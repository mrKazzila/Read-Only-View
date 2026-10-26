import { type App, type EventRef, setIcon, TFile, TFolder } from 'obsidian';
import type { CompiledRuleMatcher } from './matcher';

const ROW_SELECTOR = '.nav-file-title, .nav-folder-title';
const INDICATOR_CLASS = 'read-only-view-protection-indicator';
const INDICATOR_SELECTOR = `.${INDICATOR_CLASS}`;

/** Optional cumulative profiling counters; row visits count invalidation, cleanup and rendering. */
export interface ExplorerWorkCounts {
	rowVisits: number;
	matcherCalls: number;
	lookups: number;
}

/** File Explorer DOM is not a public API; keep its selectors isolated here. */
export class ExplorerIndicatorController {
	private running = false;
	private matcher: CompiledRuleMatcher | undefined;
	private observers = new Map<HTMLElement, MutationObserver>();
	private events: Array<() => void> = [];
	private pending = new Set<HTMLElement>();
	private queued = false;
	private removed = new Set<HTMLElement>();
	// Ancestor entries let folder events reach descendants without scanning other paths.
	private rowsByPath = new Map<string, Set<HTMLElement>>();
	private generation = 0;
	private rows = new Map<HTMLElement, string>();
	private evaluated = new WeakMap<HTMLElement, { path: string; matcher: CompiledRuleMatcher; protected: boolean }>();

	constructor(private app: App, private getMatcher: () => CompiledRuleMatcher,
		private workCounts?: ExplorerWorkCounts) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.matcher = this.getMatcher();
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
		this.matcher = undefined;
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
		this.rowsByPath.clear();
		this.removed.clear();
		this.pending.clear();
		this.evaluated = new WeakMap();
	}

	refresh(): void {
		if (!this.running) return;
		// The plugin rebuilds this matcher only when its protection revision changes.
		const matcher = this.getMatcher();
		if (matcher === this.matcher) return;
		this.matcher = matcher;
		for (const row of this.rows.keys()) this.pending.add(row);
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
				// Closing a pane may discard undelivered removal records.
				// Recheck tracked rows even if its DOM has already been emptied.
				for (const row of this.rows.keys()) this.removed.add(row);
			}
		}
		for (const container of containers) {
			if (this.observers.has(container)) continue;
			const observer = new MutationObserver((mutations) => {
				if (!this.running) return;
				for (const mutation of mutations) {
					const changed = Array.from(mutation.addedNodes);
					if (!mutation.removedNodes.length && changed.length && changed.every((node) => node.instanceOf(HTMLElement) && node.matches(INDICATOR_SELECTOR))) continue;
					for (const node of Array.from(mutation.removedNodes)) {
						if (node.instanceOf(HTMLElement) && !node.matches(INDICATOR_SELECTOR)) this.collect(node, this.removed);
					}
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

	private collect(element: HTMLElement, target = this.pending): void {
		if (element.matches(ROW_SELECTOR)) target.add(element);
		for (const row of Array.from(element.querySelectorAll<HTMLElement>(ROW_SELECTOR))) target.add(row);
	}

	private pathKeys(path: string): string[] {
		const keys = [path];
		for (let slash = path.lastIndexOf('/'); slash > 0; slash = path.lastIndexOf('/', slash - 1)) {
			keys.push(path.slice(0, slash));
		}
		return keys;
	}

	private untrack(row: HTMLElement): void {
		const path = this.rows.get(row);
		if (path === undefined) return;
		for (const key of this.pathKeys(path)) {
			const rows = this.rowsByPath.get(key);
			rows?.delete(row);
			if (!rows?.size) this.rowsByPath.delete(key);
		}
		this.rows.delete(row);
	}

	private track(row: HTMLElement, path: string): void {
		if (this.rows.get(row) === path) return;
		this.untrack(row);
		this.rows.set(row, path);
		for (const key of this.pathKeys(path)) {
			let rows = this.rowsByPath.get(key);
			if (!rows) this.rowsByPath.set(key, rows = new Set());
			rows.add(row);
		}
	}

	private refreshPath(path: string): void {
		for (const row of this.rowsByPath.get(path) ?? []) {
			if (this.workCounts) this.workCounts.rowVisits++;
			this.evaluated.delete(row);
			this.pending.add(row);
		}
		this.schedule();
	}

	private schedule(): void {
		if (this.queued || (!this.pending.size && !this.removed.size)) return;
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
		for (const row of this.removed) {
			if (this.workCounts) this.workCounts.rowVisits++;
			if (!belongs(row)) {
				this.removeIndicators(row);
				this.untrack(row);
				this.evaluated.delete(row);
				this.pending.delete(row);
			}
		}
		this.removed.clear();
		if (!this.pending.size) return;
		const matcher = this.getMatcher();
		for (const row of this.pending) {
			if (this.workCounts) this.workCounts.rowVisits++;
			if (!belongs(row)) continue;
			const path = row.getAttribute('data-path') ?? '';
			this.track(row, path);
			let result = this.evaluated.get(row);
			if (!result || result.path !== path || result.matcher !== matcher) {
				if (this.workCounts) this.workCounts.lookups++;
				const file = this.app.vault.getAbstractFileByPath(path);
				if (this.workCounts && (file instanceof TFolder || file instanceof TFile)) this.workCounts.matcherCalls++;
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
