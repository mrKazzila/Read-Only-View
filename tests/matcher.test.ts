import assert from 'node:assert/strict';
import test from 'node:test';

import {
	matchPath,
	normalizeVaultPath,
	shouldForceReadOnly,
	type ForceReadModeSettings,
} from '../src/matcher.js';

const fileMatch = '016_микросервисы/001-patterns/003-saga.md';
const fileNoMatch = '016_микросервисы/001-микросервисы.md';

function createSettings(overrides: Partial<ForceReadModeSettings>): ForceReadModeSettings {
	return {
		enabled: true,
		useGlobPatterns: true,
		caseSensitive: true,
		debug: false,
		includeRules: [],
		excludeRules: [],
		...overrides,
	};
}

test('A) glob mode patterns match as expected', () => {
	const globOptions = { useGlobPatterns: true, caseSensitive: true };

	assert.equal(matchPath(fileMatch, '016_микросервисы/**', globOptions), true);
	assert.equal(matchPath(fileNoMatch, '016_микросервисы/**', globOptions), true);

	assert.equal(matchPath(fileMatch, '**/README.md', globOptions), false);
	assert.equal(matchPath(fileNoMatch, '**/README.md', globOptions), false);

	assert.equal(matchPath(fileMatch, '016_микросервисы/**/003-saga.md', globOptions), true);
	assert.equal(matchPath(fileNoMatch, '016_микросервисы/**/003-saga.md', globOptions), false);

	assert.equal(matchPath(fileMatch, '*/README.md', globOptions), false);
	assert.equal(matchPath(fileNoMatch, '*/README.md', globOptions), false);

	assert.equal(matchPath(fileMatch, '016_микросервисы/001-patterns/*.md', globOptions), true);
	assert.equal(matchPath(fileNoMatch, '016_микросервисы/001-patterns/*.md', globOptions), false);
});

test('B) prefix mode matches prefixes and ignores wildcard semantics', () => {
	const prefixOptions = { useGlobPatterns: false, caseSensitive: true };

	assert.equal(matchPath(fileMatch, '016_микросервисы/', prefixOptions), true);
	assert.equal(matchPath(fileMatch, '016_микросервисы/001-patterns/', prefixOptions), true);
	assert.equal(matchPath(fileNoMatch, '016_микросервисы/001-patterns/', prefixOptions), false);

	assert.equal(matchPath(fileMatch, '016_микросервисы/**', prefixOptions), false);
	assert.equal(matchPath(fileMatch, '**/README.md', prefixOptions), false);
});

test('C) useGlobPatterns switch changes behavior for wildcard pattern', () => {
	const pattern = '016_микросервисы/001-patterns/*.md';
	assert.equal(matchPath(fileMatch, pattern, { useGlobPatterns: true, caseSensitive: true }), true);
	assert.equal(matchPath(fileMatch, pattern, { useGlobPatterns: false, caseSensitive: true }), false);
});

test('D) normalization supports backslashes, leading ./, and repeated slashes', () => {
	const pattern = '016_микросервисы/001-patterns/*.md';
	const windowsPath = '016_микросервисы\\001-patterns\\003-saga.md';
	const dottedPath = './016_микросервисы//001-patterns/003-saga.md';

	assert.equal(normalizeVaultPath(windowsPath), '016_микросервисы/001-patterns/003-saga.md');
	assert.equal(normalizeVaultPath(dottedPath), '016_микросервисы/001-patterns/003-saga.md');

	assert.equal(matchPath(windowsPath, pattern, { useGlobPatterns: true, caseSensitive: true }), true);
	assert.equal(matchPath(dottedPath, pattern, { useGlobPatterns: true, caseSensitive: true }), true);
});

test('E) caseSensitive flag affects matching', () => {
	assert.equal(matchPath('docs/Readme.md', '**/README.md', { useGlobPatterns: true, caseSensitive: true }), false);
	assert.equal(matchPath('docs/Readme.md', '**/README.md', { useGlobPatterns: true, caseSensitive: false }), true);
});

test('F) exclude wins over include in shouldForceReadOnly', () => {
	const settings = createSettings({
		useGlobPatterns: true,
		includeRules: ['016_микросервисы/**'],
		excludeRules: ['016_микросервисы/001-patterns/**'],
	});

	assert.equal(shouldForceReadOnly('016_микросервисы/001-patterns/003-saga.md', settings), false);
	assert.equal(shouldForceReadOnly('016_микросервисы/other/file.md', settings), true);
});
