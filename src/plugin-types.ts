import type { CompiledRuleMatcher } from './matcher';

export interface ForceReadModeSettings {
	enabled: boolean;
	forceAllMarkdownReadOnly: boolean;
	useGlobPatterns: boolean;
	caseSensitive: boolean;
	debug: boolean;
	debugVerbosePaths: boolean;
	dismissedWelcomeVersion: number;
	includeRules: string[];
	excludeRules: string[];
}

export interface SettingsTabPlugin {
	settings: ForceReadModeSettings;
	saveSettings: () => Promise<void>;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	refreshEditorOptions: () => void;
	getCompiledRuleMatcher?: () => CompiledRuleMatcher;
}
