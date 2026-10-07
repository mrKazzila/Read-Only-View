import { getRuleEntries, isRuntimeRuleEntry } from './rule-state';
import { normalizeVaultPath } from './path-utils';
import type { ForceReadModeSettings, RuleEntry } from './plugin-types';
import type { FolderRuleChange } from './folder-rules';
import { resolutionToRuleEntry, resolveRuleSource, type RuleResolverContext } from './rule-source';
import { getSourceInputMaxLength, PATH_SOURCE_INPUT_MAX_LENGTH } from './source-input-limits';

function isNoteRule(entry: RuleEntry, path: string, caseSensitive: boolean): boolean {
	if (!entry.resolvedPath) return false;
	const resolved = normalizeVaultPath(entry.resolvedPath);
	if (entry.sourceKind === 'vault-path' && /[*?]/.test(resolved)) return false;
	return caseSensitive ? resolved === path : resolved.toLowerCase() === path.toLowerCase();
}

export function hasActiveNoteRule(settings: ForceReadModeSettings, path: string): boolean {
	return getRuleEntries(settings, 'include').some((entry) =>
		entry.enabled && isRuntimeRuleEntry(entry) && isNoteRule(entry, normalizeVaultPath(path), settings.caseSensitive));
}

export function changeNoteRule(
	settings: ForceReadModeSettings,
	path: string,
	lock: boolean,
	context: RuleResolverContext,
): FolderRuleChange {
	const entries = getRuleEntries(settings, 'include');
	const normalized = normalizeVaultPath(path);
	if (!normalized.toLowerCase().endsWith('.md')) return { entries, changed: false };
	const matches = (entry: RuleEntry): boolean => isNoteRule(entry, normalized, settings.caseSensitive);
	if (!lock) {
		return {
			entries: entries.map((entry) => entry.enabled && matches(entry) ? { ...entry, enabled: false } : entry),
			changed: entries.some((entry) => entry.enabled && matches(entry)),
		};
	}
	if (hasActiveNoteRule(settings, normalized)) return { entries, changed: false };
	const index = entries.findIndex((entry) => isRuntimeRuleEntry(entry) && matches(entry));
	if (index !== -1) {
		return { entries: entries.map((entry, i) => i === index ? { ...entry, enabled: true } : entry), changed: true };
	}
	const value = `obsidian://open?vault=${encodeURIComponent(context.vaultName)}&file=${encodeURIComponent(normalized)}`;
	if (normalized.length > PATH_SOURCE_INPUT_MAX_LENGTH || value.length > getSourceInputMaxLength(value)) {
		return { entries, changed: false, error: 'Note path exceeds the rule length limit.' };
	}
	const resolution = resolveRuleSource(value, context);
	if (resolution.error || resolution.resolvedPath !== normalized) {
		return { entries, changed: false, error: 'This note path cannot be represented by an exact rule. No rule was changed.' };
	}
	return { entries: [...entries, resolutionToRuleEntry(resolution, true)], changed: true };
}
