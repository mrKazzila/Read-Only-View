import { Setting } from 'obsidian';
import { normalizeVaultPath } from './matcher';
import { buildPathTesterResult } from './rule-diagnostics';
import type { ForceReadModeSettings } from './plugin-types';

export function renderPathTester(containerEl: HTMLElement, settings: ForceReadModeSettings): void {
	const wrapperEl = containerEl.createDiv({ cls: 'read-only-view-path-tester' });
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
		const { testPath, includeMatches, excludeMatches, finalReadOnly } = buildPathTesterResult(
			normalizeVaultPath(inputEl.value),
			settings,
		);
		resultEl.empty();

		if (!testPath) {
			resultEl.setText('Enter a file path to test.');
			return;
		}

		resultEl.createDiv({
			text: `Matched include: ${includeMatches.length > 0 ? includeMatches.join(', ') : 'none'}`,
		});
		resultEl.createDiv({
			text: `Matched exclude: ${excludeMatches.length > 0 ? excludeMatches.join(', ') : 'none'}`,
		});
		resultEl.createDiv({
			text: `Result: ${finalReadOnly ? 'READ-ONLY ON' : 'READ-ONLY OFF'}`,
		});
	};

	inputEl.addEventListener('input', renderResult);
	renderResult();
}
