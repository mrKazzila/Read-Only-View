import { MarkdownView, WorkspaceLeaf } from 'obsidian';

export interface WorkspaceEventControllerDependencies {
	logDebug: (message: string, payload?: Record<string, unknown>) => void;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
	applyReadOnlyForLeaf: (leaf: WorkspaceLeaf, reason: string) => Promise<void>;
	formatLeafPathForDebug: (leaf: WorkspaceLeaf) => string | null;
}

const WORKSPACE_EVENT_COALESCE_MS = 150;
const TARGETED_WORKSPACE_REASONS = new Set(['active-leaf-change', 'file-open']);

export class WorkspaceEventController {
	private timer: ReturnType<Window['setTimeout']> | null = null;
	private reasons = new Set<string>();
	private leaves = new Set<WorkspaceLeaf>();

	constructor(private readonly dependencies: WorkspaceEventControllerDependencies) {}

	schedule(reason: string, leaf: WorkspaceLeaf | null = null): void {
		this.reasons.add(reason);
		if (leaf) {
			this.leaves.add(leaf);
		}
		if (this.timer) {
			return;
		}

		this.timer = activeWindow.setTimeout(() => {
			const reasons = Array.from(this.reasons);
			const leaves = Array.from(this.leaves);
			this.reasons.clear();
			this.leaves.clear();
			this.timer = null;
			void this.applyBurst(reasons, leaves);
		}, WORKSPACE_EVENT_COALESCE_MS);
	}

	stop(): void {
		if (this.timer) {
			activeWindow.clearTimeout(this.timer);
			this.timer = null;
		}
		this.reasons.clear();
		this.leaves.clear();
	}

	private isTargetedBurst(reasons: string[]): boolean {
		if (reasons.length === 0) {
			return false;
		}
		return reasons.every((reason) => TARGETED_WORKSPACE_REASONS.has(reason));
	}

	private async applyBurst(reasons: string[], leaves: WorkspaceLeaf[]): Promise<void> {
		const reasonText = `workspace-events:${reasons.join(',')}`;
		this.dependencies.logDebug('workspace-reapply-plan', {
			reason: reasonText,
			sourceReasons: reasons,
			leafCount: leaves.length,
			strategy: this.isTargetedBurst(reasons) ? 'targeted' : 'full',
		});

		if (!this.isTargetedBurst(reasons) || leaves.length === 0) {
			await this.dependencies.applyAllOpenMarkdownLeaves(reasonText);
			return;
		}

		for (const leaf of leaves) {
			const filePath = leaf.view instanceof MarkdownView
				? this.dependencies.formatLeafPathForDebug(leaf)
				: null;
			this.dependencies.logDebug('workspace-reapply-target', {
				reason: reasonText,
				source: 'active-leaf-change',
				filePath,
			});
			await this.dependencies.applyReadOnlyForLeaf(leaf, `${reasonText}:targeted-leaf`);
		}
	}
}
