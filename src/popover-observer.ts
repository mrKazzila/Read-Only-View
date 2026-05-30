import { MarkdownView, WorkspaceLeaf } from 'obsidian';

export type PopoverObserverSelectors = {
	popoverCandidate: string;
	editorCandidate: string;
};

export const DEFAULT_POPOVER_OBSERVER_SELECTORS: PopoverObserverSelectors = {
	popoverCandidate: '.hover-popover, .popover',
	editorCandidate: '.markdown-source-view, .cm-editor',
};

export interface PopoverObserverDependencies {
	isEnabled: () => boolean;
	isDebugLoggingEnabled?: () => boolean;
	getMarkdownLeaves: () => WorkspaceLeaf[];
	getRelevantDocuments: () => Document[];
	shouldForceReadOnlyPath: (path: string) => boolean;
	ensurePreview: (leaf: WorkspaceLeaf, reason: string) => Promise<void>;
	logDebug?: (message: string, payload?: Record<string, unknown>) => void;
}

export interface PopoverObserverService {
	start: () => void;
	stop: () => void;
	reconcileDocuments: () => void;
	invalidateLeafCache: () => void;
	findLeafByNode: (node: HTMLElement) => WorkspaceLeaf | null;
}

function isHtmlElement(node: Node): node is HTMLElement {
	if (typeof node.instanceOf !== 'function') {
		return false;
	}
	return node.instanceOf(HTMLElement);
}

class DefaultPopoverObserverService implements PopoverObserverService {
	private static readonly UNRESOLVED_DEBUG_THROTTLE_MS = 2_000;

	private mutationObservers = new Map<Document, MutationObserver>();
	private leafByContainer = new WeakMap<HTMLElement, WorkspaceLeaf>();
	private readonly unresolvedCandidateLoggedAt = new Map<string, number>();
	private readonly documentIds = new WeakMap<Document, number>();
	private nextDocumentId = 1;

	constructor(
		private readonly dependencies: PopoverObserverDependencies,
		private readonly selectors: PopoverObserverSelectors,
	) {}

	start(): void {
		this.reconcileDocuments();
	}

	stop(): void {
		for (const observer of this.mutationObservers.values()) {
			observer.disconnect();
		}
		this.mutationObservers.clear();
	}

	reconcileDocuments(): void {
		const relevantDocuments = new Set(this.dependencies.getRelevantDocuments());
		for (const document of Array.from(this.mutationObservers.keys())) {
			if (relevantDocuments.has(document)) {
				continue;
			}
			this.mutationObservers.get(document)?.disconnect();
			this.mutationObservers.delete(document);
		}
		for (const document of relevantDocuments) {
			this.attachObserver(document);
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
				if (!node) {
					continue;
				}
				if (!isHtmlElement(node)) {
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

	private attachObserver(document: Document): void {
		if (this.mutationObservers.has(document) || !document.body) {
			return;
		}

		const observer = new MutationObserver((mutations) => {
			if (!this.dependencies.isEnabled()) {
				return;
			}
			const candidateNodes = this.collectPopoverCandidates(mutations);
			if (candidateNodes.length === 0) {
				return;
			}
			void this.handlePotentialPopoverBatch(candidateNodes);
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
		this.mutationObservers.set(document, observer);
	}

	private async handlePotentialPopoverBatch(nodes: HTMLElement[]): Promise<void> {
		const processedLeaves = new Set<WorkspaceLeaf>();
		for (const node of nodes) {
			const leaf = this.findMatchingLeaf(node);
			if (!leaf || processedLeaves.has(leaf)) {
				continue;
			}
			processedLeaves.add(leaf);
			await this.dependencies.ensurePreview(leaf, 'mutation-observer');
		}
	}

	private findMatchingLeaf(node: HTMLElement): WorkspaceLeaf | null {
		const hasEditor =
			node.matches(this.selectors.editorCandidate) ||
			!!node.querySelector(this.selectors.editorCandidate);
		if (!hasEditor) {
			return null;
		}

		const leaf = this.findLeafByNode(node);
		if (!leaf) {
			this.logUnresolvedCandidate(node);
			return null;
		}

		if (!(leaf.view instanceof MarkdownView)) {
			return null;
		}

		const file = leaf.view.file;
		if (!file || file.extension !== 'md') {
			return null;
		}

		if (!this.dependencies.shouldForceReadOnlyPath(file.path)) {
			return null;
		}

		return leaf;
	}

	private logUnresolvedCandidate(node: HTMLElement): void {
		if (!this.dependencies.isDebugLoggingEnabled?.()) {
			return;
		}

		const ownerDocument = node.ownerDocument;
		const documentId = ownerDocument ? this.getDocumentDebugId(ownerDocument) : 0;
		const candidateKind = node.matches(this.selectors.popoverCandidate)
			? 'popover-root'
			: 'popover-descendant';
		const signature = `${documentId}:${node.tagName.toLowerCase()}:${candidateKind}`;
		const now = Date.now();
		const previousLoggedAt = this.unresolvedCandidateLoggedAt.get(signature);
		if (
			typeof previousLoggedAt === 'number' &&
			now - previousLoggedAt < DefaultPopoverObserverService.UNRESOLVED_DEBUG_THROTTLE_MS
		) {
			return;
		}
		this.unresolvedCandidateLoggedAt.set(signature, now);

		const markdownLeaves = this.dependencies.getMarkdownLeaves();
		const sameDocumentLeafCount = ownerDocument
			? markdownLeaves.filter((leaf) => leaf.view instanceof MarkdownView && leaf.view.containerEl.ownerDocument === ownerDocument).length
			: 0;
		this.dependencies.logDebug?.('popover-candidate-unresolved', {
			candidateTag: node.tagName.toLowerCase(),
			candidateKind,
			documentId,
			documentHasActiveContext:
				typeof activeDocument === 'object' &&
				activeDocument !== null &&
				ownerDocument === activeDocument,
			sameDocumentLeafCount,
		});
	}

	private getDocumentDebugId(document: Document): number {
		const existingId = this.documentIds.get(document);
		if (typeof existingId === 'number') {
			return existingId;
		}
		const nextId = this.nextDocumentId++;
		this.documentIds.set(document, nextId);
		return nextId;
	}
}

export function createPopoverObserverService(
	dependencies: PopoverObserverDependencies,
	selectors: PopoverObserverSelectors = DEFAULT_POPOVER_OBSERVER_SELECTORS,
): PopoverObserverService {
	return new DefaultPopoverObserverService(dependencies, selectors);
}
