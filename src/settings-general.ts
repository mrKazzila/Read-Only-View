import { ToggleComponent } from 'obsidian';
import type { ForceReadModeSettings, SettingsTabPlugin } from './plugin-types';

type BooleanSettingKey = {
	[K in keyof ForceReadModeSettings]: ForceReadModeSettings[K] extends boolean ? K : never;
}[keyof ForceReadModeSettings];

type ToggleSettingConfig = {
	name: string;
	description: string;
	settingKey: BooleanSettingKey;
	reapplyReason?: string;
};

const TOGGLE_SETTINGS: ToggleSettingConfig[] = [
	{
		name: 'Enabled',
		description: 'Enable or disable read-only enforcement globally.',
		settingKey: 'enabled',
		reapplyReason: 'settings-enabled',
	},
	{
		name: 'All Markdown files read-only',
		description: 'Force every Markdown file into reading view. Saved path rules are ignored while this preset is enabled.',
		settingKey: 'forceAllMarkdownReadOnly',
		reapplyReason: 'settings-force-all-markdown-read-only',
	},
	{
		name: 'Use glob patterns',
		description: 'Use glob tokens (*, **, ?) for matching. Disable for literal prefix compatibility mode.',
		settingKey: 'useGlobPatterns',
		reapplyReason: 'settings-use-glob-patterns',
	},
	{
		name: 'Case sensitive',
		description: 'When disabled, both rules and file paths are compared in lower case.',
		settingKey: 'caseSensitive',
		reapplyReason: 'settings-case-sensitive',
	},
	{
		name: 'Debug logging',
		description: 'Write detailed logs to the developer console.',
		settingKey: 'debug',
	},
	{
		name: 'Debug: verbose paths',
		description: 'When enabled, debug logs include full file paths. Keep disabled for safer default redaction.',
		settingKey: 'debugVerbosePaths',
	},
];

const PRIMARY_TOGGLE_SETTING_KEYS: BooleanSettingKey[] = [
	'enabled',
	'forceAllMarkdownReadOnly',
];

const MATCHING_TOGGLE_SETTING_KEYS: BooleanSettingKey[] = [
	'useGlobPatterns',
	'caseSensitive',
];

const DEBUG_TOGGLE_SETTING_KEYS: BooleanSettingKey[] = [
	'debug',
	'debugVerbosePaths',
];

function renderToggleSettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
	allowedSettingKeys: BooleanSettingKey[],
): void {
	for (const toggleSetting of TOGGLE_SETTINGS) {
		if (!allowedSettingKeys.includes(toggleSetting.settingKey)) {
			continue;
		}

		const settingEl = containerEl.createDiv({ cls: 'read-only-view-setting-item' });
		const infoEl = settingEl.createDiv({ cls: 'read-only-view-setting-info' });
		infoEl.createDiv({
			text: toggleSetting.name,
			cls: 'read-only-view-setting-name',
		});
		infoEl.createDiv({
			text: toggleSetting.description,
			cls: 'read-only-view-setting-description',
		});

		const controlEl = settingEl.createDiv({ cls: 'read-only-view-setting-control' });
		const toggle = new ToggleComponent(controlEl);
		toggle.toggleEl.addClass('read-only-view-setting-toggle');
		toggle
			.setValue(plugin.settings[toggleSetting.settingKey])
			.onChange(async (value) => {
				await updateBooleanSetting(
					plugin,
					toggleSetting.settingKey,
					value,
					refresh,
					toggleSetting.reapplyReason,
				);
			});
	}
}

export function renderPrimarySettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	renderToggleSettings(containerEl, plugin, refresh, PRIMARY_TOGGLE_SETTING_KEYS);
}

export function renderMatchingSettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	renderToggleSettings(containerEl, plugin, refresh, MATCHING_TOGGLE_SETTING_KEYS);
}

export function renderDebugSettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	renderToggleSettings(containerEl, plugin, refresh, DEBUG_TOGGLE_SETTING_KEYS);
}

export async function updateBooleanSetting(
	plugin: SettingsTabPlugin,
	settingKey: BooleanSettingKey,
	value: boolean,
	refresh: () => void,
	reapplyReason?: string,
): Promise<void> {
	plugin.settings[settingKey] = value;
	await plugin.saveSettings();
	if (reapplyReason) {
		plugin.refreshEditorOptions();
	}
	if (reapplyReason && (settingKey !== 'enabled' || value)) {
		await plugin.applyAllOpenMarkdownLeaves(reapplyReason);
	}
	refresh();
}
