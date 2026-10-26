import type { ForceReadModeSettings } from './plugin-types';
import { buildRuntimeRules, loadRuleEntries } from './rule-state';

export { buildRuntimeRules } from './rule-state';

export const DEFAULT_SETTINGS: ForceReadModeSettings = {
	enabled: true,
	showExplorerProtectionIndicators: false,
	forceAllMarkdownReadOnly: true,
	useGlobPatterns: false,
	caseSensitive: true,
	debug: false,
	debugVerbosePaths: false,
	dismissedWelcomeVersion: 0,
	includeRules: [],
	excludeRules: [],
	includeRuleEnabled: [],
	excludeRuleEnabled: [],
	includeRuleEntries: [],
	excludeRuleEntries: [],
};

type BooleanSettingKey =
	| 'enabled'
	| 'showExplorerProtectionIndicators'
	| 'forceAllMarkdownReadOnly'
	| 'useGlobPatterns'
	| 'caseSensitive'
	| 'debug'
	| 'debugVerbosePaths';

function parseNumberSetting(
	loaded: LoadedSettingsRecord,
	key: 'dismissedWelcomeVersion',
): number {
	const value = loaded[key];
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: DEFAULT_SETTINGS[key];
}

type LoadedSettingsRecord = Partial<Record<keyof ForceReadModeSettings, unknown>>;

function isLoadedSettingsRecord(value: unknown): value is LoadedSettingsRecord {
	return typeof value === 'object' && value !== null;
}

function parseBooleanSetting(
	loaded: LoadedSettingsRecord,
	key: BooleanSettingKey,
): boolean {
	const value = loaded[key];
	return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
}

export function mergeLoadedSettings(
	loaded: unknown,
): ForceReadModeSettings {
	if (!isLoadedSettingsRecord(loaded)) {
		return {
			...DEFAULT_SETTINGS,
			includeRules: [...DEFAULT_SETTINGS.includeRules],
			excludeRules: [...DEFAULT_SETTINGS.excludeRules],
			includeRuleEnabled: [...DEFAULT_SETTINGS.includeRuleEnabled],
			excludeRuleEnabled: [...DEFAULT_SETTINGS.excludeRuleEnabled],
			includeRuleEntries: [...(DEFAULT_SETTINGS.includeRuleEntries ?? [])],
			excludeRuleEntries: [...(DEFAULT_SETTINGS.excludeRuleEntries ?? [])],
		};
	}
	const includeRuleEntries = loadRuleEntries(loaded.includeRuleEntries, loaded.includeRules, loaded.includeRuleEnabled);
	const excludeRuleEntries = loadRuleEntries(loaded.excludeRuleEntries, loaded.excludeRules, loaded.excludeRuleEnabled);
	const runtimeInclude = buildRuntimeRules(includeRuleEntries);
	const runtimeExclude = buildRuntimeRules(excludeRuleEntries);

	return {
		enabled: parseBooleanSetting(loaded, 'enabled'),
		showExplorerProtectionIndicators: parseBooleanSetting(loaded, 'showExplorerProtectionIndicators'),
		forceAllMarkdownReadOnly: parseBooleanSetting(loaded, 'forceAllMarkdownReadOnly'),
		useGlobPatterns: parseBooleanSetting(loaded, 'useGlobPatterns'),
		caseSensitive: parseBooleanSetting(loaded, 'caseSensitive'),
		debug: parseBooleanSetting(loaded, 'debug'),
		debugVerbosePaths: parseBooleanSetting(loaded, 'debugVerbosePaths'),
		dismissedWelcomeVersion: parseNumberSetting(loaded, 'dismissedWelcomeVersion'),
		includeRules: runtimeInclude.rules,
		excludeRules: runtimeExclude.rules,
		includeRuleEnabled: runtimeInclude.enabled,
		excludeRuleEnabled: runtimeExclude.enabled,
		includeRuleEntries,
		excludeRuleEntries,
	};
}
