import type { WorkspaceLeaf } from 'obsidian';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createEnforcementService } from '../src/enforcement.js';
import { DEFAULT_SETTINGS, type ForceReadModeSettings } from '../src/matcher.js';
import { createMockWorkspaceLeaf } from './helpers/obsidian-mocks.js';

type CreateServiceOptions = {
	settings?: Partial<ForceReadModeSettings>;
	leaves?: ReturnType<typeof createMockWorkspaceLeaf>[];
	now?: () => number;
};

function createService(options: CreateServiceOptions = {}) {
	const settings: ForceReadModeSettings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['**/*.md'],
		excludeRules: [],
		debug: false,
		debugVerbosePaths: false,
		...options.settings,
	};
	const leaves = options.leaves ?? [createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' })];
	const debugCalls: Array<{ message: string; payload?: Record<string, unknown> }> = [];
	let getMarkdownLeavesCalls = 0;

	const service = createEnforcementService({
		getSettings: () => settings,
		getMarkdownLeaves: () => {
			getMarkdownLeavesCalls += 1;
			return leaves as unknown as WorkspaceLeaf[];
		},
		logDebug: (message, payload) => {
			debugCalls.push({ message, payload });
		},
		formatPathForDebug: (path, verbosePaths) => (verbosePaths ? path : `[redacted]/${path.split('/').pop() ?? ''}`),
		now: options.now,
	});

	return {
		service,
		settings,
		leaves,
		debugCalls,
		getMarkdownLeavesCalls: () => getMarkdownLeavesCalls,
	};
}

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

test('service contract: queues pending reapply while enforcement is running', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const setup = createService({ leaves: [leaf] });
	const originalSetViewState = leaf.setViewState.bind(leaf);

	let releaseFirstCall!: () => void;
	const firstCallGate = new Promise<void>((resolve) => {
		releaseFirstCall = resolve;
	});

	leaf.setViewState = async (state, arg) => {
		await firstCallGate;
		return originalSetViewState(state, arg);
	};

	const activeRun = setup.service.applyAllOpenMarkdownLeaves('first-run');
	await Promise.resolve();

	await setup.service.applyAllOpenMarkdownLeaves('second-run');
	releaseFirstCall();
	await activeRun;

	assert.equal(setup.getMarkdownLeavesCalls(), 2);
});

test('service contract: per-leaf throttle preserves 120ms behavior', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const nowValues = [1000, 1100, 1121];
	let nowIndex = 0;
	const setup = createService({
		leaves: [leaf],
		now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)] ?? 0,
	});

	await setup.service.applyAllOpenMarkdownLeaves('first');
	leaf.setMode('source');
	await setup.service.applyAllOpenMarkdownLeaves('second-throttled');
	leaf.setMode('source');
	await setup.service.applyAllOpenMarkdownLeaves('third-allowed');

	assert.equal(leaf.setViewStateCalls.length, 2);
});

test('service contract: fallback logging keeps redacted path format', async () => {
	const leaf = createMockWorkspaceLeaf({
		filePath: 'private/folder/file.md',
		mode: 'source',
		throwOnReplaceCall: true,
	});
	const setup = createService({
		leaves: [leaf],
		settings: {
			debug: true,
			debugVerbosePaths: false,
		},
	});

	await setup.service.applyAllOpenMarkdownLeaves('fallback-test');

	const fallbackLog = setup.debugCalls.find((entry) => entry.message === 'ensure-preview-fallback');
	assert.ok(fallbackLog);
	assert.equal(fallbackLog.payload?.filePath, '[redacted]/file.md');
	assert.equal(typeof fallbackLog.payload?.errorType, 'string');
	assert.equal(typeof fallbackLog.payload?.errorMessage, 'string');
});

test('service contract: preview check uses view state mode without forcing getMode call', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'preview' });
	leaf.view.getMode = () => {
		throw new Error('getMode should not be called for preview state check');
	};

	const setup = createService({ leaves: [leaf] });
	await setup.service.applyAllOpenMarkdownLeaves('mode-check');

	assert.equal(leaf.setViewStateCalls.length, 0);
});

test('service contract: layout-change reason uses extended per-leaf throttle', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const nowValues = [1000, 1300, 1701];
	let nowIndex = 0;
	const setup = createService({
		leaves: [leaf],
		now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)] ?? 0,
	});

	await setup.service.applyAllOpenMarkdownLeaves('workspace-events:layout-change');
	leaf.setMode('source');
	await setup.service.applyAllOpenMarkdownLeaves('workspace-events:layout-change');
	leaf.setMode('source');
	await setup.service.applyAllOpenMarkdownLeaves('workspace-events:layout-change');

	assert.equal(leaf.setViewStateCalls.length, 2);
});

test('service contract: throttled layout-change schedules trailing retry', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const nowValues = [1000, 1300, 1701];
	let nowIndex = 0;
	const setup = createService({
		leaves: [leaf],
		now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)] ?? 0,
	});

	await withFakeTimeouts(async ({ flushAll }) => {
		await setup.service.applyAllOpenMarkdownLeaves('workspace-events:layout-change');
		leaf.setMode('source');
		await setup.service.applyAllOpenMarkdownLeaves('workspace-events:layout-change');
		assert.equal(leaf.setViewStateCalls.length, 1);

		await flushAll();

		assert.equal(leaf.setViewStateCalls.length, 2);
	});
});
