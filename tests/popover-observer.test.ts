import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DEFAULT_POPOVER_OBSERVER_SELECTORS,
	createPopoverObserverService,
} from '../src/popover-observer.js';
import { MockHTMLElement, MockMutationObserver } from './helpers/dom-mocks.js';
import { createMainTestHarness } from './helpers/test-setup.js';
import { createMockWorkspaceLeaf } from './helpers/obsidian-mocks.js';

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
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
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

test('observer service skips added nodes without Obsidian instanceOf support', () => {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);

	let ensurePreviewCalls = 0;
	let getLeavesCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => {
			getLeavesCalls += 1;
			return [leaf as never];
		},
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => {
			ensurePreviewCalls += 1;
		},
	});

	try {
		service.start();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);

		observer.trigger([{ addedNodes: [{ matches: () => true, querySelector: () => null }] }]);

		assert.equal(ensurePreviewCalls, 0);
		assert.equal(getLeavesCalls, 0);
	} finally {
		harness.restore();
	}
});

test('observer service accepts popout-safe instanceOf HTMLElement nodes', async () => {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	leaf.setFilePath('docs/file.md');

	let ensurePreviewCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [leaf as never],
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => {
			ensurePreviewCalls += 1;
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

		assert.equal(ensurePreviewCalls, 1);
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
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
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

test('observer service de-duplicates enforcement per leaf within a single mutation batch', async () => {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	leaf.setFilePath('docs/file.md');
	leaf.setMode('source');

	let ensurePreviewCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [leaf as never],
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
		shouldForceReadOnlyPath: (path) => path.startsWith('docs/'),
		ensurePreview: async () => {
			ensurePreviewCalls += 1;
		},
	});

	try {
		service.start();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);

		const container = leaf.view.containerEl as unknown as MockHTMLElement;
		const firstPopover = new MockHTMLElement(['.popover']);
		firstPopover.appendChild(new MockHTMLElement(['.cm-editor']));
		const secondPopover = new MockHTMLElement(['.hover-popover']);
		secondPopover.appendChild(new MockHTMLElement(['.markdown-source-view']));
		container.appendChild(firstPopover);
		container.appendChild(secondPopover);

		observer.trigger([{ addedNodes: [firstPopover, secondPopover] }]);
		await Promise.resolve();

		assert.equal(ensurePreviewCalls, 1);
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
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
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

test('observer service ignores popover editor nodes when no leaf can be resolved', async () => {
	const harness = createMainTestHarness();
	let ensurePreviewCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [],
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => {
			ensurePreviewCalls += 1;
		},
	});

	try {
		service.start();
		const observer = MockMutationObserver.instances[0];
		assert.ok(observer);

		const popoverNode = new MockHTMLElement(['.popover']);
		popoverNode.appendChild(new MockHTMLElement(['.cm-editor']));

		observer.trigger([{ addedNodes: [popoverNode] }]);
		await Promise.resolve();

		assert.equal(ensurePreviewCalls, 0);
	} finally {
		harness.restore();
	}
});

test('observer service ignores popover nodes when file path cannot be determined', async () => {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0];
	assert.ok(leaf);
	leaf.setFilePath(undefined);
	let ensurePreviewCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [leaf as never],
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => {
			ensurePreviewCalls += 1;
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

		assert.equal(ensurePreviewCalls, 0);
	} finally {
		harness.restore();
	}
});

test('observer service centralizes selector contract', () => {
	assert.equal(
		DEFAULT_POPOVER_OBSERVER_SELECTORS.popoverCandidate,
		'.hover-popover, .popover',
	);
	assert.equal(
		DEFAULT_POPOVER_OBSERVER_SELECTORS.editorCandidate,
		'.markdown-source-view, .cm-editor',
	);
});

test('observer service attaches to initial document on start', () => {
	const harness = createMainTestHarness();
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [],
		getRelevantDocuments: () => [harness.dom.document as unknown as Document],
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => undefined,
	});

	try {
		service.start();
		assert.equal(MockMutationObserver.instances.length, 1);
		assert.equal(
			MockMutationObserver.instances[0]?.observeCalls[0]?.target,
			harness.dom.document.body,
		);
	} finally {
		harness.restore();
	}
});

test('observer service can attach to second document during reconciliation', () => {
	const harness = createMainTestHarness();
	const secondDocument = harness.dom.createDocument();
	const relevantDocuments = [harness.dom.document as unknown as Document];
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [],
		getRelevantDocuments: () => relevantDocuments,
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => undefined,
	});

	try {
		service.start();
		assert.equal(MockMutationObserver.instances.length, 1);
		relevantDocuments.push(secondDocument as unknown as Document);
		service.reconcileDocuments();
		assert.equal(MockMutationObserver.instances.length, 2);
		assert.equal(
			MockMutationObserver.instances[1]?.observeCalls[0]?.target,
			secondDocument.body,
		);
	} finally {
		harness.restore();
	}
});

test('observer service does not create duplicate observer for same document', () => {
	const harness = createMainTestHarness();
	const relevantDocuments = [harness.dom.document as unknown as Document];
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [],
		getRelevantDocuments: () => relevantDocuments,
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => undefined,
	});

	try {
		service.start();
		service.reconcileDocuments();
		service.reconcileDocuments();
		assert.equal(MockMutationObserver.instances.length, 1);
	} finally {
		harness.restore();
	}
});

test('observer service stop disconnects all document observers', () => {
	const harness = createMainTestHarness();
	const secondDocument = harness.dom.createDocument();
	const relevantDocuments = [
		harness.dom.document as unknown as Document,
		secondDocument as unknown as Document,
	];
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [],
		getRelevantDocuments: () => relevantDocuments,
		shouldForceReadOnlyPath: () => true,
		ensurePreview: async () => undefined,
	});

	try {
		service.start();
		assert.equal(MockMutationObserver.instances.length, 2);
		service.stop();
		assert.equal(MockMutationObserver.instances[0]?.disconnected, true);
		assert.equal(MockMutationObserver.instances[1]?.disconnected, true);
	} finally {
		harness.restore();
	}
});

test('observer service enforces popovers from second mock document', async () => {
	const harness = createMainTestHarness();
	const secondDocument = harness.dom.createDocument();
	const secondLeaf = createMockWorkspaceLeaf({
		filePath: 'docs/popout.md',
		mode: 'source',
		containerEl: secondDocument.body.createDiv({ cls: 'workspace-leaf' }) as unknown as HTMLElement,
	});

	let ensurePreviewCalls = 0;
	const service = createPopoverObserverService({
		isEnabled: () => true,
		getMarkdownLeaves: () => [secondLeaf as never],
		getRelevantDocuments: () => [
			harness.dom.document as unknown as Document,
			secondDocument as unknown as Document,
		],
		shouldForceReadOnlyPath: (path) => path.startsWith('docs/'),
		ensurePreview: async () => {
			ensurePreviewCalls += 1;
		},
	});

	try {
		service.start();
		assert.equal(MockMutationObserver.instances.length, 2);
		const secondObserver = MockMutationObserver.instances.find(
			(observer) => observer.observeCalls[0]?.target === secondDocument.body,
		);
		assert.ok(secondObserver);

		const container = secondLeaf.view.containerEl as unknown as MockHTMLElement;
		const popoverNode = new MockHTMLElement(['.popover']);
		popoverNode.appendChild(new MockHTMLElement(['.cm-editor']));
		container.appendChild(popoverNode);

		secondObserver.trigger([{ addedNodes: [popoverNode] }]);
		await Promise.resolve();

		assert.equal(ensurePreviewCalls, 1);
	} finally {
		harness.restore();
	}
});
