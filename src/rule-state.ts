import { normalizeVaultPath } from './path-utils';
import type { ForceReadModeSettings, RuleEntry, RuleSourceKind } from './plugin-types';
import { getSourceInputMaxLength, PATH_SOURCE_INPUT_MAX_LENGTH } from './source-input-limits';
import { buildEffectiveRules } from './rule-limits';

export type RuleList = 'include' | 'exclude';
type ResolvedRuleEntry = RuleEntry & { resolvedPath: string };

function isRuleSourceKind(value: unknown): value is RuleSourceKind {
	return value === 'vault-path' || value === 'obsidian-uri' || value === 'absolute-path';
}

function parseRuleEntries(value: unknown): RuleEntry[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const entries: RuleEntry[] = [];
	for (const candidate of value) {
		if (typeof candidate !== 'object' || candidate === null) {
			continue;
		}
		const record = candidate as Partial<Record<keyof RuleEntry, unknown>>;
		if (!isRuleSourceKind(record.sourceKind) || typeof record.sourceValue !== 'string') {
			continue;
		}
		const resolvedPath = typeof record.resolvedPath === 'string'
			? normalizeVaultPath(record.resolvedPath)
			: null;
		entries.push({
			sourceKind: record.sourceKind,
			sourceValue: record.sourceValue,
			resolvedPath: resolvedPath || null,
			enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
		});
	}
	return entries;
}

/** Read old parallel arrays at their original indexes before filtering malformed values. */
function migrateLegacyRules(rules: unknown, enabledStates: unknown, normalize = true): RuleEntry[] {
	if (!Array.isArray(rules)) return [];
	return rules.flatMap((rule: unknown, index) => {
		if (typeof rule !== 'string') return [];
		const normalized = normalize ? normalizeVaultPath(rule) : rule;
		return [{
			sourceKind: 'vault-path' as const,
			sourceValue: rule,
			resolvedPath: normalized || null,
			enabled: !Array.isArray(enabledStates) || enabledStates[index] !== false,
		}];
	});
}

export function loadRuleEntries(entries: unknown, rules: unknown, enabled: unknown): RuleEntry[] {
	const parsed = parseRuleEntries(entries);
	return parsed && parsed.length > 0 ? parsed : migrateLegacyRules(rules, enabled);
}

/** Nonempty entry lists are authoritative; empty legacy-era lists retain migration compatibility. */
export function getRuleEntries(settings: ForceReadModeSettings, list: RuleList): RuleEntry[] {
	const entries = settings[`${list}RuleEntries`];
	return entries && entries.length > 0
		? entries
		: migrateLegacyRules(settings[`${list}Rules`], settings[`${list}RuleEnabled`], false);
}

export function isRuntimeRuleEntry(entry: RuleEntry): entry is ResolvedRuleEntry {
	return !!entry.resolvedPath
		&& normalizeVaultPath(entry.resolvedPath).length > 0
		&& entry.sourceValue.length <= getSourceInputMaxLength(entry.sourceValue)
		&& entry.resolvedPath.length <= PATH_SOURCE_INPUT_MAX_LENGTH;
}

export function buildRuntimeRules(entries: RuleEntry[]): { rules: string[]; enabled: boolean[]; activeRules: string[] } {
	const resolved = entries.filter(isRuntimeRuleEntry);
	return {
		rules: resolved.map((entry) => normalizeVaultPath(entry.resolvedPath)),
		enabled: resolved.map((entry) => entry.enabled),
		activeRules: resolved.filter((entry) => entry.enabled).map((entry) => normalizeVaultPath(entry.resolvedPath)),
	};
}

/** Keep compatibility fields as projections, never as a second source of runtime truth. */
export function setRuleEntries(settings: ForceReadModeSettings, list: RuleList, entries: RuleEntry[]): void {
	const runtime = buildRuntimeRules(entries);
	settings[`${list}RuleEntries`] = entries;
	settings[`${list}Rules`] = runtime.rules;
	settings[`${list}RuleEnabled`] = runtime.enabled;
}

export function buildRuleState(settings: ForceReadModeSettings) {
	const active = (list: RuleList) => getRuleEntries(settings, list)
		.filter(isRuntimeRuleEntry).filter((entry) => entry.enabled);
	const include = active('include');
	const exclude = active('exclude');
	const limits = buildEffectiveRules(
		include.map((entry) => entry.resolvedPath),
		exclude.map((entry) => entry.resolvedPath),
	);
	const kept = (entries: ResolvedRuleEntry[], ignored: number[]) => {
		const indexes = new Set(ignored);
		return entries.filter((_, index) => !indexes.has(index));
	};
	return {
		include: kept(include, limits.ignoredIncludeLineIndexes),
		exclude: kept(exclude, limits.ignoredExcludeLineIndexes),
		limits,
	};
}
