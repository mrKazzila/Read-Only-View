import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				activeDocument: 'readonly',
				activeWindow: 'readonly',
			},
			parserOptions: {
				projectService: {
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 32,
					allowDefaultProject: [
						'eslint.config.mts',
						'manifest.json',
						'tests/*.ts',
						'tests/helpers/*.ts',
						'tsconfig.test.json',
					],
				},
				tsconfigRootDir,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['tests/**/*.ts'],
		rules: {
			'import/no-nodejs-modules': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/prefer-active-doc': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
		},
	},
	globalIgnores([
		'.tmp',
		'node_modules',
		'dist',
		'docs-site/.vitepress/**',
		'build-tests',
		'demo-vault',
		'esbuild.config.mjs',
		'eslint.config.js',
		'scripts/validate-docs-sitemap.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
	]),
);
