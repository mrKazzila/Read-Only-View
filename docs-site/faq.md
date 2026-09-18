---
title: Read Only View FAQ
description: Answers about read-only Obsidian notes and folders, temporary editing, mobile support, Markdown files, local matching, and file-permission limitations.
---
# Frequently asked questions

## Can I make an Obsidian note read-only?

You can keep it in Reading view with Read Only View. Choose **Only matched paths** and add an enabled **Include** for the note. The plugin enforces view behavior and blocks input in supported Markdown editors; it does not make the underlying file immutable. Follow the [single-note guide](./guides/make-note-read-only.md).

## Can I make an entire folder read-only?

Yes, for Markdown note views. With glob matching off, include a folder such as `Reference/` to cover its notes and subfolders. Add **Exclude** rules for editable exceptions. Attachments are unaffected. See the [folder guide](./guides/make-folder-read-only.md).

## Does Read Only View change filesystem permissions?

No. It changes Obsidian view behavior only. It is not an operating-system lock, security boundary, or access-control system.

## Can another application still edit the Markdown file?

Yes. Other applications, external tools, and plugins can still change files. Read Only View is intended to prevent accidental editing while reading in Obsidian.

## Can I temporarily edit a matched note?

Yes. Run **Disable read-only mode** in the Command Palette, switch to editing, then run **Enable read-only mode** when finished. This pauses protection globally and does not resume automatically.

To exempt only a particular note or folder, add an enabled **Exclude** rule and remove or disable it later. In **Only matched paths**, disabling an include row also stops that rule from protecting notes, provided no other include matches. In **All Markdown files**, disabling an include has no effect.

## Does it work on mobile?

Yes. The plugin supports desktop and mobile and requires Obsidian **1.10.3 or newer**. Narrow settings panes use a stacked layout. New absolute system paths can only be imported on desktop; their saved vault-relative paths remain portable to mobile. See the [mobile guide](./guides/mobile-reading-view.md).

## Are network requests required?

The plugin makes no network requests during normal operation. Rule matching stays local. Downloading the plugin or its updates is separate from that operation.

## Does it modify my Markdown files?

The plugin does not rewrite Markdown content to enforce read-only behavior. It controls note views and editor input and saves its own configuration as plugin data. It does not add frontmatter or permission markers to notes.

## Why are all my notes in Reading view?

New installations default to **All Markdown files** mode with **Enabled** on. Switch to **Only matched paths** to protect only selected paths, or add excludes for working notes and folders.

## Why does a matching note remain editable?

Check that **Enabled** is on, the note is Markdown, and an enabled exclude does not match. In **Only matched paths**, an enabled include must match. Check case sensitivity and glob settings with [Path tester](./docs/path-tester.md).

Some hover, embedded, or nonstandard editor contexts depend on Obsidian internals. Protection is not guaranteed in every such context.

## Will a rule follow a renamed note?

Imported rules do not automatically follow later renames. Review the saved path after moving or renaming a note or folder and verify the new note path in **Path tester**.

## How do I switch all Obsidian notes to Reading view?

Select **All Markdown files** with **Enabled** on. Alternatively, select **Only matched paths**, enable **Use glob patterns**, and add an enabled Include `**`. Enabled excludes still win. Follow the [whole-vault guide](./guides/make-all-notes-read-only.md).

## Can I protect a folder but keep one note editable?

Yes. With glob matching off, include `Reference/` and exclude `Reference/Working notes.md`. For an exact-file exception in either matching mode, use the note's Obsidian URL. See the [folder and single-note exception example](./guides/make-folder-read-only.md#leave-one-note-editable).

## Can I use an Obsidian URL or system path instead of a vault path?

Yes. The rule's **Value** field accepts all three. URLs must resolve to an existing Markdown note in the current vault; system-path imports are desktop-only and must point inside that vault. Successful system-path imports save portable vault-relative paths. See [source formats and examples](./docs/path-rules.md#import-a-note-or-folder).

## Can I disable a rule temporarily without retyping the path later?

Yes. Uncheck the rule row's **Enabled** checkbox, then recheck it when needed. Its path and type stay saved. Other includes or **All Markdown files** may still protect the note; a saved exclude can provide a temporary exception in either mode. See [temporarily disabling rules](./docs/path-rules.md#temporarily-disable-rules).

## Can I check whether a note will be read-only by entering its path?

Yes. Paste a specific note path into **Path tester** in the plugin settings. It shows source resolution, matching rules, and the final **Read-only** or **Editable** status. See [how to test a note path](./docs/path-tester.md#test-a-note).

## Can I use wildcards such as *, **, and ? in path rules?

Yes, after enabling **Advanced → Matching → Use glob patterns**. Use `*` within one path segment, `**` across folders, and `?` for one non-slash character. With glob matching off, these characters are literal. See [wildcard examples](./docs/path-rules.md#glob-patterns).

## Can I turn case-sensitive path matching on or off?

Yes. Use **Advanced → Matching → Case sensitive**. It is on by default; turn it off to ignore case when matching include and exclude paths. See [case-sensitive matching examples](./docs/path-rules.md#case-sensitivity).

## Can I keep daily notes editable while protecting the rest of my vault?

Yes. In **All Markdown files**, exclude your daily-notes folder: `Daily Notes/` with glob matching off, or `Daily Notes/**` with it on. Use your actual folder path; the plugin does not identify daily notes automatically. See the [daily notes and Inbox example](./guides/make-all-notes-read-only.md#except-daily-notes).

## Can I protect notes in a folder without protecting its subfolders?

Yes. Select **Only matched paths**, enable **Use glob patterns**, and include `Reference/*.md`. Remove or disable broader includes if they also protect the subfolders. See the [direct notes versus subfolders example](./guides/make-folder-read-only.md#without-subfolders).

## How do I troubleshoot a note that is protected or editable unexpectedly?

Start with **Path tester**, then check the global Enabled toggle, selected mode, matching excludes, and enabled includes. Follow [Troubleshooting](./docs/troubleshooting.md) for each result, including what to do when disabling an include does not remove protection.
