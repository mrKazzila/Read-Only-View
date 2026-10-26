import assert from 'node:assert/strict';
import test from 'node:test';
import { changeFolderRule, hasActiveFolderRule, setFolderRuleEntries } from '../src/folder-rules.js';
import { createCompiledRuleMatcher } from '../src/matcher.js';
import { mergeLoadedSettings } from '../src/plugin-settings.js';
import type { RuleEntry } from '../src/plugin-types.js';
import type { RuleResolverContext } from '../src/rule-source.js';
import { PATH_SOURCE_INPUT_MAX_LENGTH } from '../src/source-input-limits.js';

const context: RuleResolverContext = {
	vaultName: 'test', vaultBasePath: null,
	isFolder: () => true, isMarkdownFile: () => false,
};
const entry = (resolvedPath: string, enabled = true): RuleEntry => ({
	sourceKind: 'vault-path', sourceValue: resolvedPath, resolvedPath, enabled,
});

for (const useGlobPatterns of [false, true]) {
	test(`folder lock creates a normalized recursive rule, glob=${useGlobPatterns}`, () => {
		const settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false, useGlobPatterns });
		const change = changeFolderRule(settings, './Notes\\Привет мир//', true, context);
		assert.equal(change.changed, true);
		setFolderRuleEntries(settings, change.entries);
		assert.deepEqual(settings.includeRules, [`Notes/Привет мир/${useGlobPatterns ? '**' : ''}`]);
		const matcher = createCompiledRuleMatcher(settings);
		for (const path of ['Notes/Привет мир/a.md', 'Notes/Привет мир/sub/b.md']) {
			assert.equal(matcher.shouldForceReadOnly(path), true);
		}
		for (const path of ['Notes/Привет мир-other/a.md', 'Notes/a.md', 'Notes/Привет мир/a.png']) {
			assert.equal(matcher.shouldForceReadOnly(path), false);
		}
		assert.equal(changeFolderRule(settings, 'Notes/Привет мир', true, context).changed, false);
		assert.deepEqual(mergeLoadedSettings(settings), settings);
	});
}

test('disabled rule is reused, adapted after mode changes, and re-enabled without duplicates', () => {
	const settings = mergeLoadedSettings({ includeRuleEntries: [entry('Notes/', false)] });
	for (const useGlobPatterns of [false, true, false]) {
		settings.useGlobPatterns = useGlobPatterns;
		assert.equal(hasActiveFolderRule(settings, 'Notes'), false);
		setFolderRuleEntries(settings, changeFolderRule(settings, 'Notes', true, context).entries);
		assert.equal(hasActiveFolderRule(settings, 'Notes'), true);
		assert.equal(settings.includeRuleEntries?.length, 1);
	}
	setFolderRuleEntries(settings, changeFolderRule(settings, 'Notes', false, context).entries);
	assert.equal(settings.includeRuleEntries?.[0]?.enabled, false);
	assert.equal(changeFolderRule(settings, 'Notes', false, context).changed, false);
	setFolderRuleEntries(settings, changeFolderRule(settings, 'Notes', true, context).entries);
	assert.equal(settings.includeRuleEntries?.length, 1);
});

test('unlock disables all exact duplicates while preserving parents, excludes and unrelated rules', () => {
	const settings = mergeLoadedSettings({
		forceAllMarkdownReadOnly: false,
		includeRuleEntries: [entry('Notes/'), entry('Notes/Sub/'), entry('Notes/Sub/**'), entry('Other/')],
		excludeRuleEntries: [entry('Notes/Sub/Drafts/')],
	});
	const parent = settings.includeRuleEntries?.[0];
	const other = settings.includeRuleEntries?.[3];
	const excludes = JSON.stringify([settings.excludeRuleEntries, settings.excludeRules, settings.excludeRuleEnabled]);
	setFolderRuleEntries(settings, changeFolderRule(settings, 'Notes/Sub', false, context).entries);
	assert.deepEqual(settings.includeRuleEnabled, [true, false, false, true]);
	assert.equal(settings.includeRuleEntries?.[0], parent);
	assert.equal(settings.includeRuleEntries?.[3], other);
	assert.equal(JSON.stringify([settings.excludeRuleEntries, settings.excludeRules, settings.excludeRuleEnabled]), excludes);
	assert.equal(createCompiledRuleMatcher(settings).shouldForceReadOnly('Notes/Sub/a.md'), true);
	assert.equal(createCompiledRuleMatcher(settings).shouldForceReadOnly('Notes/Sub/Drafts/a.md'), false);
});

test('a parent include does not prevent creating a reversible child include', () => {
	const settings = mergeLoadedSettings({ includeRules: ['Notes/'] });
	const parent = settings.includeRuleEntries?.[0];
	setFolderRuleEntries(settings, changeFolderRule(settings, 'Notes/Sub', true, context).entries);
	assert.equal(settings.includeRuleEntries?.length, 2);
	assert.equal(settings.includeRuleEntries?.[0], parent);
});

test('folder identity respects case and source kind without treating arbitrary globs as exact', () => {
	const settings = mergeLoadedSettings({ includeRuleEntries: [entry('notes/'), entry('Notes/**/*.md')] });
	assert.equal(hasActiveFolderRule(settings, 'Notes'), false);
	settings.caseSensitive = false;
	assert.equal(hasActiveFolderRule(settings, 'Notes'), true);
	settings.includeRuleEntries = [{ ...entry('Notes/'), sourceKind: 'obsidian-uri' }];
	assert.equal(hasActiveFolderRule(settings, 'Notes'), false);
	settings.includeRuleEntries = [{ ...entry('Notes/'), sourceKind: 'absolute-path' }];
	assert.equal(hasActiveFolderRule(settings, 'Notes'), true);
	settings.useGlobPatterns = true;
	setFolderRuleEntries(settings, changeFolderRule(settings, 'Notes', true, context).entries);
	assert.equal(settings.includeRuleEntries?.[0]?.sourceKind, 'vault-path');
	assert.equal(settings.includeRuleEntries?.[0]?.resolvedPath, 'Notes/**');
});

test('global and enabled switches are untouched; unsupported paths do not mutate settings', () => {
	const settings = mergeLoadedSettings({ enabled: false, forceAllMarkdownReadOnly: true, useGlobPatterns: true });
	for (const lock of [true, false]) {
		setFolderRuleEntries(settings, changeFolderRule(settings, 'Notes', lock, context).entries);
		assert.equal(settings.enabled, false);
		assert.equal(settings.forceAllMarkdownReadOnly, true);
	}
	const before = structuredClone(settings);
	for (const path of ['Notes*', 'Notes?', 'x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH)]) {
		const change = changeFolderRule(settings, path, true, context);
		assert.equal(change.changed, false);
		assert.ok(change.error);
	}
	assert.equal(changeFolderRule(settings, '/', true, context).changed, false);
	assert.deepEqual(settings, before);
});
