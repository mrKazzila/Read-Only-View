import {
	RULE_LIMIT_EXCLUDE_MAX,
	RULE_LIMIT_INCLUDE_MAX,
	RULE_LIMIT_TOTAL_MAX,
	RULE_WARNING_SOFT_THRESHOLD,
	RULE_WARNING_STRONG_THRESHOLD,
} from './constants';
import { normalizeVaultPath } from './path-utils';

type EffectiveRuleEntry = {
	value: string;
	lineIndex: number;
};

export type RuleVolumeWarningLevel = 'none' | 'soft' | 'strong';

export type EffectiveRulesResult = {
	effectiveIncludeRules: string[];
	effectiveExcludeRules: string[];
	ignoredIncludeLineIndexes: number[];
	ignoredExcludeLineIndexes: number[];
	counts: {
		includeUsed: number;
		excludeUsed: number;
		totalUsed: number;
		includeIgnored: number;
		excludeIgnored: number;
		totalIgnored: number;
	};
	rawCounts: {
		includeEffective: number;
		excludeEffective: number;
		totalEffective: number;
	};
	hardCapExceeded: boolean;
	warningLevel: RuleVolumeWarningLevel;
};

function toEffectiveEntries(lines: string[]): EffectiveRuleEntry[] {
	const entries: EffectiveRuleEntry[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line === undefined) {
			continue;
		}
		const normalized = normalizeVaultPath(line);
		if (normalized.length === 0) {
			continue;
		}
		entries.push({ value: normalized, lineIndex: index });
	}
	return entries;
}

function pushIgnoredLineIndexes(target: number[], ignoredEntries: EffectiveRuleEntry[]): void {
	for (const entry of ignoredEntries) {
		target.push(entry.lineIndex);
	}
}

export function buildEffectiveRules(includeLines: string[], excludeLines: string[]): EffectiveRulesResult {
	const includeEntries = toEffectiveEntries(includeLines);
	const excludeEntries = toEffectiveEntries(excludeLines);

	const ignoredIncludeLineIndexes: number[] = [];
	const ignoredExcludeLineIndexes: number[] = [];

	let keptInclude = includeEntries.slice(0, RULE_LIMIT_INCLUDE_MAX);
	pushIgnoredLineIndexes(ignoredIncludeLineIndexes, includeEntries.slice(RULE_LIMIT_INCLUDE_MAX));

	let keptExclude = excludeEntries.slice(0, RULE_LIMIT_EXCLUDE_MAX);
	pushIgnoredLineIndexes(ignoredExcludeLineIndexes, excludeEntries.slice(RULE_LIMIT_EXCLUDE_MAX));

	/*
	 * Total cap policy is intentionally explicit and predictable:
	 * 1) keep include up to includeMax
	 * 2) keep exclude up to excludeMax
	 * 3) if total still exceeds totalMax, trim the tail of exclude first
	 *    (include retains priority), and only trim include if include alone exceeds totalMax.
	 */
	const totalAfterListCaps = keptInclude.length + keptExclude.length;
	if (totalAfterListCaps > RULE_LIMIT_TOTAL_MAX) {
		if (keptInclude.length > RULE_LIMIT_TOTAL_MAX) {
			pushIgnoredLineIndexes(ignoredIncludeLineIndexes, keptInclude.slice(RULE_LIMIT_TOTAL_MAX));
			keptInclude = keptInclude.slice(0, RULE_LIMIT_TOTAL_MAX);
			pushIgnoredLineIndexes(ignoredExcludeLineIndexes, keptExclude);
			keptExclude = [];
		} else {
			const allowedExclude = RULE_LIMIT_TOTAL_MAX - keptInclude.length;
			pushIgnoredLineIndexes(ignoredExcludeLineIndexes, keptExclude.slice(allowedExclude));
			keptExclude = keptExclude.slice(0, allowedExclude);
		}
	}

	const includeIgnored = ignoredIncludeLineIndexes.length;
	const excludeIgnored = ignoredExcludeLineIndexes.length;
	const totalIgnored = includeIgnored + excludeIgnored;
	const includeUsed = keptInclude.length;
	const excludeUsed = keptExclude.length;
	const totalUsed = includeUsed + excludeUsed;
	const includeEffective = includeEntries.length;
	const excludeEffective = excludeEntries.length;
	const totalEffective = includeEffective + excludeEffective;
	const maxPerListCount = Math.max(includeEffective, excludeEffective);
	const warningLevel: RuleVolumeWarningLevel =
		maxPerListCount > RULE_WARNING_STRONG_THRESHOLD
			? 'strong'
			: maxPerListCount > RULE_WARNING_SOFT_THRESHOLD
				? 'soft'
				: 'none';

	return {
		effectiveIncludeRules: keptInclude.map((entry) => entry.value),
		effectiveExcludeRules: keptExclude.map((entry) => entry.value),
		ignoredIncludeLineIndexes,
		ignoredExcludeLineIndexes,
		counts: {
			includeUsed,
			excludeUsed,
			totalUsed,
			includeIgnored,
			excludeIgnored,
			totalIgnored,
		},
		rawCounts: {
			includeEffective,
			excludeEffective,
			totalEffective,
		},
		hardCapExceeded: totalIgnored > 0,
		warningLevel,
	};
}
