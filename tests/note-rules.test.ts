import assert from 'node:assert/strict';
import test from 'node:test';
import { changeNoteRule, hasActiveNoteRule } from '../src/note-rules.js';
import { setFolderRuleEntries } from '../src/folder-rules.js';
import { mergeLoadedSettings } from '../src/plugin-settings.js';
import { createCompiledRuleMatcher } from '../src/matcher.js';
import type { RuleResolverContext } from '../src/rule-source.js';

const context: RuleResolverContext = {
	vaultName: 'My vault & notes', vaultBasePath: null,
	isMarkdownFile: () => true, isFolder: () => false,
};

for (const useGlobPatterns of [false, true]) {
	test(`note locks are exact in both modes, glob=${useGlobPatterns}`, () => {
		const settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false, useGlobPatterns });
		setFolderRuleEntries(settings, changeNoteRule(settings, './Notes\\Привет мир.md', true, context).entries);
		assert.equal(settings.includeRuleEntries?.[0]?.sourceKind, 'obsidian-uri');
		const matcher = createCompiledRuleMatcher(settings);
		assert.equal(matcher.shouldForceReadOnly('Notes/Привет мир.md'), true);
		assert.equal(matcher.shouldForceReadOnly('Notes/Привет мир.md.backup.md'), false);
		assert.equal(matcher.shouldForceReadOnly('Notes/Привет мир.md/nested.md'), false);
		assert.equal(matcher.shouldForceReadOnly('Notes/other.md'), false);
		settings.useGlobPatterns = !useGlobPatterns;
		assert.equal(createCompiledRuleMatcher(settings).shouldForceReadOnly('Notes/Привет мир.md'), true);
		assert.equal(changeNoteRule(settings, 'Notes/Привет мир.md', true, context).changed, false);
		assert.deepEqual(mergeLoadedSettings(settings), settings);
	});
}

test('manual paths, URI and imported paths are recognized; unlock preserves ancestors and exclusions', () => {
	const settings = mergeLoadedSettings({ forceAllMarkdownReadOnly: false, includeRules: ['Notes/', 'Notes/a.md'], excludeRules: ['Notes/a.md'] });
	const exact = changeNoteRule(mergeLoadedSettings(null), 'Notes/a.md', true, context).entries[0];
	assert.ok(exact);
	setFolderRuleEntries(settings, [...(settings.includeRuleEntries ?? []), exact, { ...exact, sourceKind: 'absolute-path' }]);
	const parent = settings.includeRuleEntries?.[0];
	const exclude = structuredClone(settings.excludeRuleEntries);
	assert.equal(hasActiveNoteRule(settings, 'Notes/a.md'), true);
	setFolderRuleEntries(settings, changeNoteRule(settings, 'Notes/a.md', false, context).entries);
	assert.deepEqual(settings.includeRuleEnabled, [true, false, false, false]);
	assert.equal(settings.includeRuleEntries?.[0], parent);
	assert.deepEqual(settings.excludeRuleEntries, exclude);
	assert.equal(changeNoteRule(settings, 'Notes/a.md', false, context).changed, false);
	setFolderRuleEntries(settings, changeNoteRule(settings, 'Notes/a.md', true, context).entries);
	assert.equal(settings.includeRuleEntries?.length, 4);
	assert.deepEqual(settings.includeRuleEnabled, [true, true, false, false]);
	assert.equal(createCompiledRuleMatcher(settings).shouldForceReadOnly('Notes/a.md'), false);
});

test('note identity respects case and does not claim broad glob or parent rules', () => {
	const settings = mergeLoadedSettings({ includeRules: ['Notes/', 'Notes/*.md', 'Notes/A.md'] });
	assert.equal(hasActiveNoteRule(settings, 'Notes/a.md'), false);
	settings.caseSensitive = false;
	assert.equal(hasActiveNoteRule(settings, 'Notes/a.md'), true);
});

test('unsupported names and non-Markdown targets never create misleading exact rules', () => {
	const settings = mergeLoadedSettings(null);
	for (const path of ['Notes/a#b.md', 'Notes/a?.md', 'Notes/a*.md', 'x'.repeat(40000) + '.md']) {
		const result = changeNoteRule(settings, path, true, context);
		assert.equal(result.changed, false);
		assert.ok(result.error);
	}
	assert.equal(changeNoteRule(settings, 'image.png', true, context).changed, false);
	assert.deepEqual(settings.includeRuleEntries, []);
});
