import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPathForDebug } from '../src/debug-log.js';

test('debug log formatter normalizes path before redaction', () => {
	assert.equal(
		formatPathForDebug('  ./private\\\\folder//file.md  ', false),
		'[redacted]/file.md',
	);
});

test('debug log formatter keeps normalized full path in verbose mode', () => {
	assert.equal(
		formatPathForDebug('  ./private\\\\folder//file.md  ', true),
		'private/folder/file.md',
	);
});

test('debug log formatter returns plain redacted marker for empty normalized path', () => {
	assert.equal(formatPathForDebug('   ', false), '[redacted]');
	assert.equal(formatPathForDebug('./', false), '[redacted]');
});
