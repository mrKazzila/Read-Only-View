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

function withFakeTimeouts(callback: (tools: { flushAll: () => Promise<void> }) => Promise<void>): Promise<void> {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;

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
	});
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

test('workspace event burst is coalesced into one reapply pass', async () => {
	const { harness, plugin } = createObserverPlugin();
	const reapplyReasons: string[] = [];

	plugin.loadSettings = async () => undefined;
	plugin.applyAllOpenMarkdownLeaves = async (reason: string) => {
		reapplyReasons.push(reason);
	};
	plugin.registerEvent = () => undefined;
	(plugin as unknown as { addCommand: (command: unknown) => unknown }).addCommand = () => ({});

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			await plugin.onload();
			assert.deepEqual(reapplyReasons, ['onload']);

			harness.workspace.trigger('file-open');
			harness.workspace.trigger('active-leaf-change');
			harness.workspace.trigger('layout-change');
			await Promise.resolve();

			assert.deepEqual(reapplyReasons, ['onload']);

			await flushAll();
			assert.equal(reapplyReasons.length, 2);
			assert.ok(reapplyReasons[1]?.startsWith('workspace-events:'));
			assert.ok(reapplyReasons[1]?.includes('file-open'));
			assert.ok(reapplyReasons[1]?.includes('active-leaf-change'));
			assert.ok(reapplyReasons[1]?.includes('layout-change'));
		});
	} finally {
		harness.restore();
	}
});

test('re-apply command remains immediate and bypasses workspace event scheduler', async () => {
	const { harness, plugin } = createObserverPlugin();
	const reapplyReasons: string[] = [];
	const commands = new Map<string, () => Promise<void>>();

	plugin.loadSettings = async () => undefined;
	plugin.applyAllOpenMarkdownLeaves = async (reason: string) => {
		reapplyReasons.push(reason);
	};
	plugin.registerEvent = () => undefined;
	(plugin as unknown as {
		addCommand: (command: { id: string; callback?: () => Promise<void> }) => unknown;
	}).addCommand = (command) => {
		if (command.callback) {
			commands.set(command.id, command.callback);
		}
		return {};
	};

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			await plugin.onload();
			assert.ok(commands.has('re-apply-rules-now'));

			harness.workspace.trigger('file-open');
			await Promise.resolve();
			assert.deepEqual(reapplyReasons, ['onload']);

			const reapplyCommand = commands.get('re-apply-rules-now');
			assert.ok(reapplyCommand);
			await reapplyCommand();
			assert.deepEqual(reapplyReasons, ['onload', 'command-reapply']);

			await flushAll();
			assert.equal(reapplyReasons.length, 3);
			assert.ok(reapplyReasons[2]?.startsWith('workspace-events:'));
		});
	} finally {
		harness.restore();
	}
});
