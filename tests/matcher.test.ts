import assert from 'node:assert/strict';
import test from 'node:test';

import {
    compileGlobToRegex,
    matchPath,
    normalizeVaultPath,
    shouldForceReadOnly,
    type ForceReadModeSettings,
} from '../src/matcher.js';

const fileMatch = 'project_a/patterns/saga.md';
const fileNoMatch = 'project_a/project_a.md';

function createSettings(overrides: Partial<ForceReadModeSettings>): ForceReadModeSettings {
    return {
        enabled: true,
        useGlobPatterns: true,
        caseSensitive: true,
        debug: false,
        debugVerbosePaths: false,
        includeRules: [],
        excludeRules: [],
        ...overrides,
    };
}

test('A) glob mode patterns match as expected', () => {
  const globOptions = { useGlobPatterns: true, caseSensitive: true };

  assert.equal(matchPath(fileMatch, 'project_a/**', globOptions), true);
  assert.equal(matchPath(fileNoMatch, 'project_a/**', globOptions), true);

  assert.equal(matchPath(fileMatch, '**/README.md', globOptions), false);
  assert.equal(matchPath(fileNoMatch, '**/README.md', globOptions), false);

  assert.equal(matchPath(fileMatch, 'project_a/**/saga.md', globOptions), true);
  assert.equal(matchPath(fileNoMatch, 'project_a/**/saga.md', globOptions), false);

  assert.equal(matchPath(fileMatch, '*/README.md', globOptions), false);
  assert.equal(matchPath(fileNoMatch, '*/README.md', globOptions), false);

  assert.equal(matchPath(fileMatch, 'project_a/patterns/*.md', globOptions), true);
  assert.equal(matchPath(fileNoMatch, 'project_a/patterns/*.md', globOptions), false);
});

test('B) prefix mode matches prefixes and ignores wildcard semantics', () => {
  const prefixOptions = { useGlobPatterns: false, caseSensitive: true };

  assert.equal(matchPath(fileMatch, 'project_a/', prefixOptions), true);
  assert.equal(matchPath(fileMatch, 'project_a/patterns/', prefixOptions), true);
  assert.equal(matchPath(fileNoMatch, 'project_a/patterns/', prefixOptions), false);

  // In prefix mode, wildcards are NOT treated specially; it's just a plain prefix string.
  assert.equal(matchPath(fileMatch, 'project_a/**', prefixOptions), false);
  assert.equal(matchPath(fileMatch, '**/README.md', prefixOptions), false);
});

test('C) useGlobPatterns switch changes behavior for wildcard pattern', () => {
  const pattern = 'project_a/patterns/*.md';

  assert.equal(
    matchPath(fileMatch, pattern, { useGlobPatterns: true, caseSensitive: true }),
    true,
  );
  assert.equal(
    matchPath(fileMatch, pattern, { useGlobPatterns: false, caseSensitive: true }),
    false,
  );
});

test('D) normalization supports backslashes, leading ./, and repeated slashes', () => {
  const pattern = 'project_a/patterns/*.md';
  const windowsPath = 'project_a\\patterns\\saga.md';
  const dottedPath = './project_a//patterns/saga.md';

  assert.equal(normalizeVaultPath(windowsPath), 'project_a/patterns/saga.md');
  assert.equal(normalizeVaultPath(dottedPath), 'project_a/patterns/saga.md');

  assert.equal(matchPath(windowsPath, pattern, { useGlobPatterns: true, caseSensitive: true }), true);
  assert.equal(matchPath(dottedPath, pattern, { useGlobPatterns: true, caseSensitive: true }), true);
});

test('E) caseSensitive flag affects matching', () => {
  assert.equal(
    matchPath('docs/Readme.md', '**/README.md', { useGlobPatterns: true, caseSensitive: true }),
    false,
  );
  assert.equal(
    matchPath('docs/Readme.md', '**/README.md', { useGlobPatterns: true, caseSensitive: false }),
    true,
  );
});

test('F) exclude wins over include in shouldForceReadOnly', () => {
  const settings = createSettings({
    useGlobPatterns: true,
    includeRules: ['project_a/**'],
    excludeRules: ['project_a/patterns/**'],
  });

  assert.equal(shouldForceReadOnly('project_a/patterns/saga.md', settings), false);
  assert.equal(shouldForceReadOnly('project_a/other/file.md', settings), true);
});

test('G) compileGlobToRegex is anchored and cached by key', () => {
	const regex1 = compileGlobToRegex('docs/*.md', true);
	const regex2 = compileGlobToRegex('docs/*.md', true);
	const regex3 = compileGlobToRegex('docs/*.md', false);

	assert.equal(regex1, regex2);
	assert.notEqual(regex1, regex3);

	assert.equal(regex1.test('prefix/docs/file.md'), false);
	assert.equal(regex1.test('docs/file.md/suffix'), false);
	assert.equal(regex1.test('docs/file.md'), true);
});

test('H) glob token semantics for segment crossing', () => {
	const options = { useGlobPatterns: true, caseSensitive: true };

	assert.equal(matchPath('a/b/c.md', 'a/*/c.md', options), true);
	assert.equal(matchPath('a/b/d/c.md', 'a/*/c.md', options), false);

	assert.equal(matchPath('a/b/c.md', 'a/**/c.md', options), true);
	assert.equal(matchPath('a/c.md', 'a/**/c.md', options), true);

	assert.equal(matchPath('a/b/c.md', 'a/?/c.md', options), true);
	assert.equal(matchPath('a/bb/c.md', 'a/?/c.md', options), false);
});

test('I) prefix mode applies folder slash hint and does not overmatch sibling prefix', () => {
	const prefixOptions = { useGlobPatterns: false, caseSensitive: true };

	assert.equal(matchPath('project_a/patterns/file.md', 'project_a', prefixOptions), true);
	assert.equal(matchPath('project_a_old/file.md', 'project_a', prefixOptions), false);
});

test('J) prefix mode keeps wildcard literals and uses raw startsWith for .md literal', () => {
	const prefixOptions = { useGlobPatterns: false, caseSensitive: true };

	assert.equal(matchPath('folder/file.md', 'folder/file.md', prefixOptions), true);
	assert.equal(matchPath('folder/file.md/child', 'folder/file.md', prefixOptions), true);

	assert.equal(matchPath('folder/abc/file.md', 'folder/*/file.md', prefixOptions), false);
	assert.equal(matchPath('folder/*/file.md', 'folder/*/file.md', prefixOptions), true);
});

test('K) shouldForceReadOnly ignores non-markdown files and disabled plugin', () => {
	const settings = createSettings({
		useGlobPatterns: true,
		includeRules: ['docs/**'],
		excludeRules: [],
	});
	assert.equal(shouldForceReadOnly('docs/file.png', settings), false);
	assert.equal(shouldForceReadOnly('docs/file.md', { ...settings, enabled: false }), false);
});

test('L) shouldForceReadOnly requires include match and supports case-insensitive prefix mode', () => {
	const noIncludeSettings = createSettings({
		useGlobPatterns: true,
		includeRules: [],
		excludeRules: [],
	});
	assert.equal(shouldForceReadOnly('docs/file.md', noIncludeSettings), false);

	const prefixSettings = createSettings({
		useGlobPatterns: false,
		caseSensitive: false,
		includeRules: ['Docs/Readme.md'],
		excludeRules: [],
	});
	assert.equal(shouldForceReadOnly('docs/readme.md', prefixSettings), true);
});

test('M) normalization handles repeated dot-prefix and surrounding spaces', () => {
	assert.equal(
		normalizeVaultPath('   ././docs//nested\\\\readme.md   '),
		'docs/nested/readme.md',
	);
});
