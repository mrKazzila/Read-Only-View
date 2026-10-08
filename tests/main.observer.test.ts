import assert from 'node:assert/strict';
import test from 'node:test';

import { changeSettings } from '../src/settings-lifecycle.js';
import { setRuleEntries } from '../src/rule-state.js';
import { MockHTMLElement, MockMutationObserver } from './helpers/dom-mocks.js';
import { createMockWorkspaceLeaf, type MockWorkspaceLeaf } from './helpers/obsidian-mocks.js';
import { withPluginHost } from './helpers/test-setup.js';

function addPopover(leaf: MockWorkspaceLeaf): MockHTMLElement {
	const popover = new MockHTMLElement(['.hover-popover']);
	popover.appendChild(new MockHTMLElement(['.cm-editor']));
	(leaf.view.containerEl as unknown as MockHTMLElement).appendChild(popover);
	return popover;
}

test('loaded observer forces a matching popover into preview', async () => {
	await withPluginHost(async ({ plugin, leaf, settle }) => {
		await plugin.onload();
		const observer = MockMutationObserver.instances[0]!;
		leaf.setMode('source');
		observer.trigger([{ addedNodes: [addPopover(leaf)] }]);
		await settle();
		assert.equal(leaf.view.getMode(), 'preview');
		assert.deepEqual(leaf.setViewStateCalls.map((call) => call.arg), [{ replace: true }]);
	});
});

for (const change of ['disable', 'exclude'] as const) {
	test(`loaded observer honors accepted ${change} settings`, async () => {
		await withPluginHost(async ({ plugin, leaf, settle }) => {
			await plugin.onload();
			await changeSettings(plugin, (draft) => {
				if (change === 'disable') draft.enabled = false;
				else setRuleEntries(draft, 'exclude', [{ sourceKind: 'vault-path', sourceValue: 'docs/**', resolvedPath: 'docs/**', enabled: true }]);
			}, 'settings-rules');
			leaf.setMode('source');
			MockMutationObserver.instances[0]!.trigger([{ addedNodes: [addPopover(leaf)] }]);
			await settle();
			assert.equal(leaf.view.getMode(), 'source');
			assert.equal(leaf.setViewStateCalls.length, 0);
		});
	});
}

for (const invalidate of ['layout-change', 'unload/reload'] as const) {
	test(`${invalidate} discards a cached leaf when its container is reused`, async () => {
		await withPluginHost(async ({ plugin, leaf, leaves, workspace, unload, settle }) => {
			await plugin.onload();
			const popover = addPopover(leaf);
			MockMutationObserver.instances[0]!.trigger([{ addedNodes: [popover] }]);
			await settle(); // Populate the cache while the original leaf is already in preview.
			if (invalidate === 'unload/reload') unload();
			const replacement = createMockWorkspaceLeaf({
				filePath: 'docs/replacement.md', mode: 'preview', containerEl: leaf.view.containerEl,
			});
			leaves.splice(0, 1, replacement);
			if (invalidate === 'unload/reload') await plugin.onload();
			else workspace.trigger('layout-change');
			replacement.setMode('source');
			const observer = MockMutationObserver.instances.at(-1)!;
			observer.trigger([{ addedNodes: [popover] }]);
			await settle(); // Do not flush the scheduled full reapply: the mutation must do the work.
			assert.equal(replacement.view.getMode(), 'preview');
			assert.equal(replacement.setViewStateCalls.length, 1);
			assert.equal(leaf.setViewStateCalls.length, 0);
		});
	});
}

test('workspace reconciliation observes a new popout document and unload disconnects all observers', async () => {
	await withPluginHost(async ({ plugin, dom, leaves, workspace, unload, settle, advance, pendingTimers }) => {
		await plugin.onload();
		assert.equal(MockMutationObserver.instances.length, 1);
		const popoutDocument = dom.createDocument();
		const popoutLeaf = createMockWorkspaceLeaf({
			filePath: 'docs/popout.md', mode: 'source',
			containerEl: popoutDocument.body.createDiv({ cls: 'workspace-leaf' }) as unknown as HTMLElement,
		});
		leaves.push(popoutLeaf);
		workspace.trigger('layout-change');
		assert.equal(MockMutationObserver.instances.length, 2);
		const observer = MockMutationObserver.instances[1]!;
		assert.equal(observer.observeCalls[0]?.target, popoutDocument.body);
		observer.trigger([{ addedNodes: [addPopover(popoutLeaf)] }]);
		await settle();
		assert.equal(popoutLeaf.view.getMode(), 'preview');
		assert.equal(pendingTimers(), 1);
		unload();
		assert.ok(MockMutationObserver.instances.every((entry) => entry.disconnected));
		assert.equal(pendingTimers(), 0);
		popoutLeaf.setMode('source');
		workspace.trigger('file-open');
		await advance(1_000);
		assert.equal(popoutLeaf.view.getMode(), 'source');
		assert.equal(popoutLeaf.setViewStateCalls.length, 1);
	});
});

for (const events of [
	['active-leaf-change'],
	['active-leaf-change', 'file-open'],
	['active-leaf-change', 'file-open', 'layout-change'],
	['file-open', 'active-leaf-change-without-leaf', 'layout-change'],
]) {
	test(`host burst ${events.join(' + ')} enforces the expected leaves after coalescing`, async () => {
		await withPluginHost(async ({ plugin, leaf, leaves, workspace, advance, pendingTimers }) => {
			const other = createMockWorkspaceLeaf({ filePath: 'docs/other.md', mode: 'preview' });
			leaves.push(other);
			await plugin.onload();
			leaf.setMode('source');
			other.setMode('source');
			for (const event of events) {
				if (event === 'active-leaf-change-without-leaf') workspace.trigger('active-leaf-change');
				else workspace.trigger(event, event === 'active-leaf-change' ? leaf : undefined);
			}
			assert.equal(pendingTimers(), 1);
			assert.equal(leaf.setViewStateCalls.length, 0);
			assert.equal(other.setViewStateCalls.length, 0);
			await advance(149);
			assert.equal(leaf.view.getMode(), 'source');
			await advance(1);
			assert.equal(leaf.view.getMode(), 'preview');
			assert.equal(leaf.setViewStateCalls.length, 1);
			assert.equal(other.view.getMode(), events.includes('layout-change') ? 'preview' : 'source');
			assert.equal(other.setViewStateCalls.length, events.includes('layout-change') ? 1 : 0);
			assert.equal(pendingTimers(), 0);
		});
	});
}

test('registered re-apply command forces preview before the workspace timer fires', async () => {
	await withPluginHost(async ({ plugin, leaf, workspace, commands, advance, pendingTimers }) => {
		await plugin.onload();
		leaf.setMode('source');
		workspace.trigger('file-open');
		assert.equal(leaf.setViewStateCalls.length, 0);
		const command = commands.get('re-apply-rules-now');
		assert.ok(command?.callback);
		await command.callback();
		assert.equal(leaf.view.getMode(), 'preview');
		assert.equal(leaf.setViewStateCalls.length, 1);
		assert.equal(pendingTimers(), 1);
		leaf.setMode('source');
		await advance(150);
		assert.equal(leaf.view.getMode(), 'preview');
		assert.equal(leaf.setViewStateCalls.length, 2);
	});
});
