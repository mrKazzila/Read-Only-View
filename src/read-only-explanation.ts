import { normalizeVaultPath, type CompiledRuleMatcher } from './matcher';
import type { ForceReadModeSettings } from './plugin-types';
import { buildPathTesterResult } from './rule-diagnostics';

export function explainNote(path: string, settings: ForceReadModeSettings, matcher: CompiledRuleMatcher) {
	const result = buildPathTesterResult(path, settings, matcher);
	// Follow enforcement precedence; matches remain visible even when disabled.
	const reason = !settings.enabled ? 'Plugin is disabled.'
		: result.excludeMatches.length > 0 ? 'An Exclude rule takes priority.'
			: result.presetApplied ? 'All Markdown files mode protects this note.'
				: result.finalReadOnly ? 'Matched an Include rule.'
					: 'No Include rule matched this note.';
	return { ...result, reason };
}

export function explainFolder(paths: Iterable<string>, settings: ForceReadModeSettings, matcher: CompiledRuleMatcher) {
	let total = 0;
	let protectedCount = 0;
	const includes = new Set<string>();
	const excludes = new Set<string>();
	const editableExamples: string[] = [];
	for (const path of paths) {
		const result = explainNote(path, settings, matcher);
		total++;
		if (result.finalReadOnly) protectedCount++;
		else if (editableExamples.length < 5) editableExamples.push(path);
		for (const rule of result.includeMatches) includes.add(rule);
		for (const rule of result.excludeMatches) excludes.add(rule);
	}
	const orderedMatches = (rules: readonly string[], matches: Set<string>) => {
		const order = new Map(rules.map((rule, index) => [rule, index]));
		return [...matches].sort((a, b) =>
			(order.get(normalizeVaultPath(a)) ?? rules.length) - (order.get(normalizeVaultPath(b)) ?? rules.length));
	};
	const status = total === 0 ? 'NO MARKDOWN NOTES'
		: protectedCount === total ? 'ALL PROTECTED'
			: protectedCount === 0 ? 'NOT PROTECTED' : 'MIXED';
	return {
		status, total, protectedCount, editableCount: total - protectedCount,
		includeMatches: orderedMatches(matcher.effectiveIncludeRules, includes),
		excludeMatches: orderedMatches(matcher.effectiveExcludeRules, excludes),
		editableExamples,
	};
}

export type ReadOnlyExplanation =
	| { kind: 'note'; path: string; result: ReturnType<typeof explainNote> }
	| { kind: 'folder'; path: string; result: ReturnType<typeof explainFolder> };
