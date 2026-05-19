export interface ForceReadModeSettings {
	enabled: boolean;
	useGlobPatterns: boolean;
	caseSensitive: boolean;
	debug: boolean;
	debugVerbosePaths: boolean;
	includeRules: string[];
	excludeRules: string[];
}

export interface SettingsTabPlugin {
	settings: ForceReadModeSettings;
	saveSettings: () => Promise<void>;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	refreshEditorOptions: () => void;
}
