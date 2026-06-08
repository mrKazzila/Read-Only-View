import assert from 'node:assert/strict';
import test from 'node:test';

import { DebouncedRuleChangeSaver } from '../src/settings-tab.js';

type RuleEditorUiState = {
	includeRules: string[];
	excludeRules: string[];
	includeText: string;
	excludeText: string;
};

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

function withOwnedFakeTimeoutWindows(
	callback: (tools: {
		switchActiveWindow: (name: 'A' | 'B') => void;
		windowA: { clearedIds: number[] };
		windowB: { clearedIds: number[] };
	}) => Promise<void>,
): Promise<void> {
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let nextId = 1;
	const createWindow = () => {
		const queue = new Map<number, () => void>();
		const clearedIds: number[] = [];
		return {
			clearedIds,
			setTimeout: ((handler: TimerHandler) => {
				const callbackHandler = typeof handler === 'function' ? handler : () => undefined;
				const id = nextId++;
				queue.set(id, callbackHandler as () => void);
				return id as unknown as ReturnType<typeof setTimeout>;
			}) as typeof setTimeout,
			clearTimeout: ((timeoutId: ReturnType<typeof setTimeout>) => {
				clearedIds.push(Number(timeoutId));
				queue.delete(Number(timeoutId));
			}) as typeof clearTimeout,
		};
	};

	const windowA = createWindow();
	const windowB = createWindow();
	(globalThis as Record<string, unknown>).activeWindow = windowA;

	return callback({
		switchActiveWindow: (name) => {
			(globalThis as Record<string, unknown>).activeWindow = name === 'A' ? windowA : windowB;
		},
		windowA,
		windowB,
	}).finally(() => {
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	});
}

function makeState(includeText: string, excludeText = ''): RuleEditorUiState {
	return {
		includeRules: includeText ? [includeText] : [],
		excludeRules: excludeText ? [excludeText] : [],
		includeText,
		excludeText,
	};
}

test('debounced rule saver collapses burst input into one save with latest value', async () => {
	const savedValues: RuleEditorUiState[] = [];
	const states: string[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		makeState(''),
		async (value) => {
			savedValues.push(value);
		},
		(state) => {
			states.push(state);
		},
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule(makeState('docs/a.md'));
		saver.schedule(makeState('docs/b.md'));
		saver.schedule(makeState('docs/c.md'));

		assert.deepEqual(savedValues, []);
		await flushAll();
		assert.deepEqual(savedValues, [makeState('docs/c.md')]);
	});

	assert.ok(states.includes('saving'));
	assert.ok(states.includes('saved'));
});

test('debounced rule saver flush runs immediate save and cancels pending timer', async () => {
	const savedValues: RuleEditorUiState[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		makeState(''),
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule(makeState('first'));
		await saver.flush(makeState('second'));
		assert.deepEqual(savedValues, [makeState('second')]);

		await flushAll();
		assert.deepEqual(savedValues, [makeState('second')]);
	});
});

test('debounced rule saver keeps latest edit even without blur/change flush', async () => {
	const savedValues: RuleEditorUiState[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		makeState(''),
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule(makeState('include/docs/**'));
		assert.deepEqual(savedValues, []);
		await flushAll();
		assert.deepEqual(savedValues, [makeState('include/docs/**')]);
	});
});

test('debounced rule saver dispose cancels pending save', async () => {
	const savedValues: RuleEditorUiState[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		makeState(''),
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.schedule(makeState('docs/cancelled.md'));
		saver.dispose();
		await flushAll();
		assert.deepEqual(savedValues, []);
	});
});

test('debounced rule saver dispose is idempotent and blocks later saves', async () => {
	const savedValues: RuleEditorUiState[] = [];
	const saver = new DebouncedRuleChangeSaver(
		400,
		makeState(''),
		async (value) => {
			savedValues.push(value);
		},
		() => undefined,
	);

	await withFakeTimeouts(async ({ flushAll }) => {
		saver.dispose();
		saver.dispose();
		saver.schedule(makeState('docs/ignored.md'));
		await saver.flush(makeState('docs/ignored-again.md'));
		await flushAll();
		assert.deepEqual(savedValues, []);
	});
});

test('debounced rule saver dispose clears pending timer through owner window', async () => {
	const saver = new DebouncedRuleChangeSaver(
		400,
		makeState(''),
		async () => undefined,
		() => undefined,
	);

	await withOwnedFakeTimeoutWindows(async ({ switchActiveWindow, windowA, windowB }) => {
		saver.schedule(makeState('docs/a.md'));
		switchActiveWindow('B');
		saver.dispose();

		assert.deepEqual(windowA.clearedIds, [1]);
		assert.deepEqual(windowB.clearedIds, []);
	});
});
