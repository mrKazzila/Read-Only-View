import { createCompiledRuleMatcher, matchPath, normalizeVaultPath, type CompiledRuleMatcher } from './matcher';
import type { RuleVolumeWarningLevel } from './rule-limits';
import type { ForceReadModeSettings } from './plugin-types';

export type RuleDiagnosticsEntry = {
	lineNumber: number;
	raw: string;
	normalized: string;
	isOk: boolean;
	warnings: string[];
	ignoredByRuleLimit: boolean;
};

export function splitRulesFromText(value: string): string[] {
	return value
		.split('\n')
		.map((line) => normalizeVaultPath(line))
		.filter((line) => line.length > 0);
}

export function stringifyRules(rules: string[]): string {
	return rules.join('\n');
}

function normalizeRuleForMode(rule: string, useGlobPatterns: boolean): { normalized: string; changedByFolderHint: boolean } {
	const normalized = normalizeVaultPath(rule);
	if (normalized.length === 0) {
		return { normalized: '', changedByFolderHint: false };
	}
	if (useGlobPatterns) {
		return { normalized, changedByFolderHint: false };
	}

	const hasWildcard = normalized.includes('*') || normalized.includes('?');
	if (hasWildcard || normalized.endsWith('/') || normalized.endsWith('.md')) {
		return { normalized, changedByFolderHint: false };
	}
	return {
		normalized: `${normalized}/`,
		changedByFolderHint: true,
	};
}

export function buildRuleDiagnostics(rulesText: string, useGlobPatterns: boolean): RuleDiagnosticsEntry[] {
	return buildRuleDiagnosticsWithIgnoredLines(rulesText, useGlobPatterns, new Set<number>());
}

export function buildRuleDiagnosticsWithIgnoredLines(
	rulesText: string,
	useGlobPatterns: boolean,
	ignoredLineIndexes: ReadonlySet<number>,
): RuleDiagnosticsEntry[] {
	const lines = rulesText.split('\n');
	return lines.map((line, index) => {
		const trimmed = line.trim();
		const normalizedBase = normalizeVaultPath(line);
		const normalizedInfo = normalizeRuleForMode(line, useGlobPatterns);
		const warnings: string[] = [];
		const ignoredByRuleLimit = ignoredLineIndexes.has(index);

		if (trimmed.length === 0) {
			warnings.push('Empty or whitespace-only line.');
		}
		if (!useGlobPatterns && (trimmed.includes('*') || trimmed.includes('?'))) {
			warnings.push('Contains wildcard in prefix mode. It is treated as a literal character.');
		}
		if (trimmed.length > 0 && normalizedBase !== trimmed) {
			warnings.push(`Normalized path form: "${normalizedBase}".`);
		}
		if (normalizedInfo.changedByFolderHint) {
			warnings.push(`Prefix mode folder hint applied: "${normalizedInfo.normalized}".`);
		}
		if (ignoredByRuleLimit) {
			warnings.push('Ignored due to rule limit.');
		}

		return {
			lineNumber: index + 1,
			raw: line,
			normalized: normalizedInfo.normalized,
			isOk: warnings.length === 0,
			warnings,
			ignoredByRuleLimit,
		};
	});
}

export function matchRules(filePath: string, rules: string[], useGlobPatterns: boolean, caseSensitive: boolean): string[] {
	return rules.filter((rule) => matchPath(filePath, rule, { useGlobPatterns, caseSensitive }));
}

type PathTesterMatcher = Pick<CompiledRuleMatcher, 'matchIncludeRules' | 'matchExcludeRules' | 'shouldForceReadOnly'>;

export function buildPathTesterResult(filePathInput: string, settings: ForceReadModeSettings): {
	testPath: string;
	includeMatches: string[];
	excludeMatches: string[];
	finalReadOnly: boolean;
	presetApplied: boolean;
};
export function buildPathTesterResult(
	filePathInput: string,
	settings: ForceReadModeSettings,
	matcher: PathTesterMatcher,
): {
	testPath: string;
	includeMatches: string[];
	excludeMatches: string[];
	finalReadOnly: boolean;
	presetApplied: boolean;
};
export function buildPathTesterResult(
	filePathInput: string,
	settings: ForceReadModeSettings,
	matcher: PathTesterMatcher = createCompiledRuleMatcher(settings),
): {
	testPath: string;
	includeMatches: string[];
	excludeMatches: string[];
	finalReadOnly: boolean;
	presetApplied: boolean;
} {
	const testPath = normalizeVaultPath(filePathInput);
	const includeMatches = matcher.matchIncludeRules(testPath);
	const excludeMatches = matcher.matchExcludeRules(testPath);
	const finalReadOnly = matcher.shouldForceReadOnly(testPath);
	const presetApplied = settings.enabled
		&& settings.forceAllMarkdownReadOnly
		&& testPath.toLowerCase().endsWith('.md');
	return { testPath, includeMatches, excludeMatches, finalReadOnly, presetApplied };
}

export function getRuleVolumeWarningMessage(warningLevel: RuleVolumeWarningLevel): string | null {
	if (warningLevel === 'strong') {
		return 'Very many rules. This may slow down Obsidian, especially on mobile. Consider merging rules and using **.';
	}
	if (warningLevel === 'soft') {
		return 'Many rules. Consider merging rules and using ** to simplify.';
	}
	return null;
}
