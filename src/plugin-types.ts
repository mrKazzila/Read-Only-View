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

export interface SettingsTabPlugin {
	settings: ForceReadModeSettings;
	saveSettings: () => Promise<void>;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	refreshEditorOptions: () => void;
	getCompiledRuleMatcher?: () => CompiledRuleMatcher;
}
