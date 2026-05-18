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

export function mergeLoadedSettings(
	loaded: Partial<ForceReadModeSettings> | null | undefined,
): ForceReadModeSettings {
	return {
		...DEFAULT_SETTINGS,
		...loaded,
		includeRules: loaded?.includeRules ?? DEFAULT_SETTINGS.includeRules,
		excludeRules: loaded?.excludeRules ?? DEFAULT_SETTINGS.excludeRules,
	};
}
