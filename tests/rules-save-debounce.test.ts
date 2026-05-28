import assert from 'node:assert/strict';
import test from 'node:test';

import { DebouncedRuleChangeSaver } from '../src/settings-tab.js';

function withFakeTimeouts(callback: (tools: { flushAll: () => Promise<void> }) => Promise<void>): Promise<void> {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let nextId = 1;
	const queue = new Map<number, () => void>();

	globalThis.setTimeout = ((handler: TimerHandler) => {
		const callbackHandler = typeof handler === 'function' ? handler : () => undefined;
		const id = nextId++;
		queue.set(id, callbackHandler as () => void);
		return id as unknown as ReturnType<typeof setTimeout>;
	}) as typeof setTimeout;

	globalThis.clearTimeout = ((timeoutId: ReturnType<typeof setTimeout>) => {
		queue.delete(Number(timeoutId));
	}) as typeof clearTimeout;
	(globalThis as Record<string, unknown>).activeWindow = globalThis;

	const flushAll = async () => {
		for (const [id, callbackHandler] of Array.from(queue.entries())) {
			queue.delete(id);
			callbackHandler();
			await Promise.resolve();
		}
	};

	return callback({ flushAll }).finally(() => {
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	});
}

test('debounced rule saver collapses burst input into one save with latest value', async () => {
	const savedValues: string[] = [];
	const states: string[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		async (value) => {
			savedValues.push(value);
		},
		(state) => {
			states.push(state);
		},
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule('docs/a.md');
		saver.schedule('docs/b.md');
		saver.schedule('docs/c.md');

		assert.deepEqual(savedValues, []);
		await flushAll();
		assert.deepEqual(savedValues, ['docs/c.md']);
	});

	assert.ok(states.includes('saving'));
	assert.ok(states.includes('saved'));
});

test('debounced rule saver flush runs immediate save and cancels pending timer', async () => {
	const savedValues: string[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule('first');
		await saver.flush('second');
		assert.deepEqual(savedValues, ['second']);

		await flushAll();
		assert.deepEqual(savedValues, ['second']);
	});
});

test('debounced rule saver keeps latest edit even without blur/change flush', async () => {
	const savedValues: string[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule('include/docs/**');
		assert.deepEqual(savedValues, []);
		await flushAll();
		assert.deepEqual(savedValues, ['include/docs/**']);
	});
});

test('debounced rule saver dispose cancels pending save', async () => {
	const savedValues: string[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule('docs/cancelled.md');
		saver.dispose();
		await flushAll();
		assert.deepEqual(savedValues, []);
	});
});

test('debounced rule saver dispose is idempotent and blocks later saves', async () => {
	const savedValues: string[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.dispose();
		saver.dispose();
		saver.schedule('docs/ignored.md');
		await saver.flush('docs/ignored-again.md');
		await flushAll();
		assert.deepEqual(savedValues, []);
	});
});
