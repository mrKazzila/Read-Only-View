# Copy this file to just/local.just and edit paths for your machine.
# Generate a vault-local manifest copy so Obsidian shows a DEV build without changing the repo release manifest.

[group('Local')]
[doc('Install a local dev build into an Obsidian test vault')]
link-plugin:
	@VAULT="${VAULT:-/path/to/YourTestVault}"; \
	PLUGIN_ID="read-only-view"; \
	REPO="$(pwd)"; \
	PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"; \
	if [[ "$VAULT" == "/path/to/YourTestVault" ]]; then \
		echo "Set VAULT to your real vault path (env VAULT=... or edit just/local.just)." >&2; \
		exit 1; \
	fi; \
	mkdir -p "$PLUGIN_DIR"; \
	ln -sf "$REPO/main.js" "$PLUGIN_DIR/main.js"; \
	REPO="$REPO" PLUGIN_DIR="$PLUGIN_DIR" DEV_PLUGIN_VERSION="${DEV_PLUGIN_VERSION:-999.0.0}" node -e 'const fs = require("fs"); const path = require("path"); const repo = process.env.REPO; const pluginDir = process.env.PLUGIN_DIR; const sourcePath = path.join(repo, "manifest.json"); let source; try { source = fs.readFileSync(sourcePath, "utf8"); } catch (error) { console.error(`Failed to read ${sourcePath}: ${error.message}`); process.exit(1); } let manifest; try { manifest = JSON.parse(source); } catch (error) { console.error(`Invalid JSON in ${sourcePath}: ${error.message}`); process.exit(1); } manifest.id = "read-only-view"; manifest.name = "Read Only View (DEV)"; manifest.version = process.env.DEV_PLUGIN_VERSION || "999.0.0"; const devMarker = "[LOCAL DEV BUILD]"; const description = typeof manifest.description === "string" ? manifest.description.trim() : ""; manifest.description = description.includes(devMarker) ? description : `${description} ${devMarker}`.trim(); const targetPath = path.join(pluginDir, "manifest.json"); fs.writeFileSync(targetPath, `${JSON.stringify(manifest, null, "\t")}\n`);'; \
	if [[ -f "$REPO/styles.css" ]]; then \
		ln -sf "$REPO/styles.css" "$PLUGIN_DIR/styles.css"; \
	fi; \
	echo "Installed local dev build at $PLUGIN_DIR"; \
	echo "Dev manifest version: ${DEV_PLUGIN_VERSION:-999.0.0}"

[group('Local')]
[doc('Remove the local dev build from an Obsidian test vault')]
unlink-plugin:
	@VAULT="${VAULT:-/path/to/YourTestVault}"; \
	PLUGIN_ID="read-only-view"; \
	PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"; \
	if [[ "$VAULT" == "/path/to/YourTestVault" ]]; then \
		echo "Set VAULT to your real vault path (env VAULT=... or edit just/local.just)." >&2; \
		exit 1; \
	fi; \
	if [[ ! -d "$PLUGIN_DIR" ]]; then \
		echo "No local plugin directory found at $PLUGIN_DIR" >&2; \
		exit 1; \
	fi; \
	echo "This will remove the local dev plugin directory:"; \
	echo "  $PLUGIN_DIR"; \
	read -r -p "Type YES to continue: " CONFIRM; \
	if [[ "$CONFIRM" != "YES" ]]; then \
		echo "Aborted. Nothing was removed."; \
		exit 1; \
	fi; \
	rm -rf "$PLUGIN_DIR"; \
	echo "Removed local dev plugin from $PLUGIN_DIR"; \
	echo "To return to the release build, reinstall Read Only View from Obsidian Community Plugins."
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
