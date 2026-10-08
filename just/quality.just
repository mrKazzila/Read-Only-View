[group('Quality')]
[doc('Run ESLint checks')]
lint:
	@npm run lint

[group('Quality')]
[doc('Run Obsidian Community plugin preflight')]
lint-obsidian:
	@npm run lint:obsidian

[group('Quality')]
[doc('Run build, tests, lint, and Obsidian Community preflight in sequence')]
check: build test lint lint-obsidian
