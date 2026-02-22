# Copy this file to just/local.just and edit paths for your machine.

[group('Local')]
[doc('Symlink plugin files into a local Obsidian test vault')]
link-plugin:
	@VAULT="${VAULT:-/path/to/YourTestVault}"; \
	PLUGIN_ID="read-only-view"; \
	REPO="$(pwd)"; \
	if [[ "$VAULT" == "/path/to/YourTestVault" ]]; then \
		echo "Set VAULT to your real vault path (env VAULT=... or edit just/local.just)." >&2; \
		exit 1; \
	fi; \
	mkdir -p "$VAULT/.obsidian/plugins/$PLUGIN_ID"; \
	ln -sf "$REPO/main.js" "$VAULT/.obsidian/plugins/$PLUGIN_ID/main.js"; \
	ln -sf "$REPO/manifest.json" "$VAULT/.obsidian/plugins/$PLUGIN_ID/manifest.json"; \
	if [[ -f "$REPO/styles.css" ]]; then \
		ln -sf "$REPO/styles.css" "$VAULT/.obsidian/plugins/$PLUGIN_ID/styles.css"; \
	fi
