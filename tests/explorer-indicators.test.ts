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
	const counts = { rowVisits: 0, matcherCalls: 0, lookups: 0 };
	const controller = new ExplorerIndicatorController(app, () => matcher, counts);
	const add = (path: string, folder = false, parent = container) => {
		const file = folder ? new TFolder() : new TFile();
		file.path = path;
		files.set(path, file);
		const row = parent.createDiv({ cls: folder ? 'nav-folder-title' : 'nav-file-title' });
		row.setAttr('data-path', path);
		return row;
	};
	const mutate = async (target: MockHTMLElement, addedNodes: MockHTMLElement[] = [], removedNodes: MockHTMLElement[] = []) => {
		MockMutationObserver.instances.at(-1)?.trigger([{ target, addedNodes, removedNodes }]);
		await Promise.resolve();
	};
	return { app, dom, container, settings, files, listeners, controller, add, mutate, counts,
		lookups: () => lookups,
		openPane: (pane: MockHTMLElement) => { leaves.push({ view: { containerEl: pane } }); listeners.get('layout-change')?.(); },
		closePane: (pane: MockHTMLElement) => { leaves = leaves.filter((leaf) => leaf.view.containerEl !== pane); listeners.get('layout-change')?.(); },
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

// Deterministic operation counts, not a browser timing benchmark.
test('profile targeted Explorer work with 2000 visible rows', async (t) => {
	const f = fixture();
	try {
		for (let i = 0; i < 2000; i++) f.add(`Notes/${i}.md`);
		f.controller.start();
		const measure = async (name: string, action: () => void | Promise<void>) => {
			Object.assign(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
			await action();
			await Promise.resolve();
			t.diagnostic(`${name}: ${JSON.stringify(f.counts)}`);
			assert.ok(f.counts.rowVisits <= 3, `${name} visits unrelated rows`);
		};
		await measure('unchanged refresh', () => f.controller.refresh());
		const created = f.add('Notes/New.md');
		await measure('create', async () => {
			f.listeners.get('create')?.(f.files.get('Notes/New.md'));
			await f.mutate(f.container, [created]);
		});
		const file = f.files.get('Notes/New.md')!;
		await measure('rename', async () => {
			f.files.delete(file.path);
			file.path = 'Elsewhere/New.md';
			f.files.set(file.path, file);
			created.setAttr('data-path', file.path);
			f.listeners.get('rename')?.(file, 'Notes/New.md');
			await f.mutate(created);
		});
		await measure('delete', async () => {
			f.files.delete(file.path);
			f.listeners.get('delete')?.(file);
			created.remove();
			await f.mutate(f.container, [], [created]);
		});
	} finally { f.controller.stop(); f.dom.restore(); }
});

test('debug saves reuse Explorer decisions while protection changes update locks', async () => {
	const f = fixture();
	const plugin = new ReadOnlyViewPlugin(f.app, {} as never);
	plugin.settings = { ...f.settings, showExplorerProtectionIndicators: true };
	plugin.saveData = async () => {};
	const controller = new ExplorerIndicatorController(f.app, () => plugin.getCompiledRuleMatcher(), f.counts);
	Object.assign(plugin, { explorerIndicators: controller });
	try {
		const note = f.add('Notes/Test.md');
		await changeSettings(plugin, () => undefined);
		assert.ok(note.querySelector(iconSelector));
		Object.assign(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		await changeSettings(plugin, (draft) => { draft.debug = true; });
		assert.deepEqual(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		await changeSettings(plugin, (draft) => { draft.excludeRules = ['Notes/']; });
		assert.equal(note.querySelector(iconSelector), null);
	} finally { controller.stop(); f.dom.restore(); }
});

test('folder rename invalidates descendants in every pane before and after DOM paths change', async () => {
	const f = fixture();
	try {
		const folder = f.add('Notes', true);
		const note = f.add('Notes/Test.md');
		const excluded = f.add('Notes/Drafts/Test.md');
		const unrelated = f.add('NotesOther/Test.md');
		const popup = f.dom.createDocument().body.createDiv();
		const duplicate = f.add('Notes/Test.md', false, popup);
		f.controller.start();
		f.openPane(popup);
		assert.ok(duplicate.querySelector(iconSelector));
		const folderFile = f.files.get('Notes')!;
		for (const [path, file] of [...f.files]) {
			if (path === 'Notes' || path.startsWith('Notes/')) {
				f.files.delete(path);
				file.path = path.replace('Notes', 'Elsewhere');
				f.files.set(file.path, file);
			}
		}
		Object.assign(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		f.listeners.get('rename')?.(folderFile, 'Notes');
		await Promise.resolve();
		assert.equal(f.counts.lookups, 4);
		for (const row of [folder, note, excluded, duplicate]) assert.equal(row.querySelector(iconSelector), null);
		assert.equal(unrelated.querySelector(iconSelector), null);
		// Each pane may update data-path in a later observer delivery.
		for (const row of [folder, note, excluded, duplicate]) {
			row.setAttr('data-path', row.getAttribute('data-path')!.replace('Notes', 'Elsewhere'));
			await f.mutate(row);
		}
		f.settings.includeRules = ['Elsewhere/'];
		f.settings.excludeRules = ['Elsewhere/Drafts/'];
		f.refresh();
		assert.ok(note.querySelector(iconSelector));
		assert.ok(duplicate.querySelector(iconSelector));
		assert.equal(excluded.querySelector(iconSelector), null);
		f.closePane(f.container);
		assert.equal(note.querySelector(iconSelector), null);
		assert.ok(duplicate.querySelector(iconSelector));
		Object.assign(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		f.files.delete('Elsewhere/Test.md');
		f.listeners.get('delete')?.({ path: 'Elsewhere/Test.md' });
		await Promise.resolve();
		assert.equal(f.counts.lookups, 1);
		assert.equal(duplicate.querySelector(iconSelector), null);
	} finally { f.controller.stop(); f.dom.restore(); }
});

test('removed subtrees are forgotten while reattached rows keep their indicators', async () => {
	const f = fixture();
	try {
		const group = f.container.createDiv();
		const note = f.add('Notes/Test.md', false, group);
		const other = f.add('Notes/Other.md');
		f.controller.start();
		group.remove();
		f.container.appendChild(group);
		await f.mutate(f.container, [group], [group]);
		assert.equal(note.querySelectorAll(iconSelector).length, 1);
		const label = other.createSpan({ text: 'Other' });
		label.remove();
		Object.assign(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		await f.mutate(other, [], [label]);
		assert.deepEqual(f.counts, { rowVisits: 1, matcherCalls: 0, lookups: 0 });
		group.remove();
		await f.mutate(f.container, [], [group]);
		assert.equal(note.querySelector(iconSelector), null);
		Object.assign(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		f.listeners.get('delete')?.({ path: 'Notes/Test.md' });
		await Promise.resolve();
		assert.deepEqual(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		const replacement = f.add('Notes/Test.md');
		await f.mutate(f.container, [replacement]);
		assert.equal(replacement.querySelectorAll(iconSelector).length, 1);
	} finally { f.controller.stop(); f.dom.restore(); }
});

test('closing an emptied pane forgets rows before queued removal records arrive', async () => {
	const f = fixture();
	try {
		const note = f.add('Notes/Test.md');
		f.controller.start();
		note.remove();
		f.closeExplorer();
		assert.equal(note.querySelector(iconSelector), null);
		Object.assign(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
		f.listeners.get('delete')?.({ path: 'Notes/Test.md' });
		await Promise.resolve();
		assert.deepEqual(f.counts, { rowVisits: 0, matcherCalls: 0, lookups: 0 });
	} finally { f.controller.stop(); f.dom.restore(); }
});
