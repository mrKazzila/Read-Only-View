import { fileURLToPath } from 'node:url';
import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

// Complete Community scanner exclusions plus repository-specific exclusions:
// https://github.com/obsidianmd/eslint-plugin/blob/master/docs/configuration.md#community-plugin-scanner-configuration
export default defineConfig([
	globalIgnores([
		// Official Community Plugin Scanner ignore set.
		'node_modules',
		'dist',
		'build',
		'pkg',
		'test-vault',
		'.obsidian',
		'**/.obsidian/**',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'**/*.test.*',
		'**/*.tests.*',
		'**/*.spec.*',
		'**/*.specs.*',
		'**/test/**',
		'**/tests/**',
		'**/__tests__/**',
		'**/mocks/**',
		'**/__mocks__/**',
		'**/*.cjs',
		'**/*.mjs',
		'**/*.cts',
		'**/*.mts',
		'**/vite*',
		'**/scripts/**',
		'**/docs/**',
		'**/i18n/**',
		'**/i18next/**',
		'**/locale/**',
		'**/locales/**',
		'**/translations/**',
		'**/l10n/**',
		'.pnpm-store',
		'**/*.spec.ts',
		'**/testUtils**',
		'automation/**',
		'e2e-tests/**',

		// Additional Read Only View exclusions.
		'main.js',
		'build-tests',
		'.tmp',
		'.venv',
		'demo-vault',
		'tests/**',
		'scripts/**',
		'docs/**',
		'docs-site/**',
		'.agents/**',
		'tsconfig*.json',
		'versions.json',
	]),
	...obsidianmd.configs.recommended,
	{
		// Inline directives produce warnings; --max-warnings 0 rejects them.
		linterOptions: { noInlineConfig: true },
		languageOptions: {
			parserOptions: {
				projectService: {
					// Source is in tsconfig.json; manifest is the only extra project file.
					allowDefaultProject: ['manifest.json'],
				},
				tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
				extraFileExtensions: ['.json'],
			},
		},
	},
	{
		files: ['**/*.{ts,tsx,js,jsx}'],
		rules: {
			// Retain scanner exceptions except unsafe type operations, which this
			// preflight checks strictly even when the scanner treats them as advisory.
			'no-undef': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'error',
			'@typescript-eslint/no-unsafe-assignment': 'error',
			'@typescript-eslint/no-unsafe-argument': 'error',
			'@typescript-eslint/no-unsafe-call': 'error',
			'@typescript-eslint/no-unsafe-return': 'error',
			'@typescript-eslint/restrict-template-expressions': 'off',
			'@typescript-eslint/no-base-to-string': 'off',
			'import/no-unresolved': 'off',
			// The scanner validates metadata separately and preserves legacy IDs.
			'obsidianmd/validate-manifest': 'off',
			'obsidianmd/validate-license': 'off',
			'obsidianmd/commands/no-command-in-command-id': 'off',
			'obsidianmd/commands/no-plugin-id-in-command-id': 'off',
			// Match the scanner's security errors explicitly.
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-unsanitized/method': 'error',
			'no-unsanitized/property': 'error',
			'obsidianmd/regex-lookbehind': 'error',
			'obsidianmd/no-forbidden-elements': 'error',
		},
	},
	// Keep recommended severities for other rules; the npm command also fails
	// on warnings, rather than treating the scanner's advisory findings as a pass.
]);
