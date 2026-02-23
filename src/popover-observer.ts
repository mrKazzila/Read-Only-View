import { MarkdownView, WorkspaceLeaf } from 'obsidian';

export type PopoverObserverSelectors = {
	popoverCandidate: string;
	editorCandidate: string;
};

export const DEFAULT_POPOVER_OBSERVER_SELECTORS: PopoverObserverSelectors = {
	popoverCandidate: '.hover-popover, .popover, .workspace-leaf, .markdown-source-view, .cm-editor',
	editorCandidate: '.markdown-source-view, .cm-editor',
};

export interface PopoverObserverDependencies {
	isEnabled: () => boolean;
	getMarkdownLeaves: () => WorkspaceLeaf[];
	shouldForceReadOnlyPath: (path: string) => boolean;
	ensurePreview: (leaf: WorkspaceLeaf, reason: string) => Promise<void>;
}

export interface PopoverObserverService {
	start: () => void;
	stop: () => void;
	invalidateLeafCache: () => void;
	findLeafByNode: (node: HTMLElement) => WorkspaceLeaf | null;
}

class DefaultPopoverObserverService implements PopoverObserverService {
	private mutationObserver: MutationObserver | null = null;
	private leafByContainer = new WeakMap<HTMLElement, WorkspaceLeaf>();

	constructor(
		private readonly dependencies: PopoverObserverDependencies,
		private readonly selectors: PopoverObserverSelectors,
	) {}

	start(): void {
		if (this.mutationObserver) {
			return;
		}
		if (typeof document === 'undefined' || !document.body) {
			return;
		}

		this.mutationObserver = new MutationObserver((mutations) => {
			if (!this.dependencies.isEnabled()) {
				return;
			}
			const candidateNodes = this.collectPopoverCandidates(mutations);
			if (candidateNodes.length === 0) {
				return;
			}
			void this.handlePotentialPopoverBatch(candidateNodes);
		});

		this.mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	stop(): void {
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
	}

	invalidateLeafCache(): void {
		this.leafByContainer = new WeakMap<HTMLElement, WorkspaceLeaf>();
	}

	findLeafByNode(node: HTMLElement): WorkspaceLeaf | null {
		let current: HTMLElement | null = node;
		while (current) {
			const cachedLeaf = this.leafByContainer.get(current);
			if (cachedLeaf) {
				return cachedLeaf;
			}
			current = current.parentElement;
		}

		const leaves = this.dependencies.getMarkdownLeaves();
		for (const leaf of leaves) {
			if (!(leaf.view instanceof MarkdownView)) {
				continue;
			}
			const container = leaf.view.containerEl;
			if (container && (container === node || container.contains(node))) {
				this.leafByContainer.set(container, leaf);
				return leaf;
			}
		}
		return null;
	}

	private isPotentialPopoverNode(node: HTMLElement): boolean {
		if (node.matches(this.selectors.popoverCandidate)) {
			return true;
		}
		return !!node.querySelector(this.selectors.popoverCandidate);
	}

	private collectPopoverCandidates(mutations: MutationRecord[]): HTMLElement[] {
		const candidates: HTMLElement[] = [];
		for (const mutation of mutations) {
			if (mutation.addedNodes.length === 0) {
				continue;
			}
			for (let index = 0; index < mutation.addedNodes.length; index++) {
				const node = mutation.addedNodes[index];
				if (!(node instanceof HTMLElement)) {
					continue;
				}
				if (!this.isPotentialPopoverNode(node)) {
					continue;
				}
				candidates.push(node);
			}
		}
		return candidates;
	}

	private async handlePotentialPopoverBatch(nodes: HTMLElement[]): Promise<void> {
		for (const node of nodes) {
			await this.handlePotentialPopoverNode(node);
		}
	}

	private async handlePotentialPopoverNode(node: HTMLElement): Promise<void> {
		const hasEditor =
			node.matches(this.selectors.editorCandidate) ||
			!!node.querySelector(this.selectors.editorCandidate);
		if (!hasEditor) {
			return;
		}

		const leaf = this.findLeafByNode(node);
		if (!leaf) {
			return;
		}

		if (!(leaf.view instanceof MarkdownView)) {
			return;
		}

		const file = leaf.view.file;
		if (!file || file.extension !== 'md') {
			return;
		}

		if (!this.dependencies.shouldForceReadOnlyPath(file.path)) {
			return;
		}

		await this.dependencies.ensurePreview(leaf, 'mutation-observer');
	}
}

export function createPopoverObserverService(
	dependencies: PopoverObserverDependencies,
	selectors: PopoverObserverSelectors = DEFAULT_POPOVER_OBSERVER_SELECTORS,
): PopoverObserverService {
	return new DefaultPopoverObserverService(dependencies, selectors);
}
