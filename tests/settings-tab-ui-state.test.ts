import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRuleLimitsUiState } from '../src/settings-tab.js';

function rulesText(prefix: string, count: number): string {
	return Array.from({ length: count }, (_, index) => `${prefix}/${index}.md`).join('\n');
}

test('settings ui state: small rule sets have plain summary and no warnings', () => {
	const state = computeRuleLimitsUiState('docs/a.md\ndocs/b.md', 'docs/private/a.md');
	assert.equal(state.summaryText, 'Include: 2 rules · Exclude: 1 rules · Total: 3');
	assert.equal(state.volumeWarningMessage, null);
	assert.equal(state.hardCapWarningMessage, null);
	assert.deepEqual(state.ignoredIncludeLineIndexes, []);
	assert.deepEqual(state.ignoredExcludeLineIndexes, []);
});

test('settings ui state: include over 50 shows soft volume warning', () => {
	const state = computeRuleLimitsUiState(rulesText('include', 51), '');
	assert.equal(
		state.volumeWarningMessage,
		'Many rules. Consider merging rules and using ** to simplify.',
	);
});

test('settings ui state: exclude over 150 shows strong volume warning', () => {
	const state = computeRuleLimitsUiState('', rulesText('exclude', 151));
	assert.equal(
		state.volumeWarningMessage,
		'Very many rules. This may slow down Obsidian, especially on mobile. Consider merging rules and using **.',
	);
});

test('settings ui state: hard caps expose ignored suffix and ignored indexes', () => {
	const state = computeRuleLimitsUiState(rulesText('include', 201), '');
	assert.equal(state.summaryText, 'Include: 200 rules · Exclude: 0 rules · Total: 200 (+1 ignored)');
	assert.equal(state.hardCapWarningMessage, 'Too many rules. Extra lines are ignored.');
	assert.deepEqual(state.ignoredIncludeLineIndexes, [200]);
	assert.deepEqual(state.ignoredExcludeLineIndexes, []);
});

test('settings ui state: total cap keeps include and trims exclude tail indexes', () => {
	const state = computeRuleLimitsUiState(rulesText('include', 200), rulesText('exclude', 300));
	assert.equal(state.summaryText, 'Include: 200 rules · Exclude: 200 rules · Total: 400 (+100 ignored)');
	assert.equal(state.hardCapWarningMessage, 'Too many rules. Extra lines are ignored.');
	assert.equal(state.ignoredIncludeLineIndexes.length, 0);
	assert.equal(state.ignoredExcludeLineIndexes.length, 100);
	assert.equal(state.ignoredExcludeLineIndexes[0], 200);
	assert.equal(state.ignoredExcludeLineIndexes[99], 299);
});
