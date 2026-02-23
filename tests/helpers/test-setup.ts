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
