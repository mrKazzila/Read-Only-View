import { MarkdownView, WorkspaceLeaf, type ViewState } from 'obsidian';
import { shouldForceReadOnly, type ForceReadModeSettings } from './matcher';

export interface EnforcementDependencies {
	getSettings: () => ForceReadModeSettings;
	getMarkdownLeaves: () => WorkspaceLeaf[];
	logDebug: (message: string, payload?: Record<string, unknown>) => void;
	formatPathForDebug: (path: string, verbosePaths: boolean) => string;
	now?: () => number;
}

export interface EnforcementService {
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	applyReadOnlyForLeaf: (leaf: WorkspaceLeaf, reason: string) => Promise<void>;
	ensurePreview: (leaf: WorkspaceLeaf, reason: string) => Promise<void>;
}

const LEAF_FORCE_PREVIEW_THROTTLE_MS = 120;
const LAYOUT_CHANGE_FORCE_PREVIEW_THROTTLE_MS = 700;

function waitForNextFrame(): Promise<void> {
	if (typeof requestAnimationFrame === 'function') {
		return new Promise((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
	return Promise.resolve();
}

function isLayoutChangeReason(reason: string): boolean {
	return reason.includes('workspace-events:layout-change');
}

function describeError(error: unknown): { errorType: string; errorMessage: string } {
	if (error instanceof Error) {
		return {
			errorType: error.name || 'Error',
			errorMessage: error.message,
		};
	}
	return {
		errorType: typeof error,
		errorMessage: String(error),
	};
}

class DefaultEnforcementService implements EnforcementService {
	private enforcing = false;
	private pendingReapply: string | null = null;
	private lastForcedAt = new WeakMap<WorkspaceLeaf, number>();
	private readonly now: () => number;

	constructor(private readonly dependencies: EnforcementDependencies) {
		this.now = dependencies.now ?? (() => Date.now());
	}

	async applyAllOpenMarkdownLeaves(reason: string): Promise<void> {
		const settings = this.dependencies.getSettings();
		if (!settings.enabled) {
			return;
		}
		if (this.enforcing) {
			this.pendingReapply = reason;
			return;
		}

		this.enforcing = true;
		try {
			const leaves = this.dependencies.getMarkdownLeaves();
			for (const leaf of leaves) {
				await this.applyReadOnlyForLeaf(leaf, reason);
			}
		} finally {
			this.enforcing = false;
			if (this.pendingReapply) {
				const nextReason = this.pendingReapply;
				this.pendingReapply = null;
				await this.applyAllOpenMarkdownLeaves(`pending:${nextReason}`);
			}
		}
	}

	async applyReadOnlyForLeaf(leaf: WorkspaceLeaf, reason: string): Promise<void> {
		if (!(leaf.view instanceof MarkdownView)) {
			return;
		}

		const file = leaf.view.file;
		if (!file) {
			return;
		}
		if (file.extension !== 'md') {
			return;
		}
		if (this.getLeafMode(leaf) === 'preview') {
			return;
		}

		const settings = this.dependencies.getSettings();
		if (!shouldForceReadOnly(file.path, settings)) {
			return;
		}

		await this.ensurePreview(leaf, reason);
	}

	private getLeafMode(leaf: WorkspaceLeaf): string | null {
		if (!(leaf.view instanceof MarkdownView)) {
			return null;
		}
		const stateMode = (leaf.getViewState().state as { mode?: string } | undefined)?.mode;
		if (stateMode) {
			return stateMode;
		}
		if (typeof leaf.view.getMode === 'function') {
			return leaf.view.getMode();
		}
		return null;
	}

	async ensurePreview(leaf: WorkspaceLeaf, reason: string): Promise<void> {
		if (!(leaf.view instanceof MarkdownView)) {
			return;
		}
		const file = leaf.view.file;
		if (!file) {
			return;
		}
		const settings = this.dependencies.getSettings();
		const filePath = this.dependencies.formatPathForDebug(file.path, settings.debugVerbosePaths);

		const beforeMode = this.getLeafMode(leaf);
		if (beforeMode === 'preview') {
			this.dependencies.logDebug('ensure-preview-skip', {
				reason,
				filePath,
				skipReason: 'already-preview',
			});
			return;
		}

		const now = this.now();
		const last = this.lastForcedAt.get(leaf) ?? 0;
		const throttleMs = isLayoutChangeReason(reason)
			? LAYOUT_CHANGE_FORCE_PREVIEW_THROTTLE_MS
			: LEAF_FORCE_PREVIEW_THROTTLE_MS;
		if (now - last < throttleMs) {
			this.dependencies.logDebug('ensure-preview-skip', {
				reason,
				filePath,
				skipReason: 'throttled',
				throttleMs,
			});
			return;
		}

		const currentState = leaf.getViewState();
		if (currentState.type !== 'markdown') {
			this.dependencies.logDebug('ensure-preview-skip', {
				reason,
				filePath,
				skipReason: 'non-markdown-state',
			});
			return;
		}

		const nextState: ViewState = {
			...currentState,
			state: {
				...currentState.state,
				mode: 'preview',
			},
		};

		this.lastForcedAt.set(leaf, now);
		// Defer the actual mode write to the next frame to avoid forcing it
		// in the middle of CodeMirror measurement/layout work.
		await waitForNextFrame();

		const refreshedState = leaf.getViewState();
		if (refreshedState.type !== 'markdown') {
			this.dependencies.logDebug('ensure-preview-skip', {
				reason,
				filePath,
				skipReason: 'non-markdown-state-after-frame',
			});
			return;
		}
		if ((refreshedState.state as { mode?: string } | undefined)?.mode === 'preview') {
			this.dependencies.logDebug('ensure-preview-skip', {
				reason,
				filePath,
				skipReason: 'already-preview-after-frame',
			});
			return;
		}

		try {
			const setState = leaf.setViewState.bind(leaf) as (
				state: ViewState,
				pushHistory?: boolean | { replace?: boolean }
			) => Promise<void>;
			await setState(nextState, { replace: true });
		} catch (error) {
			const errorInfo = describeError(error);
			this.dependencies.logDebug('ensure-preview-fallback', {
				reason,
				filePath,
				errorType: errorInfo.errorType,
				errorMessage: errorInfo.errorMessage,
			});
			await leaf.setViewState(nextState, false);
		}

		const afterMode = (leaf.getViewState().state as { mode?: string } | undefined)?.mode ?? this.getLeafMode(leaf);
		this.dependencies.logDebug('ensure-preview', {
			reason,
			filePath,
			beforeMode,
			afterMode,
		});
	}
}

export function createEnforcementService(dependencies: EnforcementDependencies): EnforcementService {
	return new DefaultEnforcementService(dependencies);
}
