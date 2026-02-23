import {
	MarkdownView,
	Plugin,
	WorkspaceLeaf,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	type ForceReadModeSettings,
	normalizeVaultPath,
	shouldForceReadOnly,
} from './matcher';
import {
	canRunDisableCommand,
	canRunEnableCommand,
	shouldReapplyAfterEnabledChange,
} from './command-controls';
import { createEnforcementService, type EnforcementService } from './enforcement';
import { ForceReadModeSettingTab } from './settings-tab';

export function formatPathForDebug(path: string, verbosePaths: boolean): string {
	const normalized = normalizeVaultPath(path);
	if (verbosePaths) {
		return normalized;
	}
	const parts = normalized.split('/');
	const basename = parts[parts.length - 1] ?? '';
	return basename ? `[redacted]/${basename}` : '[redacted]';
}

export default class ReadOnlyViewPlugin extends Plugin {
	settings: ForceReadModeSettings = { ...DEFAULT_SETTINGS };
	private static readonly WORKSPACE_EVENT_COALESCE_MS = 150;

	private enforcementService: EnforcementService | null = null;
	private mutationObserver: MutationObserver | null = null;
	private leafByContainer = new WeakMap<HTMLElement, WorkspaceLeaf>();
	private workspaceEventTimer: ReturnType<typeof setTimeout> | null = null;
	private workspaceEventReasons = new Set<string>();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: 'toggle-plugin-enabled',
			name: 'Toggle plugin enabled',
			callback: async () => {
				await this.setPluginEnabled(!this.settings.enabled, 'command-toggle-enabled');
			},
		});

		this.addCommand({
			id: 'enable-plugin',
			name: 'Enable read-only mode',
			checkCallback: (checking: boolean) => {
				if (!canRunEnableCommand(this.settings.enabled)) {
					return false;
				}
				if (!checking) {
					void this.setPluginEnabled(true, 'command-enable');
				}
				return true;
			},
		});

		this.addCommand({
			id: 'disable-plugin',
			name: 'Disable read-only mode',
			checkCallback: (checking: boolean) => {
				if (!canRunDisableCommand(this.settings.enabled)) {
					return false;
				}
				if (!checking) {
					void this.setPluginEnabled(false, 'command-disable');
				}
				return true;
			},
		});

		this.addCommand({
			id: 're-apply-rules-now',
			name: 'Re-apply rules now',
			callback: async () => {
				await this.applyAllOpenMarkdownLeaves('command-reapply');
			},
		});

		this.registerEvent(this.app.workspace.on('file-open', () => {
			this.scheduleWorkspaceEventReapply('file-open');
		}));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.scheduleWorkspaceEventReapply('active-leaf-change');
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.invalidateLeafContainerCache();
			this.scheduleWorkspaceEventReapply('layout-change');
		}));

		this.installMutationObserver();
		this.addSettingTab(new ForceReadModeSettingTab(this.app, this));

		await this.applyAllOpenMarkdownLeaves('onload');
	}

	onunload(): void {
		if (this.workspaceEventTimer) {
			clearTimeout(this.workspaceEventTimer);
			this.workspaceEventTimer = null;
		}
		this.workspaceEventReasons.clear();
		this.invalidateLeafContainerCache();
		this.enforcementService = null;

		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData() as Partial<ForceReadModeSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			includeRules: loaded?.includeRules ?? DEFAULT_SETTINGS.includeRules,
			excludeRules: loaded?.excludeRules ?? DEFAULT_SETTINGS.excludeRules,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async setPluginEnabled(enabled: boolean, reason: string): Promise<void> {
		const previousEnabled = this.settings.enabled;
		if (previousEnabled === enabled) {
			return;
		}
		this.settings.enabled = enabled;
		await this.saveSettings();
		this.logDebug('set-enabled', { enabled: this.settings.enabled, reason });
		if (shouldReapplyAfterEnabledChange(previousEnabled, enabled)) {
			await this.applyAllOpenMarkdownLeaves(reason);
		}
	}

	private getEnforcementService(): EnforcementService {
		if (!this.enforcementService) {
			this.enforcementService = createEnforcementService({
				getSettings: () => this.settings,
				getMarkdownLeaves: () => this.app.workspace.getLeavesOfType('markdown'),
				logDebug: (message, payload) => this.logDebug(message, payload),
				formatPathForDebug,
			});
		}
		return this.enforcementService;
	}

	async applyAllOpenMarkdownLeaves(reason: string): Promise<void> {
		await this.getEnforcementService().applyAllOpenMarkdownLeaves(reason);
	}

	private scheduleWorkspaceEventReapply(reason: string): void {
		this.workspaceEventReasons.add(reason);
		if (this.workspaceEventTimer) {
			return;
		}

		this.workspaceEventTimer = setTimeout(() => {
			const reasons = Array.from(this.workspaceEventReasons);
			this.workspaceEventReasons.clear();
			this.workspaceEventTimer = null;
			void this.applyAllOpenMarkdownLeaves(`workspace-events:${reasons.join(',')}`);
		}, ReadOnlyViewPlugin.WORKSPACE_EVENT_COALESCE_MS);
	}

	private invalidateLeafContainerCache(): void {
		this.leafByContainer = new WeakMap<HTMLElement, WorkspaceLeaf>();
	}

	private installMutationObserver(): void {
		if (typeof document === 'undefined' || !document.body) {
			return;
		}

		this.mutationObserver = new MutationObserver((mutations) => {
			if (!this.settings.enabled) {
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

	private isPotentialPopoverNode(node: HTMLElement): boolean {
		if (node.matches('.hover-popover, .popover, .workspace-leaf, .markdown-source-view, .cm-editor')) {
			return true;
		}
		return !!node.querySelector('.hover-popover, .popover, .workspace-leaf, .markdown-source-view, .cm-editor');
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
			node.matches('.markdown-source-view, .cm-editor') ||
			!!node.querySelector('.markdown-source-view, .cm-editor');
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

		if (!shouldForceReadOnly(file.path, this.settings)) {
			return;
		}

		await this.getEnforcementService().ensurePreview(leaf, 'mutation-observer');
	}

	private findLeafByNode(node: HTMLElement): WorkspaceLeaf | null {
		let current: HTMLElement | null = node;
		while (current) {
			const cachedLeaf = this.leafByContainer.get(current);
			if (cachedLeaf) {
				return cachedLeaf;
			}
			current = current.parentElement;
		}

		const leaves = this.app.workspace.getLeavesOfType('markdown');
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

	logDebug(message: string, payload?: Record<string, unknown>): void {
		if (!this.settings.debug) {
			return;
		}
		if (payload) {
			console.debug('[read-only-view]', message, payload);
			return;
		}
		console.debug('[read-only-view]', message);
	}
}
