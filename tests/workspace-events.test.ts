import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkspaceEventController } from '../src/workspace-events.js';
import { createMockWorkspaceLeaf } from './helpers/obsidian-mocks.js';

function withFakeTimeouts(callback: (tools: { flushAll: () => Promise<void> }) => Promise<void>): Promise<void> {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let nextId = 1;
	const queue = new Map<number, () => void>();

	globalThis.setTimeout = ((handler: TimerHandler) => {
		const callbackHandler = typeof handler === 'function' ? handler : () => undefined;
		const id = nextId++;
		queue.set(id, callbackHandler as () => void);
		return id as unknown as ReturnType<typeof setTimeout>;
	}) as typeof setTimeout;

	globalThis.clearTimeout = ((timeoutId: ReturnType<typeof setTimeout>) => {
		queue.delete(Number(timeoutId));
	}) as typeof clearTimeout;
	(globalThis as Record<string, unknown>).activeWindow = globalThis;

	const flushAll = async () => {
		for (const [id, callbackHandler] of Array.from(queue.entries())) {
			queue.delete(id);
			callbackHandler();
			await Promise.resolve();
		}
	};

	return callback({ flushAll }).finally(() => {
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	});
}

test('workspace event controller uses targeted strategy for active leaf/file-open bursts', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const fullReasons: string[] = [];
	const targetedReasons: string[] = [];
	const debugCalls: Array<{ message: string; payload?: Record<string, unknown> }> = [];
	const controller = new WorkspaceEventController({
		logDebug: (message, payload) => {
			debugCalls.push({ message, payload });
		},
		applyAllOpenMarkdownLeaves: async (reason) => {
			fullReasons.push(reason);
		},
		applyReadOnlyForLeaf: async (_leaf, reason) => {
			targetedReasons.push(reason);
		},
		formatLeafPathForDebug: () => '[redacted]/file.md',
	});

	await withFakeTimeouts(async ({ flushAll }) => {
		controller.schedule('file-open', leaf as never);
		controller.schedule('active-leaf-change', leaf as never);
		await flushAll();
	});

	assert.deepEqual(fullReasons, []);
	assert.deepEqual(targetedReasons, ['workspace-events:file-open,active-leaf-change:targeted-leaf']);
	assert.equal(debugCalls[0]?.payload?.strategy, 'targeted');
	assert.equal(debugCalls[1]?.payload?.filePath, '[redacted]/file.md');
});

test('workspace event controller falls back to full reapply for layout-change bursts', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const fullReasons: string[] = [];
	const targetedReasons: string[] = [];
	const controller = new WorkspaceEventController({
		logDebug: () => undefined,
		applyAllOpenMarkdownLeaves: async (reason) => {
			fullReasons.push(reason);
		},
		applyReadOnlyForLeaf: async (_leaf, reason) => {
			targetedReasons.push(reason);
		},
		formatLeafPathForDebug: () => '[redacted]/file.md',
	});

	await withFakeTimeouts(async ({ flushAll }) => {
		controller.schedule('layout-change', leaf as never);
		await flushAll();
	});

	assert.deepEqual(fullReasons, ['workspace-events:layout-change']);
	assert.deepEqual(targetedReasons, []);
});

test('workspace event controller de-duplicates repeated leaf scheduling within one targeted burst', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const targetedReasons: string[] = [];
	const controller = new WorkspaceEventController({
		logDebug: () => undefined,
		applyAllOpenMarkdownLeaves: async () => undefined,
		applyReadOnlyForLeaf: async (_leaf, reason) => {
			targetedReasons.push(reason);
		},
		formatLeafPathForDebug: () => '[redacted]/file.md',
	});

	await withFakeTimeouts(async ({ flushAll }) => {
		controller.schedule('active-leaf-change', leaf as never);
		controller.schedule('file-open', leaf as never);
		controller.schedule('active-leaf-change', leaf as never);
		await flushAll();
	});

	assert.deepEqual(targetedReasons, ['workspace-events:active-leaf-change,file-open:targeted-leaf']);
});

test('workspace event controller uses full reapply when targeted and non-targeted reasons are mixed', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const fullReasons: string[] = [];
	const targetedReasons: string[] = [];
	const controller = new WorkspaceEventController({
		logDebug: () => undefined,
		applyAllOpenMarkdownLeaves: async (reason) => {
			fullReasons.push(reason);
		},
		applyReadOnlyForLeaf: async (_leaf, reason) => {
			targetedReasons.push(reason);
		},
		formatLeafPathForDebug: () => '[redacted]/file.md',
	});

	await withFakeTimeouts(async ({ flushAll }) => {
		controller.schedule('file-open', leaf as never);
		controller.schedule('layout-change', leaf as never);
		await flushAll();
	});

	assert.deepEqual(fullReasons, ['workspace-events:file-open,layout-change']);
	assert.deepEqual(targetedReasons, []);
});

test('workspace event controller falls back to full reapply when targeted burst has no leaves', async () => {
	const fullReasons: string[] = [];
	const controller = new WorkspaceEventController({
		logDebug: () => undefined,
		applyAllOpenMarkdownLeaves: async (reason) => {
			fullReasons.push(reason);
		},
		applyReadOnlyForLeaf: async () => undefined,
		formatLeafPathForDebug: () => null,
	});

	await withFakeTimeouts(async ({ flushAll }) => {
		controller.schedule('file-open');
		await flushAll();
	});

	assert.deepEqual(fullReasons, ['workspace-events:file-open']);
});

test('workspace event controller stop clears pending timers and queued events', async () => {
	const fullReasons: string[] = [];
	const controller = new WorkspaceEventController({
		logDebug: () => undefined,
		applyAllOpenMarkdownLeaves: async (reason) => {
			fullReasons.push(reason);
		},
		applyReadOnlyForLeaf: async () => undefined,
		formatLeafPathForDebug: () => null,
	});

	await withFakeTimeouts(async ({ flushAll }) => {
		controller.schedule('file-open');
		controller.stop();
		await flushAll();
	});

	assert.deepEqual(fullReasons, []);
});
