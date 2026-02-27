import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS, shouldForceReadOnly, type ForceReadModeSettings } from '../src/matcher.js';
import { buildEffectiveRules } from '../src/rule-limits.js';

function makeRules(count: number, prefix: string): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}/${index}.md`);
}

function createSettings(overrides: Partial<ForceReadModeSettings>): ForceReadModeSettings {
	return {
		...DEFAULT_SETTINGS,
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: [],
		excludeRules: [],
		...overrides,
	};
}

test('rule limits: small lists keep all rules and warning level stays none', () => {
	const zero = buildEffectiveRules([], []);
	assert.equal(zero.counts.totalUsed, 0);
	assert.equal(zero.counts.totalIgnored, 0);
	assert.equal(zero.warningLevel, 'none');

	const ten = buildEffectiveRules(makeRules(10, 'include'), []);
	assert.equal(ten.counts.includeUsed, 10);
	assert.equal(ten.counts.totalIgnored, 0);
	assert.equal(ten.warningLevel, 'none');
});

test('rule limits: include over 50 triggers soft warning', () => {
	const result = buildEffectiveRules(makeRules(51, 'include'), []);
	assert.equal(result.warningLevel, 'soft');
});

test('rule limits: exclude over 150 triggers strong warning', () => {
	const result = buildEffectiveRules([], makeRules(151, 'exclude'));
	assert.equal(result.warningLevel, 'strong');
});

test('rule limits: include hard cap keeps 200 and ignores rest', () => {
	const result = buildEffectiveRules(makeRules(201, 'include'), []);
	assert.equal(result.counts.includeUsed, 200);
	assert.equal(result.counts.includeIgnored, 1);
	assert.equal(result.counts.totalIgnored, 1);
});

test('rule limits: exclude hard cap keeps 300 and ignores rest', () => {
	const result = buildEffectiveRules([], makeRules(301, 'exclude'));
	assert.equal(result.counts.excludeUsed, 300);
	assert.equal(result.counts.excludeIgnored, 1);
	assert.equal(result.counts.totalIgnored, 1);
});

test('rule limits: total cap preserves include then trims exclude tail', () => {
	const result = buildEffectiveRules(makeRules(200, 'include'), makeRules(300, 'exclude'));
	assert.equal(result.counts.includeUsed, 200);
	assert.equal(result.counts.excludeUsed, 200);
	assert.equal(result.counts.totalUsed, 400);
	assert.equal(result.counts.excludeIgnored, 100);
	assert.equal(result.counts.totalIgnored, 100);
});

test('matching uses only effective rules and ignores truncated tail', () => {
	const includeRules = makeRules(200, 'notes');
	includeRules.push('secret/blocked.md');
	const settings = createSettings({
		includeRules,
		excludeRules: [],
	});

	assert.equal(shouldForceReadOnly('secret/blocked.md', settings), false);
	assert.equal(shouldForceReadOnly('notes/10.md', settings), true);
});
