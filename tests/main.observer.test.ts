import assert from 'node:assert/strict';
import test from 'node:test';

import ReadOnlyViewPlugin from '../src/main.js';
import { DEFAULT_SETTINGS } from '../src/matcher.js';
import { MockHTMLElement, MockMutationObserver } from './helpers/dom-mocks.js';
import { createMainTestHarness } from './helpers/test-setup.js';

type PatchablePlugin = ReadOnlyViewPlugin & {
	loadSettings: () => Promise<void>;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	registerEvent: (unsubscribe: () => void) => void;
};

function createObserverPlugin() {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	leaf.setFilePath('docs/file.md');
	leaf.setMode('source');
	const plugin = new ReadOnlyViewPlugin(harness.app as never, {} as never) as PatchablePlugin;

	plugin.settings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['docs/**'],
		excludeRules: [],
		debug: false,
	};

	return {
		leaf,
		harness,
		plugin,
	};
}

test('observer ignores added nodes without relevant classes', async () => {
	const { leaf, harness, plugin } = createObserverPlugin();

	try {
		(plugin as unknown as { installMutationObserver: () => void }).installMutationObserver();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);

		const plainNode = new MockHTMLElement();
		observer.trigger([{ addedNodes: [plainNode] }]);
		await Promise.resolve();

		assert.equal(leaf.setViewStateCalls.length, 0);
	} finally {
		harness.restore();
	}
});

test('observer enforces preview when matching popover/editor node is added', async () => {
	const { leaf, harness, plugin } = createObserverPlugin();

	try {
		(plugin as unknown as { installMutationObserver: () => void }).installMutationObserver();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);

		const container = leaf.view.containerEl as unknown as MockHTMLElement;
		const popoverNode = new MockHTMLElement(['.popover']);
		popoverNode.appendChild(new MockHTMLElement(['.cm-editor']));
		container.appendChild(popoverNode);

		observer.trigger([{ addedNodes: [popoverNode] }]);
		await Promise.resolve();

		assert.equal(leaf.setViewStateCalls.length, 1);
		assert.deepEqual(leaf.setViewStateCalls[0]?.arg, { replace: true });
	} finally {
		harness.restore();
	}
});

test('observer callback does not enforce when plugin is disabled', async () => {
	const { leaf, harness, plugin } = createObserverPlugin();
	plugin.settings.enabled = false;

	try {
		(plugin as unknown as { installMutationObserver: () => void }).installMutationObserver();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);

		const container = leaf.view.containerEl as unknown as MockHTMLElement;
		const popoverNode = new MockHTMLElement(['.hover-popover']);
		popoverNode.appendChild(new MockHTMLElement(['.markdown-source-view']));
		container.appendChild(popoverNode);

		observer.trigger([{ addedNodes: [popoverNode] }]);
		await Promise.resolve();

		assert.equal(leaf.setViewStateCalls.length, 0);
	} finally {
		harness.restore();
	}
});

test('onunload disconnects active mutation observer', () => {
	const { harness, plugin } = createObserverPlugin();

	try {
		(plugin as unknown as { installMutationObserver: () => void }).installMutationObserver();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);
		assert.equal(observer.disconnected, false);

		plugin.onunload();

		assert.equal(observer.disconnected, true);
		assert.equal((plugin as unknown as { mutationObserver: MutationObserver | null }).mutationObserver, null);
	} finally {
		harness.restore();
	}
});

test('workspace events trigger reapply for file-open, active-leaf-change, and layout-change', async () => {
	const { harness, plugin } = createObserverPlugin();
	const reapplyReasons: string[] = [];

	plugin.loadSettings = async () => undefined;
	plugin.applyAllOpenMarkdownLeaves = async (reason: string) => {
		reapplyReasons.push(reason);
	};
	plugin.registerEvent = () => undefined;

	try {
		await plugin.onload();
		assert.ok(reapplyReasons.includes('onload'));

		harness.workspace.trigger('file-open');
		harness.workspace.trigger('active-leaf-change');
		harness.workspace.trigger('layout-change');
		await Promise.resolve();
		await Promise.resolve();

		assert.ok(reapplyReasons.includes('file-open'));
		assert.ok(reapplyReasons.includes('active-leaf-change'));
		assert.ok(reapplyReasons.includes('layout-change'));
	} finally {
		harness.restore();
	}
});
