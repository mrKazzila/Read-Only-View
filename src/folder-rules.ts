import { normalizeVaultPath } from './path-utils';
import { buildRuntimeRules } from './plugin-settings';
import type { ForceReadModeSettings, RuleEntry } from './plugin-types';
import { resolutionToRuleEntry, resolveRuleSource, type RuleResolverContext } from './rule-source';
import { PATH_SOURCE_INPUT_MAX_LENGTH } from './source-input-limits';

export function folderRulePath(path: string): string {
	return normalizeVaultPath(path).replace(/\/$/, '');
}

function isExactFolderRule(entry: RuleEntry, folder: string, caseSensitive: boolean): boolean {
	if (!entry.resolvedPath || entry.sourceKind === 'obsidian-uri') return false;
	let path = normalizeVaultPath(entry.resolvedPath);
	if (entry.sourceKind === 'absolute-path' && !path.endsWith('/')) return false;
	// A literal folder name takes precedence over the optional recursive glob suffix.
	const compare = (value: string): string => caseSensitive ? value : value.toLowerCase();
	if (compare(path) === compare(`${folder}/`)) return true;
	if (path.endsWith('/**')) path = path.slice(0, -3);
	else if (path.endsWith('/')) path = path.slice(0, -1);
	else if (path.endsWith('.md') || /[*?]/.test(path)) return false;
	return compare(path) === compare(folder);
}

export function hasActiveFolderRule(settings: ForceReadModeSettings, path: string): boolean {
	const folder = folderRulePath(path);
	return (settings.includeRuleEntries ?? []).some((entry) => {
		if (!entry.enabled || !isExactFolderRule(entry, folder, settings.caseSensitive)) return false;
		const resolved = normalizeVaultPath(entry.resolvedPath ?? '');
		return settings.useGlobPatterns
			? !/[*?]/.test(folder) && resolved.endsWith('/**')
			: !resolved.endsWith('/**');
	});
}

export type FolderRuleChange = { entries: RuleEntry[]; changed: boolean; error?: string };

export function changeFolderRule(
	settings: ForceReadModeSettings,
	path: string,
	lock: boolean,
	context: RuleResolverContext,
): FolderRuleChange {
	const entries = settings.includeRuleEntries ?? [];
	const folder = folderRulePath(path);
	if (!folder) return { entries, changed: false };
	const exact = (entry: RuleEntry): boolean => isExactFolderRule(entry, folder, settings.caseSensitive);
	if (!lock) {
		return {
			entries: entries.map((entry) => exact(entry) && entry.enabled ? { ...entry, enabled: false } : entry),
			changed: entries.some((entry) => exact(entry) && entry.enabled),
		};
	}
	if (settings.useGlobPatterns && /[*?]/.test(folder)) {
		return { entries, changed: false, error: 'Folder names containing * or ? cannot be locked in glob mode.' };
	}
	if (hasActiveFolderRule(settings, folder)) return { entries, changed: false };
	const value = `${folder}/${settings.useGlobPatterns ? '**' : ''}`;
	if (value.length > PATH_SOURCE_INPUT_MAX_LENGTH) {
		return { entries, changed: false, error: 'Folder path exceeds the rule length limit.' };
	}
	const resolution = resolveRuleSource(value, context);
	if (resolution.error) return { entries, changed: false, error: resolution.error };
	const replacement = resolutionToRuleEntry(resolution, true);
	const index = entries.findIndex(exact);
	const next = [...entries];
	if (index === -1) next.push(replacement);
	else {
		const existing = entries[index];
		next[index] = existing && hasActiveFolderRule({ ...settings, includeRuleEntries: [{ ...existing, enabled: true }] }, folder)
			? { ...existing, enabled: true }
			: replacement;
	}
	return { entries: next, changed: true };
}

export function setFolderRuleEntries(settings: ForceReadModeSettings, entries: RuleEntry[]): void {
	settings.includeRuleEntries = entries;
	const runtime = buildRuntimeRules(entries);
	settings.includeRules = runtime.rules;
	settings.includeRuleEnabled = runtime.enabled;
}
