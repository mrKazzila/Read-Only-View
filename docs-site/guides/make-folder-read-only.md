---
title: How to Make a Folder Read-Only in Obsidian
description: Keep Markdown notes in a reference or archive folder in Reading view, with include rules for folders and exclude rules for one editable note or a drafts subfolder.
---
# How to Make a Folder Read-Only in Obsidian

Add a folder path such as `Reference/` as an **Include** rule in Read Only View. With ordinary path matching, Markdown notes inside that folder and its subfolders stay in Reading view.

## Protect a reference or archive folder

1. [Install and enable Read Only View](./make-note-read-only.md#protect-a-reference-note).
2. Open **Settings → Read Only View**. Keep **Enabled** on and select **Only matched paths**.
3. Under **Advanced → Matching**, keep **Use glob patterns** off.
4. Under **Path rules**, add an enabled **Include** row with **Value** set to `Reference/`.
5. Wait for **Saved.** and open a Markdown note inside that folder.

Use a vault-relative path, not the vault's name. Keep the trailing `/` to make the folder intent clear. For an archive, use `Archive/`; for a nested folder, use `Notes/Summaries/`.

## How do I make a folder read-only but leave one note editable? {#leave-one-note-editable}

Add an **Exclude** for that note alongside the folder's **Include**. With **Only matched paths** selected and **Use glob patterns** off, enable both rows:

| Type | Value |
| --- | --- |
| Include | `Reference/` |
| Exclude | `Reference/Working notes.md` |

`Reference/Handbook.md` and `Reference/Policies/Security.md` stay in Reading view, while `Reference/Working notes.md` remains editable. Excludes always win, even when an include also matches.

Ordinary file paths use prefix matching with glob matching off. To exempt exactly one existing note, paste its Obsidian URL into the exclude row instead. With glob matching on, use `Reference/**` for the folder include and `Reference/Working notes.md` for the note exclude.

Check both the exception and another note using [Path tester](../docs/path-tester.md). To protect the exception again without retyping its path, uncheck the exclude row's **Enabled** checkbox; recheck it when you want to edit that note again.

## Leave drafts editable

Add these two rules:

| Type | Value |
| --- | --- |
| Include | `Reference/` |
| Exclude | `Reference/Drafts/` |

The resulting behavior is:

| Note | Result |
| --- | --- |
| `Reference/Handbook.md` | Read-only |
| `Reference/Policies/Security.md` | Read-only |
| `Reference/Drafts/New policy.md` | Editable |
| `Inbox/Capture.md` | Editable, unless another include rule matches |

An enabled **Exclude** always wins, even if another include rule also matches. Check any note with [Path tester](../docs/path-tester.md).

## Protect everything except a working folder

If almost the whole vault is for reading, select **All Markdown files** and add an **Exclude** rule for `Inbox/`. Include rules are saved but inactive in this mode.

If you enable glob matching, use `Reference/**` instead of the plain folder rule. See [Path rules](../docs/path-rules.md#glob-patterns) before changing the matching mode, because it applies to ordinary path rules throughout the configuration.

## How do I make only the notes directly in a folder read-only, without subfolders? {#without-subfolders}

Use the glob `Reference/*.md` in **Only matched paths** mode. A single `*` cannot cross `/`, so it selects Markdown notes directly inside `Reference/` without selecting notes in nested folders.

1. Keep the global **Enabled** toggle on and select **Only matched paths**.
2. Under **Advanced → Matching**, turn on **Use glob patterns**.
3. Add an enabled **Include** with **Value** set to `Reference/*.md`.
4. Disable broader includes such as `Reference/**` or `**` if you want the subfolders to remain editable.
5. Wait for **Saved.** and test both a direct note and a nested note with [Path tester](../docs/path-tester.md).

| Note | With Include `Reference/*.md` | With Include `Reference/**` |
| --- | --- | --- |
| `Reference/Handbook.md` | Read-only | Read-only |
| `Reference/Policies/Security.md` | Editable | Read-only |
| `Inbox/Capture.md` | Editable | Editable |

This comparison assumes **Only matched paths**, glob matching on, and only the include shown in each column, with no excludes. In **All Markdown files**, nested Markdown notes remain protected unless excluded.

Glob matching applies to all ordinary path rules. Review existing folder rules when turning it on: a prefix such as `Inbox/` needs to become `Inbox/**` to continue matching its contents. With glob matching off, `Reference/*.md` treats `*` literally and will not behave as this example describes.

## What a folder rule does not lock

The rule affects Markdown note views, not the directory's filesystem permissions. It does not protect PDFs, images, other attachments, or changes made by external tools. Review rules after moving or renaming notes and folders; imported paths do not automatically track renames.

For reading on a phone or tablet, see [Reading view on mobile](./mobile-reading-view.md).
