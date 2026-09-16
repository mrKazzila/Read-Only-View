import { normalizeVaultPath } from './path-utils';
import { buildEffectiveRules } from './rule-limits';
import type { ForceReadModeSettings } from './plugin-types';

export { DEFAULT_SETTINGS } from './plugin-settings';
export type { ForceReadModeSettings } from './plugin-types';

export interface MatchPathOptions {
	useGlobPatterns: boolean;
	caseSensitive: boolean;
}

export interface CompiledRuleMatcher {
	effectiveIncludeRules: readonly string[];
	effectiveExcludeRules: readonly string[];
	matchIncludeRules: (filePath: string) => string[];
	matchExcludeRules: (filePath: string) => string[];
	shouldForceReadOnly: (filePath: string) => boolean;
}

type PreparedRule = {
	raw: string;
	matches: (normalizedFilePath: string) => boolean;
};

type RuleSpec = {
	raw: string;
	exact: boolean;
};

export const GLOB_REGEX_CACHE_CAP = 512;
const globRegexCache = new Map<string, RegExp>();

export function clearGlobRegexCache(): void {
	globRegexCache.clear();
}

export function getGlobRegexCacheSize(): number {
	return globRegexCache.size;
}

function setGlobRegexCache(cacheKey: string, compiled: RegExp): void {
	if (globRegexCache.has(cacheKey)) {
		globRegexCache.set(cacheKey, compiled);
		return;
	}
	if (globRegexCache.size >= GLOB_REGEX_CACHE_CAP) {
		const oldestEntry = globRegexCache.keys().next();
		if (!oldestEntry.done) {
			globRegexCache.delete(oldestEntry.value);
		}
	}
	globRegexCache.set(cacheKey, compiled);
}

export { normalizeVaultPath };

function escapeRegexLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForCase(value: string, caseSensitive: boolean): string {
	return caseSensitive ? value : value.toLowerCase();
}

function normalizeFilePathForMatch(filePath: string, caseSensitive: boolean): string {
	return normalizeForCase(normalizeVaultPath(filePath), caseSensitive);
}

function applyPrefixModeRuleNormalization(pattern: string): string {
	const hasWildcard = pattern.includes('*') || pattern.includes('?');
	if (hasWildcard || pattern.endsWith('/') || pattern.endsWith('.md')) {
		return pattern;
	}
	return `${pattern}/`;
}

export function compileGlobToRegex(pattern: string, caseSensitive: boolean): RegExp {
	const normalizedPattern = normalizeForCase(normalizeVaultPath(pattern), caseSensitive);
	const cacheKey = `${caseSensitive ? '1' : '0'}:${normalizedPattern}`;
	const cached = globRegexCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	let source = '^';
	for (let index = 0; index < normalizedPattern.length; index++) {
		const char = normalizedPattern[index];
		if (char === undefined) {
			continue;
		}
		if (normalizedPattern.startsWith('/**/', index)) {
			source += '/(?:.*/)?';
			index += 3;
			continue;
		}
		if (char === '*') {
			const next = normalizedPattern[index + 1];
			if (next === '*') {
				source += '.*';
				index += 1;
			} else {
				source += '[^/]*';
			}
			continue;
		}
		if (char === '?') {
			source += '[^/]';
			continue;
		}
		source += escapeRegexLiteral(char);
	}
	source += '$';

	const compiled = new RegExp(source);
	setGlobRegexCache(cacheKey, compiled);
	return compiled;
}

export function matchPath(filePath: string, pattern: string, options: MatchPathOptions): boolean {
	const normalizedFilePath = normalizeFilePathForMatch(filePath, options.caseSensitive);
	const normalizedPattern = normalizeForCase(normalizeVaultPath(pattern), options.caseSensitive);

	if (!normalizedFilePath || !normalizedPattern) {
		return false;
	}

	if (options.useGlobPatterns) {
		return compileGlobToRegex(normalizedPattern, options.caseSensitive).test(normalizedFilePath);
	}

	return normalizedFilePath.startsWith(applyPrefixModeRuleNormalization(normalizedPattern));
}

export function getCompiledRuleMatcherKey(settings: ForceReadModeSettings): string {
	return [
		settings.enabled ? '1' : '0',
		settings.forceAllMarkdownReadOnly ? '1' : '0',
		settings.useGlobPatterns ? '1' : '0',
		settings.caseSensitive ? '1' : '0',
		settings.includeRules.join('\u0000'),
		settings.excludeRules.join('\u0000'),
		settings.includeRuleEnabled.map((enabled) => enabled ? '1' : '0').join(''),
		settings.excludeRuleEnabled.map((enabled) => enabled ? '1' : '0').join(''),
		(settings.includeRuleEntries ?? []).map((entry) => `${entry.sourceKind}:${entry.resolvedPath ?? ''}:${entry.enabled ? '1' : '0'}`).join('\u0000'),
		(settings.excludeRuleEntries ?? []).map((entry) => `${entry.sourceKind}:${entry.resolvedPath ?? ''}:${entry.enabled ? '1' : '0'}`).join('\u0000'),
	].join('\u0001');
}

function getEnabledRules(rules: string[], enabledStates: boolean[]): string[] {
	return rules.filter((_, index) => enabledStates[index] !== false);
}

function getEnabledRuleSpecs(
	rules: string[],
	enabledStates: boolean[],
	entries: ForceReadModeSettings['includeRuleEntries'],
): RuleSpec[] {
	if (entries && entries.length > 0) {
		return entries
			.filter((entry): entry is typeof entry & { resolvedPath: string } => !!entry.resolvedPath && entry.enabled)
			.map((entry) => ({
				raw: entry.resolvedPath,
				exact: entry.sourceKind !== 'vault-path'
					&& !(entry.sourceKind === 'absolute-path' && entry.resolvedPath.endsWith('/')),
			}));
	}
	return getEnabledRules(rules, enabledStates).map((raw) => ({ raw, exact: false }));
}

export function createCompiledRuleMatcher(settings: ForceReadModeSettings): CompiledRuleMatcher {
	const options: MatchPathOptions = {
		useGlobPatterns: settings.useGlobPatterns,
		caseSensitive: settings.caseSensitive,
	};
	const effectiveRules = buildEffectiveRules(
		getEnabledRules(settings.includeRules, settings.includeRuleEnabled),
		getEnabledRules(settings.excludeRules, settings.excludeRuleEnabled),
	);
	const includeSpecs = getEnabledRuleSpecs(
		settings.includeRules,
		settings.includeRuleEnabled,
		settings.includeRuleEntries,
	).slice(0, effectiveRules.effectiveIncludeRules.length);
	const excludeSpecs = getEnabledRuleSpecs(
		settings.excludeRules,
		settings.excludeRuleEnabled,
		settings.excludeRuleEntries,
	).slice(0, effectiveRules.effectiveExcludeRules.length);
	const prepareRule = (spec: RuleSpec): PreparedRule => {
		const rule = spec.raw;
		const normalizedRule = normalizeForCase(normalizeVaultPath(rule), options.caseSensitive);
		if (spec.exact) {
			return {
				raw: rule,
				matches: (normalizedFilePath: string) => normalizedFilePath === normalizedRule,
			};
		}
		if (options.useGlobPatterns) {
			const regex = compileGlobToRegex(normalizedRule, true);
			return {
				raw: rule,
				matches: (normalizedFilePath: string) => regex.test(normalizedFilePath),
			};
		}
		const prefix = applyPrefixModeRuleNormalization(normalizedRule);
		return {
			raw: rule,
			matches: (normalizedFilePath: string) => normalizedFilePath.startsWith(prefix),
		};
	};
	const preparedIncludeRules = includeSpecs.map(prepareRule);
	const preparedExcludeRules = excludeSpecs.map(prepareRule);

	const matchRules = (filePath: string, rules: readonly PreparedRule[]): string[] => {
		const normalizedFilePath = normalizeFilePathForMatch(filePath, options.caseSensitive);
		if (!normalizedFilePath) {
			return [];
		}
		return rules.filter((rule) => rule.matches(normalizedFilePath)).map((rule) => rule.raw);
	};

	const shouldForceReadOnlyPath = (filePath: string): boolean => {
		if (!settings.enabled) {
			return false;
		}

		const normalizedFilePath = normalizeFilePathForMatch(filePath, options.caseSensitive);
		if (!normalizedFilePath.toLowerCase().endsWith('.md')) {
			return false;
		}

		const hasExcludeMatch = preparedExcludeRules.some((rule) => rule.matches(normalizedFilePath));
		if (hasExcludeMatch) {
			return false;
		}

		if (settings.forceAllMarkdownReadOnly) {
			return true;
		}

		const hasIncludeMatch = preparedIncludeRules.some((rule) => rule.matches(normalizedFilePath));
		if (!hasIncludeMatch) {
			return false;
		}

		return true;
	};

	return {
		effectiveIncludeRules: effectiveRules.effectiveIncludeRules,
		effectiveExcludeRules: effectiveRules.effectiveExcludeRules,
		matchIncludeRules: (filePath: string) => matchRules(filePath, preparedIncludeRules),
		matchExcludeRules: (filePath: string) => matchRules(filePath, preparedExcludeRules),
		shouldForceReadOnly: shouldForceReadOnlyPath,
	};
}

export function shouldForceReadOnly(filePath: string, settings: ForceReadModeSettings): boolean {
	return createCompiledRuleMatcher(settings).shouldForceReadOnly(filePath);
}
