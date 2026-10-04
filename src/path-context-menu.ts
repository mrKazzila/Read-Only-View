import { Notice, TFile, TFolder, type Menu, type TAbstractFile, type Vault } from 'obsidian';
import { changeFolderRule, folderRulePath, hasActiveFolderRule, setFolderRuleEntries } from './folder-rules';
import { createCompiledRuleMatcher } from './matcher';
import type { IncludeRuleUpdate, SettingsTabPlugin } from './plugin-types';
import { createRuleResolverContext } from './rule-source';
import { changeNoteRule, hasActiveNoteRule } from './note-rules';
import { buildEffectiveRules } from './rule-limits';

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
		const previous = {
			includeRuleEntries: plugin.settings.includeRuleEntries,
			includeRules: plugin.settings.includeRules,
			includeRuleEnabled: plugin.settings.includeRuleEnabled,
		};
		setFolderRuleEntries(plugin.settings, change.entries);
		try {
			await plugin.saveSettings();
		} catch {
			Object.assign(plugin.settings, previous);
			plugin.refreshEditorOptions();
			notify('Could not save the path rule. Please try again.');
			return;
		}
		try {
			plugin.refreshEditorOptions();
			await plugin.applyAllOpenMarkdownLeaves('path-context-menu');
		} catch {
			notify('Path rule saved, but could not re-apply it to open notes.');
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
	const limits = buildEffectiveRules(
		plugin.settings.includeRules.filter((_, index) => plugin.settings.includeRuleEnabled[index] !== false),
		plugin.settings.excludeRules.filter((_, index) => plugin.settings.excludeRuleEnabled[index] !== false),
	);
	if (limits.hardCapExceeded) notify('Path rule saved. Some rules are ignored because the rule limit is exceeded.');
}

export function addPathContextMenu(
	menu: Menu,
	file: TAbstractFile,
	plugin: SettingsTabPlugin,
	vault: Vault,
): void {
	if (!(file instanceof TFolder) && !(file instanceof TFile && file.extension.toLowerCase() === 'md')) return;
	if (!folderRulePath(file.path)) return;
	const lock = !(file instanceof TFolder ? hasActiveFolderRule : hasActiveNoteRule)(plugin.settings, file.path);
	menu.addItem((item) => item
		.setTitle(lock ? 'Lock → Reading' : 'Unlock')
		.setIcon(lock ? 'lock' : 'unlock')
		.onClick(() => applyPathRuleAction(plugin, vault, file, lock)));
}
