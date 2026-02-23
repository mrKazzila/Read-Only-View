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
