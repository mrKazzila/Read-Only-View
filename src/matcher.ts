import { normalizeVaultPath } from './path-utils';
import { buildRuleState, getRuleEntries, isRuntimeRuleEntry } from './rule-state';
import type { ForceReadModeSettings } from './plugin-types';

export { DEFAULT_SETTINGS } from './plugin-settings';
export type { ForceReadModeSettings } from './plugin-types';

export interface MatchPathOptions {
	useGlobPatterns: boolean;
	caseSensitive: boolean;
}

export interface CompiledRuleMatcher {
	isPathProtected: (path: string, kind: 'file' | 'folder') => boolean;
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
type CompiledGlob = { test: (path: string) => boolean };

const globRegexCache = new Map<string, CompiledGlob>();

export function clearGlobRegexCache(): void {
	globRegexCache.clear();
}

export function getGlobRegexCacheSize(): number {
	return globRegexCache.size;
}

function setGlobRegexCache(cacheKey: string, compiled: CompiledGlob): void {
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

function isLineTerminator(char: string): boolean {
	return char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029';
}

function isLiteralToken(token: string): boolean {
	return token !== '*' && token !== '**' && token !== '?' && token !== '**/';
}

function testGlob(tokens: readonly string[], path: string): boolean {
	let first = 0;
	let last = tokens.length;
	let start = 0;
	let end = path.length;
	// Peel fixed ends before allocating rows, keeping common long-path rules cheap.
	while (first < last && isLiteralToken(tokens[first]!)) {
		const literal = tokens[first++]!;
		if (!path.startsWith(literal, start) || start + literal.length > end) return false;
		start += literal.length;
	}
	while (first < last && isLiteralToken(tokens[last - 1]!)) {
		const literal = tokens[--last]!;
		end -= literal.length;
		if (end < start || !path.startsWith(literal, end)) return false;
	}
	if (first === last) return start === end;

	const length = end - start;
	let previous = new Uint8Array(length + 1);
	let current = new Uint8Array(length + 1);
	previous[0] = 1;
	let minimum = 0;
	// Each row records reachable path offsets after one token. No branch is
	// revisited: O(pattern length * path length) time, O(path length) scratch space.
	for (let index = first; index < last; index++) {
		const token = tokens[index]!;
		current.fill(0);
		let nextMinimum = length + 1;
		if (isLiteralToken(token)) {
			let position = path.indexOf(token, start + minimum);
			while (position >= 0 && position + token.length <= end) {
				if (previous[position - start] === 1) {
					current[position - start + token.length] = 1;
					nextMinimum = Math.min(nextMinimum, position - start + token.length);
				}
				position = path.indexOf(token, position + 1);
			}
			minimum = nextMinimum;
			if (minimum > length) return false;
			[previous, current] = [current, previous];
			continue;
		}
		const repeat = token === '*' || token === '**';
		current[0] = repeat || token === '**/' ? previous[0]! : 0;
		if (current[0] === 1) nextMinimum = 0;
		let directoryReachable = false;
		for (let offset = Math.max(1, minimum); offset <= length; offset++) {
			const char = path[start + offset - 1]!;
			if (token === '**/') {
				// (.* /)? without the space: optional directories after a literal slash.
				directoryReachable = (directoryReachable || previous[offset - 1] === 1)
					&& !isLineTerminator(char);
				current[offset] = previous[offset] === 1 || (char === '/' && directoryReachable) ? 1 : 0;
			} else {
				const accepts = token === '*' || token === '?' ? char !== '/'
					: token === '**' ? !isLineTerminator(char) : token === char;
				current[offset] = repeat
					? (previous[offset] === 1 || (accepts && current[offset - 1] === 1) ? 1 : 0)
					: (accepts ? previous[offset - 1]! : 0);
			}
			if (current[offset] === 1 && nextMinimum > offset) nextMinimum = offset;
		}
		minimum = nextMinimum;
		if (minimum > length) return false;
		[previous, current] = [current, previous];
	}
	return previous[length] === 1;
}

// Legacy helper/cache names are retained for callers; the compiled object only
// exposes .test(), and never constructs a backtracking RegExp.
export function compileGlobToRegex(pattern: string, caseSensitive: boolean): CompiledGlob {
	const normalizedPattern = normalizeForCase(normalizeVaultPath(pattern), caseSensitive);
	const cacheKey = `${caseSensitive ? '1' : '0'}:${normalizedPattern}`;
	const cached = globRegexCache.get(cacheKey);
	if (cached) return cached;

	const tokens: string[] = [];
	for (let index = 0; index < normalizedPattern.length; index++) {
		if (normalizedPattern.startsWith('/**/', index)) {
			tokens.push('/', '**/');
			index += 3;
		} else if (normalizedPattern.startsWith('**', index)) {
			tokens.push('**');
			index += 1;
		} else {
			const char = normalizedPattern[index]!;
			const previous = tokens[tokens.length - 1];
			if (isLiteralToken(char) && previous !== undefined && isLiteralToken(previous)) {
				tokens[tokens.length - 1] = previous + char;
			} else {
				tokens.push(char);
			}
		}
	}
	const compiled = { test: (path: string) => testGlob(tokens, path) };
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
	const entriesKey = (list: 'include' | 'exclude') => getRuleEntries(settings, list).map((entry) => [
		entry.sourceKind, entry.resolvedPath, entry.enabled, isRuntimeRuleEntry(entry),
	]);
	return JSON.stringify([
		settings.enabled,
		settings.forceAllMarkdownReadOnly,
		settings.useGlobPatterns,
		settings.caseSensitive,
		entriesKey('include'),
		entriesKey('exclude'),
	]);
}

export function createCompiledRuleMatcher(settings: ForceReadModeSettings): CompiledRuleMatcher {
	const options: MatchPathOptions = {
		useGlobPatterns: settings.useGlobPatterns,
		caseSensitive: settings.caseSensitive,
	};
	const state = buildRuleState(settings);
	const toSpec = (entry: typeof state.include[number]): RuleSpec => ({
		raw: entry.resolvedPath,
		exact: entry.sourceKind !== 'vault-path'
			&& !(entry.sourceKind === 'absolute-path' && entry.resolvedPath.endsWith('/')),
	});
	const includeSpecs = state.include.map(toSpec);
	const excludeSpecs = state.exclude.map(toSpec);
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
			const glob = compileGlobToRegex(normalizedRule, true);
			return {
				raw: rule,
				matches: (normalizedFilePath: string) => glob.test(normalizedFilePath),
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

	const isPathProtected = (path: string, kind: 'file' | 'folder'): boolean => {
		if (!settings.enabled) {
			return false;
		}

		const normalizedPath = normalizeFilePathForMatch(path, options.caseSensitive);
		const normalizedFilePath = kind === 'folder' && !normalizedPath.endsWith('/')
			? `${normalizedPath}/` : normalizedPath;
		if (!normalizedPath || (kind === 'file' && !normalizedFilePath.toLowerCase().endsWith('.md'))) {
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
		effectiveIncludeRules: state.limits.effectiveIncludeRules,
		effectiveExcludeRules: state.limits.effectiveExcludeRules,
		matchIncludeRules: (filePath: string) => matchRules(filePath, preparedIncludeRules),
		matchExcludeRules: (filePath: string) => matchRules(filePath, preparedExcludeRules),
		isPathProtected,
		shouldForceReadOnly: (path) => isPathProtected(path, 'file'),
	};
}

export function shouldForceReadOnly(filePath: string, settings: ForceReadModeSettings): boolean {
	return createCompiledRuleMatcher(settings).shouldForceReadOnly(filePath);
}
