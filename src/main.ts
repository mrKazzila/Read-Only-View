import {
	Plugin,
	MarkdownView,
	WorkspaceLeaf,
	type MarkdownFileInfo,
	type Editor,
} from 'obsidian';
import {
	createCompiledRuleMatcher,
	getCompiledRuleMatcherKey,
	type CompiledRuleMatcher,
} from './matcher';
import { shouldReapplyAfterEnabledChange } from './command-controls';
import { formatPathForDebug } from './debug-log';
import { createEditorReadOnlyExtension } from './editor-readonly';
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
	private compiledRuleMatcher: CompiledRuleMatcher = createCompiledRuleMatcher(this.settings);
	private compiledRuleMatcherKey = getCompiledRuleMatcherKey(this.settings);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.registerEditorExtension(createEditorReadOnlyExtension({
			shouldForceReadOnlyPath: (path) => this.shouldForceReadOnlyPath(path),
			onReadOnlyInteraction: (info, reason) => {
				void this.handleProtectedEditorInput(info, reason);
			},
		}));

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
		this.registerEvent(this.app.workspace.on('editor-paste', (evt: ClipboardEvent, _editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
			if (evt.defaultPrevented) {
				return;
			}
			const file = info.file;
			if (!file || !this.shouldForceReadOnlyPath(file.path)) {
				return;
			}
			evt.preventDefault();
			void this.handleProtectedEditorInput(info, 'editor-paste');
		}));
		this.registerEvent(this.app.workspace.on('editor-drop', (evt: DragEvent, _editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
			if (evt.defaultPrevented) {
				return;
			}
			const file = info.file;
			if (!file || !this.shouldForceReadOnlyPath(file.path)) {
				return;
			}
			evt.preventDefault();
			void this.handleProtectedEditorInput(info, 'editor-drop');
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
		if (this.enforcementService) {
			this.enforcementService.stop();
			this.enforcementService = null;
		}
		if (this.popoverObserverService) {
			this.popoverObserverService.stop();
			this.popoverObserverService = null;
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData() as Partial<ForceReadModeSettings> | null;
		this.settings = mergeLoadedSettings(loaded);
		this.rebuildCompiledRuleMatcher();
	}

	async saveSettings(): Promise<void> {
		this.rebuildCompiledRuleMatcher();
		await this.saveData(this.settings);
	}

	private async setPluginEnabled(enabled: boolean, reason: string): Promise<void> {
		const previousEnabled = this.settings.enabled;
		if (previousEnabled === enabled) {
			return;
		}
		this.settings.enabled = enabled;
		await this.saveSettings();
		this.refreshEditorOptions();
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
				shouldForceReadOnlyPath: (path) => this.shouldForceReadOnlyPath(path),
			});
		}
		return this.enforcementService;
	}

	private getPopoverObserverService(): PopoverObserverService {
		if (!this.popoverObserverService) {
			this.popoverObserverService = createPopoverObserverService({
				isEnabled: () => this.settings.enabled,
				getMarkdownLeaves: () => this.app.workspace.getLeavesOfType('markdown'),
				shouldForceReadOnlyPath: (path) => this.shouldForceReadOnlyPath(path),
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

	refreshEditorOptions(): void {
		if (typeof this.app.workspace.updateOptions === 'function') {
			this.app.workspace.updateOptions();
		}
	}

	shouldForceReadOnlyPath(path: string): boolean {
		return this.getCompiledRuleMatcher().shouldForceReadOnly(path);
	}

	getCompiledRuleMatcher(): CompiledRuleMatcher {
		const nextKey = getCompiledRuleMatcherKey(this.settings);
		if (nextKey !== this.compiledRuleMatcherKey) {
			this.rebuildCompiledRuleMatcher();
		}
		return this.compiledRuleMatcher;
	}

	private rebuildCompiledRuleMatcher(): void {
		this.compiledRuleMatcher = createCompiledRuleMatcher(this.settings);
		this.compiledRuleMatcherKey = getCompiledRuleMatcherKey(this.settings);
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

	private async handleProtectedEditorInput(
		info: MarkdownView | MarkdownFileInfo,
		reason: string,
	): Promise<void> {
		const file = info.file;
		if (!file) {
			return;
		}
		const leaf = this.resolveLeafForEditorContext(info);
		this.logDebug('editor-input-blocked', {
			reason,
			filePath: formatPathForDebug(file.path, this.settings.debugVerbosePaths),
			resolvedLeaf: !!leaf,
		});
		if (!leaf) {
			return;
		}
		await this.getEnforcementService().ensurePreview(leaf, reason);
	}

	private resolveLeafForEditorContext(info: MarkdownView | MarkdownFileInfo): WorkspaceLeaf | null {
		if (info instanceof MarkdownView) {
			const directLeaf = (info as MarkdownView & { leaf?: WorkspaceLeaf | null }).leaf;
			if (directLeaf) {
				return directLeaf;
			}
		}

		const targetPath = info.file?.path;
		if (!targetPath) {
			return null;
		}

		const leaves = this.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			if (!(leaf.view instanceof MarkdownView)) {
				continue;
			}
			if (leaf.view === info) {
				return leaf;
			}
			const leafFile = leaf.view.file;
			if (leafFile?.path === targetPath) {
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
