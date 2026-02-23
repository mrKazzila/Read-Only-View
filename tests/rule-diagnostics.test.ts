import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRuleDiagnostics } from '../src/main.js';

test('empty diagnostic line stays empty in prefix mode and keeps empty-line warning', () => {
	const diagnostics = buildRuleDiagnostics('', false);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.normalized, '');
	assert.equal(diagnostics[0]?.warnings.includes('Empty or whitespace-only line.'), true);
	assert.equal(
		diagnostics[0]?.warnings.some((warning) => warning.includes('Prefix mode folder hint applied')),
		false,
	);
});

test('empty diagnostic line stays empty in glob mode', () => {
	const diagnostics = buildRuleDiagnostics('', true);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.normalized, '');
	assert.equal(diagnostics[0]?.warnings.includes('Empty or whitespace-only line.'), true);
});

test('non-empty prefix diagnostics keep existing normalization behavior', () => {
	const diagnostics = buildRuleDiagnostics('docs', false);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.normalized, 'docs/');
	assert.equal(
		diagnostics[0]?.warnings.some((warning) => warning.includes('Prefix mode folder hint applied')),
		true,
	);
});

test('diagnostics provide inline-renderable warning data for suspicious prefix rules', () => {
	const diagnostics = buildRuleDiagnostics('*', false);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.isOk, false);
	assert.equal(diagnostics[0]?.warnings.length, 1);
	assert.equal(
		diagnostics[0]?.warnings[0],
		'Contains wildcard in prefix mode. It is treated as a literal character.',
	);
});

test('diagnostics provide empty warnings for healthy rules', () => {
	const diagnostics = buildRuleDiagnostics('docs/**', true);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.isOk, true);
	assert.deepEqual(diagnostics[0]?.warnings, []);
});
