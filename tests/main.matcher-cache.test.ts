import assert from 'node:assert/strict';
import test from 'node:test';

import ReadOnlyViewPlugin from '../src/main.js';
import {
	createCompiledRuleMatcher,
	DEFAULT_SETTINGS,
	getCompiledRuleMatcherKey,
	type CompiledRuleMatcher,
	type ForceReadModeSettings,
} from '../src/matcher.js';

type MatcherCachePlugin = {
	getCompiledRuleMatcher: () => CompiledRuleMatcher;
	settings: ForceReadModeSettings;
	compiledRuleMatcher: CompiledRuleMatcher;
	compiledRuleMatcherKey: string;
};

function createPlugin(settings: ForceReadModeSettings): MatcherCachePlugin {
	const plugin = Object.create(ReadOnlyViewPlugin.prototype) as MatcherCachePlugin;
	plugin.settings = settings;
	plugin.compiledRuleMatcher = createCompiledRuleMatcher(settings);
	plugin.compiledRuleMatcherKey = getCompiledRuleMatcherKey(settings);
	return plugin;
}

test('plugin reuses compiled matcher until rule settings change, then rebuilds it', () => {
	const settings: ForceReadModeSettings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		forceAllMarkdownReadOnly: false,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['docs/**'],
		excludeRules: [],
	};
	const plugin = createPlugin(settings);

	const firstMatcher = plugin.getCompiledRuleMatcher();
	const secondMatcher = plugin.getCompiledRuleMatcher();

	assert.equal(firstMatcher, secondMatcher);
	assert.equal(firstMatcher.shouldForceReadOnly('docs/private/secret.md'), true);

	plugin.settings.excludeRules = ['docs/private/**'];

	const rebuiltMatcher = plugin.getCompiledRuleMatcher();

	assert.notEqual(rebuiltMatcher, firstMatcher);
	assert.equal(rebuiltMatcher.shouldForceReadOnly('docs/private/secret.md'), false);
	assert.equal(plugin.getCompiledRuleMatcher(), rebuiltMatcher);
});

test('plugin rebuilds compiled matcher until preset setting change, then rebuilds it', () => {
	const settings: ForceReadModeSettings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		forceAllMarkdownReadOnly: false,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: [],
		excludeRules: [],
	};
	const plugin = createPlugin(settings);

	const firstMatcher = plugin.getCompiledRuleMatcher();
	plugin.settings.forceAllMarkdownReadOnly = true;
	const rebuiltMatcher = plugin.getCompiledRuleMatcher();

	assert.notEqual(rebuiltMatcher, firstMatcher);
	assert.equal(rebuiltMatcher.shouldForceReadOnly('notes/file.md'), true);
});
