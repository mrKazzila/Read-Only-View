import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { execPath } from 'node:process';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { clearGlobRegexCache, matchPath } from '../src/matcher.js';

const GLOB_OPTIONS = { useGlobPatterns: true, caseSensitive: true };

function measureRuntimeMs(run: () => void): number {
	const startedAt = performance.now();
	run();
	const finishedAt = performance.now();
	return finishedAt - startedAt;
}

function buildLongPath(segmentCount: number): string {
	const segments: string[] = [];
	for (let index = 0; index < segmentCount; index++) {
		segments.push(`segment-${index.toString().padStart(3, '0')}`);
	}
	segments.push('note-final.md');
	return segments.join('/');
}

test('S1) long path and wildcard combination keep expected match semantics', () => {
	clearGlobRegexCache();

	const longPath = buildLongPath(120);
	const pattern = 'segment-000/**/segment-119/note-?????.md';

	assert.equal(matchPath(longPath, pattern, GLOB_OPTIONS), true);
	assert.equal(matchPath(longPath, 'segment-000/**/segment-118/note-?????.md', GLOB_OPTIONS), false);
});

test('S2) repeated long-path matching stays within conservative runtime budget', () => {
	clearGlobRegexCache();

	const longPath = buildLongPath(160);
	const pattern = 'segment-000/**/segment-159/note-*.md';
	const iterations = 30_000;
	const budgetMs = 900;

	// Budget is intentionally conservative to catch obvious regressions without creating CI flakes.
	const durationMs = measureRuntimeMs(() => {
		for (let index = 0; index < iterations; index++) {
			assert.equal(matchPath(longPath, pattern, GLOB_OPTIONS), true);
		}
	});

	assert.ok(durationMs <= budgetMs, `Expected <= ${budgetMs}ms, got ${durationMs.toFixed(2)}ms`);
});

test('S3) mixed wildcard stress cases (*, **, ?) stay within conservative runtime budget', () => {
	clearGlobRegexCache();

	const matchingPath = 'vault/projects/alpha/docs/section-aa/chapter-bb/note-12345.md';
	const nonMatchingPath = 'vault/projects/alpha/docs/section-aaa/chapter-bb/note-12345.md';
	const matchingPattern = 'vault/**/section-??/chapter-??/note-?????.md';
	const nonMatchingPattern = 'vault/**/section-?/chapter-??/note-?????.md';
	const iterations = 25_000;
	const budgetMs = 900;

	const durationMs = measureRuntimeMs(() => {
		for (let index = 0; index < iterations; index++) {
			assert.equal(matchPath(matchingPath, matchingPattern, GLOB_OPTIONS), true);
			assert.equal(matchPath(nonMatchingPath, matchingPattern, GLOB_OPTIONS), false);
			assert.equal(matchPath(matchingPath, nonMatchingPattern, GLOB_OPTIONS), false);
		}
	});

	assert.ok(durationMs <= budgetMs, `Expected <= ${budgetMs}ms, got ${durationMs.toFixed(2)}ms`);
});

// The parent enforces the deadline even if synchronous matching never returns.
test('S4) adversarial glob matching completes in an isolated process', () => {
	const matcherUrl = new URL('../src/matcher.js', import.meta.url).href;
	const result = spawnSync(execPath, ['--input-type=module', '--eval', `
		import assert from 'node:assert/strict';
		import { matchPath, createCompiledRuleMatcher, DEFAULT_SETTINGS } from ${JSON.stringify(matcherUrl)};
		const options = { useGlobPatterns: true, caseSensitive: true };
		const cases = [
			['*a'.repeat(32) + 'b.md', 'a'.repeat(40) + '.md'],
			['*a'.repeat(32) + '*b*.md', 'a'.repeat(80) + '.md'],
			['**a'.repeat(32) + '**b**.md', 'a/'.repeat(80) + 'a.md'],
			['a' + '/**/a'.repeat(24) + '/**/b*.md', 'a/'.repeat(60) + 'c.md'],
			['*?'.repeat(32) + '*b*.md', 'a'.repeat(80) + '.md'],
			['*a'.repeat(256) + '*b*.md', 'a'.repeat(1_000) + '.md'],
		];
		for (const [pattern, path] of cases) {
			assert.equal(matchPath(path, pattern, options), false, pattern);
			const settings = {
				...DEFAULT_SETTINGS, ...options, enabled: true, forceAllMarkdownReadOnly: false,
				includeRules: [pattern], excludeRules: [],
			};
			assert.equal(createCompiledRuleMatcher(settings).shouldForceReadOnly(path), false);
			const excluded = createCompiledRuleMatcher({
				...settings, includeRules: ['**'], excludeRules: [pattern, '**'],
			});
			assert.equal(excluded.shouldForceReadOnly(path), false);
			assert.deepEqual(excluded.matchExcludeRules(path), ['**']);
		}
		const matchingPattern = '*a'.repeat(32) + '*.md';
		const matchingPath = 'a'.repeat(80) + '.md';
		assert.equal(matchPath(matchingPath, matchingPattern, options), true);
		assert.equal(createCompiledRuleMatcher({
			...DEFAULT_SETTINGS, ...options, enabled: true, forceAllMarkdownReadOnly: true,
			includeRules: [], excludeRules: [matchingPattern],
		}).shouldForceReadOnly(matchingPath), false);

	`], { timeout: 5_000, killSignal: 'SIGKILL', encoding: 'utf8' });
	assert.ifError(result.error);
	assert.equal(result.status, 0, result.stderr);
});
