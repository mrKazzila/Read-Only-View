import {
	App,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	type ViewState,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	type ForceReadModeSettings,
	matchPath,
	normalizeVaultPath,
	shouldForceReadOnly,
} from './matcher';
import {
	canRunDisableCommand,
	canRunEnableCommand,
	shouldReapplyAfterEnabledChange,
} from './command-controls';

type RuleDiagnosticsEntry = {
	lineNumber: number;
	raw: string;
	normalized: string;
	isOk: boolean;
	warnings: string[];
};

export default class ReadOnlyViewPlugin extends Plugin {
	settings: ForceReadModeSettings = { ...DEFAULT_SETTINGS };
	private static readonly WORKSPACE_EVENT_COALESCE_MS = 150;

	private enforcing = false;
	private pendingReapply: string | null = null;
	private lastForcedAt = new WeakMap<WorkspaceLeaf, number>();
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

	async applyAllOpenMarkdownLeaves(reason: string): Promise<void> {
		if (!this.settings.enabled) {
			return;
		}
		if (this.enforcing) {
			this.pendingReapply = reason;
			return;
		}

		this.enforcing = true;
		try {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				await this.applyReadOnlyForLeaf(leaf, reason);
			}
		} finally {
			this.enforcing = false;
			if (this.pendingReapply) {
				const nextReason = this.pendingReapply;
				this.pendingReapply = null;
				await this.applyAllOpenMarkdownLeaves(`pending:${nextReason}`);
			}
		}
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

	private async applyReadOnlyForLeaf(leaf: WorkspaceLeaf, reason: string): Promise<void> {
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

		if (!shouldForceReadOnly(file.path, this.settings)) {
			return;
		}

		await this.ensurePreview(leaf, reason);
	}

	private getLeafMode(leaf: WorkspaceLeaf): string | null {
		if (!(leaf.view instanceof MarkdownView)) {
			return null;
		}
		if (typeof leaf.view.getMode === 'function') {
			return leaf.view.getMode();
		}
		const stateMode = (leaf.getViewState().state as { mode?: string } | undefined)?.mode;
		return stateMode ?? null;
	}

	private async ensurePreview(leaf: WorkspaceLeaf, reason: string): Promise<void> {
		if (!(leaf.view instanceof MarkdownView)) {
			return;
		}
		const file = leaf.view.file;
		if (!file) {
			return;
		}

		const beforeMode = this.getLeafMode(leaf);
		if (beforeMode === 'preview') {
			return;
		}

		const now = Date.now();
		const last = this.lastForcedAt.get(leaf) ?? 0;
		if (now - last < 120) {
			return;
		}

		const currentState = leaf.getViewState();
		if (currentState.type !== 'markdown') {
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
		try {
			const setState = leaf.setViewState.bind(leaf) as (
				state: ViewState,
				pushHistory?: boolean | { replace?: boolean }
			) => Promise<void>;
			await setState(nextState, { replace: true });
		} catch {
			await leaf.setViewState(nextState, false);
		}

		const afterMode = this.getLeafMode(leaf);
		this.logDebug('ensure-preview', {
			reason,
			filePath: file.path,
			beforeMode,
			afterMode,
		});
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

		await this.ensurePreview(leaf, 'mutation-observer');
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

function splitRulesFromText(value: string): string[] {
	return value
		.split('\n')
		.map((line) => normalizeVaultPath(line))
		.filter((line) => line.length > 0);
}

function stringifyRules(rules: string[]): string {
	return rules.join('\n');
}

function normalizeRuleForMode(rule: string, useGlobPatterns: boolean): { normalized: string; changedByFolderHint: boolean } {
	const normalized = normalizeVaultPath(rule);
	if (useGlobPatterns) {
		return { normalized, changedByFolderHint: false };
	}

	const hasWildcard = normalized.includes('*') || normalized.includes('?');
	if (hasWildcard || normalized.endsWith('/') || normalized.endsWith('.md')) {
		return { normalized, changedByFolderHint: false };
	}
	return {
		normalized: `${normalized}/`,
		changedByFolderHint: true,
	};
}

function buildRuleDiagnostics(rulesText: string, useGlobPatterns: boolean): RuleDiagnosticsEntry[] {
	const lines = rulesText.split('\n');
	return lines.map((line, index) => {
		const trimmed = line.trim();
		const normalizedBase = normalizeVaultPath(line);
		const normalizedInfo = normalizeRuleForMode(line, useGlobPatterns);
		const warnings: string[] = [];

		if (trimmed.length === 0) {
			warnings.push('Empty or whitespace-only line.');
		}
		if (!useGlobPatterns && (trimmed.includes('*') || trimmed.includes('?'))) {
			warnings.push('Contains wildcard in prefix mode. It is treated as a literal character.');
		}
		if (trimmed.length > 0 && normalizedBase !== trimmed) {
			warnings.push(`Normalized path form: "${normalizedBase}".`);
		}
		if (normalizedInfo.changedByFolderHint) {
			warnings.push(`Prefix mode folder hint applied: "${normalizedInfo.normalized}".`);
		}

		return {
			lineNumber: index + 1,
			raw: line,
			normalized: normalizedInfo.normalized,
			isOk: warnings.length === 0,
			warnings,
		};
	});
}

function matchRules(filePath: string, rules: string[], useGlobPatterns: boolean, caseSensitive: boolean): string[] {
	return rules.filter((rule) => matchPath(filePath, rule, { useGlobPatterns, caseSensitive }));
}

class ForceReadModeSettingTab extends PluginSettingTab {
	plugin: ReadOnlyViewPlugin;

	constructor(app: App, plugin: ReadOnlyViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Read-only view').setHeading();

		new Setting(containerEl)
			.setName('Enabled')
			.setDesc('Enable or disable read-only enforcement globally.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
						if (value) {
							await this.plugin.applyAllOpenMarkdownLeaves('settings-enabled');
						}
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Use glob patterns')
			.setDesc('Use glob tokens (*, **, ?) for matching. Disable for literal prefix compatibility mode.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useGlobPatterns)
					.onChange(async (value) => {
						this.plugin.settings.useGlobPatterns = value;
						await this.plugin.saveSettings();
						await this.plugin.applyAllOpenMarkdownLeaves('settings-use-glob-patterns');
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Case sensitive')
			.setDesc('When disabled, both rules and file paths are compared in lower case.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.caseSensitive)
					.onChange(async (value) => {
						this.plugin.settings.caseSensitive = value;
						await this.plugin.saveSettings();
						await this.plugin.applyAllOpenMarkdownLeaves('settings-case-sensitive');
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Write detailed logs to the developer console.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		this.renderRulesEditor('Include rules', 'One rule per line. These files become read-only if not excluded.', this.plugin.settings.includeRules, async (value) => {
			this.plugin.settings.includeRules = splitRulesFromText(value);
			await this.plugin.saveSettings();
			await this.plugin.applyAllOpenMarkdownLeaves('settings-include-rules');
		});

		this.renderRulesEditor('Exclude rules', 'One rule per line. Exclude wins when include and exclude both match.', this.plugin.settings.excludeRules, async (value) => {
			this.plugin.settings.excludeRules = splitRulesFromText(value);
			await this.plugin.saveSettings();
			await this.plugin.applyAllOpenMarkdownLeaves('settings-exclude-rules');
		});

		this.renderPathTester();
	}

	private renderRulesEditor(
		title: string,
		description: string,
		rules: string[],
		onChange: (value: string) => Promise<void>,
	): void {
		const initialText = stringifyRules(rules);
		let currentText = initialText;

		const sectionEl = this.containerEl.createDiv({ cls: 'read-only-view-rule-section' });
		new Setting(sectionEl).setName(title).setHeading();
		sectionEl.createEl('p', {
			text: description,
			cls: 'setting-item-description',
		});

		const textAreaEl = sectionEl.createEl('textarea');
		textAreaEl.value = initialText;
		textAreaEl.placeholder ='Examples:\nproject_a/**\n**/README.md\nfolder/subfolder/';
		textAreaEl.rows = 6;
		textAreaEl.addClass('read-only-view-full-width');

		const diagnosticsEl = sectionEl.createDiv({ cls: 'read-only-view-rule-diagnostics' });
		new Setting(diagnosticsEl).setName('Rule diagnostics').setHeading();

		const renderDiagnostics = () => {
			const entries = buildRuleDiagnostics(currentText, this.plugin.settings.useGlobPatterns);
			diagnosticsEl.querySelectorAll('ul').forEach((el) => el.remove());
			const listEl = diagnosticsEl.createEl('ul');
			for (const entry of entries) {
				const bullet = entry.isOk ? '✅' : '⚠️';
				const summary = `${bullet} [${entry.lineNumber}] ${entry.normalized || '(empty line)'}`;
				const itemEl = listEl.createEl('li', { text: summary });
				if (entry.warnings.length > 0) {
					itemEl.setAttr('title', entry.warnings.join(' '));
				}
			}
		};

		renderDiagnostics();

		textAreaEl.addEventListener('input', () => {
			currentText = textAreaEl.value;
			renderDiagnostics();
		});
		textAreaEl.addEventListener('change', () => {
			currentText = textAreaEl.value;
			void onChange(currentText);
			renderDiagnostics();
		});
	}

	private renderPathTester(): void {
		const wrapperEl = this.containerEl.createDiv({ cls: 'read-only-view-path-tester' });
		new Setting(wrapperEl).setName('Path tester').setHeading();
		wrapperEl.createEl('p', {
			text: 'Enter a path exactly as file.path in Obsidian. Shows include/exclude matches and final read-only result.',
			cls: 'setting-item-description',
		});

		const inputEl = wrapperEl.createEl('input', { type: 'text' });
		inputEl.placeholder = 'project_a/subfolder/file_1.md';
		inputEl.addClass('read-only-view-full-width');

		const resultEl = wrapperEl.createDiv({ cls: 'read-only-view-path-tester-result' });

		const renderResult = () => {
			const testPath = normalizeVaultPath(inputEl.value);
			resultEl.empty();

			if (!testPath) {
				resultEl.setText('Enter a file path to test.');
				return;
			}

			const includeMatches = matchRules(
				testPath,
				this.plugin.settings.includeRules,
				this.plugin.settings.useGlobPatterns,
				this.plugin.settings.caseSensitive,
			);
			const excludeMatches = matchRules(
				testPath,
				this.plugin.settings.excludeRules,
				this.plugin.settings.useGlobPatterns,
				this.plugin.settings.caseSensitive,
			);
			const finalReadOnly = shouldForceReadOnly(testPath, this.plugin.settings);

			resultEl.createEl('div', {
				text: `Matched include: ${includeMatches.length > 0 ? includeMatches.join(', ') : 'none'}`,
			});
			resultEl.createEl('div', {
				text: `Matched exclude: ${excludeMatches.length > 0 ? excludeMatches.join(', ') : 'none'}`,
			});
			resultEl.createEl('div', {
				text: `Result: ${finalReadOnly ? 'READ-ONLY ON' : 'READ-ONLY OFF'}`,
			});
		};

		inputEl.addEventListener('input', renderResult);
		renderResult();
	}
}
