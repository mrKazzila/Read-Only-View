import {
	Plugin,
	MarkdownView,
	WorkspaceLeaf,
} from 'obsidian';
import {
	shouldForceReadOnly,
} from './matcher';
import { shouldReapplyAfterEnabledChange } from './command-controls';
import { formatPathForDebug } from './debug-log';
import { createEnforcementService, type EnforcementService } from './enforcement';
import { createPopoverObserverService, type PopoverObserverService } from './popover-observer';
import { DEFAULT_SETTINGS, mergeLoadedSettings } from './plugin-settings';
import { registerPluginCommands } from './plugin-commands';
import { ForceReadModeSettingTab } from './settings-tab';
import type { ForceReadModeSettings } from './plugin-types';
import { WorkspaceEventController } from './workspace-events';

export { formatPathForDebug } from './debug-log';

export default class ReadOnlyViewPlugin extends Plugin {
	settings: ForceReadModeSettings = { ...DEFAULT_SETTINGS };

	private enforcementService: EnforcementService | null = null;
	private popoverObserverService: PopoverObserverService | null = null;
	private workspaceEventController: WorkspaceEventController | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		registerPluginCommands({
			addCommand: this.addCommand.bind(this),
			isEnabled: () => this.settings.enabled,
			setPluginEnabled: (enabled, reason) => this.setPluginEnabled(enabled, reason),
			applyAllOpenMarkdownLeaves: (reason) => this.applyAllOpenMarkdownLeaves(reason),
		});

		this.registerEvent(this.app.workspace.on('file-open', () => {
			this.getWorkspaceEventController().schedule('file-open');
		}));
		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
			this.getWorkspaceEventController().schedule('active-leaf-change', leaf ?? null);
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.invalidateLeafContainerCache();
			this.getWorkspaceEventController().schedule('layout-change');
		}));

		this.installMutationObserver();
		this.addSettingTab(new ForceReadModeSettingTab(this.app, this));

		await this.applyAllOpenMarkdownLeaves('onload');
	}

	onunload(): void {
		if (this.workspaceEventController) {
			this.workspaceEventController.stop();
			this.workspaceEventController = null;
		}
		this.invalidateLeafContainerCache();
		this.enforcementService = null;
		if (this.popoverObserverService) {
			this.popoverObserverService.stop();
			this.popoverObserverService = null;
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData() as Partial<ForceReadModeSettings> | null;
		this.settings = mergeLoadedSettings(loaded);
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

	private getWorkspaceEventController(): WorkspaceEventController {
		if (!this.workspaceEventController) {
			this.workspaceEventController = new WorkspaceEventController({
				logDebug: (message, payload) => this.logDebug(message, payload),
				applyAllOpenMarkdownLeaves: (reason) => this.applyAllOpenMarkdownLeaves(reason),
				applyReadOnlyForLeaf: (leaf, reason) => this.getEnforcementService().applyReadOnlyForLeaf(leaf, reason),
				formatLeafPathForDebug: (leaf) => leaf.view instanceof MarkdownView && leaf.view.file
					? formatPathForDebug(leaf.view.file.path, this.settings.debugVerbosePaths)
					: null,
			});
		}
		return this.workspaceEventController;
	}

	async applyAllOpenMarkdownLeaves(reason: string): Promise<void> {
		await this.getEnforcementService().applyAllOpenMarkdownLeaves(reason);
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
