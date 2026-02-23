import assert from 'node:assert/strict';
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
