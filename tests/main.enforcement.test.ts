import assert from 'node:assert/strict';
import test from 'node:test';

import { changeSettings } from '../src/settings-lifecycle.js';
import { setRuleEntries } from '../src/rule-state.js';
import { createMockWorkspaceLeaf } from './helpers/obsidian-mocks.js';
import { withPluginHost, withFakeAnimationFrames } from './helpers/test-setup.js';

test('persisted disabled protection leaves notes editable on load and workspace events', async () => {
	await withPluginHost(async ({ plugin, leaf, workspace, advance }) => {
		leaf.setMode('source');
		await plugin.onload();
		workspace.trigger('file-open');
		await advance(150);
		assert.equal(leaf.view.getMode(), 'source');
		assert.equal(leaf.setViewStateCalls.length, 0);
	}, { enabled: false });
});

test('loaded enforcement ignores non-Markdown and fileless leaves', async () => {
	await withPluginHost(async ({ plugin, leaves, workspace, advance }) => {
		const nonMarkdown = createMockWorkspaceLeaf({ filePath: 'docs/file.md', mode: 'source', isMarkdownView: false });
		const fileless = createMockWorkspaceLeaf({ mode: 'source' });
		leaves.splice(0, leaves.length, nonMarkdown, fileless);
		await plugin.onload();
		workspace.trigger('file-open');
		await advance(150);
		assert.equal(nonMarkdown.setViewStateCalls.length, 0);
		assert.equal(fileless.setViewStateCalls.length, 0);
	});
});

test('persisted rules enforce only matching Markdown paths on load and file-open', async () => {
	await withPluginHost(async ({ plugin, leaf, leaves, workspace, advance }) => {
		leaf.setMode('source');
		const nonMatching = createMockWorkspaceLeaf({ filePath: 'notes/no-match.md', mode: 'source' });
		const attachment = createMockWorkspaceLeaf({ filePath: 'docs/not-markdown.txt', mode: 'source' });
		leaves.push(nonMatching, attachment);
		await plugin.onload();
		assert.equal(leaf.view.getMode(), 'preview');
		leaf.setMode('source');
		workspace.trigger('file-open');
		await advance(150);
		assert.equal(leaf.view.getMode(), 'preview');
		assert.equal(leaf.setViewStateCalls.length, 2);
		assert.equal(nonMatching.setViewStateCalls.length, 0);
		assert.equal(attachment.setViewStateCalls.length, 0);
	});
});

test('workspace enforcement writes preview when its deferred frame remains current', async () => {
	await withPluginHost(async ({ plugin, leaf, workspace, advance, settle, unload }) => {
		await plugin.onload();
		await withFakeAnimationFrames(async ({ flushNextFrame, pendingFrameCount }) => {
			try {
				leaf.setMode('source');
				workspace.trigger('active-leaf-change', leaf);
				await advance(150);
				assert.equal(pendingFrameCount(), 1);
				assert.equal(leaf.setViewStateCalls.length, 0);
				await flushNextFrame();
				await settle();
				assert.equal(leaf.view.getMode(), 'preview');
				assert.equal(leaf.setViewStateCalls.length, 1);
			} finally { unload(); }
		});
	});
});

for (const change of ['navigation', 'disable', 'exclude', 'unload', 'close'] as const) {
	test(`host enforcement cancels a pending transition after ${change}`, async () => {
		await withPluginHost(async ({ plugin, leaf, leaves, workspace, advance, settle, unload }) => {
			leaf.setFilePath('docs/A.md');
			await plugin.onload();
			await withFakeAnimationFrames(async ({ flushNextFrame, pendingFrameCount }) => {
				try {
					leaf.setMode('source');
					workspace.trigger('file-open');
					await advance(150);
					assert.equal(pendingFrameCount(), 1);
					switch (change) {
						case 'navigation':
							leaf.setFilePath('docs/B.md');
							workspace.trigger('file-open');
							break;
						case 'disable':
							await changeSettings(plugin, (draft) => { draft.enabled = false; }, 'settings-enabled');
							break;
						case 'exclude':
							await changeSettings(plugin, (draft) => {
								setRuleEntries(draft, 'exclude', [{ sourceKind: 'vault-path', sourceValue: 'docs/**', resolvedPath: 'docs/**', enabled: true }]);
							}, 'settings-rules');
							break;
						case 'unload': unload(); break;
						case 'close':
							leaves.splice(0);
							workspace.trigger('layout-change');
							break;
					}
					await flushNextFrame();
					await settle();
					assert.equal(leaf.view.getMode(), 'source');
					assert.equal(leaf.setViewStateCalls.length, 0);
					assert.equal(pendingFrameCount(), 0);
				} finally { unload(); }
			});
		});
	});
}
