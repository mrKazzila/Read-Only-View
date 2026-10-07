import { type App, type EventRef, setIcon, TFile, TFolder } from 'obsidian';
import type { CompiledRuleMatcher } from './matcher';

const ROW_SELECTOR = '.nav-file-title, .nav-folder-title';
const INDICATOR_CLASS = 'read-only-view-protection-indicator';
const INDICATOR_SELECTOR = `.${INDICATOR_CLASS}`;

/** File Explorer DOM is not a public API; keep its selectors isolated here. */
export class ExplorerIndicatorController {
	private running = false;
	private observers = new Map<HTMLElement, MutationObserver>();
	private events: Array<() => void> = [];
	private pending = new Set<HTMLElement>();
	private queued = false;
	private pruneRows = false;
	private generation = 0;
	private rows = new Map<HTMLElement, string>();
	private evaluated = new WeakMap<HTMLElement, { path: string; matcher: CompiledRuleMatcher; protected: boolean }>();

	constructor(private app: App, private getMatcher: () => CompiledRuleMatcher) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		const workspace = this.app.workspace;
		const layout = workspace.on('layout-change', () => this.reconcile());
		this.events.push(() => workspace.offref(layout));
		const vault = this.app.vault;
		const refs: EventRef[] = [
			vault.on('create', (file) => this.refreshPath(file.path)),
			vault.on('delete', (file) => this.refreshPath(file.path)),
			vault.on('rename', (file, oldPath) => {
				this.refreshPath(oldPath);
				this.refreshPath(file.path);
			}),
		];
		this.events.push(() => refs.forEach((ref) => vault.offref(ref)));
		this.reconcile();
	}

	stop(): void {
		this.running = false;
		this.generation++;
		this.queued = false;
		for (const cleanup of this.events) cleanup();
		this.events = [];
		for (const [container, observer] of this.observers) {
			observer.disconnect();
			this.removeIndicators(container);
		}
		for (const row of this.rows.keys()) this.removeIndicators(row);
		this.observers.clear();
		this.rows.clear();
		this.pending.clear();
		this.evaluated = new WeakMap();
	}

	refresh(): void {
		if (!this.running) return;
		this.evaluated = new WeakMap();
		this.reconcile();
		for (const container of this.observers.keys()) this.collect(container);
		this.flush();
	}

	private reconcile(): void {
		if (!this.running) return;
		const containers = new Set(this.app.workspace.getLeavesOfType('file-explorer')
			.map((leaf) => leaf.view.containerEl));
		for (const [container, observer] of this.observers) {
			if (!containers.has(container)) {
				observer.disconnect();
				this.removeIndicators(container);
				this.observers.delete(container);
				this.pruneRows = true;
			}
		}
		for (const container of containers) {
			if (this.observers.has(container)) continue;
			const observer = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					const changed = Array.from(mutation.addedNodes);
					if (!mutation.removedNodes.length && changed.length && changed.every((node) => node.instanceOf(HTMLElement) && node.matches(INDICATOR_SELECTOR))) continue;
					if (Array.from(mutation.removedNodes).some((node) =>
						!node.instanceOf(HTMLElement) || !node.matches(INDICATOR_SELECTOR))) this.pruneRows = true;
					// SVG/icon mutations must not schedule another render.
					if (mutation.target.instanceOf(HTMLElement)
						&& mutation.target.closest(INDICATOR_SELECTOR)) continue;
					if (mutation.target.instanceOf(HTMLElement)) {
						const row = mutation.target.closest<HTMLElement>(ROW_SELECTOR);
						if (row) this.pending.add(row);
					}
					for (const node of Array.from(mutation.addedNodes)) {
						if (node.instanceOf(HTMLElement) && !node.matches(INDICATOR_SELECTOR)) this.collect(node);
					}
				}
				this.schedule();
			});
			observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-path'] });
			this.observers.set(container, observer);
			this.collect(container);
		}
		this.flush();
	}

	private collect(element: HTMLElement): void {
		if (element.matches(ROW_SELECTOR)) this.pending.add(element);
		for (const row of Array.from(element.querySelectorAll<HTMLElement>(ROW_SELECTOR))) this.pending.add(row);
	}

	private refreshPath(path: string): void {
		for (const [row, previousPath] of this.rows) {
			if (previousPath === path || previousPath.startsWith(`${path}/`)) {
				this.evaluated.delete(row);
				this.pending.add(row);
			}
		}
		this.schedule();
	}

	private schedule(): void {
		if (this.queued) return;
		this.queued = true;
		const generation = this.generation;
		queueMicrotask(() => {
			if (generation !== this.generation) return;
			this.queued = false;
			this.flush();
		});
	}

	private flush(): void {
		if (!this.running) return;
		const containers = [...this.observers.keys()];
		const belongs = (row: HTMLElement) => containers.some((container) => container.contains(row));
		if (this.pruneRows) for (const row of this.rows.keys()) {
			if (!belongs(row)) {
				this.removeIndicators(row);
				this.rows.delete(row);
				this.evaluated.delete(row);
			}
		}
		this.pruneRows = false;
		if (!this.pending.size) return;
		const matcher = this.getMatcher();
		for (const row of this.pending) {
			if (!belongs(row)) continue;
			const path = row.getAttribute('data-path') ?? '';
			this.rows.set(row, path);
			let result = this.evaluated.get(row);
			if (!result || result.path !== path || result.matcher !== matcher) {
				const file = this.app.vault.getAbstractFileByPath(path);
				const protectedPath = file instanceof TFolder
					? matcher.isPathProtected(path, 'folder')
					: file instanceof TFile && matcher.shouldForceReadOnly(path);
				result = { path, matcher, protected: protectedPath };
				this.evaluated.set(row, result);
			}
			const indicator = row.querySelector(INDICATOR_SELECTOR);
			if (!result.protected) {
				indicator?.remove();
			} else if (!indicator) {
				const icon = row.createSpan({ cls: INDICATOR_CLASS });
				icon.setAttr('aria-hidden', 'true');
				setIcon(icon, 'lock');
			}
		}
		this.pending.clear();
	}

	private removeIndicators(container: HTMLElement): void {
		for (const icon of Array.from(container.querySelectorAll(INDICATOR_SELECTOR))) icon.remove();
	}
}
