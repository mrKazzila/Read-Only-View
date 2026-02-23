import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DEFAULT_POPOVER_OBSERVER_SELECTORS,
	createPopoverObserverService,
} from '../src/popover-observer.js';
import { MockHTMLElement, MockMutationObserver } from './helpers/dom-mocks.js';
import { createMainTestHarness } from './helpers/test-setup.js';

test('observer service start/stop manages lifecycle and keeps prefilter optimization', () => {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	leaf.setFilePath('docs/file.md');
	leaf.setMode('source');

	let ensurePreviewCalls = 0;
	let getLeavesCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => {
			getLeavesCalls += 1;
			return [leaf as never];
		},
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => {
			ensurePreviewCalls += 1;
		},
	});

	try {
		service.start();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);
		assert.equal(observer.observeCalls.length, 1);

		observer.trigger([{ addedNodes: [new MockHTMLElement(), { foo: 'bar' }] }]);
		assert.equal(ensurePreviewCalls, 0);
		assert.equal(getLeavesCalls, 0);

		service.stop();
		assert.equal(observer.disconnected, true);
	} finally {
		harness.restore();
	}
});

test('observer service dispatches matching popover/editor node to enforcement callback', async () => {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	leaf.setFilePath('docs/file.md');
	leaf.setMode('source');

	const ensurePreviewCalls: Array<{ reason: string }> = [];
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [leaf as never],
		shouldForceReadOnlyPath: (path) => path.startsWith('docs/'),
		ensurePreview: async (_leaf, reason) => {
			ensurePreviewCalls.push({ reason });
		},
	});

	try {
		service.start();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);

		const container = leaf.view.containerEl as unknown as MockHTMLElement;
		const popoverNode = new MockHTMLElement(['.popover']);
		popoverNode.appendChild(new MockHTMLElement(['.cm-editor']));
		container.appendChild(popoverNode);

		observer.trigger([{ addedNodes: [popoverNode] }]);
		await Promise.resolve();

		assert.equal(ensurePreviewCalls.length, 1);
		assert.equal(ensurePreviewCalls[0]?.reason, 'mutation-observer');
	} finally {
		harness.restore();
	}
});

test('observer service findLeafByNode uses cache and invalidation', () => {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	const container = leaf.view.containerEl as unknown as MockHTMLElement;
	const nestedNode = new MockHTMLElement(['.cm-editor']);
	container.appendChild(nestedNode);

	let getLeavesCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => {
			getLeavesCalls += 1;
			return [leaf as never];
		},
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => undefined,
	});

	try {
		assert.ok(service.findLeafByNode(nestedNode as unknown as HTMLElement));
		assert.ok(service.findLeafByNode(nestedNode as unknown as HTMLElement));
		assert.equal(getLeavesCalls, 1);

		service.invalidateLeafCache();
		assert.ok(service.findLeafByNode(nestedNode as unknown as HTMLElement));
		assert.equal(getLeavesCalls, 2);
	} finally {
		harness.restore();
	}
});

test('observer service centralizes selector contract', () => {
	assert.equal(
		DEFAULT_POPOVER_OBSERVER_SELECTORS.popoverCandidate,
		'.hover-popover, .popover, .workspace-leaf, .markdown-source-view, .cm-editor',
	);
	assert.equal(
		DEFAULT_POPOVER_OBSERVER_SELECTORS.editorCandidate,
		'.markdown-source-view, .cm-editor',
	);
});
