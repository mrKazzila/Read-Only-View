import { Setting } from 'obsidian';
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

export function renderGeneralSettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	new Setting(containerEl).setName('Read-only view').setHeading();

	for (const toggleSetting of TOGGLE_SETTINGS) {
		new Setting(containerEl)
			.setName(toggleSetting.name)
			.setDesc(toggleSetting.description)
			.addToggle((toggle) => {
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
			});
	}
}
