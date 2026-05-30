import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS } from '../src/plugin-settings.js';
import { renderPathTester } from '../src/settings-path-tester.js';
import { installDomMocks, MockHTMLElement } from './helpers/dom-mocks.js';

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

function collectTexts(root: MockHTMLElement): string[] {
	return [root.textContent, ...root.getChildren().flatMap((child) => collectTexts(child))]
		.filter((value) => value.length > 0);
}

function createSettings() {
	return {
		...DEFAULT_SETTINGS,
		forceAllMarkdownReadOnly: false,
	};
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
	(globalThis as Record<string, unknown>).activeWindow = windowB;

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

test('path tester renders empty-state prompt before input', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderPathTester(container as unknown as HTMLElement, { settings: createSettings() });

		assert.ok(collectTexts(container).includes('Enter a file path to test.'));
	} finally {
		dom.restore();
	}
});

test('path tester normalizes input path and renders include-only read-only result', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...createSettings(),
				enabled: true,
				useGlobPatterns: true,
				includeRules: ['docs/**'],
				excludeRules: [],
			},
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = '  ./docs\\\\guide.md  ';
		input.trigger('change');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: docs/**'));
		assert.ok(texts.includes('Matched exclude: none'));
		assert.ok(texts.includes('Result: READ-ONLY ON'));
	} finally {
		dom.restore();
	}
});

test('path tester renders exclude override as read-only off', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...createSettings(),
				enabled: true,
				useGlobPatterns: true,
				includeRules: ['docs/**'],
				excludeRules: ['docs/private/**'],
			},
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = 'docs/private/secret.md';
		input.trigger('change');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: docs/**'));
		assert.ok(texts.includes('Matched exclude: docs/private/**'));
		assert.ok(texts.includes('Result: READ-ONLY OFF'));
	} finally {
		dom.restore();
	}
});

test('path tester uses supplied compiled matcher instead of rebuilding from raw settings', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		const fakeMatcher = {
			matchIncludeRules: () => ['shared/include'],
			matchExcludeRules: () => [],
			shouldForceReadOnly: () => true,
		};

		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...createSettings(),
				enabled: true,
				useGlobPatterns: true,
				includeRules: [],
				excludeRules: [],
			},
			getCompiledRuleMatcher: () => fakeMatcher,
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = 'docs/guide.md';
		input.trigger('change');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: shared/include'));
		assert.ok(texts.includes('Matched exclude: none'));
		assert.ok(texts.includes('Result: READ-ONLY ON'));
	} finally {
		dom.restore();
	}
});

test('path tester reflects matcher invalidation after rule changes', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		let currentMatcher: {
			matchIncludeRules: () => string[];
			matchExcludeRules: () => string[];
			shouldForceReadOnly: () => boolean;
		} = {
			matchIncludeRules: () => ['docs/**'],
			matchExcludeRules: () => [],
			shouldForceReadOnly: () => true,
		};

		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...createSettings(),
				enabled: true,
				useGlobPatterns: true,
				includeRules: ['docs/**'],
				excludeRules: [],
			},
			getCompiledRuleMatcher: () => currentMatcher,
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = 'docs/private/secret.md';
		input.trigger('change');
		assert.ok(collectTexts(container).includes('Result: READ-ONLY ON'));

		currentMatcher = {
			matchIncludeRules: () => ['docs/**'],
			matchExcludeRules: () => ['docs/private/**'],
			shouldForceReadOnly: () => false,
		};
		input.trigger('change');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: docs/**'));
		assert.ok(texts.includes('Matched exclude: docs/private/**'));
		assert.ok(texts.includes('Result: READ-ONLY OFF'));
	} finally {
		dom.restore();
	}
});

test('path tester shows preset override for Markdown paths when all-Markdown preset is enabled', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...DEFAULT_SETTINGS,
				enabled: true,
				forceAllMarkdownReadOnly: true,
				includeRules: [],
				excludeRules: ['docs/private/**'],
			},
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = 'docs/private/secret.md';
		input.trigger('change');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Preset override: all Markdown files are currently read-only. Saved path rules are ignored.'));
		assert.ok(texts.includes('Result: READ-ONLY ON'));
	} finally {
		dom.restore();
	}
});

test('path tester debounces input and eventually renders only the latest result', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderPathTester(container as unknown as HTMLElement, {
				settings: {
					...createSettings(),
					enabled: true,
					useGlobPatterns: true,
					includeRules: ['docs/**', 'notes/**'],
					excludeRules: [],
				},
			});

			const input = container.querySelector('input');
			assert.ok(input);
			input.value = 'docs/guide.md';
			input.trigger('input');
			input.value = 'notes/final.md';
			input.trigger('input');

			const textsBeforeFlush = collectTexts(container);
			assert.ok(!textsBeforeFlush.includes('Matched include: notes/**'));

			await flushAll();

			const textsAfterFlush = collectTexts(container);
			assert.ok(textsAfterFlush.includes('Matched include: notes/**'));
			assert.ok(!textsAfterFlush.includes('Matched include: docs/**'));
			assert.ok(textsAfterFlush.includes('Result: READ-ONLY ON'));
		});
	} finally {
		dom.restore();
	}
});

test('path tester blur flushes pending input render immediately', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async () => {
			renderPathTester(container as unknown as HTMLElement, {
				settings: {
					...createSettings(),
					enabled: true,
					useGlobPatterns: true,
					includeRules: ['docs/**'],
					excludeRules: [],
				},
			});

			const input = container.querySelector('input');
			assert.ok(input);
			input.value = 'docs/guide.md';
			input.trigger('input');
			assert.ok(!collectTexts(container).includes('Matched include: docs/**'));

			input.trigger('blur');
			const texts = collectTexts(container);
			assert.ok(texts.includes('Matched include: docs/**'));
			assert.ok(texts.includes('Result: READ-ONLY ON'));
		});
	} finally {
		dom.restore();
	}
});

test('path tester dispose cancels pending render', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			const controller = renderPathTester(container as unknown as HTMLElement, {
				settings: {
					...createSettings(),
					enabled: true,
					useGlobPatterns: true,
					includeRules: ['docs/**'],
					excludeRules: [],
				},
			});

			const input = container.querySelector('input');
			assert.ok(input);
			input.value = 'docs/guide.md';
			input.trigger('input');
			controller.dispose();

			await flushAll();

			const texts = collectTexts(container);
			assert.ok(!texts.includes('Matched include: docs/**'));
			assert.ok(texts.includes('Enter a file path to test.'));
		});
	} finally {
		dom.restore();
	}
});

test('path tester dispose clears pending render through owner window after focus switch', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withOwnedFakeTimeoutWindows(async ({ switchActiveWindow, windowA, windowB }) => {
			container.ownerDocument = { defaultView: windowA } as unknown as typeof container.ownerDocument;
			const controller = renderPathTester(container as unknown as HTMLElement, {
				settings: {
					...createSettings(),
					enabled: true,
					useGlobPatterns: true,
					includeRules: ['docs/**'],
					excludeRules: [],
				},
			});

			const input = container.querySelector('input');
			assert.ok(input);
			input.value = 'docs/guide.md';
			input.trigger('input');
			switchActiveWindow('B');
			controller.dispose();

			assert.deepEqual(windowA.clearedIds, [1]);
			assert.deepEqual(windowB.clearedIds, []);
		});
	} finally {
		dom.restore();
	}
});
