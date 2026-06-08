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

export function getPathTesterSummary(): string {
	return 'Ready to test';
}

export function renderPathTester(
	containerEl: HTMLElement,
	options: PathTesterRenderOptions,
): PathTesterController {
	const ownerWindow = containerEl.ownerDocument?.defaultView;
	const wrapperEl = containerEl.createDiv({ cls: 'read-only-view-path-tester' });
	wrapperEl.createEl('p', {
		text: 'Enter a path exactly as file.path in Obsidian. Review include and exclude matches before changing rules or matching settings.',
		cls: 'setting-item-description',
	});

	const inputEl = wrapperEl.createEl('input', { type: 'text' });
	inputEl.placeholder = 'project_a/subfolder/file_1.md';
	inputEl.addClass('read-only-view-full-width');
	inputEl.setAttr('aria-label', 'Path to test');

	const resultEl = wrapperEl.createDiv({ cls: 'read-only-view-path-tester-result' });

	const renderResult = () => {
		const matcher = options.getCompiledRuleMatcher?.();
		const { testPath, includeMatches, excludeMatches, finalReadOnly, presetApplied } = matcher
			? buildPathTesterResult(normalizeVaultPath(inputEl.value), options.settings, matcher)
			: buildPathTesterResult(normalizeVaultPath(inputEl.value), options.settings);
		resultEl.empty();

		if (!testPath) {
			resultEl.setText('Enter a file path to test.');
			return;
		}

		const statusEl = resultEl.createDiv({ cls: 'read-only-view-path-status-row' });
		statusEl.createSpan({
			text: finalReadOnly ? 'Read-only' : 'Editable',
			cls: `read-only-view-path-status-pill ${finalReadOnly ? 'is-read-only' : 'is-editable'}`,
		});
		statusEl.createSpan({
			text: finalReadOnly
				? 'This path resolves to Reading view.'
				: excludeMatches.length > 0
					? 'This path is excluded and stays editable.'
					: 'This path stays editable with the current settings.',
			cls: 'read-only-view-path-status-copy',
		});

		const detailsEl = resultEl.createDiv({ cls: 'read-only-view-path-result-details' });
		detailsEl.createDiv({
			text: `Matched include: ${includeMatches.length > 0 ? includeMatches.join(', ') : 'none'}`,
		});
		detailsEl.createDiv({
			text: `Matched exclude: ${excludeMatches.length > 0 ? excludeMatches.join(', ') : 'none'}`,
		});
		if (presetApplied) {
			detailsEl.createDiv({
				text: 'Preset override: all Markdown files are currently read-only. Saved path rules are ignored.',
			});
		}
		detailsEl.createDiv({
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
