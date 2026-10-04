import type { CompiledRuleMatcher } from './matcher';

export type RuleSourceKind = 'vault-path' | 'obsidian-uri' | 'absolute-path';

export interface RuleEntry {
	sourceKind: RuleSourceKind;
	sourceValue: string;
	resolvedPath: string | null;
	enabled: boolean;
}

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
	includeRuleEnabled: boolean[];
	excludeRuleEnabled: boolean[];
	includeRuleEntries?: RuleEntry[];
	excludeRuleEntries?: RuleEntry[];
}

export type IncludeRuleUpdate = (settings: ForceReadModeSettings) => {
	entries: RuleEntry[];
	changed: boolean;
	error?: string;
};

export interface SettingsTabPlugin {
	updateOpenRuleEditor?: (update: IncludeRuleUpdate) => Promise<{ changed: boolean; error?: string }> | undefined;
	settings: ForceReadModeSettings;
	saveSettings: () => Promise<void>;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	refreshEditorOptions: () => void;
	getCompiledRuleMatcher?: () => CompiledRuleMatcher;
}
