import assert from 'node:assert/strict';
import test from 'node:test';
import ReadOnlyViewPlugin from '../src/main.js';
import { changeSettings } from '../src/settings-lifecycle.js';
import { setRuleEntries } from '../src/rule-state.js';
import { createMainTestHarness } from './helpers/test-setup.js';

test('plugin reuses compiled matcher until accepted rules or mode change', async () => {
	const harness = createMainTestHarness();
	const plugin = new ReadOnlyViewPlugin(harness.app as never, {} as never);
	plugin.loadData = async () => ({ forceAllMarkdownReadOnly: false, useGlobPatterns: true, includeRules: ['docs/**'] });
	plugin.saveData = async () => undefined;
	await plugin.loadSettings();
	try {
		const first = plugin.getCompiledRuleMatcher();
		assert.equal(plugin.getCompiledRuleMatcher(), first);
		assert.equal(first.shouldForceReadOnly('docs/private/secret.md'), true);
		await changeSettings(plugin, (draft) => {
			setRuleEntries(draft, 'exclude', [{ sourceKind: 'vault-path', sourceValue: 'docs/private/**', resolvedPath: 'docs/private/**', enabled: true }]);
		}, 'settings-rules');
		const second = plugin.getCompiledRuleMatcher();
		assert.notEqual(second, first);
		assert.equal(second.shouldForceReadOnly('docs/private/secret.md'), false);
		assert.equal(plugin.getCompiledRuleMatcher(), second);
		await changeSettings(plugin, (draft) => { draft.forceAllMarkdownReadOnly = true; }, 'settings-mode');
		assert.notEqual(plugin.getCompiledRuleMatcher(), second);
		assert.equal(plugin.shouldForceReadOnlyPath('other/file.md'), true);
	} finally { plugin.onunload(); harness.restore(); }
});
