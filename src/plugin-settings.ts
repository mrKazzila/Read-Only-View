import { normalizeVaultPath } from './path-utils';
import type { ForceReadModeSettings, RuleEntry, RuleSourceKind } from './plugin-types';
import {
	getSourceInputMaxLength,
	PATH_SOURCE_INPUT_MAX_LENGTH,
} from './source-input-limits';

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
	includeRuleEnabled: [],
	excludeRuleEnabled: [],
	includeRuleEntries: [],
	excludeRuleEntries: [],
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

function parseRuleEnabledList(value: unknown, ruleCount: number): boolean[] {
	if (!Array.isArray(value)) {
		return Array.from({ length: ruleCount }, () => true);
	}

	return Array.from({ length: ruleCount }, (_, index) =>
		typeof value[index] === 'boolean' ? value[index] : true,
	);
}

function isRuleSourceKind(value: unknown): value is RuleSourceKind {
	return value === 'vault-path' || value === 'obsidian-uri' || value === 'absolute-path';
}

function parseRuleEntries(value: unknown): RuleEntry[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const entries: RuleEntry[] = [];
	for (const candidate of value) {
		if (typeof candidate !== 'object' || candidate === null) {
			continue;
		}
		const record = candidate as Partial<Record<keyof RuleEntry, unknown>>;
		if (!isRuleSourceKind(record.sourceKind) || typeof record.sourceValue !== 'string') {
			continue;
		}
		const resolvedPath = typeof record.resolvedPath === 'string'
			? normalizeVaultPath(record.resolvedPath)
			: null;
		entries.push({
			sourceKind: record.sourceKind,
			sourceValue: record.sourceValue,
			resolvedPath: resolvedPath || null,
			enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
		});
	}
	return entries;
}

function migrateLegacyRules(rules: string[], enabledStates: boolean[]): RuleEntry[] {
	return rules.map((rule, index) => {
		const normalized = normalizeVaultPath(rule);
		return {
			sourceKind: 'vault-path',
			sourceValue: normalized,
			resolvedPath: normalized || null,
			enabled: enabledStates[index] !== false,
		};
	});
}

function buildRuntimeRules(entries: RuleEntry[]): { rules: string[]; enabled: boolean[] } {
	const resolved = entries.filter((entry): entry is RuleEntry & { resolvedPath: string } =>
		!!entry.resolvedPath
		&& entry.sourceValue.length <= getSourceInputMaxLength(entry.sourceValue)
		&& entry.resolvedPath.length <= PATH_SOURCE_INPUT_MAX_LENGTH,
	);
	return {
		rules: resolved.map((entry) => entry.resolvedPath),
		enabled: resolved.map((entry) => entry.enabled),
	};
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
	const includeRules = parseRuleList(loaded.includeRules);
	const excludeRules = parseRuleList(loaded.excludeRules);
	const includeRuleEnabled = parseRuleEnabledList(loaded.includeRuleEnabled, includeRules.length);
	const excludeRuleEnabled = parseRuleEnabledList(loaded.excludeRuleEnabled, excludeRules.length);
	const parsedIncludeEntries = parseRuleEntries(loaded.includeRuleEntries);
	const parsedExcludeEntries = parseRuleEntries(loaded.excludeRuleEntries);
	const includeRuleEntries = parsedIncludeEntries && (parsedIncludeEntries.length > 0 || includeRules.length === 0)
		? parsedIncludeEntries
		: migrateLegacyRules(includeRules, includeRuleEnabled);
	const excludeRuleEntries = parsedExcludeEntries && (parsedExcludeEntries.length > 0 || excludeRules.length === 0)
		? parsedExcludeEntries
		: migrateLegacyRules(excludeRules, excludeRuleEnabled);
	const runtimeInclude = buildRuntimeRules(includeRuleEntries);
	const runtimeExclude = buildRuntimeRules(excludeRuleEntries);

	return {
		enabled: parseBooleanSetting(loaded, 'enabled'),
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
