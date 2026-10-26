import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import type { Command } from 'obsidian';
import ReadOnlyViewPlugin from '../../src/main.js';
import type { ForceReadModeSettings } from '../../src/plugin-types.js';

import { createMockApp, createMockWorkspace, createMockWorkspaceLeaf, type MockWorkspaceLeaf } from './obsidian-mocks.js';
import { installDomMocks, type InstalledDomMocks } from './dom-mocks.js';

type CreateMainTestHarnessOptions = {
	leaves?: MockWorkspaceLeaf[];
};

export type MainTestHarness = {
	dom: InstalledDomMocks;
	leaves: MockWorkspaceLeaf[];
	app: ReturnType<typeof createMockApp>;
	workspace: ReturnType<typeof createMockWorkspace>;
	restore: () => void;
};

export function createMainTestHarness(options: CreateMainTestHarnessOptions = {}): MainTestHarness {
	const dom = installDomMocks();
	const leaves = options.leaves ?? [createMockWorkspaceLeaf({ filePath: 'notes/example.md', mode: 'source' })];
	const workspace = createMockWorkspace({ leaves });
	const app = createMockApp({ workspace });

	return {
		dom,
		leaves,
		app,
		workspace,
		restore: () => {
			dom.restore();
		},
	};
}

export function withFakeAnimationFrames(
	callback: (tools: { flushNextFrame: () => Promise<void>; pendingFrameCount: () => number }) => Promise<void>
): Promise<void> {
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;
	const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
	const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

	let nextId = 1;
	const queue = new Map<number, FrameRequestCallback>();
	const frameWindow = {
		requestAnimationFrame: (callbackHandler: FrameRequestCallback) => {
			const id = nextId++;
			queue.set(id, callbackHandler);
			return id;
		},
		cancelAnimationFrame: (frameId: number) => {
			queue.delete(frameId);
		},
	};

	(globalThis as Record<string, unknown>).window = frameWindow;
	(globalThis as Record<string, unknown>).activeWindow = frameWindow;
	globalThis.requestAnimationFrame = frameWindow.requestAnimationFrame;
	globalThis.cancelAnimationFrame = frameWindow.cancelAnimationFrame;

	const flushNextFrame = async () => {
		const nextEntry = queue.entries().next();
		if (nextEntry.done) {
			return;
		}
		const [frameId, callbackHandler] = nextEntry.value;
		queue.delete(frameId);
		callbackHandler(16);
		await Promise.resolve();
	};

	return callback({
		flushNextFrame,
		pendingFrameCount: () => queue.size,
	}).finally(() => {
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
		globalThis.requestAnimationFrame = originalRequestAnimationFrame;
		globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
	});
}

export type PluginHost = ReturnType<typeof createPluginHost>;

/** Host boundaries only: persistence, commands, event disposal, and time. */
export async function withPluginHost(
	callback: (host: PluginHost) => Promise<void>,
	persisted: Partial<ForceReadModeSettings> = {},
): Promise<void> {
	const host = createPluginHost(persisted);
	try {
		await callback(host);
	} finally {
		try { host.unload(); }
		finally { host.restore(); }
	}
}

function createPluginHost(persisted: Partial<ForceReadModeSettings>) {
	const harness = createMainTestHarness();
	const leaf = harness.leaves[0]!;
	leaf.setFilePath('docs/file.md');
	leaf.setMode('preview');
	const plugin = new ReadOnlyViewPlugin(harness.app as never, {} as never);
	plugin.loadData = async () => ({
		forceAllMarkdownReadOnly: false,
		useGlobPatterns: true,
		includeRules: ['docs/**'],
		...persisted,
	});
	plugin.saveData = async () => undefined;
	const commands = new Map<string, Command>();
	plugin.addCommand = (command) => { commands.set(command.id, command); return command; };
	const eventDisposers: Array<() => void> = [];
	plugin.registerEvent = (ref) => {
		// This workspace adapter represents Obsidian EventRefs as unsubscribe functions.
		assert.equal(typeof ref, 'function');
		eventDisposers.push(ref as unknown as () => void);
	};
	const originalNow = Date.now;
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	let now = 1_000;
	let nextId = 1;
	const timers = new Map<number, { due: number; run: () => void }>();
	Date.now = () => now;
	globalThis.setTimeout = ((handler: TimerHandler, delay = 0) => {
		assert.equal(typeof handler, 'function');
		const id = nextId++;
		timers.set(id, { due: now + delay, run: handler as () => void });
		return id as unknown as ReturnType<typeof setTimeout>;
	}) as typeof setTimeout;
	globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
		timers.delete(Number(id));
	}) as typeof clearTimeout;

	return {
		...harness,
		plugin,
		leaf,
		commands,
		settle: () => setImmediate(),
		pendingTimers: () => timers.size,
		advance: async (milliseconds: number) => {
			now += milliseconds;
			for (const [id, timer] of [...timers]) {
				if (timer.due > now || !timers.delete(id)) continue;
				timer.run();
				await setImmediate();
			}
		},
		unload: () => {
			try { plugin.onunload(); }
			finally { for (const dispose of eventDisposers.splice(0)) dispose(); }
		},
		restore: () => {
			Date.now = originalNow;
			globalThis.setTimeout = originalSetTimeout;
			globalThis.clearTimeout = originalClearTimeout;
			harness.restore();
		},
	};
}
