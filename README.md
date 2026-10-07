# Read Only View

Keep your Markdown notes in Obsidian Reading view and prevent accidental edits, across your whole vault or only where you choose.

[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?label=downloads&query=%24%5B%22read-only-view%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&color=8c79de&logo=obsidian&logoColor=8c79de)](https://community.obsidian.md/plugins/read-only-view)

**Desktop and mobile · Obsidian 1.10.3+ · 0BSD license**

Privacy: No network requests; all rule matching stays local. Imported system paths are stored as portable vault-relative paths, without the original absolute path.

**[Full documentation](https://mrkazzila.github.io/Read-Only-View/)** · [Report an issue](https://github.com/mrKazzila/Read-Only-View/issues)

![Read Only View settings with All Markdown files mode enabled](docs/images/community-images/Read-Only-View-all-markdown-mode-1200x800.png)

## Why Read Only View?

Keep reference notes, documentation, dashboards, and archives in Reading view without accidentally opening the editor.

- Keep a knowledge base ready for reading.
- Protect archived project notes while keeping drafts editable.
- Protect individual Markdown notes.
- Use the same rules on desktop and mobile.

## Installation

In Obsidian, open **Settings → Community plugins → Browse**, search for **Read Only View**, then select **Install → Enable**.

<details>
<summary>Install with BRAT</summary>

To try unreleased builds:

1. Install **Obsidian42 - BRAT** from Community Plugins.
2. Run **BRAT: Add a beta plugin for testing** from the Command Palette.
3. Paste `https://github.com/mrKazzila/Read-Only-View`.
4. Add the plugin, refresh the plugin list if needed, and enable **Read Only View**.

</details>

<details>
<summary>Install release files manually</summary>

Download `main.js`, `manifest.json`, and `styles.css` (when provided) from a [release](https://github.com/mrKazzila/Read-Only-View/releases). Copy them into:

```text
<Vault>/.obsidian/plugins/read-only-view/
```

Restart Obsidian or reload plugins, then enable **Read Only View**.

</details>

## Quick start

### Protect all Markdown notes

Open **Settings → Read Only View**, keep **Enabled** on, and select **All Markdown files**. This is the default on a new installation. Add an **Exclude** rule for any note or folder that should remain editable.

### Protect one folder

1. Select **Only matched paths**.
2. Under **Path rules**, select **Add rule** and enter:

```text
Type: Include
Value: Notes/Summaries/
```

3. Wait for **Saved.**, then open a note in that folder. It will stay in Reading view.

**Exclude rules take priority over Include rules.** See the [full matching guide](https://mrkazzila.github.io/Read-Only-View/docs/path-rules) for advanced settings.

<a id="rule-examples"></a>

## Common examples

Use **Only matched paths** for these examples. Folder examples use the default path-prefix matching.

### Read-only folder

```text
Type: Include
Value: Archive/
```

### Editable subfolder inside a protected folder

```text
Type: Include
Value: Notes/Summaries/

Type: Exclude
Value: Notes/Summaries/Drafts/
```

### Single note

Add an **Include** rule and paste the note's Obsidian URL into **Value**. For an existing `Reference/Handbook.md` note in a vault named `MyVault`:

```text
Type: Include
Value: obsidian://open?vault=MyVault&file=Reference%2FHandbook.md
```

Use your own note's URL to protect exactly that note. You can also right-click a Markdown note or folder in the file explorer and choose **Lock → Reading**. See [Lock and Unlock](https://mrkazzila.github.io/Read-Only-View/docs/path-rules#lock-and-unlock) for exceptions and how to undo a lock.

## How rules work

- **Include** selects paths to protect in **Only matched paths** mode.
- **Exclude** leaves matching paths editable, even when an Include matches or **All Markdown files** is selected.
- Rules apply only to Markdown notes. Keep a trailing `/` for folder rules.
- Uncheck a rule's **Enabled** checkbox to keep it without applying it.

In **All Markdown files**, saved Include rules are retained but inactive. In **Only matched paths**, notes without a matching enabled Include remain editable.

For glob patterns, case sensitivity, imported paths, and edge cases, see [Path rules](https://mrkazzila.github.io/Read-Only-View/docs/path-rules).

## Path Tester

Use **Path tester** in the plugin settings to see whether a note is protected and which rule caused the result. Paste a note path such as `Notes/Summaries/Meeting.md`; it shows the resolved path, matching rules, and final **Read-only** or **Editable** status.

![Path tester resolving an Obsidian URL and reporting Read-only](docs/images/community-images/Read-Only-View-path-tester-read-only-1200x800.png)

You can also right-click a note or folder and choose **Explain read-only status**. For a folder, it summarizes protection across its Markdown notes. See the [diagnostics guide](https://mrkazzila.github.io/Read-Only-View/docs/path-tester) for details.

## Commands

Available from Obsidian's Command Palette:

- `Enable read-only mode`
- `Disable read-only mode`
- `Toggle read-only mode`
- `Re-apply rules now`

Enable appears while protection is off; Disable appears while it is on. Use **Re-apply rules now** to apply the current configuration immediately to open Markdown notes.

## Troubleshooting

- **A note stays editable:** confirm the plugin and Include rule are enabled, then check for an Exclude match in **Path tester**.
- **A note stays protected:** check whether **All Markdown files** or another Include rule still covers it. Add an Exclude when it should remain editable.
- **Changes have not taken effect:** wait for **Saved.**, run **Re-apply rules now**, and reopen the note if needed.
- **A path does not resolve or match:** check its spelling and use the [troubleshooting guide](https://mrkazzila.github.io/Read-Only-View/docs/troubleshooting).

If the issue persists, [report it](https://github.com/mrKazzila/Read-Only-View/issues) with your Obsidian version, plugin version, platform, and a small example rule set. Avoid sharing private paths or note content.

## Limitations

- Protection helps prevent accidental edits; it does not change filesystem permissions or provide security/access control.
- Only Markdown notes opened in Obsidian are affected. Other plugins, applications, and external tools can still change the files.
- Some embedded and preview contexts depend on Obsidian's view behavior; protection is not guaranteed in every context.
- Imported URLs and system paths must resolve to existing items in the current vault. Rules do not automatically follow later renames.
- New system-path imports require desktop Obsidian. Once imported, saved vault-relative paths work on mobile.

## Documentation

- [Full user documentation](https://mrkazzila.github.io/Read-Only-View/)
- [Matching modes, glob patterns, and path imports](https://mrkazzila.github.io/Read-Only-View/docs/path-rules)
- [Path tester and diagnostics](https://mrkazzila.github.io/Read-Only-View/docs/path-tester)
- [Mobile usage](https://mrkazzila.github.io/Read-Only-View/guides/mobile-reading-view)
- [Frequently asked questions](https://mrkazzila.github.io/Read-Only-View/faq)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for source builds, local development, desktop/mobile testing, and documentation maintenance. Project activity is available in the [Star History dashboard](https://mrkazzila.github.io/Read-Only-View/star-history).

## License

Licensed under [0BSD](LICENSE).
