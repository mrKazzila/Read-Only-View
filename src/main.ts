import {
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
import { createPopoverObserverService, type PopoverObserverService } from './popover-observer';
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
	private popoverObserverService: PopoverObserverService | null = null;
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
		if (this.popoverObserverService) {
			this.popoverObserverService.stop();
			this.popoverObserverService = null;
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

	private getPopoverObserverService(): PopoverObserverService {
		if (!this.popoverObserverService) {
			this.popoverObserverService = createPopoverObserverService({
				isEnabled: () => this.settings.enabled,
				getMarkdownLeaves: () => this.app.workspace.getLeavesOfType('markdown'),
				shouldForceReadOnlyPath: (path) => shouldForceReadOnly(path, this.settings),
				ensurePreview: (leaf, reason) => this.getEnforcementService().ensurePreview(leaf, reason),
			});
		}
		return this.popoverObserverService;
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
		this.getPopoverObserverService().invalidateLeafCache();
	}

	private installMutationObserver(): void {
		this.getPopoverObserverService().start();
	}

	private findLeafByNode(node: HTMLElement): WorkspaceLeaf | null {
		return this.getPopoverObserverService().findLeafByNode(node);
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
