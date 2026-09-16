# Demo Vault

The demo vault provides a reproducible synthetic Obsidian vault for manual QA, screenshots, and short videos without exposing real user notes. All folders and note content are generated from public, neutral demo material.

## Create the vault

```bash
just demo-vault
just demo-vault-reset
just demo-vault-no-plugin
just link-plugin
just unlink-plugin
```

- `just demo-vault` creates or refreshes `./demo-vault` without deleting unrelated files in that directory.
- `just demo-vault-reset` removes and recreates `./demo-vault`.
- `just demo-vault-no-plugin` creates the synthetic notes and folder structure only.
- `just link-plugin` attaches the current local dev build to `./demo-vault` by default.
- `just unlink-plugin` detaches the local dev build from `./demo-vault` without removing notes.

Direct script usage:

```bash
python3 scripts/create_demo_vault.py --force
python3 scripts/create_demo_vault.py --force --no-plugin-link
```

If `main.js` is missing, the script prints a clear message asking you to build the plugin first with `just build` or `npm run build`.

## Open the vault in Obsidian

1. Run `just demo-vault`.
2. Open Obsidian.
3. Choose **Open folder as vault**.
4. Select `demo-vault` from the repository root.
5. Confirm that **Read Only View** appears in Community plugins and is enabled.

The script copies `manifest.json`, links `main.js` and optional `styles.css` by default, and writes `data.json` plus `.obsidian/community-plugins.json` for the demo vault.

If you want to create the vault structure first and attach the plugin later:

1. Run `just demo-vault-no-plugin`.
2. Run `just link-plugin`.
3. Open `demo-vault` in Obsidian.

To remove the dev install but keep the synthetic notes, run `just unlink-plugin`.

## Default rules in the demo vault

Protected by default:

- `Read Only/`
- `Archive/`
- `Inbox/Quick capture.md` — exact rule imported from an `obsidian://open` URL
- `Inbox/Meeting recap.md` — exact rule imported from a desktop system path

Excluded from protection:

- `Read Only/Drafts/`

These values are written into `.obsidian/plugins/read-only-view/data.json` using the current plugin settings schema. The imported system path is stored as the portable vault-relative value `Inbox/Meeting recap.md`; the generated settings do not retain a local absolute path.

## Suggested test scenarios

### Scenario 1: Basic read-only behavior

1. Open `Read Only/Docs/API overview.md`.
2. Verify it opens or stays in Reading view.
3. Try an accidental click or tap in the note body.
4. Verify it does not switch to edit mode.

### Scenario 2: Include/exclude behavior

1. Open `Read Only/Docs/User guide.md`.
2. Verify it is protected.
3. Open `Read Only/Drafts/Editable draft.md`.
4. Verify it remains editable.

### Scenario 3: Archive protection

1. Open `Archive/2025/Retrospective.md`.
2. Verify it is protected by the archive include rule.

### Scenario 4: Normal editable notes

1. Open `Inbox/Idea parking lot.md`.
2. Verify it remains editable.
3. Open `Knowledge Base/Programming/Python/Testing checklist.md`.
4. Verify it remains editable unless you add your own matching rules.

### Scenario 5: Imported notes

1. Open `Inbox/Quick capture.md` and verify the exact rule imported from an Obsidian URL protects it.
2. Open `Inbox/Meeting recap.md` and verify the exact rule imported from a desktop system path protects it.
3. Open **Settings -> Read Only View** and inspect the unified **Path rules** table.
4. Verify both rows show their detected source type and resolved vault-relative path.

### Scenario 6: Path tester and rule diagnostics

Use **Path tester** with all three accepted source formats:

- Vault-relative path: `Read Only/Docs/API overview.md`
- Obsidian URL: `obsidian://open?vault=demo-vault&file=Inbox%2FQuick%20capture`
- Desktop system path: copy the absolute path to `demo-vault/Inbox/Meeting recap.md` or the `demo-vault/Inbox` folder

Verify the detected source, resolved path, matched include/exclude rules, and final `Read-only` or `Editable` result. Also inspect inline and aggregate diagnostics in the unified **Path rules** table and confirm that the generated defaults are valid in prefix mode.

## Recommended recording targets

Use the generated notes below for documentation media:

- Long protected note: `Read Only/Docs/API overview.md`
- Short note: `Reference/Snippets/Regex cheatsheet.md`
- Excluded draft note: `Read Only/Drafts/Editable draft.md`
- Archive note: `Archive/2025/Retrospective.md`
- Obsidian URL import: `Inbox/Quick capture.md`
- System-path import: `Inbox/Meeting recap.md`
- Ordinary editable note: `Inbox/Idea parking lot.md`

README candidate screenshots:

- Main settings screen in both `All Markdown files` and `Only matched paths` modes
- Unified **Path rules** table with include/exclude, enabled/disabled, and imported-source rows
- **Path tester** result showing detected source, resolved path, matched rules, and final status
- Collapsed and expanded **Advanced** settings
- Protected note example
- Editable excluded draft example
- Narrow mobile or tablet settings layout

## Notes on reproducibility

- The vault generator is idempotent when run without `--force`.
- `--force` recreates the vault from scratch.
- The generated vault is ignored by git via `demo-vault/`.
- No real names, addresses, tokens, phone numbers, email addresses, or user notes are read or copied.
