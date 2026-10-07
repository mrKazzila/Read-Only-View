import { changeSettings } from '../src/settings-lifecycle.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { type App, TFile, TFolder } from 'obsidian';
import ReadOnlyViewPlugin from '../src/main.js';
import { ExplorerIndicatorController } from '../src/explorer-indicators.js';
import { createCompiledRuleMatcher } from '../src/matcher.js';
import { DEFAULT_SETTINGS, mergeLoadedSettings } from '../src/plugin-settings.js';
import { installDomMocks, MockHTMLElement, MockMutationObserver } from './helpers/dom-mocks.js';

const iconSelector = '.read-only-view-protection-indicator';

function fixture() {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const settings = { ...DEFAULT_SETTINGS, forceAllMarkdownReadOnly: false,
		includeRules: ['Notes/'], excludeRules: ['Notes/Drafts/'] };
	let matcher = createCompiledRuleMatcher(settings);
	let lookups = 0;
	const files = new Map<string, TFile | TFolder>();
	const listeners = new Map<string, (...args: unknown[]) => void>();
	const events = {
		on: (name: string, callback: (...args: unknown[]) => void) => {
			listeners.set(name, callback);
			return name;
		},
		offref: (name: string) => listeners.delete(name),
	};
	let leaves = [{ view: { containerEl: container } }];
	const app = {
		workspace: { ...events, getLeavesOfType: () => leaves },
		vault: { ...events, getAbstractFileByPath: (path: string) => { lookups++; return files.get(path) ?? null; } },
	} as unknown as App;
	const controller = new ExplorerIndicatorController(app, () => matcher);
	const add = (path: string, folder = false) => {
		const file = folder ? new TFolder() : new TFile();
		file.path = path;
		files.set(path, file);
		const row = container.createDiv({ cls: folder ? 'nav-folder-title' : 'nav-file-title' });
		row.setAttr('data-path', path);
		return row;
	};
	const mutate = async (target: MockHTMLElement, addedNodes: MockHTMLElement[] = [], removedNodes: MockHTMLElement[] = []) => {
		MockMutationObserver.instances.at(-1)?.trigger([{ target, addedNodes, removedNodes }]);
		await Promise.resolve();
	};
	return { app, dom, container, settings, files, listeners, controller, add, mutate,
		lookups: () => lookups,
		refresh: () => { matcher = createCompiledRuleMatcher(settings); controller.refresh(); },
		closeExplorer: () => { leaves = []; listeners.get('layout-change')?.(); },
	};
}

test('Explorer setting is opt-in for new, legacy and invalid settings, and persists true', () => {
	for (const input of [null, {}, { enabled: true }, { showExplorerProtectionIndicators: 'true' }]) {
		assert.equal(mergeLoadedSettings(input).showExplorerProtectionIndicators, false);
	}
	assert.equal(mergeLoadedSettings({ showExplorerProtectionIndicators: true }).showExplorerProtectionIndicators, true);
});

test('shared protection decision handles folders, exclusions, global state, glob and file types', () => {
	const settings = { ...DEFAULT_SETTINGS, forceAllMarkdownReadOnly: false,
		includeRules: ['Notes/'], excludeRules: ['Notes/Drafts/'] };
	let matcher = createCompiledRuleMatcher(settings);
	for (const path of ['Notes/Test.md', 'Notes/Reference/API.md']) assert.equal(matcher.shouldForceReadOnly(path), true);
	for (const path of ['Notes/', 'Notes/Reference/']) assert.equal(matcher.isPathProtected(path, 'folder'), true);
	assert.equal(matcher.isPathProtected('Notes', 'folder'), true);
	assert.equal(matcher.isPathProtected('Notes/Drafts/', 'folder'), false);
	assert.equal(matcher.shouldForceReadOnly('Notes/Drafts/Test.md'), false);
	for (const ext of ['png', 'pdf', 'canvas', 'txt']) assert.equal(matcher.isPathProtected(`Notes/file.${ext}`, 'file'), false);
	settings.enabled = false;
	matcher = createCompiledRuleMatcher(settings);
	assert.equal(matcher.isPathProtected('Notes/', 'folder'), false);
	assert.equal(matcher.shouldForceReadOnly('Notes/Test.md'), false);
	settings.enabled = true;
	settings.useGlobPatterns = true;
	settings.includeRules = ['Notes/**'];
	settings.excludeRules = ['Notes/Drafts/**'];
	matcher = createCompiledRuleMatcher(settings);
	assert.equal(matcher.isPathProtected('Notes/Reference', 'folder'), true);
	assert.equal(matcher.isPathProtected('Notes/Drafts', 'folder'), false);
});

test('Explorer refresh is idempotent; stop removes indicators and all feature observers/listeners', () => {
	const f = fixture();
	try {
		const note = f.add('Notes/Test.md');
		const folder = f.add('Notes', true);
		const excluded = f.add('Notes/Drafts', true);
		const attachment = f.add('Notes/image.png');
		assert.equal(f.listeners.size, 0);
		assert.equal(MockMutationObserver.instances.length, 0);
		f.controller.start();
		f.controller.refresh();
		f.controller.refresh();
		assert.equal(note.querySelectorAll(iconSelector).length, 1);
		assert.equal(folder.querySelectorAll(iconSelector).length, 1);
		assert.equal(excluded.querySelector(iconSelector), null);
		assert.equal(attachment.querySelector(iconSelector), null);
		f.settings.excludeRules = ['Notes/'];
		f.refresh();
		assert.equal(f.container.querySelector(iconSelector), null);
		f.settings.excludeRules = [];
		f.refresh();
		assert.ok(note.querySelector(iconSelector));
		f.controller.stop();
		assert.equal(f.container.querySelector(iconSelector), null);
		assert.equal(f.listeners.size, 0);
		assert.ok(MockMutationObserver.instances.every((observer) => observer.disconnected));
	} finally { f.controller.stop(); f.dom.restore(); }
});

test('targeted DOM updates handle creation, recycled paths, rerenders, moves and deletion', async () => {
	const f = fixture();
	try {
		f.add('Notes/Existing.md');
		f.controller.start();
		const created = f.add('Notes/New.md');
		const before = f.lookups();
		await f.mutate(f.container, [created]);
		assert.equal(f.lookups(), before + 1);
		const icon = created.querySelector(iconSelector);
		assert.ok(icon);
		await f.mutate(created, [icon]);
		assert.equal(f.lookups(), before + 1);
		icon.remove();
		await f.mutate(created, [], [icon]);
		assert.ok(created.querySelector(iconSelector));
		// Native title replacement must also preserve the indicator.
		await f.mutate(created, [created.createSpan({ text: 'New' })]);
		assert.ok(created.querySelector(iconSelector));
		assert.equal(f.lookups(), before + 1);
		const file = f.files.get('Notes/New.md');
		assert.ok(file);
		f.files.delete(file.path);
		file.path = 'Elsewhere/New.md';
		f.files.set(file.path, file);
		created.setAttr('data-path', file.path);
		f.listeners.get('rename')?.(file, 'Notes/New.md');
		await f.mutate(created);
		assert.equal(created.querySelector(iconSelector), null);
		f.settings.forceAllMarkdownReadOnly = true;
		f.refresh();
		assert.ok(created.querySelector(iconSelector));
		f.files.delete(file.path);
		f.listeners.get('delete')?.(file);
		await Promise.resolve();
		assert.equal(created.querySelector(iconSelector), null);
		f.closeExplorer();
		assert.equal(f.container.querySelector(iconSelector), null);
	} finally { f.controller.stop(); f.dom.restore(); }
});

test('stopping cancels queued rendering, including across a restart', async () => {
	const f = fixture();
	try {
		f.controller.start();
		const note = f.add('Notes/Test.md');
		const mutation = f.mutate(f.container, [note]);
		f.controller.stop();
		await mutation;
		assert.equal(note.querySelector(iconSelector), null);
		f.controller.start();
		assert.ok(note.querySelector(iconSelector));
		f.settings.enabled = false;
		f.refresh();
		assert.equal(note.querySelector(iconSelector), null);
	} finally { f.controller.stop(); f.dom.restore(); }
});


test('saving the feature/global toggles synchronizes Explorer immediately and persists the setting', async () => {
	const f = fixture();
	try {
		const plugin = new ReadOnlyViewPlugin(f.app, {} as never);
		plugin.settings = { ...f.settings };
		const controller = new ExplorerIndicatorController(f.app, () => plugin.getCompiledRuleMatcher());
		Object.assign(plugin, { explorerIndicators: controller });
		let persisted = false;
		plugin.saveData = async (data: unknown) => {
			persisted = mergeLoadedSettings(data).showExplorerProtectionIndicators;
		};
		const note = f.add('Notes/Test.md');
		await changeSettings(plugin, () => undefined);
		assert.equal(f.listeners.size, 0);
		await changeSettings(plugin, (draft) => { draft.showExplorerProtectionIndicators = true; });
		assert.equal(persisted, true);
		assert.ok(note.querySelector(iconSelector));
		await changeSettings(plugin, (draft) => { draft.enabled = false; });
		assert.equal(note.querySelector(iconSelector), null);
		assert.equal(f.listeners.size, 0);
		await changeSettings(plugin, (draft) => { draft.enabled = true; });
		assert.ok(note.querySelector(iconSelector));
		const saving = changeSettings(plugin, (draft) => { draft.showExplorerProtectionIndicators = false; });
		assert.equal(note.querySelector(iconSelector), null);
		assert.equal(f.listeners.size, 0);
		await saving;
		assert.equal(persisted, false);
		controller.stop();
	} finally { f.dom.restore(); }
});
