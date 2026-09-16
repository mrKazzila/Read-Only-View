import { DebouncedRenderScheduler } from './debounced-render';
import { buildPathTesterResult } from './rule-diagnostics';
import type { ForceReadModeSettings } from './plugin-types';
import { resolveRuleSource, type RuleResolverContext } from './rule-source';
import {
	buildSourceInputLimitMessage,
	formatSourceValueForDisplay,
	limitSourceInput,
} from './source-input-limits';
import { setSettingsFocusKey } from './settings-focus';

const PATH_TESTER_RENDER_DEBOUNCE_MS = 75;

type PathTesterRenderMatcher = {
	matchIncludeRules: (filePath: string) => string[];
	matchExcludeRules: (filePath: string) => string[];
	shouldForceReadOnly: (filePath: string) => boolean;
};

type PathTesterRenderOptions = {
	settings: ForceReadModeSettings;
	getCompiledRuleMatcher?: () => PathTesterRenderMatcher | undefined;
	resolverContext?: RuleResolverContext;
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
		text: 'Enter a vault path, Obsidian URL, or system path. Review the resolved path and rule matches.',
		cls: 'setting-item-description',
	});

	const inputEl = wrapperEl.createEl('input', { type: 'text' });
	inputEl.placeholder = 'Inbox/Quick capture.md or obsidian://open?...';
	inputEl.addClass('read-only-view-full-width');
	inputEl.setAttr('aria-label', 'Path to test');
	setSettingsFocusKey(inputEl, 'path-tester-input');

	const resultEl = wrapperEl.createDiv({ cls: 'read-only-view-path-tester-result' });
	let inputLimitExceeded = false;
	let inputLimit = limitSourceInput('').limit;

	const renderResult = () => {
		const rawValue = inputEl.value.trim();
		resultEl.empty();
		if (inputLimitExceeded) {
			resultEl.createDiv({
				text: buildSourceInputLimitMessage(inputLimit),
				cls: 'read-only-view-rule-inline-message is-error',
			});
			return;
		}
		if (!rawValue) {
			resultEl.setText('Enter a path to test.');
			return;
		}
		const resolution = resolveRuleSource(rawValue, options.resolverContext ?? {
			vaultName: '',
			vaultBasePath: null,
			isMarkdownFile: () => false,
			isFolder: () => false,
		});
		if (resolution.error || !resolution.resolvedPath) {
			resultEl.createDiv({ text: `Detected source: ${resolution.sourceKind}` });
			resultEl.createDiv({
				text: formatSourceValueForDisplay(resolution.error ?? 'The input could not be resolved.'),
				cls: 'read-only-view-rule-inline-message is-error',
			});
			return;
		}
		if (resolution.resolvedPath.endsWith('/')) {
			const statusEl = resultEl.createDiv({ cls: 'read-only-view-path-status-row' });
			statusEl.createSpan({
				text: 'Folder',
				cls: 'read-only-view-path-status-pill',
			});
			statusEl.createSpan({
				text: 'This system folder can be imported as a vault folder rule.',
				cls: 'read-only-view-path-status-copy',
			});
			const detailsEl = resultEl.createDiv({ cls: 'read-only-view-path-result-details' });
			detailsEl.createDiv({ text: `Detected source: ${resolution.sourceKind}` });
			detailsEl.createDiv({ text: `Resolved folder: ${formatSourceValueForDisplay(resolution.resolvedPath)}` });
			detailsEl.createDiv({ text: 'Enter a Markdown note inside this folder to test rule matches.' });
			return;
		}
		const matcher = options.getCompiledRuleMatcher?.();
		const { testPath, includeMatches, excludeMatches, finalReadOnly, presetApplied } = matcher
			? buildPathTesterResult(resolution.resolvedPath, options.settings, matcher)
			: buildPathTesterResult(resolution.resolvedPath, options.settings);

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
		detailsEl.createDiv({ text: `Detected source: ${resolution.sourceKind}` });
		detailsEl.createDiv({ text: `Resolved path: ${formatSourceValueForDisplay(testPath)}` });
		detailsEl.createDiv({
			text: `Matched include: ${includeMatches.length > 0
				? includeMatches.map((value) => formatSourceValueForDisplay(value)).join(', ')
				: 'none'}`,
		});
		detailsEl.createDiv({
			text: `Matched exclude: ${excludeMatches.length > 0
				? excludeMatches.map((value) => formatSourceValueForDisplay(value)).join(', ')
				: 'none'}`,
		});
		if (presetApplied) {
			detailsEl.createDiv({
				text: 'All Markdown files mode applies because no exclude rule matches.',
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

	const applyInputLimit = () => {
		const limited = limitSourceInput(inputEl.value, inputLimitExceeded);
		inputEl.value = limited.value;
		inputLimit = limited.limit;
		inputLimitExceeded = limited.exceeded;
		inputEl.setAttr('aria-invalid', limited.exceeded ? 'true' : 'false');
		if (limited.exceeded) {
			inputEl.addClass('is-input-error');
		} else {
			inputEl.removeClass('is-input-error');
		}
	};
	inputEl.addEventListener('input', () => {
		applyInputLimit();
		renderScheduler.schedule();
	});
	inputEl.addEventListener('change', () => {
		applyInputLimit();
		renderScheduler.flush();
	});
	inputEl.addEventListener('blur', () => {
		applyInputLimit();
		renderScheduler.flush();
	});
	renderResult();

	return {
		dispose: () => {
			renderScheduler.dispose();
		},
	};
}
