---
layout: home
title: Read Only View for Obsidian
description: Keep selected notes and folders in Obsidian Reading view. Prevent accidental edits on desktop, phone, and tablet with local path rules.
hero:
  name: Read Only View
  text: Right click → Lock → Reading
  tagline: Lock a Markdown note or folder from File Explorer to prevent accidental edits. Keep reference notes in Reading view on desktop, phone, and tablet.
  actions:
    - theme: brand
      text: Install from Community Plugins
      link: https://community.obsidian.md/plugins/read-only-view
    - theme: alt
      text: Lock notes and folders
      link: /guides/lock-notes-and-folders
    - theme: alt
      text: GitHub
      link: https://github.com/mrKazzila/Read-Only-View
features:
  - title: Lock from File Explorer
    details: Lock notes or folders from File Explorer. Include paths to protect them and exclude drafts to keep them editable.
    link: /guides/lock-notes-and-folders
  - title: Check a rule before relying on it
    details: The built-in Path tester shows the resolved path, matching rules, and whether a note is Read-only or Editable.
    link: /docs/path-tester
  - title: Read on mobile and tablet
    details: Keep reference notes in Reading view while browsing. Matching runs locally, with no network requests from the plugin.
    link: /guides/mobile-reading-view
---

<script setup>
import contextMenuScreenshot from "../docs/images/documentation/Read-Only-View-Context-menu.png";
</script>

## Get started

In Obsidian, open **Settings → Community plugins → Browse**, search for **Read Only View**, then select **Install** and **Enable**. Requires Obsidian **1.10.3 or newer**; supports desktop and mobile.

1. Open **Settings → Read Only View**, keep **Enabled** on, and select **Only matched paths** to protect selected notes and folders.
2. In **File Explorer**, use **Right click → Lock → Reading** on a Markdown note or folder. **Lock → Reading** is one menu item.
3. Open the note to read it. Folder locks also cover Markdown notes in subfolders.

<img :src="contextMenuScreenshot" alt="File Explorer context menu with Lock → Reading selected for a Markdown note" />

The shortcut creates or enables an Include rule; enabled Excludes still win. Choose **Unlock** to disable the target’s Include rules. See [Lock and Unlock notes and folders](./guides/lock-notes-and-folders.md) for exceptions and notes that remain protected.

::: tip Protect the whole vault
New installations use **All Markdown files** mode. Keep that mode if you want every Markdown note protected, and add Excludes for editable exceptions. [Keep all notes in Reading view](./guides/make-all-notes-read-only.md).
:::

## Find your workflow

- [Lock and Unlock from File Explorer](./guides/lock-notes-and-folders.md): manage protection from the context menu.
- [How do I keep all Obsidian notes in Reading view?](./guides/make-all-notes-read-only.md): use **All Markdown files** or an Include glob `**`.
- [Make one note read-only](./guides/make-note-read-only.md): keep a reference note in Reading view.
- [Make a folder read-only](./guides/make-folder-read-only.md): protect `Reference/` or `Archive/` while leaving drafts editable.
- [Explain why a note is read-only](./guides/why-is-my-note-read-only.md): inspect matching rules and folder exceptions.
- [Show protected notes in File Explorer](./guides/show-locked-notes-in-file-explorer.md): enable optional lock indicators.
- [Prevent accidental editing](./guides/prevent-accidental-editing.md): separate reading from deliberate editing.
- [Use Reading view on mobile](./guides/mobile-reading-view.md): browse notes on a phone or tablet.

See [Path rules](./docs/path-rules.md) for matching syntax and [Path tester](./docs/path-tester.md) for diagnostics.

## Questions about path rules

- [How do I keep daily notes editable in a read-only vault?](./guides/make-all-notes-read-only.md#except-daily-notes)
- [How do I protect a folder without its subfolders?](./guides/make-folder-read-only.md#without-subfolders)
- [Why is my note read-only or still editable?](./docs/troubleshooting.md)

- [Can I protect a folder but leave one note editable?](./guides/make-folder-read-only.md#leave-one-note-editable)
- [Can I use an Obsidian URL, system path, or vault path?](./docs/path-rules.md#import-a-note-or-folder)
- [Can I temporarily disable a rule without deleting its path?](./docs/path-rules.md#temporarily-disable-rules)
- [How do I check whether a note will be read-only?](./docs/path-tester.md#test-a-note)
- [Can I use wildcards in path rules?](./docs/path-rules.md#glob-patterns)
- [Can I make path matching case-sensitive?](./docs/path-rules.md#case-sensitivity)

## What protection means

Read Only View returns matching Markdown notes to Reading view and blocks editor input in supported Markdown editors. It changes Obsidian view behavior; it does not change filesystem permissions, rewrite your Markdown files, or prevent other applications from editing them. See the [FAQ](./faq.md) for limitations and temporary editing.
