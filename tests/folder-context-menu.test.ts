import assert from 'node:assert/strict';
import test from 'node:test';
import { TFile, TFolder, type App, type Menu, type MenuItem, type Vault } from 'obsidian';
import { addPathContextMenu, applyPathRuleAction } from '../src/path-context-menu.js';
import ReadOnlyViewPlugin from '../src/main.js';
import { mergeLoadedSettings } from '../src/plugin-settings.js';
import type { SettingsTabPlugin } from '../src/plugin-types.js';
import { createMainTestHarness } from './helpers/test-setup.js';
import { RULE_LIMIT_INCLUDE_MAX } from '../src/constants.js';

function folder(path = 'notes'): TFolder {
	return Object.assign(new TFolder(), { path });
}
const vault = {
	getName: () => 'test',
	getFileByPath: (path: string) => Object.assign(new TFile(), { path, extension: 'md' }),
	getAbstractFileByPath: () => folder(),
	getMarkdownFiles: () => [{ path: 'notes/example.md' }],
} as unknown as Vault;

function fixture() {
	const calls: string[] = [];
	const notices: string[] = [];
	const plugin: SettingsTabPlugin = {
		settings: mergeLoadedSettings({ forceAllMarkdownReadOnly: false }),
		saveSettings: async () => { calls.push('save'); },
		refreshEditorOptions: () => { calls.push('refresh'); },
		applyAllOpenMarkdownLeaves: async () => { calls.push('apply'); },
	};
	return { plugin, calls, notices, notify: (message: string) => { notices.push(message); } };
}

test('Markdown menu callbacks lock and unlock the note while attachments have no action', async () => {
	const { plugin } = fixture();
	const titles: string[] = [];
	let click: (() => Promise<void>) | undefined;
	const item = {
		setTitle(title: string) { titles.push(title); return this; },
		setIcon() { return this; },
		onClick(callback: () => Promise<void>) { click = callback; return this; },
	} as unknown as MenuItem;
	const menu = { addItem: (callback: (item: MenuItem) => void) => callback(item) } as unknown as Menu;
	addPathContextMenu(menu, Object.assign(new TFile(), { path: 'image.png', extension: 'png' }), plugin, vault, () => {});
	assert.deepEqual(titles, []);
	const note = Object.assign(new TFile(), { path: 'notes/example.md', extension: 'md' });
	addPathContextMenu(menu, note, plugin, vault, () => {});
	assert.ok(click);
	await click();
	assert.equal(plugin.settings.includeRuleEntries?.[0]?.enabled, true);
	addPathContextMenu(menu, note, plugin, vault, () => {});
	await click();
	assert.equal(plugin.settings.includeRuleEntries?.[0]?.enabled, false);
	assert.deepEqual(titles, ['Explain read-only status', 'Lock → Reading', 'Explain read-only status', 'Unlock']);
});

test('folder menu skips root and reflects enabled rules and mode changes', () => {
	const { plugin } = fixture();
	const titles: string[] = [];
	const item = {
		setTitle(title: string) { titles.push(title); return this; },
		setIcon() { return this; }, onClick() { return this; },
	} as unknown as MenuItem;
	const menu = { addItem: (callback: (item: MenuItem) => void) => callback(item) } as unknown as Menu;
	addPathContextMenu(menu, new TFile(), plugin, vault, () => {});
	addPathContextMenu(menu, folder('/'), plugin, vault, () => {});
	assert.deepEqual(titles, ['Explain read-only status']);
	titles.length = 0;
	addPathContextMenu(menu, folder(), plugin, vault, () => {});
	plugin.settings = mergeLoadedSettings({ includeRules: ['notes/'] });
	addPathContextMenu(menu, folder(), plugin, vault, () => {});
	plugin.settings.useGlobPatterns = true;
	addPathContextMenu(menu, folder(), plugin, vault, () => {});
	assert.deepEqual(titles, ['Explain read-only status', 'Lock → Reading', 'Explain read-only status', 'Unlock', 'Explain read-only status', 'Lock → Reading']);
});

test('actions persist, refresh, and reapply in order; repeated actions are safe', async () => {
	const { plugin, calls, notify } = fixture();
	await applyPathRuleAction(plugin, vault, folder(), true, notify);
	assert.deepEqual(calls, ['save', 'refresh', 'apply']);
	await applyPathRuleAction(plugin, vault, folder(), true, notify);
	assert.equal(calls.length, 3);
	await applyPathRuleAction(plugin, vault, folder(), false, notify);
	assert.deepEqual(calls, ['save', 'refresh', 'apply', 'save', 'refresh', 'apply']);
	assert.deepEqual(plugin.settings.includeRuleEnabled, [false]);
});

test('failed save restores previous rules and does not claim success or apply protection', async () => {
	const { plugin, calls, notices, notify } = fixture();
	const before = structuredClone(plugin.settings);
	plugin.saveSettings = () => Promise.reject(new Error('disk full'));
	await applyPathRuleAction(plugin, vault, folder(), true, notify);
	assert.deepEqual(plugin.settings, before);
	assert.deepEqual(calls, ['refresh']);
	assert.match(notices[0] ?? '', /Could not save/);
});

test('notices explain exclusions, inherited protection, global mode, disabled plugin and limits', async () => {
	const { plugin, notices, notify } = fixture();
	plugin.settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false, excludeRules: ['notes/'] });
	await applyPathRuleAction(plugin, vault, folder(), true, notify);
	assert.match(notices.pop() ?? '', /Exclude rule/);
	plugin.settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false, includeRules: ['notes/', 'notes/**'], useGlobPatterns: true });
	await applyPathRuleAction(plugin, vault, folder(), false, notify);
	assert.equal(plugin.settings.includeRuleEnabled.every((enabled) => !enabled), true);
	plugin.settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false, includeRules: ['notes/', '**'], useGlobPatterns: true });
	await applyPathRuleAction(plugin, vault, folder(), false, notify);
	assert.match(notices.pop() ?? '', /another rule/);
	plugin.settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: true });
	await applyPathRuleAction(plugin, vault, folder(), true, notify);
	assert.match(notices.pop() ?? '', /All Markdown files/);
	plugin.settings.enabled = false;
	await applyPathRuleAction(plugin, vault, folder(), false, notify);
	assert.match(notices.pop() ?? '', /disabled/);
	plugin.settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false, includeRules: Array.from({ length: RULE_LIMIT_INCLUDE_MAX }, (_, i) => `folder${i}/`) });
	await applyPathRuleAction(plugin, vault, folder(), true, notify);
	assert.match(notices.pop() ?? '', /rule limit/);
	assert.equal(plugin.settings.includeRuleEntries?.length, RULE_LIMIT_INCLUDE_MAX + 1);
});

for (const target of [folder(), Object.assign(new TFile(), { path: 'notes/example.md', extension: 'md' })]) {
test(`real plugin saves and enforces an open leaf for ${target.path}`, async () => {
	const harness = createMainTestHarness();
	const plugin = new ReadOnlyViewPlugin(harness.app as unknown as App, {
		id: 'read-only-view', name: 'Read Only View', version: '1.1.3', minAppVersion: '1.10.3', author: 'test', description: 'test',
	});
	let saved: unknown;
	plugin.saveData = async (data: unknown) => { saved = structuredClone(data); };
	plugin.settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false });
	try {
		const before = plugin.getCompiledRuleMatcher();
		await applyPathRuleAction(plugin, vault, target, true, () => undefined);
		assert.notEqual(plugin.getCompiledRuleMatcher(), before);
		assert.equal(harness.leaves[0]?.getViewState().state.mode, 'preview');
		assert.equal(harness.workspace.updateOptionsCalls, 1);
		assert.equal(mergeLoadedSettings(saved).includeRuleEntries?.[0]?.enabled, true);
		await applyPathRuleAction(plugin, vault, target, false, () => undefined);
		assert.equal(plugin.shouldForceReadOnlyPath('notes/example.md'), false);
		assert.equal(mergeLoadedSettings(saved).includeRuleEntries?.[0]?.enabled, false);
	} finally {
		plugin.onunload();
		harness.restore();
	}
});

}
