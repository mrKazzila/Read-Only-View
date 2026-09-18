---
title: How to Make a Note Read-Only in Obsidian
description: Configure Read Only View to keep one Obsidian Markdown note in Reading view, verify its path rule, and temporarily allow editing when needed.
---
# How to Make a Note Read-Only in Obsidian

Use Read Only View with an **Include** rule for the note's vault path. The plugin keeps matching Markdown notes in Reading view to help prevent accidental edits.

## Reading view and protection

Obsidian already provides Reading view and lets you switch between reading and editing. Live Preview is still an editing mode. See [Obsidian's guide to views and editing modes](https://obsidian.md/help/edit-and-read).

Read Only View adds automatic enforcement for selected paths: it returns matching notes to Reading view and blocks editor input in supported Markdown editors. The underlying file does not become read-only at the operating-system level.

## Protect a reference note

1. Open **Settings → Community plugins → Browse**, find **Read Only View**, then **Install** and **Enable** it.
2. Open **Settings → Read Only View** and keep **Enabled** on.
3. Select **Only matched paths**. A new installation defaults to **All Markdown files**, which protects all Markdown notes instead.
4. Under **Path rules**, select **Add rule**. Keep the row enabled, select **Include**, and enter `Reference/Travel checklist.md` in **Value**.
5. Under **Advanced → Matching**, keep **Use glob patterns** off for this example. Keep the path's spelling and capitalization consistent with the vault.
6. Wait for **Saved.**, then open the note.

Paste `Reference/Travel checklist.md` into [Path tester](../docs/path-tester.md). It should report **Read-only** unless an enabled exclude rule matches.

Ordinary paths use prefix matching. To target exactly one existing note, you can also paste its `obsidian://open` URL into the rule. See [Path rules](../docs/path-rules.md) for the distinction.

## Can I temporarily edit this note without deleting its rule? {#temporarily-edit-the-note}

Yes. In **Only matched paths**, uncheck **Enabled** on the note's Include row and wait for **Saved.** The path stays saved. Edit the note, then check the row again to restore protection. This works only if no other enabled include also protects the note.

If a folder rule or `**` also matches, use a saved **Exclude** for the note: enable the exclude to allow editing, then disable it to restore protection. See [how to pause individual rules](../docs/path-rules.md#temporarily-disable-rules).

### Pause protection for all notes

Run **Disable read-only mode** from the Command Palette, then switch the note into editing. This disables enforcement across the vault. When finished, run **Enable read-only mode**.

For an exception limited to this note, add an **Exclude** rule instead. Excludes always take precedence. Remove or disable the exception to protect the note again.

## Limitations

Only Markdown notes are affected. Other applications and plugins can still modify files, and imported note rules do not follow later renames automatically. Some preview and embedded contexts depend on Obsidian's internal view behavior; this is accidental-edit prevention, not an access-control mechanism.

To cover several notes together, follow [Make a folder read-only](./make-folder-read-only.md).
