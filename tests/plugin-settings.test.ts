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

type LoadSettingsPlugin = {
	loadData: () => Promise<unknown>;
	loadSettings: () => Promise<void>;
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
		useGlobPatterns: true,
		caseSensitive: false,
		debug: true,
		debugVerbosePaths: true,
		includeRules: ['docs/**', 'notes/file.md'],
		excludeRules: ['docs/private/**'],
	};

	assert.deepEqual(mergeLoadedSettings(loaded), loaded);
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
});

test('completely invalid loaded payload is handled safely', () => {
	assert.deepEqual(mergeLoadedSettings('broken-payload'), {
		...DEFAULT_SETTINGS,
		includeRules: [],
		excludeRules: [],
	});
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
	assert.equal(plugin.getCompiledRuleMatcher().shouldForceReadOnly('docs/file.md'), false);
});
