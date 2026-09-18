---
title: How to Keep All Obsidian Notes in Reading View
description: Make all Markdown notes in an Obsidian vault read-only using All Markdown files mode or an Include rule with **, while keeping editable exceptions.
---
# How to Keep All Obsidian Notes in Reading View

To keep every Markdown note in your Obsidian vault in Reading view, enable Read Only View and select **All Markdown files**. You can also use an **Include** rule with `**` when glob matching is enabled.

Both options help prevent accidental edits in Obsidian. They do not change filesystem permissions or protect attachments and changes made by other applications.

## How do I make my entire Obsidian vault read-only?

1. Open **Settings → Community plugins → Browse**, search for **Read Only View**, then **Install** and **Enable** it.
2. Open **Settings → Read Only View** and keep **Enabled** on.
3. Select **All Markdown files**. This is the default for new installations.
4. Review existing **Exclude** rules: any enabled matching exclude leaves the note editable.
5. Open a Markdown note, or run **Re-apply rules now** to apply the configuration across open Markdown notes.

No include rules are required. Saved include rules remain available but inactive in this mode. **Use glob patterns** does not need to be enabled for the all-Markdown preset; it still controls how ordinary exclude rules match.

## Can I match all notes with an Include rule and **?

Yes. The `**` glob matches paths at every depth, including notes directly in the vault root.

1. Select **Only matched paths** and keep the global **Enabled** toggle on.
2. Under **Advanced → Matching**, turn on **Use glob patterns**.
3. Under **Path rules**, add an enabled **Include** with **Value** set to `**`.
4. Wait for **Saved.** and check a note with [Path tester](../docs/path-tester.md).

| Tested path | Result with Include `**` and no matching exclude |
| --- | --- |
| `Home.md` | Read-only |
| `Reference/Handbook.md` | Read-only |
| `Archive/2025/Meeting.md` | Read-only |

Only Markdown notes are protected even though `**` can match other path strings. With **Use glob patterns** off, `**` is literal text and does not select all notes. A single `*` cannot cross folder separators.

::: tip Review existing rules when enabling globs
Glob matching is a shared setting for ordinary path rules. Change folder prefixes such as `Reference/` to `Reference/**` when switching to glob mode. Exact imported note rules keep their exact-file behavior.
:::

## How do I keep some notes editable in a read-only vault?

Add enabled **Exclude** rules. Excludes take precedence in both approaches.

| Matching mode | Exclude value | Editable exception |
| --- | --- | --- |
| Glob matching off | `Inbox/` | Markdown notes in Inbox and its subfolders |
| Glob matching on | `Inbox/**` | Markdown notes in Inbox and its subfolders |
| Either mode | `Reference/Working notes.md` | The named note; ordinary paths remain prefixes when globs are off |

For an exact-file exception regardless of matching mode, paste the existing note's Obsidian URL into an **Exclude** row. See [supported path sources](../docs/path-rules.md#import-a-note-or-folder).

## How do I make my vault read-only except for daily notes? {#except-daily-notes}

Use **All Markdown files** with an enabled **Exclude** for the folder where you keep daily notes. For example, protect reference material while keeping your journal and quick captures editable:

1. Open **Settings → Read Only View**, keep **Enabled** on, and select **All Markdown files**.
2. With **Use glob patterns** off, add these enabled **Exclude** rows under **Path rules**:

| Type | Value |
| --- | --- |
| Exclude | `Daily Notes/` |
| Exclude | `Inbox/` |

3. Replace the example folder names with the actual vault-relative paths you use. Read Only View matches paths; it does not detect daily notes by date or automatically read another plugin's folder setting.
4. Wait for **Saved.** and check representative notes with [Path tester](../docs/path-tester.md).

| Tested path | Expected result with only the rules above |
| --- | --- |
| `Daily Notes/2026-09-18.md` | Editable |
| `Daily Notes/2026/09/18.md` | Editable |
| `Inbox/Quick capture.md` | Editable |
| `Reference/Handbook.md` | Read-only |
| `Home.md` | Read-only |

New Markdown notes created under the excluded folders also match those folder rules. A daily note saved elsewhere does not get an exception just because it is a daily note.

If **Use glob patterns** is already on, use `Daily Notes/**` and `Inbox/**` instead. These excludes also work with **Only matched paths** and Include `**`. Review existing rules before changing the shared matching mode.

## Can I temporarily allow editing without deleting my rules?

Run **Disable read-only mode**, switch into editing, then run **Enable read-only mode** when finished. This pauses protection globally and does not resume automatically.

If you use the `**` include in **Only matched paths**, you can instead uncheck that row's **Enabled** checkbox and recheck it later. Other enabled includes may still protect some notes. Disabling an include does not pause **All Markdown files** mode. See [temporarily disabling path rules](../docs/path-rules.md#temporarily-disable-rules).
