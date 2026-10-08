import assert from 'node:assert/strict';
import test from 'node:test';

import { MockMutationObserver } from './helpers/dom-mocks.js';
import { createMockWorkspaceLeaf } from './helpers/obsidian-mocks.js';
import { createMainTestHarness, withPluginHost } from './helpers/test-setup.js';

test('plugin host unloads and restores mocks even when an assertion fails', async () => {
	const original = { now: Date.now, setTimeout, clearTimeout, document: globalThis.document };
	let observer: MockMutationObserver | undefined;
	let pendingTimers = () => -1;
	await assert.rejects(withPluginHost(async (host) => {
		await host.plugin.onload();
		observer = MockMutationObserver.instances[0];
		host.workspace.trigger('file-open');
		pendingTimers = host.pendingTimers;
		assert.equal(pendingTimers(), 1);
		assert.fail('intentional assertion failure');
	}), /intentional assertion failure/);
	assert.equal(observer?.disconnected, true);
	assert.equal(pendingTimers(), 0);
	assert.equal(Date.now, original.now);
	assert.equal(globalThis.setTimeout, original.setTimeout);
	assert.equal(globalThis.clearTimeout, original.clearTimeout);
	assert.equal(globalThis.document, original.document);
});

test('main test harness: workspace and leaf mocks expose view state controls', async () => {
	const leaf = createMockWorkspaceLeaf({ filePath: 'folder/note.md', mode: 'source' });
	const harness = createMainTestHarness({ leaves: [leaf] });

	try {
		assert.equal(harness.workspace.getLeavesOfType('markdown').length, 1);
		assert.deepEqual(harness.workspace.getLeavesOfTypeCalls, ['markdown']);

		assert.equal(leaf.view.file?.path, 'folder/note.md');
		assert.equal(leaf.getViewState().state.mode, 'source');

		await leaf.setViewState(
			{
				type: 'markdown',
				state: { mode: 'preview' },
			},
			{ replace: true },
		);

		assert.equal(leaf.getViewState().state.mode, 'preview');
		assert.equal(leaf.setViewStateCalls.length, 1);
		assert.deepEqual(leaf.setViewStateCalls[0]?.arg, { replace: true });

		leaf.setFilePath(undefined);
		assert.equal(leaf.view.file, null);
	} finally {
		harness.restore();
	}
});

test('main test harness: dom mock installs MutationObserver and document.body', () => {
	const harness = createMainTestHarness();

	try {
		assert.ok(globalThis.document?.body);
		assert.equal(MockMutationObserver.instances.length, 0);

		const observer = new MutationObserver(() => undefined);
		observer.observe(globalThis.document.body, { childList: true, subtree: true });

		assert.equal(MockMutationObserver.instances.length, 1);
		const first = MockMutationObserver.instances[0];
		assert.equal(first?.observeCalls.length, 1);
		assert.equal(first?.observeCalls[0]?.options.subtree, true);
	} finally {
		harness.restore();
	}
});
