import assert from 'node:assert/strict';
import test from 'node:test';

import ReadOnlyViewPlugin, { formatPathForDebug } from '../src/main.js';
import { DEFAULT_SETTINGS } from '../src/matcher.js';
import { createMockWorkspaceLeaf } from './helpers/obsidian-mocks.js';
import { createMainTestHarness } from './helpers/test-setup.js';

type TestPluginState = {
	enforcing: boolean;
	pendingReapply: string | null;
	lastForcedAt: WeakMap<object, number>;
	mutationObserver: MutationObserver | null;
};

function createPluginWithLeaf() {
	const leaf = createMockWorkspaceLeaf({
		filePath: 'private/folder/file.md',
		mode: 'source',
		throwOnReplaceCall: true,
	});
	const harness = createMainTestHarness({ leaves: [leaf] });
	const plugin = Object.create(ReadOnlyViewPlugin.prototype) as ReadOnlyViewPlugin;
	const state = plugin as unknown as TestPluginState & {
		app: unknown;
		settings: typeof DEFAULT_SETTINGS;
	};

	state.app = harness.app;
	state.settings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['**/*.md'],
		excludeRules: [],
		debug: false,
		debugVerbosePaths: false,
	};
	state.enforcing = false;
	state.pendingReapply = null;
	state.lastForcedAt = new WeakMap<object, number>();
	state.mutationObserver = null;

	return { harness, plugin, leaf, state };
}

test('formatPathForDebug masks by default and can return full path in verbose mode', () => {
	assert.equal(formatPathForDebug('private/folder/file.md', false), '[redacted]/file.md');
	assert.equal(formatPathForDebug('private/folder/file.md', true), 'private/folder/file.md');
});

test('fallback diagnostics are logged only when debug is enabled', async () => {
	const originalDebug = console.debug;
	const debugOnCalls: unknown[][] = [];
	console.debug = (...args: unknown[]) => {
		debugOnCalls.push(args);
	};

	const debugOnSetup = createPluginWithLeaf();
	try {
		debugOnSetup.state.settings.debug = true;
		debugOnSetup.state.settings.debugVerbosePaths = false;
		await debugOnSetup.plugin.applyAllOpenMarkdownLeaves('fallback-debug-on');

		const fallbackLog = debugOnCalls.find((entry) => entry[1] === 'ensure-preview-fallback');
		assert.ok(fallbackLog);
		const payload = fallbackLog[2] as Record<string, unknown>;
		assert.equal(typeof payload.errorType, 'string');
		assert.equal(typeof payload.errorMessage, 'string');
		assert.equal(payload.filePath, '[redacted]/file.md');
	} finally {
		debugOnSetup.harness.restore();
	}

	const debugOffCalls: unknown[][] = [];
	console.debug = (...args: unknown[]) => {
		debugOffCalls.push(args);
	};

	const debugOffSetup = createPluginWithLeaf();
	try {
		debugOffSetup.state.settings.debug = false;
		await debugOffSetup.plugin.applyAllOpenMarkdownLeaves('fallback-debug-off');
		assert.equal(debugOffCalls.length, 0);
	} finally {
		console.debug = originalDebug;
		debugOffSetup.harness.restore();
	}
});
