import assert from 'node:assert/strict';
import test from 'node:test';

import ReadOnlyViewPlugin from '../src/main.js';
import { DEFAULT_SETTINGS } from '../src/matcher.js';
import { createMockWorkspaceLeaf, type MockWorkspaceLeaf } from './helpers/obsidian-mocks.js';
import { createMainTestHarness } from './helpers/test-setup.js';

type TestPluginState = {
	enforcing: boolean;
	pendingReapply: string | null;
	lastForcedAt: WeakMap<object, number>;
	mutationObserver: MutationObserver | null;
};

function createPluginForEnforcement(leaves: MockWorkspaceLeaf[]) {
	const harness = createMainTestHarness({ leaves });
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
	};
	state.enforcing = false;
	state.pendingReapply = null;
	state.lastForcedAt = new WeakMap<object, number>();
	state.mutationObserver = null;

	return {
		harness,
		plugin,
		state,
	};
}

function withMockedNow(values: number[], callback: () => Promise<void>): Promise<void> {
	const originalNow = Date.now;
	let index = 0;
	Date.now = () => values[Math.min(index++, values.length - 1)] ?? values[values.length - 1] ?? 0;
	return callback().finally(() => {
		Date.now = originalNow;
	});
}

test('enforcement exits early when plugin is disabled', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const { harness, plugin, state } = createPluginForEnforcement([leaf]);

	try {
		state.settings.enabled = false;
		await plugin.applyAllOpenMarkdownLeaves('disabled-test');

		assert.equal(harness.workspace.getLeavesOfTypeCalls.length, 0);
		assert.equal(leaf.setViewStateCalls.length, 0);
	} finally {
		harness.restore();
	}
});

test('enforcement ignores non-markdown leaves and markdown leaves without file', async () => {
	const nonMarkdownLeaf = createMockWorkspaceLeaf({
		filePath: 'docs/file.md',
		mode: 'source',
		isMarkdownView: false,
	});
	const markdownLeafWithoutFile = createMockWorkspaceLeaf({
		filePath: undefined,
		mode: 'source',
	});

	const { harness, plugin } = createPluginForEnforcement([nonMarkdownLeaf, markdownLeafWithoutFile]);

	try {
		await plugin.applyAllOpenMarkdownLeaves('ignore-test');

		assert.equal(nonMarkdownLeaf.setViewStateCalls.length, 0);
		assert.equal(markdownLeafWithoutFile.setViewStateCalls.length, 0);
	} finally {
		harness.restore();
	}
});

test('enforcement queues pending reapply when called during an active run', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const { harness, plugin } = createPluginForEnforcement([leaf]);
	const originalSetViewState = leaf.setViewState.bind(leaf);

	let releaseFirstCall!: () => void;
	const firstCallGate = new Promise<void>((resolve) => {
		releaseFirstCall = resolve;
	});

	leaf.setViewState = async (state, arg) => {
		await firstCallGate;
		return originalSetViewState(state, arg);
	};

	try {
		const activeRun = plugin.applyAllOpenMarkdownLeaves('first-run');
		await Promise.resolve();

		await plugin.applyAllOpenMarkdownLeaves('second-run');
		releaseFirstCall();
		await activeRun;

		assert.equal(harness.workspace.getLeavesOfTypeCalls.length, 2);
	} finally {
		harness.restore();
	}
});

test('enforcement applies per-leaf throttle within 120ms window', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source' });
	const { harness, plugin } = createPluginForEnforcement([leaf]);

	try {
		await withMockedNow([1000, 1100, 1121], async () => {
			await plugin.applyAllOpenMarkdownLeaves('first');
			leaf.setMode('source');
			await plugin.applyAllOpenMarkdownLeaves('second-throttled');
			leaf.setMode('source');
			await plugin.applyAllOpenMarkdownLeaves('third-allowed');
		});

		assert.equal(leaf.setViewStateCalls.length, 2);
	} finally {
		harness.restore();
	}
});

test('enforcement applies only to matching markdown files', async () => {
	const matchingMarkdownLeaf = createMockWorkspaceLeaf({ filePath: 'docs/match.md', mode: 'source' });
	const nonMatchingMarkdownLeaf = createMockWorkspaceLeaf({ filePath: 'notes/no-match.md', mode: 'source' });
	const nonMarkdownExtensionLeaf = createMockWorkspaceLeaf({ filePath: 'docs/not-markdown.txt', mode: 'source' });

	const { harness, plugin, state } = createPluginForEnforcement([
		matchingMarkdownLeaf,
		nonMatchingMarkdownLeaf,
		nonMarkdownExtensionLeaf,
	]);
	state.settings.includeRules = ['docs/**'];
	state.settings.excludeRules = [];

	try {
		await plugin.applyAllOpenMarkdownLeaves('md-filter-test');

		assert.equal(matchingMarkdownLeaf.setViewStateCalls.length, 1);
		assert.equal(nonMatchingMarkdownLeaf.setViewStateCalls.length, 0);
		assert.equal(nonMarkdownExtensionLeaf.setViewStateCalls.length, 0);
	} finally {
		harness.restore();
	}
});

test('enforcement uses setViewState(nextState, false) fallback when replace call throws', async () => {
	const leaf = createMockWorkspaceLeaf({
		filePath: 'docs/file.md',
		mode: 'source',
		throwOnReplaceCall: true,
	});
	const { harness, plugin } = createPluginForEnforcement([leaf]);

	try {
		await plugin.applyAllOpenMarkdownLeaves('fallback-test');

		assert.equal(leaf.setViewStateCalls.length, 1);
		assert.equal(leaf.setViewStateCalls[0]?.arg, false);
	} finally {
		harness.restore();
	}
});
