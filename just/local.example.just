# Copy this file to just/local.just to enable machine-local commands.
# Set MOBILE_VAULT in your environment or edit only the ignored local copy.

[group('Local')]
[doc('Build and copy regular plugin files into the local mobile test vault')]
demo-mobile version: (_validate-demo-version version) build
	@just _demo-mobile-install {{quote(version)}}

[group('Local')]
[doc('Build once and install the same version into desktop and mobile test vaults')]
demo-all version:
	@just demo {{quote(version)}}
	@just _demo-mobile-install {{quote(version)}}

[private]
_demo-mobile-install version:
	@REPO="$(pwd)"; \
	MOBILE_VAULT="${MOBILE_VAULT:?Set MOBILE_VAULT to your mobile test vault path}"; \
	PLUGIN_ID="read-only-view"; \
	PLUGIN_DIR="$MOBILE_VAULT/.obsidian/plugins/$PLUGIN_ID"; \
	if [[ ! -d "$MOBILE_VAULT" ]]; then \
		echo "Mobile test vault not found at $MOBILE_VAULT" >&2; \
		exit 1; \
	fi; \
	mkdir -p "$PLUGIN_DIR"; \
	cp "$REPO/main.js" "$PLUGIN_DIR/.main.js.tmp"; \
	mv -f "$PLUGIN_DIR/.main.js.tmp" "$PLUGIN_DIR/main.js"; \
	if [[ -f "$REPO/styles.css" ]]; then \
		cp "$REPO/styles.css" "$PLUGIN_DIR/.styles.css.tmp"; \
		mv -f "$PLUGIN_DIR/.styles.css.tmp" "$PLUGIN_DIR/styles.css"; \
	fi; \
	REPO="$REPO" PLUGIN_DIR="$PLUGIN_DIR" DEV_PLUGIN_VERSION={{quote(version)}} node -e 'const fs = require("fs"); const path = require("path"); const sourcePath = path.join(process.env.REPO, "manifest.json"); const manifest = JSON.parse(fs.readFileSync(sourcePath, "utf8")); manifest.name = "Read Only View (DEV)"; manifest.version = process.env.DEV_PLUGIN_VERSION; const marker = "[LOCAL DEV BUILD]"; manifest.description = manifest.description.includes(marker) ? manifest.description : `${manifest.description.trim()} ${marker}`; const tempPath = path.join(process.env.PLUGIN_DIR, ".manifest.json.tmp"); const targetPath = path.join(process.env.PLUGIN_DIR, "manifest.json"); fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, "\t")}\n`); fs.renameSync(tempPath, targetPath);'; \
	if find "$PLUGIN_DIR" -maxdepth 1 -type l | grep -q .; then \
		echo "Plugin directory still contains symbolic links:" >&2; \
		find "$PLUGIN_DIR" -maxdepth 1 -type l >&2; \
		exit 1; \
	fi; \
	echo "Copied mobile dev build as regular files:"; \
	echo "  $PLUGIN_DIR"; \
	shasum -a 256 "$PLUGIN_DIR/main.js" "$PLUGIN_DIR/manifest.json" "$PLUGIN_DIR/styles.css"

[group('Release')]
[doc('Run release preflight checks for a target version (x.y.z)')]
release-preflight version:
	@echo "==> release preflight for {{version}}"; \
	if [[ ! "{{version}}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then \
		echo "Version must match x.y.z (without 'v' prefix)." >&2; \
		exit 1; \
	fi; \
	echo "==> ensure branch is up to date"; \
	fetch_ok=1; \
	if ! git fetch origin; then \
		fetch_ok=0; \
		echo "Warning: git fetch origin failed (offline?). Continue with local checks." >&2; \
	fi; \
	echo "==> quick status"; \
	git status --short; \
	if [[ -n "$(git status --porcelain)" ]]; then \
		echo "Working tree is not clean. Commit/stash changes before release." >&2; \
		exit 1; \
	fi; \
	if git rev-parse -q --verify "refs/tags/{{version}}" >/dev/null 2>&1; then \
		echo "Tag {{version}} already exists locally." >&2; \
		exit 1; \
	fi; \
	if [[ "$fetch_ok" -eq 1 ]]; then \
		if git ls-remote --exit-code --tags origin "refs/tags/{{version}}" >/dev/null 2>&1; then \
			echo "Tag {{version}} already exists on origin." >&2; \
			exit 1; \
		fi; \
	else \
		echo "Warning: skipped remote tag existence check (fetch failed)." >&2; \
	fi; \
	current_package_version="$(node -p "require('./package.json').version")"; \
	if [[ "$current_package_version" == "{{version}}" ]]; then \
		echo "package.json already has version {{version}}. Use a new version." >&2; \
		exit 1; \
	fi; \
	echo "==> preflight passed for {{version}}"

[group('Release')]
[doc('Full release flow: preflight -> bump versions -> checks -> commit -> tag -> push')]
release version:
	@just release-preflight {{version}}; \
	echo "==> bump package/manifest/versions to {{version}}"; \
	npm version --no-git-tag-version "{{version}}"; \
	echo "==> run required checks"; \
	just build; \
	echo "==> validate version files"; \
	package_version="$(node -p "require('./package.json').version")"; \
	manifest_version="$(node -p "require('./manifest.json').version")"; \
	if [[ "$package_version" != "{{version}}" ]]; then \
		echo "package.json version ($package_version) != expected ({{version}})" >&2; \
		exit 1; \
	fi; \
	if [[ "$manifest_version" != "{{version}}" ]]; then \
		echo "manifest.json version ($manifest_version) != expected ({{version}})" >&2; \
		exit 1; \
	fi; \
	node -e "const v='{{version}}'; const versions=require('./versions.json'); if(!versions[v]){console.error('versions.json has no entry for ' + v); process.exit(1)}"; \
	echo "==> commit release changes"; \
	git add package.json package-lock.json manifest.json versions.json; \
	git commit -m "Release {{version}}"; \
	echo "==> create annotated tag {{version}}"; \
	git tag -a "{{version}}" -m "Release {{version}}"; \
	echo "==> push commit + tag to origin"; \
	git push origin HEAD; \
	git push origin "refs/tags/{{version}}"; \
	echo "==> done. GitHub Actions release workflow should start for tag {{version}}."
