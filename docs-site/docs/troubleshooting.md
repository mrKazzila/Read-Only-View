---
title: Why Is My Obsidian Note Read-Only or Still Editable?
description: Troubleshoot Read Only View rules when a note stays editable, remains read-only after disabling an Include, or does not reflect saved settings.
---
# Why Is My Obsidian Note Read-Only or Still Editable?

Start with **Path tester** in **Settings → Read Only View**. Enter the specific Markdown note path and check its resolved path, matching rules, and final **Read-only** or **Editable** status. This separates a rule-configuration problem from a view that has not reflected the configuration yet.

## Why is my note still editable after I added an Include? {#still-editable}

An include protects a Markdown note only while the plugin is enabled and no enabled exclude matches. Check these points in order:

1. Confirm the global **Enabled** toggle is on and the file is a Markdown note.
2. Look for an **Exclude** match in Path tester. Excludes always win; adding another include cannot override one.
3. In **Only matched paths**, confirm the Include row is enabled and its source resolves without an inline error.
4. Check **Advanced → Matching**. Use `Reference/` for a folder with glob matching off, or `Reference/**` with glob matching on. With globs off, `*` and `?` are literal characters.
5. Check spelling and capitalization. **Case sensitive** is on by default. Imported URLs and system paths must still resolve to existing items in the current vault.
6. If the note was moved or renamed, update the saved path. Imported rules do not automatically follow renames.

For example, Include `Reference/` and Exclude `Reference/Drafts/` leave `Reference/Drafts/Plan.md` editable. Disable or narrow that exclude if you want the note protected.

If settings show a rule-limit warning, review which rules were ignored. See [Path rules](./path-rules.md#verify-the-result) for the limits.

## Why is my note read-only when I want to edit it? {#unexpectedly-read-only}

Check **Mode** first. New installations use **All Markdown files**, which protects Markdown notes even without include rules. Choose **Only matched paths** for selected-path protection, or add an enabled exclude for an exception.

In **Only matched paths**, check every matching include in Path tester. A broad include such as `Reference/` in prefix mode, or `**` in glob mode, may protect the note alongside its individual rule.

For example, a vault in **All Markdown files** mode needs an Exclude for `Daily Notes/` to leave that folder editable with glob matching off. With glob matching on, use `Daily Notes/**`. See the [daily notes example](../guides/make-all-notes-read-only.md#except-daily-notes).

## Why does disabling an Include not let me edit the note? {#disabled-include}

Either **All Markdown files** is active or another enabled include still matches. Disabling one rule does not override those other sources of protection.

For a temporary exception, keep an **Exclude** row for the note: enable the exclude while editing, then disable it to restore protection. Its path stays saved. To pause enforcement for every note, run **Disable read-only mode** and later **Enable read-only mode**. See [temporarily disabling rules](./path-rules.md#temporarily-disable-rules).

## Why does Path tester disagree with the open note? {#view-not-updated}

Confirm you tested the actual note path and waited for **Saved.** after editing rules. If settings report **Save failed.**, the changes have not saved successfully.

Run **Re-apply rules now** from the Command Palette, then reopen the note if necessary. An **Editable** result means Read Only View is not enforcing protection; you may still need to switch the note from Reading view to editing yourself.

If Path tester reports **Read-only** but editing remains possible in a hover, embedded, or nonstandard view, that context may depend on Obsidian internals. Protection is not guaranteed in every such view, and it does not prevent another plugin or application from modifying files.

If the problem continues, [report an issue](https://github.com/mrKazzila/Read-Only-View/issues) with your Obsidian and plugin versions, platform, mode, matching settings, and a minimal rule example. Use anonymized paths and describe whether it occurs in a normal note tab or a preview. See [Path tester](./path-tester.md) for the available diagnostics.
