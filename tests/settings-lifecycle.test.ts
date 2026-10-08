/* eslint-disable @typescript-eslint/no-deprecated, obsidianmd/no-unsupported-api -- Exercise both supported Settings branches. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Setting, TFile, TFolder, type App, type Vault, type SettingDefinitionGroup, type SettingDefinition } from 'obsidian';
import ReadOnlyViewPlugin from '../src/main.js';
import { changeSettings } from '../src/settings-lifecycle.js';
import { updateBooleanSetting } from '../src/settings-general.js';
import { applyPathRuleAction } from '../src/path-context-menu.js';
import { ForceReadModeSettingTab } from '../src/settings-tab.js';
import { createMainTestHarness } from './helpers/test-setup.js';
import { MockHTMLElement } from './helpers/dom-mocks.js';
import { mergeLoadedSettings } from '../src/plugin-settings.js';
import type { ForceReadModeSettings } from '../src/plugin-types.js';

async function fixture() {
	const harness = createMainTestHarness();
	const container = new MockHTMLElement();
	container.ownerDocument = harness.dom.document;
	const row = container.createDiv({ cls: 'nav-file-title' });
	row.setAttr('data-path', 'notes/example.md');
	const file = Object.assign(new TFile(), { path: 'notes/example.md', extension: 'md' });
	const folder = Object.assign(new TFolder(), { path: 'notes', children: [file] });
	const vault = {
		on: () => ({}), offref: () => undefined, getName: () => 'test',
		getAbstractFileByPath: (path: string) => path === file.path ? file : folder,
		getFileByPath: () => file, getMarkdownFiles: () => [file],
	} as unknown as Vault;
	const app = {
		vault,
		workspace: {
			...harness.workspace, offref: () => undefined,
			getLeavesOfType: (type: string) => type === 'file-explorer'
				? [{ view: { containerEl: container } }] : harness.workspace.getLeavesOfType(type),
		},
	} as unknown as App;
	const plugin = new ReadOnlyViewPlugin(app, { id: 'read-only-view' } as never);
	plugin.loadData = async () => ({ forceAllMarkdownReadOnly: false, showExplorerProtectionIndicators: true });
	plugin.saveData = async () => undefined;
	await plugin.onload();
	return { plugin, harness, row, app, vault, folder, dispose: () => { plugin.onunload(); harness.restore(); } };
}

function gate() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

test('failed menu save rolls back Explorer and editor protection while a later Settings edit survives', async () => {
	const f = await fixture();
	const first = gate();
	const writes: ForceReadModeSettings[] = [];
	const saveGates = [first.promise];
	f.plugin.saveData = async (data: unknown) => {
		writes.push(mergeLoadedSettings(data));
		await saveGates.shift();
	};
	try {
		const menu = applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		assert.ok(f.row.querySelector('.read-only-view-protection-indicator'));
		assert.equal(f.plugin.shouldForceReadOnlyPath('notes/example.md'), true);
		const settings = updateBooleanSetting(f.plugin, 'debug', true, () => undefined);
		assert.equal(writes.length, 1);
		first.reject(new Error('disk full'));
		await Promise.all([menu, settings]);
		assert.equal(writes.length, 2);
		assert.deepEqual(writes[1]?.includeRules, []);
		assert.equal(writes[1]?.debug, true);
		assert.equal(f.plugin.settings.debug, true);
		assert.equal(f.plugin.shouldForceReadOnlyPath('notes/example.md'), false);
		assert.equal(f.row.querySelector('.read-only-view-protection-indicator'), null);
		assert.equal(f.harness.workspace.updateOptionsCalls, 2);
	} finally { f.dispose(); }
});

test('queued menu edit survives a failed Settings change without persisting the failed value', async () => {
	const f = await fixture();
	const first = gate();
	const writes: ForceReadModeSettings[] = [];
	const saveGates = [first.promise];
	f.plugin.saveData = async (data: unknown) => {
		writes.push(mergeLoadedSettings(data));
		await saveGates.shift();
	};
	try {
		const settings = updateBooleanSetting(f.plugin, 'caseSensitive', false, () => undefined, 'settings-case-sensitive');
		const menu = applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		first.reject(new Error('disk full'));
		await Promise.all([settings, menu]);
		assert.equal(f.plugin.settings.caseSensitive, true);
		assert.deepEqual(writes[1]?.includeRules, ['notes/']);
		assert.equal(writes[1]?.caseSensitive, true);
		assert.ok(f.row.querySelector('.read-only-view-protection-indicator'));
	} finally { f.dispose(); }
});

test('an unchanged matcher does not inspect rules; debug and visual changes reuse it', async () => {
	const f = await fixture();
	try {
		const matcher = f.plugin.getCompiledRuleMatcher();
		for (const key of ['includeRuleEntries', 'excludeRuleEntries', 'includeRules', 'excludeRules'] as const) {
			const value = f.plugin.settings[key];
			Object.defineProperty(f.plugin.settings, key, { configurable: true, get: () => { throw new Error('rules read'); } });
			assert.equal(f.plugin.getCompiledRuleMatcher(), matcher);
			Object.defineProperty(f.plugin.settings, key, { configurable: true, writable: true, enumerable: true, value });
		}
		await updateBooleanSetting(f.plugin, 'debug', true, () => undefined);
		await updateBooleanSetting(f.plugin, 'showExplorerProtectionIndicators', false, () => undefined);
		assert.equal(f.plugin.getCompiledRuleMatcher(), matcher);
		await changeSettings(f.plugin, (draft) => { draft.forceAllMarkdownReadOnly = true; }, 'settings-mode');
		assert.notEqual(f.plugin.getCompiledRuleMatcher(), matcher);
		assert.equal(f.plugin.shouldForceReadOnlyPath('notes/example.md'), true);
	} finally { f.dispose(); }
});

test('open Settings retains a failed menu draft and the same action retries it', async () => {
	const f = await fixture();
	const tab = new ForceReadModeSettingTab(f.app, f.plugin);
	const container = new MockHTMLElement();
	container.ownerDocument = f.harness.dom.document;
	tab.containerEl = container as unknown as HTMLElement;
	tab.display();
	try {
		f.plugin.saveData = async () => { throw new Error('disk full'); };
		await applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		assert.deepEqual(f.plugin.settings.includeRules, []);
		assert.equal(container.querySelector('.read-only-view-rule-input')?.value, 'notes/');
		f.plugin.saveData = async () => undefined;
		await applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		assert.deepEqual(f.plugin.settings.includeRules, ['notes/']);
		assert.ok(f.row.querySelector('.read-only-view-protection-indicator'));
	} finally { tab.hide(); f.dispose(); }
});


const settingsRenderers = [
	{ name: 'legacy', render: (tab: ForceReadModeSettingTab) => tab.display() },
	{ name: 'declarative', render: (tab: ForceReadModeSettingTab) => {
		const group = tab.getSettingDefinitions()[0] as SettingDefinitionGroup;
		const definition = group.items?.[0] as SettingDefinition;
		assert.ok(definition.render);
		definition.render(new Setting(tab.containerEl), {} as never);
	} },
];

for (const { name, render } of settingsRenderers) {
	test(`closing Settings lets in-flight menu saves finish, renderer=${name}`, async () => {
		const f = await fixture();
		const first = gate();
		const writes: ForceReadModeSettings[] = [];
		const saveGates = [first.promise];
		f.plugin.saveData = async (data: unknown) => {
			writes.push(mergeLoadedSettings(data));
			await saveGates.shift();
		};
		const tab = new ForceReadModeSettingTab(f.app, f.plugin);
		const container = new MockHTMLElement();
		container.ownerDocument = f.harness.dom.document;
		tab.containerEl = container as unknown as HTMLElement;
		render(tab);
		try {
			const menu = applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
			const later = applyPathRuleAction(f.plugin, f.vault, Object.assign(new TFolder(), { path: 'Archive', children: [] }), true, () => undefined);
			tab.hide();
			first.resolve();
			await Promise.all([menu, later]);
			assert.equal(writes.length, 2);
			assert.deepEqual(writes[1]?.includeRules, ['notes/', 'Archive/']);
			assert.deepEqual(f.plugin.settings.includeRules, ['notes/', 'Archive/']);
		} finally { tab.hide(); f.dispose(); }
	});
}

test('a Settings refresh during a later failed menu save preserves its draft and error status', async () => {
	const f = await fixture();
	const first = gate();
	const second = gate();
	const saveGates = [first.promise, second.promise];
	f.plugin.saveData = async () => { await saveGates.shift(); };
	const tab = new ForceReadModeSettingTab(f.app, f.plugin);
	const container = new MockHTMLElement();
	container.ownerDocument = f.harness.dom.document;
	tab.containerEl = container as unknown as HTMLElement;
	tab.display();
	const texts = (root: MockHTMLElement): string[] => [root.textContent, ...root.getChildren().flatMap(texts)];
	try {
		const toggle = updateBooleanSetting(f.plugin, 'caseSensitive', false, () => tab.display(), 'settings-case-sensitive');
		const menu = applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		first.resolve();
		await toggle;
		assert.equal(container.querySelector('.read-only-view-rule-input')?.value, 'notes/');
		assert.ok(texts(container).includes('Saving...'));
		second.reject(new Error('disk full'));
		await menu;
		assert.deepEqual(f.plugin.settings.includeRules, []);
		assert.ok(texts(container).includes('Save failed.'));
		assert.equal(container.querySelector('.read-only-view-rule-input')?.value, 'notes/');
		f.plugin.saveData = async () => undefined;
		await applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		assert.deepEqual(f.plugin.settings.includeRules, ['notes/']);
		assert.ok(texts(container).includes('Saved.'));
	} finally { tab.hide(); f.dispose(); }
});

test('closing Settings discards a failed draft before subsequent closed-menu edits', async () => {
	const f = await fixture();
	const tab = new ForceReadModeSettingTab(f.app, f.plugin);
	const container = new MockHTMLElement();
	container.ownerDocument = f.harness.dom.document;
	tab.containerEl = container as unknown as HTMLElement;
	tab.display();
	try {
		f.plugin.saveData = async () => { throw new Error('disk full'); };
		await applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		tab.hide();
		f.plugin.saveData = async () => undefined;
		await applyPathRuleAction(f.plugin, f.vault, Object.assign(new TFolder(), { path: 'Archive', children: [] }), true, () => undefined);
		tab.display();
		assert.deepEqual(container.querySelectorAll('.read-only-view-rule-input').map((input) => input.value), ['Archive/']);
		await applyPathRuleAction(f.plugin, f.vault, f.folder, true, () => undefined);
		assert.deepEqual(f.plugin.settings.includeRules, ['Archive/', 'notes/']);
	} finally { tab.hide(); f.dispose(); }
});
