import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from 'obsidian';
import type { PathTesterController } from './settings-path-tester';
import {
	getPathTesterSummary,
	renderPathTester,
} from './settings-path-tester';
import {
	getDebugSummary,
	getMatchingSummary,
	renderDebugSettings,
	renderMatchingSettings,
	renderModeSelector,
	renderPrimarySettings,
} from './settings-general';
import {
	getPathRulesSummary,
	renderRuleEditor,
	type RuleEditorController,
} from './settings-rule-editor';
import type { SettingsTabPlugin } from './plugin-types';
import { createRuleResolverContext, type RuleResolverContext } from './rule-source';
import {
	captureSettingsFocus,
	focusFirstSettingsControl,
	restoreSettingsFocus,
	setSettingsFocusKey,
} from './settings-focus';

export { computeRuleLimitsUiState } from './settings-ui-state';
export { DebouncedRuleChangeSaver } from './settings-rule-editor';

type SettingsSectionKey = 'pathRules' | 'pathTester' | 'matching' | 'debugFlags';

type DisclosureController = {
	bodyEl: HTMLElement;
	setSummary: (summary: string) => void;
};

type StaticSectionController = {
	bodyEl: HTMLElement;
	setSummary: (summary: string) => void;
};

type HeaderIndicatorsController = {
	setActiveRulesCount: (count: number) => void;
};

function getRuleResolverContext(app: App): RuleResolverContext {
	if (!app.vault) {
		return {
			vaultName: '',
			vaultBasePath: null,
			isMarkdownFile: () => false,
			isFolder: () => false,
		};
	}
	return createRuleResolverContext(app.vault);
}

function getActiveRulesCount(settings: SettingsTabPlugin['settings']): number {
	return (settings.forceAllMarkdownReadOnly
		? 0
		: settings.includeRules.filter((_, index) => settings.includeRuleEnabled[index] !== false).length)
		+ settings.excludeRules.filter((_, index) => settings.excludeRuleEnabled[index] !== false).length;
}

export class ForceReadModeSettingTab extends PluginSettingTab {
	plugin: SettingsTabPlugin;
	private ruleEditor: RuleEditorController | null = null;
	private pathTesterController: PathTesterController | null = null;
	private readonly sectionOpenState = new Map<SettingsSectionKey, boolean>();

	constructor(app: App, plugin: Plugin & SettingsTabPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const refresh = () => {
			const declarativeTab = this as unknown as { update?: () => void };
			declarativeTab.update?.();
		};
		return [
			{
				name: 'Read-only behavior',
				desc: 'Enable read-only enforcement and choose how it applies to Markdown notes.',
				aliases: ['Enabled', 'Mode'],
				render: (setting) => {
					const containerEl = this.prepareDeclarativeSetting(setting);
					this.renderHeaderSection(containerEl);
					const sectionEl = this.createCardSection(containerEl);
					renderPrimarySettings(sectionEl, this.plugin, refresh);
					renderModeSelector(sectionEl, this.plugin, refresh);
				},
			},
			{
				type: 'group',
				heading: 'Path rules',
				items: [
					{
						name: 'Path rules',
						desc: 'Choose folders or notes to keep in Reading view.',
						render: (setting) => this.renderDeclarativePathRules(setting),
					},
				],
			},
			{
				type: 'group',
				heading: 'Path tester',
				items: [
					{
						name: 'Path tester',
						desc: 'Test a vault path against the current rules.',
						render: (setting) => this.renderDeclarativePathTester(setting),
					},
				],
			},
			{
				type: 'group',
				heading: 'Advanced',
				items: [
					{
						name: 'Matching',
						desc: 'Choose how paths are compared before rules are evaluated.',
						aliases: ['Use glob patterns', 'Case sensitive'],
						render: (setting) => {
							const containerEl = this.prepareDeclarativeSetting(setting);
							const section = this.createCollapsibleSection(
								containerEl,
								'matching',
								'Matching',
								'Choose how paths are compared before rules are evaluated.',
								getMatchingSummary(this.plugin.settings),
								false,
							);
							renderMatchingSettings(section.bodyEl, this.plugin, refresh);
						},
					},
					{
						name: 'Debug flags',
						desc: 'Enable extra logging only when diagnosing rule behavior.',
						aliases: ['Debug logging', 'Debug: verbose paths'],
						render: (setting) => {
							const containerEl = this.prepareDeclarativeSetting(setting);
							const section = this.createCollapsibleSection(
								containerEl,
								'debugFlags',
								'Debug flags',
								'Enable extra logging only when diagnosing rule behavior.',
								getDebugSummary(this.plugin.settings),
								false,
							);
							renderDebugSettings(section.bodyEl, this.plugin, refresh);
						},
					},
				],
			},
		];
	}

	display(): void {
		this.renderLegacySettings();
	}

	private renderLegacySettings(): void {
		const focusSnapshot = captureSettingsFocus(this.containerEl);
		this.disposeUiControllers();
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('read-only-view-settings');

		const headerIndicators = this.renderHeaderSection(containerEl);

		const modeSectionEl = this.createCardSection(containerEl);
		renderPrimarySettings(modeSectionEl, this.plugin, () => this.renderLegacySettings());
		renderModeSelector(modeSectionEl, this.plugin, () => this.renderLegacySettings());

		const pathRulesSection = this.createStaticWorkflowSection(
			containerEl,
			'Path rules',
			'Choose folders or notes to keep in Reading view.',
			getPathRulesSummary(
				this.plugin.settings.includeRules,
				this.plugin.settings.excludeRules,
				this.plugin.settings.includeRuleEnabled,
				this.plugin.settings.excludeRuleEnabled,
				!this.plugin.settings.forceAllMarkdownReadOnly,
			),
		);
		this.renderRuleEditor(pathRulesSection, headerIndicators);

		const pathTesterSection = this.createStaticWorkflowSection(
			containerEl,
			'Path tester',
			'Test a vault path against the current rules.',
			getPathTesterSummary(),
		);
		this.renderPathTester(pathTesterSection.bodyEl);

		const advancedSectionEl = this.createCardSection(containerEl, 'Advanced');
		const matchingSection = this.createCollapsibleSection(
			advancedSectionEl,
			'matching',
			'Matching',
			'Choose how paths are compared before rules are evaluated.',
			getMatchingSummary(this.plugin.settings),
			false,
		);
		renderMatchingSettings(matchingSection.bodyEl, this.plugin, () => this.renderLegacySettings());

		const debugSection = this.createCollapsibleSection(
			advancedSectionEl,
			'debugFlags',
			'Debug flags',
			'Enable extra logging only when diagnosing rule behavior.',
			getDebugSummary(this.plugin.settings),
			false,
		);
		renderDebugSettings(debugSection.bodyEl, this.plugin, () => this.renderLegacySettings());

		if (!restoreSettingsFocus(containerEl, focusSnapshot)) {
			focusFirstSettingsControl(containerEl);
		}
	}

	hide(): void {
		this.disposeUiControllers();
		this.sectionOpenState.clear();
	}

	private prepareDeclarativeSetting(setting: Setting): HTMLElement {
		this.containerEl.addClass('read-only-view-settings');
		setting.settingEl.empty();
		setting.settingEl.addClass('read-only-view-declarative-setting');
		return setting.settingEl;
	}

	private renderDeclarativePathRules(setting: Setting): () => void {
		const containerEl = this.prepareDeclarativeSetting(setting);
		const section = this.createStaticWorkflowSection(
			containerEl,
			'Path rules',
			'Choose folders or notes to keep in Reading view.',
			getPathRulesSummary(
				this.plugin.settings.includeRules,
				this.plugin.settings.excludeRules,
				this.plugin.settings.includeRuleEnabled,
				this.plugin.settings.excludeRuleEnabled,
				!this.plugin.settings.forceAllMarkdownReadOnly,
			),
		);
		const controller = this.renderRuleEditor(section);
		return () => this.disposeRuleEditor(controller);
	}

	private renderDeclarativePathTester(setting: Setting): () => void {
		const containerEl = this.prepareDeclarativeSetting(setting);
		const section = this.createStaticWorkflowSection(
			containerEl,
			'Path tester',
			'Test a vault path against the current rules.',
			getPathTesterSummary(),
		);
		const controller = this.renderPathTester(section.bodyEl);
		return () => this.disposePathTester(controller);
	}

	private renderRuleEditor(
		pathRulesSection: StaticSectionController,
		headerIndicators?: HeaderIndicatorsController,
	): RuleEditorController {
		this.ruleEditor?.dispose();
		const controller = renderRuleEditor({
			containerEl: pathRulesSection.bodyEl,
			includeRules: this.plugin.settings.includeRules,
			excludeRules: this.plugin.settings.excludeRules,
			includeRuleEnabled: this.plugin.settings.includeRuleEnabled,
			excludeRuleEnabled: this.plugin.settings.excludeRuleEnabled,
			includeRuleEntries: this.plugin.settings.includeRuleEntries,
			excludeRuleEntries: this.plugin.settings.excludeRuleEntries,
			resolverContext: getRuleResolverContext(this.app),
			useGlobPatterns: this.plugin.settings.useGlobPatterns,
			includeRulesActive: !this.plugin.settings.forceAllMarkdownReadOnly,
			onChange: async (state, reason) => {
				this.plugin.settings.includeRules = state.includeRules;
				this.plugin.settings.excludeRules = state.excludeRules;
				this.plugin.settings.includeRuleEnabled = state.includeRuleEnabled;
				this.plugin.settings.excludeRuleEnabled = state.excludeRuleEnabled;
				this.plugin.settings.includeRuleEntries = state.includeRuleEntries ?? [];
				this.plugin.settings.excludeRuleEntries = state.excludeRuleEntries ?? [];
				await this.plugin.saveSettings();
				this.plugin.refreshEditorOptions();
				await this.plugin.applyAllOpenMarkdownLeaves(reason);
				pathRulesSection.setSummary(
					getPathRulesSummary(
						state.includeRules,
						state.excludeRules,
						state.includeRuleEnabled,
						state.excludeRuleEnabled,
						!this.plugin.settings.forceAllMarkdownReadOnly,
					),
				);
			},
			onStateChange: ({ includeCount, excludeCount }) => {
				pathRulesSection.setSummary(buildRulesSummary(includeCount, excludeCount));
				if (headerIndicators) {
					headerIndicators.setActiveRulesCount(includeCount + excludeCount);
				} else {
					this.setRenderedActiveRulesCount(includeCount + excludeCount);
				}
			},
		});
		this.ruleEditor = controller;
		return controller;
	}

	private renderPathTester(containerEl: HTMLElement): PathTesterController {
		this.pathTesterController?.dispose();
		const controller = renderPathTester(containerEl, {
			settings: this.plugin.settings,
			getCompiledRuleMatcher: this.plugin.getCompiledRuleMatcher?.bind(this.plugin),
			resolverContext: getRuleResolverContext(this.app),
		});
		this.pathTesterController = controller;
		return controller;
	}

	private disposeRuleEditor(controller: RuleEditorController): void {
		controller.dispose();
		if (this.ruleEditor === controller) {
			this.ruleEditor = null;
		}
	}

	private disposePathTester(controller: PathTesterController): void {
		controller.dispose();
		if (this.pathTesterController === controller) {
			this.pathTesterController = null;
		}
	}

	private setRenderedActiveRulesCount(count: number): void {
		const badgeEl = this.containerEl.querySelector<HTMLElement>('.read-only-view-status-badge');
		badgeEl?.setText(`Active rules: ${count}`);
	}

	private renderHeaderSection(containerEl: HTMLElement): HeaderIndicatorsController {
		const sectionEl = containerEl.createDiv({ cls: 'read-only-view-header-card' });
		sectionEl.createDiv({
			text: 'Read Only View',
			cls: 'read-only-view-header-title',
		});
		sectionEl.createDiv({
			text: 'Read-only behavior',
			cls: 'read-only-view-header-subtitle',
		});
		sectionEl.createDiv({
			text: 'Keep selected Markdown notes in Reading view',
			cls: 'read-only-view-header-description',
		});

		const indicatorsEl = sectionEl.createDiv({ cls: 'read-only-view-header-indicators' });
		const activeRulesBadgeEl = indicatorsEl.createDiv({ cls: 'read-only-view-status-badge' });
		activeRulesBadgeEl.setText(`Active rules: ${getActiveRulesCount(this.plugin.settings)}`);
		if (this.plugin.settings.forceAllMarkdownReadOnly) {
			const warningEl = indicatorsEl.createDiv({ cls: 'read-only-view-global-warning' });
			warningEl.setText('All Markdown files mode is enabled');
		}
		return {
			setActiveRulesCount: (count: number) => {
				activeRulesBadgeEl.setText(`Active rules: ${count}`);
			},
		};
	}

	private createCardSection(containerEl: HTMLElement, title?: string): HTMLElement {
		const sectionEl = containerEl.createDiv({ cls: 'read-only-view-section-card' });
		if (title) {
			sectionEl.createDiv({
				text: title,
				cls: 'read-only-view-section-card-title',
			});
		}
		return sectionEl;
	}

	private createStaticWorkflowSection(
		containerEl: HTMLElement,
		title: string,
		description: string,
		summary: string,
	): StaticSectionController {
		const sectionEl = this.createCardSection(containerEl);
		const headerEl = sectionEl.createDiv({ cls: 'read-only-view-static-section-header' });
		const copyEl = headerEl.createDiv({ cls: 'read-only-view-static-section-copy' });
		copyEl.createDiv({
			text: title,
			cls: 'read-only-view-disclosure-title',
		});
		copyEl.createDiv({
			text: description,
			cls: 'read-only-view-disclosure-description',
		});
		const summaryEl = headerEl.createDiv({ cls: 'read-only-view-static-section-summary' });
		summaryEl.setText(summary);

		const bodyEl = sectionEl.createDiv({ cls: 'read-only-view-static-section-body' });
		return {
			bodyEl,
			setSummary: (nextSummary: string) => {
				summaryEl.setText(nextSummary);
			},
		};
	}

	private createCollapsibleSection(
		containerEl: HTMLElement,
		sectionKey: SettingsSectionKey,
		title: string,
		description: string,
		summary: string,
		defaultOpen: boolean,
	): DisclosureController {
		const open = this.sectionOpenState.get(sectionKey) ?? defaultOpen;
		const bodyId = `read-only-view-section-${sectionKey}`;
		const wrapperEl = containerEl.createDiv({
			cls: `read-only-view-disclosure-row${open ? ' is-open' : ''}`,
		});
		const toggleEl = wrapperEl.createEl('button', {
			cls: 'read-only-view-disclosure-toggle',
			type: 'button',
		});
		toggleEl.setAttr('aria-expanded', open ? 'true' : 'false');
		toggleEl.setAttr('aria-controls', bodyId);
		setSettingsFocusKey(toggleEl, `section-${sectionKey}`);

		const copyEl = toggleEl.createSpan({ cls: 'read-only-view-disclosure-copy' });
		copyEl.createSpan({
			text: title,
			cls: 'read-only-view-disclosure-title',
		});
		copyEl.createSpan({
			text: description,
			cls: 'read-only-view-disclosure-description',
		});

		const metaEl = toggleEl.createSpan({ cls: 'read-only-view-disclosure-meta' });
		const summaryEl = metaEl.createSpan({ cls: 'read-only-view-disclosure-summary' });
		summaryEl.setText(summary);
		const arrowEl = metaEl.createSpan({
			text: open ? '▼' : '▶',
			cls: 'read-only-view-disclosure-arrow',
		});
		arrowEl.setAttr('aria-hidden', 'true');

		const bodyEl = wrapperEl.createDiv({
			cls: `read-only-view-disclosure-body${open ? '' : ' is-collapsed'}`,
		});
		bodyEl.setAttr('id', bodyId);

		toggleEl.addEventListener('click', () => {
			const isOpen = wrapperEl.matches('.is-open');
			if (isOpen) {
				this.sectionOpenState.set(sectionKey, false);
				wrapperEl.removeClass('is-open');
				bodyEl.addClass('is-collapsed');
				toggleEl.setAttr('aria-expanded', 'false');
				toggleEl.querySelector('.read-only-view-disclosure-arrow')?.setText('▶');
				return;
			}

			this.sectionOpenState.set(sectionKey, true);
			wrapperEl.addClass('is-open');
			bodyEl.removeClass('is-collapsed');
			toggleEl.setAttr('aria-expanded', 'true');
			toggleEl.querySelector('.read-only-view-disclosure-arrow')?.setText('▼');
		});

		return {
			bodyEl,
			setSummary: (nextSummary: string) => {
				summaryEl.setText(nextSummary);
			},
		};
	}

	private disposeUiControllers(): void {
		this.ruleEditor?.dispose();
		this.ruleEditor = null;
		this.pathTesterController?.dispose();
		this.pathTesterController = null;
	}
}

function buildRulesSummary(includeCount: number, excludeCount: number): string {
	return `${includeCount} include · ${excludeCount} exclude`;
}
