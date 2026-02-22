export interface ForceReadModeSettings {
	enabled: boolean;
	useGlobPatterns: boolean;
	caseSensitive: boolean;
	debug: boolean;
	includeRules: string[];
	excludeRules: string[];
}

export const DEFAULT_SETTINGS: ForceReadModeSettings = {
	enabled: true,
	useGlobPatterns: false,
	caseSensitive: true,
	debug: false,
	includeRules: [],
	excludeRules: [],
};

export interface MatchPathOptions {
	useGlobPatterns: boolean;
	caseSensitive: boolean;
}

const globRegexCache = new Map<string, RegExp>();

export function normalizeVaultPath(path: string): string {
	let normalized = path.trim();
	normalized = normalized.replace(/\\/g, '/');
	normalized = normalized.replace(/^(\.\/)+/, '');
	normalized = normalized.replace(/\/+/g, '/');
	return normalized;
}

function escapeRegexLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForCase(value: string, caseSensitive: boolean): string {
	return caseSensitive ? value : value.toLowerCase();
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
	globRegexCache.set(cacheKey, compiled);
	return compiled;
}

export function matchPath(filePath: string, pattern: string, options: MatchPathOptions): boolean {
	const normalizedFilePath = normalizeForCase(normalizeVaultPath(filePath), options.caseSensitive);
	const normalizedPattern = normalizeForCase(normalizeVaultPath(pattern), options.caseSensitive);

	if (!normalizedFilePath || !normalizedPattern) {
		return false;
	}

	if (options.useGlobPatterns) {
		return compileGlobToRegex(normalizedPattern, options.caseSensitive).test(normalizedFilePath);
	}

	return normalizedFilePath.startsWith(applyPrefixModeRuleNormalization(normalizedPattern));
}

export function shouldForceReadOnly(filePath: string, settings: ForceReadModeSettings): boolean {
	if (!settings.enabled) {
		return false;
	}

	const normalizedFilePath = normalizeVaultPath(filePath);
	if (!normalizedFilePath.toLowerCase().endsWith('.md')) {
		return false;
	}

	const options: MatchPathOptions = {
		useGlobPatterns: settings.useGlobPatterns,
		caseSensitive: settings.caseSensitive,
	};

	const hasIncludeMatch = settings.includeRules.some((rule) => matchPath(normalizedFilePath, rule, options));
	if (!hasIncludeMatch) {
		return false;
	}

	const hasExcludeMatch = settings.excludeRules.some((rule) => matchPath(normalizedFilePath, rule, options));
	return !hasExcludeMatch;
}
