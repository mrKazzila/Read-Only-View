import { changeSettings } from './settings-lifecycle';
import { Notice, TFile, TFolder, type Menu, type TAbstractFile, type Vault } from 'obsidian';
import { changeFolderRule, folderRulePath, hasActiveFolderRule, setFolderRuleEntries } from './folder-rules';
import { createCompiledRuleMatcher } from './matcher';
import type { IncludeRuleUpdate, SettingsTabPlugin } from './plugin-types';
import { createRuleResolverContext } from './rule-source';
import { changeNoteRule, hasActiveNoteRule } from './note-rules';
import { explainNote, explainFolder, type ReadOnlyExplanation } from './read-only-explanation';
import { buildRuleState } from './rule-state';

export async function applyPathRuleAction(
	plugin: SettingsTabPlugin,
	vault: Vault,
	target: TFolder | TFile,
	lock: boolean,
	notify: (message: string) => void = (message) => { new Notice(message); },
): Promise<void> {
	const isFolder = target instanceof TFolder;
	if (!isFolder && target.extension.toLowerCase() !== 'md') return;
	const update: IncludeRuleUpdate = (settings) => (isFolder ? changeFolderRule : changeNoteRule)(settings, target.path, lock, createRuleResolverContext(vault));
	const editorUpdate = plugin.updateOpenRuleEditor?.(update);
	if (editorUpdate) {
		try {
			const result = await editorUpdate;
			if (result.error) notify(result.error);
			if (result.error || !result.changed) return;
		} catch {
			notify('Could not save the path rule. Your changes remain in Settings for retry.');
			return;
		}
	} else {
		const change = update(plugin.settings);
		if (change.error) { notify(change.error); return; }
		if (!change.changed) return;
		try {
			await changeSettings(plugin, (draft) => {
				const rebased = update(draft);
				if (rebased.error) throw new Error(rebased.error);
				setFolderRuleEntries(draft, rebased.entries);
			}, 'path-context-menu');
		} catch {
			notify('Could not save or apply the path rule. Please try again.');
			return;
		}
	}
	if (!plugin.settings.enabled) {
		notify('Path rule saved. Read Only View is currently disabled.');
		return;
	}
	if (plugin.settings.forceAllMarkdownReadOnly) {
		notify('Path rule saved. All Markdown files mode remains active; Exclude rules still take priority.');
	}
	const matcher = createCompiledRuleMatcher(plugin.settings);
	const prefix = `${folderRulePath(target.path)}/`;
	const descendants = isFolder
		? vault.getMarkdownFiles().filter((file) => file.path.startsWith(prefix))
		: [target];
	if (lock && descendants.some((file) => matcher.matchExcludeRules(file.path).length > 0)) {
		notify(isFolder ? 'An Exclude rule takes priority for some existing notes in this folder.' : 'An Exclude rule takes priority for this note.');
	} else if (!lock && !plugin.settings.forceAllMarkdownReadOnly && descendants.some((file) => matcher.shouldForceReadOnly(file.path))) {
		notify(isFolder ? 'Some existing notes in this folder remain protected by another rule.' : 'This note remains protected by another rule.');
	}
	const { limits } = buildRuleState(plugin.settings);
	if (limits.hardCapExceeded) notify('Path rule saved. Some rules are ignored because the rule limit is exceeded.');
}

/** Walk only the selected subtree, using already-loaded vault metadata. */
export function* markdownDescendantPaths(folder: TFolder): Generator<string> {
	const pending = [...folder.children].reverse();
	while (pending.length) {
		const child = pending.pop();
		if (child instanceof TFolder) {
			for (let index = child.children.length - 1; index >= 0; index--) pending.push(child.children[index]!);
		} else if (child instanceof TFile && child.extension.toLowerCase() === 'md') yield child.path;
	}
}

export function addPathContextMenu(
	menu: Menu,
	file: TAbstractFile,
	plugin: SettingsTabPlugin,
	vault: Vault,
	showExplanation: (explanation: ReadOnlyExplanation) => void,
): void {
	if (!(file instanceof TFolder) && !(file instanceof TFile && file.extension.toLowerCase() === 'md')) return;
	menu.addItem((item) => item
		.setTitle('Explain read-only status')
		.setIcon('info')
		.onClick(() => {
			const matcher = plugin.getCompiledRuleMatcher?.() ?? createCompiledRuleMatcher(plugin.settings);
			showExplanation(file instanceof TFolder
				? { kind: 'folder', path: `${folderRulePath(file.path)}/`, result: explainFolder(markdownDescendantPaths(file), plugin.settings, matcher) }
				: { kind: 'note', path: file.path, result: explainNote(file.path, plugin.settings, matcher) });
		}));
	if (!folderRulePath(file.path)) return;
	const lock = !(file instanceof TFolder ? hasActiveFolderRule : hasActiveNoteRule)(plugin.settings, file.path);
	menu.addItem((item) => item
		.setTitle(lock ? 'Lock → Reading' : 'Unlock')
		.setIcon(lock ? 'lock' : 'unlock')
		.onClick(() => applyPathRuleAction(plugin, vault, file, lock)));
}
