[group('Quality')]
[doc('Run ESLint checks')]
lint:
	@npm run lint

[group('Quality')]
[doc('Run build, tests, and lint in sequence')]
check: build test lint
