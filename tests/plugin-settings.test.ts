import assert from 'node:assert/strict';
import test from 'node:test';

import ReadOnlyViewPlugin from '../src/main.js';
import {
	createCompiledRuleMatcher,
	getCompiledRuleMatcherKey,
	type CompiledRuleMatcher,
	type ForceReadModeSettings,
} from '../src/matcher.js';
import { DEFAULT_SETTINGS, mergeLoadedSettings } from '../src/plugin-settings.js';
import { PATH_SOURCE_INPUT_MAX_LENGTH } from '../src/source-input-limits.js';
import { buildPathTesterResult } from '../src/rule-diagnostics.js';

test('an overlength source cannot displace the next valid rule in runtime consumers', () => {
	const settings = mergeLoadedSettings({
		forceAllMarkdownReadOnly: false,
		includeRuleEntries: [
			{ sourceKind: 'vault-path', sourceValue: 'x'.repeat(40001), resolvedPath: 'Blocked/', enabled: true },
			{ sourceKind: 'vault-path', sourceValue: 'Notes/', resolvedPath: 'Notes/', enabled: true },
		],
	});
	const matcher = createCompiledRuleMatcher(settings);
	assert.deepEqual(matcher.effectiveIncludeRules, ['Notes/']);
	assert.equal(matcher.shouldForceReadOnly('Notes/A.md'), true);
	assert.equal(matcher.shouldForceReadOnly('Blocked/A.md'), false);
	assert.equal(matcher.isPathProtected('Notes', 'folder'), true);
	assert.deepEqual(buildPathTesterResult('Notes/A.md', settings).includeMatches, ['Notes/']);
});

type LoadSettingsPlugin = {
	loadData: () => Promise<unknown>;
	loadSettings: () => Promise<boolean>;
	getCompiledRuleMatcher: () => CompiledRuleMatcher;
	settings: ForceReadModeSettings;
	compiledRuleMatcher: CompiledRuleMatcher;
	compiledRuleMatcherKey: string;
};

function createPlugin(loadDataValue: unknown): LoadSettingsPlugin {
	const settings: ForceReadModeSettings = {
		...DEFAULT_SETTINGS,
		includeRules: [...DEFAULT_SETTINGS.includeRules],
		excludeRules: [...DEFAULT_SETTINGS.excludeRules],
	};
	const plugin = Object.create(ReadOnlyViewPlugin.prototype) as LoadSettingsPlugin;
	plugin.settings = settings;
	plugin.compiledRuleMatcher = createCompiledRuleMatcher(settings);
	plugin.compiledRuleMatcherKey = getCompiledRuleMatcherKey(settings);
	plugin.loadData = async () => loadDataValue;
	return plugin;
}

test('valid persisted settings are preserved', () => {
	const loaded: ForceReadModeSettings = {
		enabled: false,
		showExplorerProtectionIndicators: false,
		forceAllMarkdownReadOnly: true,
		useGlobPatterns: true,
		caseSensitive: false,
		debug: true,
		debugVerbosePaths: true,
		dismissedWelcomeVersion: 1,
		includeRules: ['docs/**', 'notes/file.md'],
		excludeRules: ['docs/private/**'],
		includeRuleEnabled: [true, false],
		excludeRuleEnabled: [true],
	};

	assert.deepEqual(mergeLoadedSettings(loaded), {
		...loaded,
		includeRuleEntries: [
			{ sourceKind: 'vault-path', sourceValue: 'docs/**', resolvedPath: 'docs/**', enabled: true },
			{ sourceKind: 'vault-path', sourceValue: 'notes/file.md', resolvedPath: 'notes/file.md', enabled: false },
		],
		excludeRuleEntries: [
			{ sourceKind: 'vault-path', sourceValue: 'docs/private/**', resolvedPath: 'docs/private/**', enabled: true },
		],
	});
});

test('string includeRules payload falls back safely without crashing', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		includeRules: 'docs/**',
	});

	assert.deepEqual(merged.includeRules, []);
	assert.deepEqual(merged.excludeRules, []);
});

test('object excludeRules payload falls back safely without crashing', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		excludeRules: {},
	});

	assert.deepEqual(merged.includeRules, []);
	assert.deepEqual(merged.excludeRules, []);
});

test('rule arrays keep only string entries', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		includeRules: ['docs/**', 42, null, 'notes/**'],
		excludeRules: [false, 'docs/private/**', { raw: 'bad' }],
	});

	assert.deepEqual(merged.includeRules, ['docs/**', 'notes/**']);
	assert.deepEqual(merged.excludeRules, ['docs/private/**']);
});

test('existing rules without enabled flags migrate as enabled', () => {
	const merged = mergeLoadedSettings({
		includeRules: ['docs/**', 'notes/**'],
		excludeRules: ['private/**'],
	});

	assert.deepEqual(merged.includeRuleEnabled, [true, true]);
	assert.deepEqual(merged.excludeRuleEnabled, [true]);
});

test('object rule entries drive canonical runtime rules and keep unresolved sources out', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		includeRules: ['stale/value.md'],
		includeRuleEntries: [
			{
				sourceKind: 'obsidian-uri',
				sourceValue: 'obsidian://open?vault=demo-vault&file=Inbox%2FQuick%20capture',
				resolvedPath: 'Inbox/Quick capture.md',
				enabled: true,
			},
			{
				sourceKind: 'obsidian-uri',
				sourceValue: 'obsidian://open?vault=other&file=Missing',
				resolvedPath: null,
				enabled: true,
			},
		],
	});

	assert.deepEqual(merged.includeRules, ['Inbox/Quick capture.md']);
	assert.deepEqual(merged.includeRuleEnabled, [true]);
	assert.equal(merged.includeRuleEntries?.length, 2);
});

test('over-limit persisted entries remain available for correction but stay out of runtime rules', () => {
	const sourceValue = 'x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH + 1);
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		includeRuleEntries: [{
			sourceKind: 'vault-path',
			sourceValue,
			resolvedPath: sourceValue,
			enabled: true,
		}],
	});

	assert.equal(merged.includeRuleEntries?.[0]?.sourceValue, sourceValue);
	assert.deepEqual(merged.includeRules, []);
	assert.deepEqual(merged.includeRuleEnabled, []);
});

test('absolute entry persists only the resolved vault path', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		includeRuleEntries: [{
			sourceKind: 'absolute-path',
			sourceValue: 'Inbox/Quick capture.md',
			resolvedPath: 'Inbox/Quick capture.md',
			enabled: true,
		}],
	});

	assert.deepEqual(merged.includeRuleEntries, [{
		sourceKind: 'absolute-path',
		sourceValue: 'Inbox/Quick capture.md',
		resolvedPath: 'Inbox/Quick capture.md',
		enabled: true,
	}]);
});

test('absolute folder entry reloads with its trailing slash and portable source value', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		includeRuleEntries: [{
			sourceKind: 'absolute-path',
			sourceValue: 'Knowledge Base/Productivity/',
			resolvedPath: 'Knowledge Base/Productivity/',
			enabled: true,
		}],
	});

	assert.deepEqual(merged.includeRules, ['Knowledge Base/Productivity/']);
	assert.deepEqual(merged.includeRuleEntries, [{
		sourceKind: 'absolute-path',
		sourceValue: 'Knowledge Base/Productivity/',
		resolvedPath: 'Knowledge Base/Productivity/',
		enabled: true,
	}]);
});

test('rule enabled flags are validated and aligned to rule counts', () => {
	const merged = mergeLoadedSettings({
		includeRules: ['docs/**', 'notes/**', 'archive/**'],
		excludeRules: ['private/**'],
		includeRuleEnabled: [false, 'invalid'],
		excludeRuleEnabled: [false, true],
	});

	assert.deepEqual(merged.includeRuleEnabled, [false, true, true]);
	assert.deepEqual(merged.excludeRuleEnabled, [false]);
});

test('invalid boolean fields fall back to defaults', () => {
	const merged = mergeLoadedSettings({
		enabled: 'yes',
		useGlobPatterns: 1,
		caseSensitive: null,
		debug: [],
		debugVerbosePaths: 'false',
	});

	assert.equal(merged.enabled, DEFAULT_SETTINGS.enabled);
	assert.equal(merged.useGlobPatterns, DEFAULT_SETTINGS.useGlobPatterns);
	assert.equal(merged.caseSensitive, DEFAULT_SETTINGS.caseSensitive);
	assert.equal(merged.debug, DEFAULT_SETTINGS.debug);
	assert.equal(merged.debugVerbosePaths, DEFAULT_SETTINGS.debugVerbosePaths);
	assert.equal(merged.forceAllMarkdownReadOnly, DEFAULT_SETTINGS.forceAllMarkdownReadOnly);
});

test('missing welcome dismissal version falls back to default', () => {
	const merged = mergeLoadedSettings({
		enabled: true,
	});

	assert.equal(merged.dismissedWelcomeVersion, 0);
});

test('invalid welcome dismissal version falls back to default', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		dismissedWelcomeVersion: '1',
	});

	assert.equal(merged.dismissedWelcomeVersion, 0);
});

test('missing all-Markdown preset falls back to default', () => {
	const merged = mergeLoadedSettings({
		enabled: true,
	});

	assert.equal(merged.forceAllMarkdownReadOnly, DEFAULT_SETTINGS.forceAllMarkdownReadOnly);
});

test('invalid all-Markdown preset falls back to default', () => {
	const merged = mergeLoadedSettings({
		...DEFAULT_SETTINGS,
		forceAllMarkdownReadOnly: 'true',
	});

	assert.equal(merged.forceAllMarkdownReadOnly, DEFAULT_SETTINGS.forceAllMarkdownReadOnly);
});

test('completely invalid loaded payload is handled safely', () => {
	assert.deepEqual(mergeLoadedSettings('broken-payload'), {
		...DEFAULT_SETTINGS,
		includeRules: [],
		excludeRules: [],
	});
});

test('loadSettings identifies missing persisted data as a fresh install', async () => {
	for (const loaded of [null, undefined]) {
		const plugin = createPlugin(loaded);

		assert.equal(await plugin.loadSettings(), true);
	}
});

test('loadSettings treats legacy settings without welcome state as an existing install', async () => {
	const plugin = createPlugin({
		enabled: true,
		includeRules: ['docs/**'],
	});

	assert.equal(await plugin.loadSettings(), false);
});

test('loadSettings treats valid and malformed persisted payloads as existing installs', async () => {
	for (const loaded of [
		{ ...DEFAULT_SETTINGS, dismissedWelcomeVersion: 1 },
		'broken-payload',
	]) {
		const plugin = createPlugin(loaded);

		assert.equal(await plugin.loadSettings(), false);
	}
});

test('loadSettings handles malformed persisted settings and rebuilds matcher safely', async () => {
	const plugin = createPlugin({
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: 'docs/**',
		excludeRules: {},
	});

	await assert.doesNotReject(async () => {
		await plugin.loadSettings();
	});

	assert.deepEqual(plugin.settings, {
		...DEFAULT_SETTINGS,
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: [],
		excludeRules: [],
	});
	assert.equal(plugin.getCompiledRuleMatcher().shouldForceReadOnly('docs/file.md'), true);
});

test('legacy invalid rows retain enabled flags at their original indexes', () => {
	const settings = mergeLoadedSettings({
		forceAllMarkdownReadOnly: false,
		includeRules: [null, 'Disabled/', 'Notes/'],
		includeRuleEnabled: [true, false, true],
	});
	const matcher = createCompiledRuleMatcher(settings);
	assert.deepEqual(matcher.effectiveIncludeRules, ['Notes/']);
	assert.equal(matcher.shouldForceReadOnly('Disabled/A.md'), false);
	assert.equal(matcher.shouldForceReadOnly('Notes/A.md'), true);
});

test('changing source validity invalidates the matcher cache', () => {
	const settings = mergeLoadedSettings({
		forceAllMarkdownReadOnly: false,
		includeRules: ['Notes/'],
	});
	const before = getCompiledRuleMatcherKey(settings);
	settings.includeRuleEntries![0]!.sourceValue = 'x'.repeat(40001);
	assert.notEqual(getCompiledRuleMatcherKey(settings), before);
	assert.equal(createCompiledRuleMatcher(settings).shouldForceReadOnly('Notes/A.md'), false);
});

for (const list of ['include', 'exclude'] as const) {
	test(`${list} validation preserves enabled alignment, exact semantics, and cap boundaries`, () => {
		const entry = (path: string, enabled = true) => ({
			sourceKind: 'vault-path', sourceValue: path, resolvedPath: path, enabled,
		});
		const count = list === 'include' ? 200 : 300;
		const settings = mergeLoadedSettings({
			forceAllMarkdownReadOnly: list === 'exclude',
			[`${list}RuleEntries`]: [
				{ ...entry('BadSource/'), sourceValue: 'x'.repeat(40001) },
				{ ...entry('BadPath/'), resolvedPath: 'x'.repeat(40001) },
				{ ...entry('Missing/'), resolvedPath: null },
				entry('Disabled/', false),
				...Array.from({ length: count - 1 }, (_, index) => entry(`Folder${index}/`)),
				{ ...entry('Exact.md'), sourceKind: 'obsidian-uri' },
				entry('Overflow/'),
			],
		});
		const matcher = createCompiledRuleMatcher(settings);
		const rules = list === 'include' ? matcher.effectiveIncludeRules : matcher.effectiveExcludeRules;
		assert.equal(rules.length, count);
		assert.equal(rules.at(-1), 'Exact.md');
		const matches = list === 'include' ? matcher.matchIncludeRules : matcher.matchExcludeRules;
		for (const path of ['BadSource/A.md', 'Disabled/A.md', 'Missing/A.md', 'Overflow/A.md', 'Exact.md-extra.md']) {
			assert.deepEqual(matches(path), []);
		}
		assert.deepEqual(matches('Exact.md'), ['Exact.md']);
		assert.equal(buildPathTesterResult('Exact.md', settings).finalReadOnly, list === 'include');
	});
}

test('total cap retains include priority after invalid and disabled entries are removed', () => {
	const settings = mergeLoadedSettings({
		forceAllMarkdownReadOnly: false,
		includeRules: Array.from({ length: 200 }, (_, index) => `Notes/${index}/`),
		excludeRules: [null, 'Disabled/', ...Array.from({ length: 201 }, (_, index) => `Notes/${index}/`)],
		excludeRuleEnabled: [true, false],
	});
	const matcher = createCompiledRuleMatcher(settings);
	assert.equal(matcher.effectiveIncludeRules.length, 200);
	assert.equal(matcher.effectiveExcludeRules.length, 200);
	assert.deepEqual(matcher.matchExcludeRules('Notes/199/A.md'), ['Notes/199/']);
	assert.deepEqual(matcher.matchExcludeRules('Notes/200/A.md'), []);
	assert.equal(matcher.shouldForceReadOnly('Notes/199/A.md'), false);
});
