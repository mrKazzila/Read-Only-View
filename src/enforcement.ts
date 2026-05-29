import { MarkdownView, WorkspaceLeaf, type ViewState } from 'obsidian';
import type { ForceReadModeSettings } from './plugin-types';
import {
	cancelOwnedAnimationFrame,
	clearOwnedTimeout,
	requestOwnedAnimationFrame,
	resolveAnimationFrameWindow,
	scheduleOwnedTimeout,
	type AnimationFrameWindow,
	type OwnedTimeout,
} from './window-ownership';

export interface EnforcementDependencies {
	getSettings: () => ForceReadModeSettings;
	getMarkdownLeaves: () => WorkspaceLeaf[];
	shouldForceReadOnlyPath: (path: string) => boolean;
	logDebug: (message: string, payload?: Record<string, unknown>) => void;
	formatPathForDebug: (path: string, verbosePaths: boolean) => string;
	now?: () => number;
}

export interface EnforcementService {
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	applyReadOnlyForLeaf: (leaf: WorkspaceLeaf, reason: string) => Promise<void>;
	ensurePreview: (leaf: WorkspaceLeaf, reason: string) => Promise<void>;
	stop: () => void;
}

const LEAF_FORCE_PREVIEW_THROTTLE_MS = 120;
const LAYOUT_CHANGE_FORCE_PREVIEW_THROTTLE_MS = 700;

type PendingAnimationFrame = {
	cancel: () => void;
};

export function requestAnimationFrameSafe(
	callback: FrameRequestCallback,
	ownerWindow?: AnimationFrameWindow | null,
): number | null {
	return requestOwnedAnimationFrame(callback, ownerWindow)?.id ?? null;
}

export function cancelAnimationFrameSafe(
	frameId: number,
	ownerWindow?: AnimationFrameWindow | null,
): void {
	const frameWindow = resolveAnimationFrameWindow(ownerWindow);
	if (frameWindow) {
		frameWindow.cancelAnimationFrame(frameId);
		return;
	}
	if (typeof cancelAnimationFrame === 'function') {
		cancelAnimationFrame(frameId);
	}
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
	private stopped = false;
	private pendingReapply: string | null = null;
	private lastForcedAt = new WeakMap<WorkspaceLeaf, number>();
	private pendingLayoutRetry = new WeakMap<WorkspaceLeaf, OwnedTimeout>();
	private pendingLayoutRetryTimers = new Set<OwnedTimeout>();
	private pendingAnimationFrames = new Set<PendingAnimationFrame>();
	private readonly now: () => number;

	constructor(private readonly dependencies: EnforcementDependencies) {
		this.now = dependencies.now ?? (() => Date.now());
	}

	stop(): void {
		this.stopped = true;
		for (const timer of this.pendingLayoutRetryTimers) {
			clearOwnedTimeout(timer);
		}
		for (const pendingFrame of this.pendingAnimationFrames) {
			pendingFrame.cancel();
		}
		this.pendingLayoutRetryTimers.clear();
		this.pendingAnimationFrames.clear();
		this.pendingLayoutRetry = new WeakMap<WorkspaceLeaf, OwnedTimeout>();
		this.pendingReapply = null;
	}

	async applyAllOpenMarkdownLeaves(reason: string): Promise<void> {
		if (this.stopped) {
			return;
		}
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
			if (this.stopped) {
				this.pendingReapply = null;
			} else if (this.pendingReapply) {
				const nextReason = this.pendingReapply;
				this.pendingReapply = null;
				await this.applyAllOpenMarkdownLeaves(`pending:${nextReason}`);
			}
		}
	}

	async applyReadOnlyForLeaf(leaf: WorkspaceLeaf, reason: string): Promise<void> {
		if (this.stopped) {
			return;
		}
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

		if (!this.dependencies.shouldForceReadOnlyPath(file.path)) {
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
		if (this.stopped) {
			return;
		}
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
		const layoutChangeReason = isLayoutChangeReason(reason);
		const throttleMs = layoutChangeReason
			? LAYOUT_CHANGE_FORCE_PREVIEW_THROTTLE_MS
			: LEAF_FORCE_PREVIEW_THROTTLE_MS;
		if (now - last < throttleMs) {
			const remainingMs = throttleMs - (now - last);
			this.dependencies.logDebug('ensure-preview-skip', {
				reason,
				filePath,
				skipReason: 'throttled',
				throttleMs,
				remainingMs,
			});
			if (layoutChangeReason) {
				this.scheduleLayoutRetry(leaf, reason, remainingMs);
			}
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
		const frameCompleted = await this.waitForNextFrame();
		if (!frameCompleted || this.stopped) {
			this.dependencies.logDebug('ensure-preview-skip', {
				reason,
				filePath,
				skipReason: 'stopped-after-frame',
			});
			return;
		}

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

	private scheduleLayoutRetry(leaf: WorkspaceLeaf, reason: string, delayMs: number): void {
		if (this.stopped || this.pendingLayoutRetry.has(leaf)) {
			return;
		}
		const timer = scheduleOwnedTimeout(() => {
			this.pendingLayoutRetry.delete(leaf);
			this.pendingLayoutRetryTimers.delete(timer);
			if (this.stopped) {
				return;
			}
			void this.applyReadOnlyForLeaf(leaf, `deferred:${reason}`);
		}, Math.max(delayMs, 0));
		this.pendingLayoutRetry.set(leaf, timer);
		this.pendingLayoutRetryTimers.add(timer);
	}

	private waitForNextFrame(): Promise<boolean> {
		if (this.stopped) {
			return Promise.resolve(false);
		}

		const frameWindow = resolveAnimationFrameWindow();
		if (frameWindow) {
			return new Promise((resolve) => {
				let settled = false;
				let pendingFrame: PendingAnimationFrame | null = null;
				const ownedFrame = requestOwnedAnimationFrame(() => {
					if (settled) {
						return;
					}
					settled = true;
					if (pendingFrame) {
						this.pendingAnimationFrames.delete(pendingFrame);
					}
					resolve(true);
				}, frameWindow);
				if (!ownedFrame) {
					resolve(true);
					return;
				}
				pendingFrame = {
					cancel: () => {
						if (settled) {
							return;
						}
						settled = true;
						cancelOwnedAnimationFrame(ownedFrame);
						if (pendingFrame) {
							this.pendingAnimationFrames.delete(pendingFrame);
						}
						resolve(false);
					},
				};
				this.pendingAnimationFrames.add(pendingFrame);
			});
		}

		if (typeof requestAnimationFrame === 'function') {
			return new Promise((resolve) => {
				let settled = false;
				let pendingFrame: PendingAnimationFrame | null = null;
				const ownedFrame = requestOwnedAnimationFrame(() => {
					if (settled) {
						return;
					}
					settled = true;
					if (pendingFrame) {
						this.pendingAnimationFrames.delete(pendingFrame);
					}
					resolve(true);
				});
				if (!ownedFrame) {
					resolve(true);
					return;
				}
				pendingFrame = {
					cancel: () => {
						if (settled) {
							return;
						}
						settled = true;
						cancelOwnedAnimationFrame(ownedFrame);
						if (pendingFrame) {
							this.pendingAnimationFrames.delete(pendingFrame);
						}
						resolve(false);
					},
				};
				this.pendingAnimationFrames.add(pendingFrame);
			});
		}

		return Promise.resolve(true);
	}
}

export function createEnforcementService(dependencies: EnforcementDependencies): EnforcementService {
	return new DefaultEnforcementService(dependencies);
}
