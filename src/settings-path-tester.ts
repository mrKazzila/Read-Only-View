import { Setting } from 'obsidian';
import { DebouncedRenderScheduler } from './debounced-render';
import { normalizeVaultPath } from './matcher';
import { buildPathTesterResult } from './rule-diagnostics';
import type { ForceReadModeSettings } from './plugin-types';

const PATH_TESTER_RENDER_DEBOUNCE_MS = 75;

type PathTesterRenderMatcher = {
	matchIncludeRules: (filePath: string) => string[];
	matchExcludeRules: (filePath: string) => string[];
	shouldForceReadOnly: (filePath: string) => boolean;
};

type PathTesterRenderOptions = {
	settings: ForceReadModeSettings;
	getCompiledRuleMatcher?: () => PathTesterRenderMatcher | undefined;
};

export type PathTesterController = {
	dispose: () => void;
};

export function renderPathTester(
	containerEl: HTMLElement,
	options: PathTesterRenderOptions,
): PathTesterController {
	const ownerWindow = containerEl.ownerDocument?.defaultView;
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
		const matcher = options.getCompiledRuleMatcher?.();
		const { testPath, includeMatches, excludeMatches, finalReadOnly } = matcher
			? buildPathTesterResult(normalizeVaultPath(inputEl.value), options.settings, matcher)
			: buildPathTesterResult(normalizeVaultPath(inputEl.value), options.settings);
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
	const renderScheduler = new DebouncedRenderScheduler(
		PATH_TESTER_RENDER_DEBOUNCE_MS,
		renderResult,
		ownerWindow,
	);

	inputEl.addEventListener('input', () => renderScheduler.schedule());
	inputEl.addEventListener('change', () => renderScheduler.flush());
	inputEl.addEventListener('blur', () => renderScheduler.flush());
	renderResult();

	return {
		dispose: () => {
			renderScheduler.dispose();
		},
	};
}
