import { getRuleVolumeWarningMessage } from './rule-diagnostics';
import { buildEffectiveRules } from './rule-limits';

export type RuleLimitsUiState = {
	summaryText: string;
	volumeWarningMessage: string | null;
	hardCapWarningMessage: string | null;
	ignoredIncludeLineIndexes: number[];
	ignoredExcludeLineIndexes: number[];
};

export function computeRuleLimitsUiState(includeRulesText: string, excludeRulesText: string): RuleLimitsUiState {
	const effectiveRules = buildEffectiveRules(
		includeRulesText.split('\n'),
		excludeRulesText.split('\n'),
	);
	const ignoredSuffix = effectiveRules.counts.totalIgnored > 0
		? ` (+${effectiveRules.counts.totalIgnored} ignored)`
		: '';
	const summaryText =
		`Include: ${effectiveRules.counts.includeUsed} rules · Exclude: ${effectiveRules.counts.excludeUsed} rules · Total: ${effectiveRules.counts.totalUsed}${ignoredSuffix}`;
	const volumeWarningMessage = getRuleVolumeWarningMessage(effectiveRules.warningLevel);
	const hardCapWarningMessage = effectiveRules.hardCapExceeded
		? 'Too many rules. Extra lines are ignored.'
		: null;

	return {
		summaryText,
		volumeWarningMessage,
		hardCapWarningMessage,
		ignoredIncludeLineIndexes: effectiveRules.ignoredIncludeLineIndexes,
		ignoredExcludeLineIndexes: effectiveRules.ignoredExcludeLineIndexes,
	};
}
