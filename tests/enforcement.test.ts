import type { WorkspaceLeaf } from 'obsidian';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	cancelAnimationFrameSafe,
	createEnforcementService,
	requestAnimationFrameSafe,
} from '../src/enforcement.js';
import { createCompiledRuleMatcher, DEFAULT_SETTINGS, type ForceReadModeSettings } from '../src/matcher.js';
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
		forceAllMarkdownReadOnly: false,
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
	const matcher = createCompiledRuleMatcher(settings);

	const service = createEnforcementService({
		getSettings: () => settings,
		getMarkdownLeaves: () => {
			getMarkdownLeavesCalls += 1;
			return leaves as unknown as WorkspaceLeaf[];
		},
		shouldForceReadOnlyPath: (path) => matcher.shouldForceReadOnly(path),
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

function withFakeAnimationFrames(
	callback: (tools: { flushNextFrame: () => Promise<void>; pendingFrameCount: () => number }) => Promise<void>
): Promise<void> {
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;
	const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
	const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

	let nextId = 1;
	const queue = new Map<number, FrameRequestCallback>();
	const frameWindow = {
		requestAnimationFrame: (callbackHandler: FrameRequestCallback) => {
			const id = nextId++;
			queue.set(id, callbackHandler);
			return id;
		},
		cancelAnimationFrame: (frameId: number) => {
			queue.delete(frameId);
		},
	};

	(globalThis as Record<string, unknown>).window = frameWindow;
	(globalThis as Record<string, unknown>).activeWindow = frameWindow;
	globalThis.requestAnimationFrame = frameWindow.requestAnimationFrame;
	globalThis.cancelAnimationFrame = frameWindow.cancelAnimationFrame;

	const flushNextFrame = async () => {
		const nextEntry = queue.entries().next();
		if (nextEntry.done) {
			return;
		}
		const [frameId, callbackHandler] = nextEntry.value;
		queue.delete(frameId);
		callbackHandler(16);
		await Promise.resolve();
	};

	return callback({
		flushNextFrame,
		pendingFrameCount: () => queue.size,
	}).finally(() => {
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
		globalThis.requestAnimationFrame = originalRequestAnimationFrame;
		globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
	});
}

function withOwnedFakeTimeoutWindows(
	callback: (tools: {
		switchActiveWindow: (name: 'A' | 'B') => void;
		windowA: { clearedIds: number[] };
		windowB: { clearedIds: number[] };
	}) => Promise<void>,
): Promise<void> {
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let nextId = 1;
	const createWindow = () => {
		const queue = new Map<number, () => void>();
		const clearedIds: number[] = [];
		return {
			queue,
			clearedIds,
			setTimeout: ((handler: TimerHandler) => {
				const callbackHandler = typeof handler === 'function' ? handler : () => undefined;
				const id = nextId++;
				queue.set(id, callbackHandler as () => void);
				return id as unknown as ReturnType<typeof setTimeout>;
			}) as typeof setTimeout,
			clearTimeout: ((timeoutId: ReturnType<typeof setTimeout>) => {
				clearedIds.push(Number(timeoutId));
				queue.delete(Number(timeoutId));
			}) as typeof clearTimeout,
		};
	};

	const windowA = createWindow();
	const windowB = createWindow();
	(globalThis as Record<string, unknown>).activeWindow = windowA;

	return callback({
		switchActiveWindow: (name) => {
			(globalThis as Record<string, unknown>).activeWindow = name === 'A' ? windowA : windowB;
		},
		windowA,
		windowB,
	}).finally(() => {
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	});
}

function withOwnedFakeAnimationFrameWindows(
	callback: (tools: {
		switchActiveWindow: (name: 'A' | 'B') => void;
		windowA: { cancelCalls: number[] };
		windowB: { cancelCalls: number[] };
	}) => Promise<void>,
): Promise<void> {
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;
	const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
	const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

	let nextId = 1;
	const createWindow = () => {
		const queue = new Map<number, FrameRequestCallback>();
		const cancelCalls: number[] = [];
		return {
			queue,
			cancelCalls,
			requestAnimationFrame: (callbackHandler: FrameRequestCallback) => {
				const id = nextId++;
				queue.set(id, callbackHandler);
				return id;
			},
			cancelAnimationFrame: (frameId: number) => {
				cancelCalls.push(frameId);
				queue.delete(frameId);
			},
		};
	};

	const windowA = createWindow();
	const windowB = createWindow();
	(globalThis as Record<string, unknown>).window = windowB;
	(globalThis as Record<string, unknown>).activeWindow = windowA;
	globalThis.requestAnimationFrame = windowB.requestAnimationFrame;
	globalThis.cancelAnimationFrame = windowB.cancelAnimationFrame;

	return callback({
		switchActiveWindow: (name) => {
			(globalThis as Record<string, unknown>).activeWindow = name === 'A' ? windowA : windowB;
		},
		windowA,
		windowB,
	}).finally(() => {
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
		globalThis.requestAnimationFrame = originalRequestAnimationFrame;
		globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
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

test('service contract: stop cancels pending layout-change retry', async () => {
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

		setup.service.stop();
		await flushAll();

		assert.equal(leaf.setViewStateCalls.length, 1);
	});
});

test('service contract: layout retry cleanup uses original timer owner after focus switch', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const nowValues = [1000, 1300];
	let nowIndex = 0;
	const setup = createService({
		leaves: [leaf],
		now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)] ?? 0,
	});

	await withOwnedFakeTimeoutWindows(async ({ switchActiveWindow, windowA, windowB }) => {
		await setup.service.applyAllOpenMarkdownLeaves('workspace-events:layout-change');
		leaf.setMode('source');
		await setup.service.applyAllOpenMarkdownLeaves('workspace-events:layout-change');
		switchActiveWindow('B');
		setup.service.stop();

		assert.deepEqual(windowA.clearedIds, [1]);
		assert.deepEqual(windowB.clearedIds, []);
	});
});

test('service contract: frame-deferred enforcement still runs while active', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const setup = createService({ leaves: [leaf] });

	await withFakeAnimationFrames(async ({ flushNextFrame, pendingFrameCount }) => {
		const ensurePreviewPromise = setup.service.ensurePreview(leaf as unknown as WorkspaceLeaf, 'frame-active');
		assert.equal(pendingFrameCount(), 1);
		assert.equal(leaf.setViewStateCalls.length, 0);

		await flushNextFrame();
		await ensurePreviewPromise;

		assert.equal(leaf.setViewStateCalls.length, 1);
		assert.equal(leaf.setViewStateCalls[0]?.state.state.mode, 'preview');
	});
});

test('service contract: stop cancels pending frame-deferred enforcement', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const setup = createService({ leaves: [leaf] });

	await withFakeAnimationFrames(async ({ pendingFrameCount }) => {
		const ensurePreviewPromise = setup.service.ensurePreview(leaf as unknown as WorkspaceLeaf, 'frame-stop');
		assert.equal(pendingFrameCount(), 1);

		setup.service.stop();
		await ensurePreviewPromise;

		assert.equal(pendingFrameCount(), 0);
		assert.equal(leaf.setViewStateCalls.length, 0);
	});
});

test('service contract: repeated stop is idempotent for pending frames', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const setup = createService({ leaves: [leaf] });

	await withFakeAnimationFrames(async ({ pendingFrameCount }) => {
		const ensurePreviewPromise = setup.service.ensurePreview(leaf as unknown as WorkspaceLeaf, 'frame-stop-repeat');
		assert.equal(pendingFrameCount(), 1);

		setup.service.stop();
		setup.service.stop();
		await ensurePreviewPromise;

		assert.equal(pendingFrameCount(), 0);
		assert.equal(leaf.setViewStateCalls.length, 0);
	});
});

test('service contract: stop cancels pending frame through original owner window after focus switch', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const setup = createService({ leaves: [leaf] });

	await withOwnedFakeAnimationFrameWindows(async ({ switchActiveWindow, windowA, windowB }) => {
		const ensurePreviewPromise = setup.service.ensurePreview(leaf as unknown as WorkspaceLeaf, 'frame-stop-owner');
		switchActiveWindow('B');
		setup.service.stop();
		await ensurePreviewPromise;

		assert.deepEqual(windowA.cancelCalls, [1]);
		assert.deepEqual(windowB.cancelCalls, []);
	});
});

test('requestAnimationFrameSafe falls back to global window', async () => {
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let callbackInvoked = false;
	const fallbackWindow = {
		requestAnimationFrame: (callback: FrameRequestCallback) => {
			callbackInvoked = true;
			callback(16);
			return 11;
		},
		cancelAnimationFrame: (_frameId: number) => {
			assert.fail('fallback window cancel should not be called in this test');
		},
	};

	(globalThis as Record<string, unknown>).window = fallbackWindow;
	(globalThis as Record<string, unknown>).activeWindow = undefined;

	try {
		const frameId = requestAnimationFrameSafe(() => undefined);
		assert.equal(frameId, 11);
		assert.equal(callbackInvoked, true);
	} finally {
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	}
});

test('requestAnimationFrameSafe prefers provided activeWindow', async () => {
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let usedActiveWindow = false;
	const fallbackWindow = {
		requestAnimationFrame: (_callback: FrameRequestCallback) => {
			assert.fail('global window should not be used when activeWindow supports requestAnimationFrame');
		},
		cancelAnimationFrame: (_frameId: number) => undefined,
	};
	const popoutWindow = {
		requestAnimationFrame: (callback: FrameRequestCallback) => {
			usedActiveWindow = true;
			callback(16);
			return 27;
		},
		cancelAnimationFrame: (_frameId: number) => undefined,
	};

	(globalThis as Record<string, unknown>).window = fallbackWindow;
	(globalThis as Record<string, unknown>).activeWindow = popoutWindow;

	try {
		const frameId = requestAnimationFrameSafe(() => undefined);
		assert.equal(frameId, 27);
		assert.equal(usedActiveWindow, true);
	} finally {
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	}
});

test('cancelAnimationFrameSafe uses matching activeWindow context', async () => {
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	const calls: string[] = [];
	const fallbackWindow = {
		requestAnimationFrame: (_callback: FrameRequestCallback) => {
			assert.fail('global window should not be used when activeWindow supports requestAnimationFrame');
		},
		cancelAnimationFrame: (_frameId: number) => {
			calls.push('window');
		},
	};
	const popoutWindow = {
		requestAnimationFrame: (_callback: FrameRequestCallback) => 39,
		cancelAnimationFrame: (frameId: number) => {
			calls.push(`active:${frameId}`);
		},
	};

	(globalThis as Record<string, unknown>).window = fallbackWindow;
	(globalThis as Record<string, unknown>).activeWindow = popoutWindow;

	try {
		const frameId = requestAnimationFrameSafe(() => undefined);
		assert.equal(frameId, 39);
		cancelAnimationFrameSafe(frameId ?? -1);
		assert.deepEqual(calls, ['active:39']);
	} finally {
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	}
});

test('cancelAnimationFrameSafe uses provided owner window when activeWindow changes', async () => {
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	const fallbackWindow = {
		requestAnimationFrame: (_callback: FrameRequestCallback) => 0,
		cancelAnimationFrame: (_frameId: number) => {
			assert.fail('fallback window should not receive owner-bound cancellation');
		},
	};
	const ownerWindow = {
		requestAnimationFrame: (_callback: FrameRequestCallback) => 55,
		cancelAnimationFrame: (frameId: number) => {
			assert.equal(frameId, 55);
		},
	};

	(globalThis as Record<string, unknown>).window = fallbackWindow;
	(globalThis as Record<string, unknown>).activeWindow = fallbackWindow;

	try {
		cancelAnimationFrameSafe(55, ownerWindow);
	} finally {
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	}
});
