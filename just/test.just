[group('Test')]
[doc('Compile and run unit tests')]
test:
	@npm test

[group('Test')]
[doc('Run tests with Node coverage report (line/branch/function %)')]
coverage:
	@npm exec tsc -- -p tsconfig.test.json
	@node tests/helpers/prepare-obsidian-runtime.mjs
	@node --experimental-test-coverage --test build-tests/**/*.test.js
