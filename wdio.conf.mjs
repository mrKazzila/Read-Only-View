/* eslint-env node */
/* eslint-disable no-undef */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const screenshotsDir = path.join(repoRoot, '.tmp', 'wdio-artifacts');
const defaultObsidianPath = process.platform === 'darwin'
	? '/Applications/Obsidian.app/Contents/MacOS/Obsidian'
	: null;

const obsidianPath = process.env.OBSIDIAN_PATH ?? defaultObsidianPath;

if (!obsidianPath) {
	throw new Error(
		[
			'OBSIDIAN_PATH is required on this platform.',
			'Point it to the Obsidian desktop binary before running E2E tests.',
		].join(' '),
	);
}

if (!fs.existsSync(obsidianPath)) {
	throw new Error(
		`Obsidian binary not found at ${obsidianPath}. ` +
		'Set OBSIDIAN_PATH to a valid Obsidian desktop executable.',
	);
}

fs.mkdirSync(screenshotsDir, { recursive: true });

export const config = {
	runner: 'local',
	autoCompileOpts: {
		autoCompile: false,
	},
	specs: [
		'./tests/e2e/specs/**/*.e2e.mjs',
	],
	exclude: [],
	maxInstances: 1,
	logLevel: 'warn',
	baseUrl: '',
	waitforTimeout: 15_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 1,
	services: [
		['electron'],
	],
	framework: 'mocha',
	reporters: ['spec'],
	mochaOpts: {
		ui: 'bdd',
		timeout: 120_000,
	},
	capabilities: [
		{
			browserName: 'electron',
			'wdio:electronServiceOptions': {
				appBinaryPath: obsidianPath,
			},
		},
	],
	afterTest: async function afterTest(_test, _context, result) {
		if (result.passed) {
			return;
		}

		const screenshotName = `${Date.now()}-${result.error?.name ?? 'failure'}.png`;
		const screenshotPath = path.join(screenshotsDir, screenshotName);
		await browser.saveScreenshot(screenshotPath);
	},
};
