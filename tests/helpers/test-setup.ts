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
