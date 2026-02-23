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
