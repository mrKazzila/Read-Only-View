[group('Build')]
[doc('Build plugin bundle for production')]
build:
	@npm run build

[group('Build')]
[doc('Remove generated build artifacts')]
clean:
	@rm -rf build-tests
	@rm -f main.js
