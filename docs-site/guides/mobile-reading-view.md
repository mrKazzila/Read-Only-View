---
title: Keep Obsidian Notes in Reading View on Mobile
description: Use Read Only View on phones and tablets to keep reference notes in Reading view, configure folder rules, and allow deliberate edits.
---
# Keep Obsidian Notes in Reading View on Mobile

Read Only View supports Obsidian on phones and tablets as well as desktop. Use it for notes you mainly consume: reference material, checklists, summaries, or an archive.

An accidental switch into editing can open the keyboard and interrupt reading. The plugin returns matching Markdown notes to Reading view and blocks editor input in supported editors. It does not promise to suppress every keyboard appearance or control every plugin-provided view.

## Set up a reading folder

1. In Obsidian, open **Settings → Community plugins → Browse**. Search for **Read Only View**, then **Install** and **Enable** it.
2. Open **Settings → Read Only View**. Keep **Enabled** on and select **Only matched paths**.
3. Under **Path rules**, add an enabled **Include** rule for `Reference/`.
4. Keep **Use glob patterns** off under **Advanced → Matching**.
5. Wait for **Saved.**, then open a note in that folder.

Use [Path tester](../docs/path-tester.md) with a specific note such as `Reference/Travel checklist.md` to check the result. On narrow screens, settings controls and rule rows use a stacked layout.

For an entire vault used mainly for reading, keep **All Markdown files** selected and add **Exclude** rules for notes you need to edit.

## Use portable paths

Vault-relative paths work on desktop and mobile. Obsidian URLs must resolve to an existing Markdown note in the current vault.

Importing a new absolute system path is desktop-only. Once imported, the rule stores its resolved vault-relative path, so that saved rule remains portable to mobile. You can enter the vault-relative path directly on your phone; no system path is needed.

## Edit when you intend to

Run **Disable read-only mode**, switch to editing, and make your change. Then run **Enable read-only mode**. The disable command pauses enforcement for all notes, not just the current one.

For a permanent writing area, add an **Exclude** rule such as `Reference/Drafts/`. See [folder rules](./make-folder-read-only.md).

## Limits and privacy

Only Markdown notes are affected. The plugin does not change file permissions or prevent external applications from editing notes. Rule matching stays local, and the plugin makes no network requests. Installation and updates are separate from normal plugin operation.
