import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

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
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
					allowDefaultProject: [
						'eslint.config.mts',
						'manifest.json',
						'tests/*.ts',
						'tests/helpers/*.ts',
						'tsconfig.test.json',
					],
				},
				tsconfigRootDir: import.meta.dirname,
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
		'node_modules',
		'dist',
		'build-tests',
		'esbuild.config.mjs',
		'eslint.config.js',
		'version-bump.mjs',
		'versions.json',
		'main.js',
	]),
);
