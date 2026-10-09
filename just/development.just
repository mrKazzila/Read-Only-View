[group('Development')]
[doc('Run esbuild in watch mode')]
dev:
	@npm run dev

[group('Development')]
[doc('Run the local VitePress documentation site')]
docs-dev:
	@npm run docs:dev

[group('Development')]
[doc('Install a local dev build into an Obsidian test vault')]
link-plugin:
	@REPO="$(pwd)"; \
	VAULT="${VAULT:-$REPO/demo-vault}"; \
	PLUGIN_ID="read-only-view"; \
	PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"; \
	if [[ ! -d "$VAULT" ]]; then \
		echo "Vault not found at $VAULT" >&2; \
		echo "Default target is ./demo-vault. Run 'just demo <version>' or 'just demo-no-plugin' first," >&2; \
		echo "or override the target with VAULT=/path/to/vault just link-plugin." >&2; \
		exit 1; \
	fi; \
	mkdir -p "$VAULT/.obsidian"; \
	mkdir -p "$PLUGIN_DIR"; \
	ln -sf "$REPO/main.js" "$PLUGIN_DIR/main.js"; \
	REPO="$REPO" PLUGIN_DIR="$PLUGIN_DIR" DEV_PLUGIN_VERSION="${DEV_PLUGIN_VERSION:-999.0.0}" node -e 'const fs = require("fs"); const path = require("path"); const repo = process.env.REPO; const pluginDir = process.env.PLUGIN_DIR; const sourcePath = path.join(repo, "manifest.json"); let source; try { source = fs.readFileSync(sourcePath, "utf8"); } catch (error) { console.error(`Failed to read ${sourcePath}: ${error.message}`); process.exit(1); } let manifest; try { manifest = JSON.parse(source); } catch (error) { console.error(`Invalid JSON in ${sourcePath}: ${error.message}`); process.exit(1); } manifest.id = "read-only-view"; manifest.name = "Read Only View (DEV)"; manifest.version = process.env.DEV_PLUGIN_VERSION || "999.0.0"; const devMarker = "[LOCAL DEV BUILD]"; const description = typeof manifest.description === "string" ? manifest.description.trim() : ""; manifest.description = description.includes(devMarker) ? description : `${description} ${devMarker}`.trim(); const targetPath = path.join(pluginDir, "manifest.json"); fs.writeFileSync(targetPath, `${JSON.stringify(manifest, null, "\t")}\n`);'; \
	if [[ -f "$REPO/styles.css" ]]; then \
		ln -sf "$REPO/styles.css" "$PLUGIN_DIR/styles.css"; \
	fi; \
	VAULT="$VAULT" PLUGIN_ID="$PLUGIN_ID" node -e 'const fs = require("fs"); const path = require("path"); const vault = process.env.VAULT; const pluginId = process.env.PLUGIN_ID; const targetPath = path.join(vault, ".obsidian", "community-plugins.json"); let plugins = []; try { plugins = JSON.parse(fs.readFileSync(targetPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") { console.error(`Failed to read ${targetPath}: ${error.message}`); process.exit(1); } } if (!Array.isArray(plugins)) { plugins = []; } if (!plugins.includes(pluginId)) { plugins.push(pluginId); } fs.writeFileSync(targetPath, `${JSON.stringify(plugins, null, 2)}\n`);'; \
	echo "Installed local dev build at $PLUGIN_DIR"; \
	echo "Target vault: $VAULT"; \
	echo "Dev manifest version: ${DEV_PLUGIN_VERSION:-999.0.0}"

[group('Development')]
[doc('Remove the local dev build from an Obsidian test vault')]
unlink-plugin:
	@REPO="$(pwd)"; \
	VAULT="${VAULT:-$REPO/demo-vault}"; \
	PLUGIN_ID="read-only-view"; \
	PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"; \
	if [[ ! -d "$VAULT" ]]; then \
		echo "Vault not found at $VAULT" >&2; \
		echo "Default target is ./demo-vault. Run 'just demo-no-plugin' or 'just demo <version>' first," >&2; \
		echo "or override the target with VAULT=/path/to/vault just unlink-plugin." >&2; \
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
	VAULT="$VAULT" PLUGIN_ID="$PLUGIN_ID" node -e 'const fs = require("fs"); const path = require("path"); const vault = process.env.VAULT; const pluginId = process.env.PLUGIN_ID; const targetPath = path.join(vault, ".obsidian", "community-plugins.json"); let plugins; try { plugins = JSON.parse(fs.readFileSync(targetPath, "utf8")); } catch (error) { if (error.code === "ENOENT") { process.exit(0); } console.error(`Failed to read ${targetPath}: ${error.message}`); process.exit(1); } if (!Array.isArray(plugins)) { process.exit(0); } const filtered = plugins.filter((entry) => entry !== pluginId); if (filtered.length === 0) { fs.rmSync(targetPath, { force: true }); process.exit(0); } fs.writeFileSync(targetPath, `${JSON.stringify(filtered, null, 2)}\n`);'; \
	echo "Removed local dev plugin from $PLUGIN_DIR"; \
	echo "Target vault: $VAULT"; \
	echo "Demo vault notes were left untouched."

[group('Development')]
[doc('Build the plugin and create or refresh the synthetic demo vault')]
demo version: (_validate-demo-version version) build
	@python3 scripts/create_demo_vault.py --plugin-version {{quote(version)}}

[group('Development')]
[doc('Build the plugin and recreate the synthetic demo vault from scratch')]
demo-reset version: (_validate-demo-version version) build
	@python3 scripts/create_demo_vault.py --force --plugin-version {{quote(version)}}

[group('Development')]
[doc('Create the synthetic demo vault without linking plugin files')]
demo-no-plugin:
	@python3 scripts/create_demo_vault.py --no-plugin-link
[private]
_validate-demo-version version:
	@python3 -c 'import sys; sys.exit(0 if sys.argv[1].strip() else "Version must not be empty.")' {{quote(version)}}
