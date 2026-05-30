import type { ForceReadModeSettings } from './plugin-types';

export const DEFAULT_SETTINGS: ForceReadModeSettings = {
	enabled: true,
	forceAllMarkdownReadOnly: true,
	useGlobPatterns: false,
	caseSensitive: true,
	debug: false,
	debugVerbosePaths: false,
	dismissedWelcomeVersion: 0,
	includeRules: [],
	excludeRules: [],
};

type BooleanSettingKey =
	| 'enabled'
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
		forceAllMarkdownReadOnly: parseBooleanSetting(loaded, 'forceAllMarkdownReadOnly'),
		useGlobPatterns: parseBooleanSetting(loaded, 'useGlobPatterns'),
		caseSensitive: parseBooleanSetting(loaded, 'caseSensitive'),
		debug: parseBooleanSetting(loaded, 'debug'),
		debugVerbosePaths: parseBooleanSetting(loaded, 'debugVerbosePaths'),
		dismissedWelcomeVersion: parseNumberSetting(loaded, 'dismissedWelcomeVersion'),
		includeRules: parseRuleList(loaded.includeRules),
		excludeRules: parseRuleList(loaded.excludeRules),
	};
}
