import assert from 'node:assert/strict';
import test from 'node:test';

import {
	canRunDisableCommand,
	canRunEnableCommand,
	shouldReapplyAfterEnabledChange,
} from '../src/command-controls.js';

test('Enable command availability follows enabled state', () => {
	assert.equal(canRunEnableCommand(false), true);
	assert.equal(canRunEnableCommand(true), false);
});

test('Disable command availability follows enabled state', () => {
	assert.equal(canRunDisableCommand(true), true);
	assert.equal(canRunDisableCommand(false), false);
});

test('Re-apply should happen only when transitioning false -> true', () => {
	assert.equal(shouldReapplyAfterEnabledChange(false, true), true);
	assert.equal(shouldReapplyAfterEnabledChange(true, true), false);
	assert.equal(shouldReapplyAfterEnabledChange(true, false), false);
	assert.equal(shouldReapplyAfterEnabledChange(false, false), false);
});
