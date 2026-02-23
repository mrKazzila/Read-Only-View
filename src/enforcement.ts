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
		if (typeof leaf.view.getMode === 'function') {
			return leaf.view.getMode();
		}
		const stateMode = (leaf.getViewState().state as { mode?: string } | undefined)?.mode;
		return stateMode ?? null;
	}

	async ensurePreview(leaf: WorkspaceLeaf, reason: string): Promise<void> {
		if (!(leaf.view instanceof MarkdownView)) {
			return;
		}
		const file = leaf.view.file;
		if (!file) {
			return;
		}

		const beforeMode = this.getLeafMode(leaf);
		if (beforeMode === 'preview') {
			return;
		}

		const now = this.now();
		const last = this.lastForcedAt.get(leaf) ?? 0;
		if (now - last < LEAF_FORCE_PREVIEW_THROTTLE_MS) {
			return;
		}

		const currentState = leaf.getViewState();
		if (currentState.type !== 'markdown') {
			return;
		}

		const nextState: ViewState = {
			...currentState,
			state: {
				...currentState.state,
				mode: 'preview',
			},
		};

		const settings = this.dependencies.getSettings();
		this.lastForcedAt.set(leaf, now);
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
				filePath: this.dependencies.formatPathForDebug(file.path, settings.debugVerbosePaths),
				errorType: errorInfo.errorType,
				errorMessage: errorInfo.errorMessage,
			});
			await leaf.setViewState(nextState, false);
		}

		const afterMode = this.getLeafMode(leaf);
		this.dependencies.logDebug('ensure-preview', {
			reason,
			filePath: this.dependencies.formatPathForDebug(file.path, settings.debugVerbosePaths),
			beforeMode,
			afterMode,
		});
	}
}

export function createEnforcementService(dependencies: EnforcementDependencies): EnforcementService {
	return new DefaultEnforcementService(dependencies);
}
