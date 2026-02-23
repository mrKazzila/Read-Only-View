export type MockViewMode = 'preview' | 'source';

export type MockSetViewStateArg = boolean | { replace?: boolean };

export type MockViewState = {
	type: 'markdown';
	state: {
		mode: MockViewMode;
	};
};

export type MockSetViewStateCall = {
	state: MockViewState;
	arg: MockSetViewStateArg | undefined;
};

type MockVaultFile = {
	path: string;
	extension: string;
};

type CreateMockLeafOptions = {
	mode?: MockViewMode;
	filePath?: string;
};

function createContainerElement(): HTMLElement {
	if (typeof HTMLElement === 'function') {
		return new HTMLElement();
	}
	return {
		contains: () => false,
	} as unknown as HTMLElement;
}

function extensionFromPath(path: string): string {
	const dot = path.lastIndexOf('.');
	return dot === -1 ? '' : path.slice(dot + 1);
}

export type MockWorkspaceLeaf = {
	view: {
		file: MockVaultFile | null;
		getMode: () => MockViewMode;
		containerEl: HTMLElement;
	};
	getViewState: () => MockViewState;
	setViewState: (state: MockViewState, arg?: MockSetViewStateArg) => Promise<void>;
	setViewStateCalls: MockSetViewStateCall[];
	setMode: (mode: MockViewMode) => void;
	setFilePath: (filePath?: string) => void;
};

export function createMockWorkspaceLeaf(options: CreateMockLeafOptions = {}): MockWorkspaceLeaf {
	let mode = options.mode ?? 'source';
	let filePath = options.filePath;
	const setViewStateCalls: MockSetViewStateCall[] = [];
	const containerEl = createContainerElement();

	const getFile = (): MockVaultFile | null => {
		if (!filePath) {
			return null;
		}
		return {
			path: filePath,
			extension: extensionFromPath(filePath),
		};
	};

	const leaf: MockWorkspaceLeaf = {
		view: {
			get file() {
				return getFile();
			},
			getMode: () => mode,
			containerEl,
		},
		getViewState: () => ({
			type: 'markdown',
			state: { mode },
		}),
		setViewState: async (state, arg) => {
			setViewStateCalls.push({ state, arg });
			mode = state.state.mode;
		},
		setViewStateCalls,
		setMode: (nextMode) => {
			mode = nextMode;
		},
		setFilePath: (nextFilePath) => {
			filePath = nextFilePath;
		},
	};

	return leaf;
}

type WorkspaceEventCallback = (...args: unknown[]) => unknown;

export type MockWorkspace = {
	getLeavesOfType: (type: string) => MockWorkspaceLeaf[];
	getLeavesOfTypeCalls: string[];
	on: (event: string, callback: WorkspaceEventCallback) => () => void;
	trigger: (event: string, ...args: unknown[]) => void;
};

type CreateMockWorkspaceOptions = {
	leaves?: MockWorkspaceLeaf[];
};

export function createMockWorkspace(options: CreateMockWorkspaceOptions = {}): MockWorkspace {
	const leaves = options.leaves ?? [];
	const getLeavesOfTypeCalls: string[] = [];
	const listeners = new Map<string, Set<WorkspaceEventCallback>>();

	return {
		getLeavesOfType: (type: string) => {
			getLeavesOfTypeCalls.push(type);
			if (type === 'markdown') {
				return leaves;
			}
			return [];
		},
		getLeavesOfTypeCalls,
		on: (event, callback) => {
			const callbacks = listeners.get(event) ?? new Set<WorkspaceEventCallback>();
			callbacks.add(callback);
			listeners.set(event, callbacks);
			return () => {
				const current = listeners.get(event);
				if (!current) {
					return;
				}
				current.delete(callback);
				if (current.size === 0) {
					listeners.delete(event);
				}
			};
		},
		trigger: (event, ...args) => {
			const callbacks = listeners.get(event);
			if (!callbacks) {
				return;
			}
			for (const callback of callbacks) {
				void callback(...args);
			}
		},
	};
}

export type MockApp = {
	workspace: MockWorkspace;
};

type CreateMockAppOptions = {
	workspace?: MockWorkspace;
	leaves?: MockWorkspaceLeaf[];
};

export function createMockApp(options: CreateMockAppOptions = {}): MockApp {
	const workspace = options.workspace ?? createMockWorkspace({ leaves: options.leaves });
	return { workspace };
}
