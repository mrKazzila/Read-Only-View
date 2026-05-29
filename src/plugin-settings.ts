import type { ForceReadModeSettings } from './plugin-types';

export const DEFAULT_SETTINGS: ForceReadModeSettings = {
	enabled: true,
	useGlobPatterns: false,
	caseSensitive: true,
	debug: false,
	debugVerbosePaths: false,
	includeRules: [],
	excludeRules: [],
};

type BooleanSettingKey =
	| 'enabled'
	| 'useGlobPatterns'
	| 'caseSensitive'
	| 'debug'
	| 'debugVerbosePaths';

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

function parseRuleList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((entry): entry is string => typeof entry === 'string');
}

export function mergeLoadedSettings(
	loaded: unknown,
): ForceReadModeSettings {
	if (!isLoadedSettingsRecord(loaded)) {
		return {
			...DEFAULT_SETTINGS,
			includeRules: [...DEFAULT_SETTINGS.includeRules],
			excludeRules: [...DEFAULT_SETTINGS.excludeRules],
		};
	}

	return {
		enabled: parseBooleanSetting(loaded, 'enabled'),
		useGlobPatterns: parseBooleanSetting(loaded, 'useGlobPatterns'),
		caseSensitive: parseBooleanSetting(loaded, 'caseSensitive'),
		debug: parseBooleanSetting(loaded, 'debug'),
		debugVerbosePaths: parseBooleanSetting(loaded, 'debugVerbosePaths'),
		includeRules: parseRuleList(loaded.includeRules),
		excludeRules: parseRuleList(loaded.excludeRules),
	};
}
