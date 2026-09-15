import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildSourceInputLimitMessage,
	formatSourceValueForDisplay,
	getSourceInputMaxLength,
	limitSourceInput,
	OBSIDIAN_URI_INPUT_MAX_LENGTH,
	PATH_SOURCE_INPUT_MAX_LENGTH,
} from '../src/source-input-limits.js';

test('source limits distinguish paths from Obsidian URLs', () => {
	assert.equal(getSourceInputMaxLength('/vault/note.md'), PATH_SOURCE_INPUT_MAX_LENGTH);
	assert.equal(getSourceInputMaxLength('  OBSIDIAN://open?vault=demo'), OBSIDIAN_URI_INPUT_MAX_LENGTH);
});

test('source input accepts the boundary and truncates one character beyond it', () => {
	const accepted = limitSourceInput('x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH));
	assert.equal(accepted.exceeded, false);
	assert.equal(accepted.value.length, PATH_SOURCE_INPUT_MAX_LENGTH);

	const rejected = limitSourceInput('x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH + 1));
	assert.equal(rejected.exceeded, true);
	assert.equal(rejected.value.length, PATH_SOURCE_INPUT_MAX_LENGTH);
});

test('an exceeded input remains invalid at the boundary until shortened', () => {
	assert.equal(limitSourceInput('x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH), true).exceeded, true);
	assert.equal(limitSourceInput('x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH - 1), true).exceeded, false);
});

test('long display values keep their beginning and end without rendering the full input', () => {
	const value = `begin-${'x'.repeat(1_000)}-end`;
	const formatted = formatSourceValueForDisplay(value, 100);
	assert.ok(formatted.startsWith('begin-'));
	assert.ok(formatted.includes('…'));
	assert.ok(formatted.includes(`${value.length} characters`));
	assert.ok(formatted.endsWith('-end (1010 characters)'));
	assert.ok(formatted.length < value.length);
});

test('limit message uses a readable character count', () => {
	assert.equal(
		buildSourceInputLimitMessage(40_000),
		'Input is too long. Maximum: 40,000 characters.',
	);
});
