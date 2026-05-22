import assert from 'node:assert/strict';
import test from 'node:test';

import ReadOnlyViewPlugin from '../src/main.js';
import { DEFAULT_SETTINGS } from '../src/matcher.js';
import { createMainTestHarness } from './helpers/test-setup.js';

type PatchablePlugin = ReadOnlyViewPlugin & {
	loadSettings: () => Promise<void>;
	registerEvent: (unsubscribe: () => void) => void;
	addCommand: (command: unknown) => unknown;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
};

type PreventableEvent = {
	defaultPrevented: boolean;
	preventDefault: () => void;
};

function createEditorEventPlugin() {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	leaf.setFilePath('docs/file.md');
	leaf.setMode('source');

	const plugin = new ReadOnlyViewPlugin(harness.app as never, {} as never) as PatchablePlugin & {
		editorExtensions?: unknown[];
	};
	plugin.settings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['docs/**'],
		excludeRules: [],
		debug: false,
		debugVerbosePaths: false,
	};
	plugin.loadSettings = async () => undefined;
	plugin.registerEvent = () => undefined;
	plugin.addCommand = ((command: unknown) => command) as PatchablePlugin['addCommand'];
	plugin.applyAllOpenMarkdownLeaves = async () => undefined;

	return {
		harness,
		leaf,
		plugin,
	};
}

function createPreventableEvent(): PreventableEvent {
	return {
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
}

async function flushAsyncEventHandler(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

test('plugin registers the editor read-only extension on load', async () => {
	const { harness, plugin } = createEditorEventPlugin();

	try {
		await plugin.onload();
		assert.equal(plugin.editorExtensions?.length, 1);
	} finally {
		harness.restore();
	}
});

test('editor-paste blocks read-only MarkdownFileInfo input and enforces preview with one leaf lookup scan', async () => {
	const { harness, leaf, plugin } = createEditorEventPlugin();

	try {
		await plugin.onload();
		leaf.setMode('source');
		leaf.setViewStateCalls.length = 0;
		const baselineScans = harness.workspace.getLeavesOfTypeCalls.length;
		const evt = createPreventableEvent();

		harness.workspace.trigger(
			'editor-paste',
			evt,
			{},
			{ file: { path: 'docs/file.md', extension: 'md' } },
		);
		await flushAsyncEventHandler();

		assert.equal(evt.defaultPrevented, true);
		assert.equal(leaf.setViewStateCalls.length, 1);
		assert.deepEqual(leaf.setViewStateCalls[0]?.arg, { replace: true });
		assert.equal(harness.workspace.getLeavesOfTypeCalls.length, baselineScans + 1);
	} finally {
		harness.restore();
	}
});

test('editor-paste does nothing for non-read-only file and avoids leaf scan', async () => {
	const { harness, leaf, plugin } = createEditorEventPlugin();

	try {
		await plugin.onload();
		leaf.setMode('source');
		leaf.setViewStateCalls.length = 0;
		const baselineScans = harness.workspace.getLeavesOfTypeCalls.length;
		const evt = createPreventableEvent();

		harness.workspace.trigger(
			'editor-paste',
			evt,
			{},
			{ file: { path: 'notes/file.md', extension: 'md' } },
		);
		await flushAsyncEventHandler();

		assert.equal(evt.defaultPrevented, false);
		assert.equal(leaf.setViewStateCalls.length, 0);
		assert.equal(harness.workspace.getLeavesOfTypeCalls.length, baselineScans);
	} finally {
		harness.restore();
	}
});

test('editor-paste resolves MarkdownView directly without extra leaf scan', async () => {
	const { harness, leaf, plugin } = createEditorEventPlugin();

	try {
		await plugin.onload();
		leaf.setMode('source');
		leaf.setViewStateCalls.length = 0;
		const baselineScans = harness.workspace.getLeavesOfTypeCalls.length;
		const evt = createPreventableEvent();

		harness.workspace.trigger(
			'editor-paste',
			evt,
			{},
			leaf.view,
		);
		await flushAsyncEventHandler();

		assert.equal(evt.defaultPrevented, true);
		assert.equal(leaf.setViewStateCalls.length, 1);
		assert.equal(harness.workspace.getLeavesOfTypeCalls.length, baselineScans);
	} finally {
		harness.restore();
	}
});

test('editor-drop blocks read-only input and returns safely when no matching leaf exists', async () => {
	const { harness, plugin } = createEditorEventPlugin();

	try {
		await plugin.onload();
		const baselineScans = harness.workspace.getLeavesOfTypeCalls.length;
		const evt = createPreventableEvent();

		harness.workspace.trigger(
			'editor-drop',
			evt,
			{},
			{ file: { path: 'docs/missing.md', extension: 'md' } },
		);
		await flushAsyncEventHandler();

		assert.equal(evt.defaultPrevented, true);
		assert.equal(harness.workspace.getLeavesOfTypeCalls.length, baselineScans + 1);
	} finally {
		harness.restore();
	}
});
