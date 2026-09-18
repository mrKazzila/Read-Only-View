---
layout: home
title: Read Only View for Obsidian
description: Keep selected notes and folders in Obsidian Reading view. Prevent accidental edits on desktop, phone, and tablet with local path rules.
hero:
  name: Read Only View
  text: Keep selected Obsidian notes in Reading view and prevent accidental edits.
  tagline: Read reference notes comfortably on desktop, phone, and tablet. Choose individual notes, whole folders, or every Markdown note in your vault.
  actions:
    - theme: brand
      text: Install from Community Plugins
      link: https://community.obsidian.md/plugins/read-only-view
    - theme: alt
      text: Read the guides
      link: /guides/make-note-read-only
    - theme: alt
      text: GitHub
      link: https://github.com/mrKazzila/Read-Only-View
features:
  - title: Choose what stays in Reading view
    details: Include notes or folders with Path rules. Exclude drafts and working notes so they remain editable.
  - title: Check a rule before relying on it
    details: The built-in Path tester shows the resolved path, matching rules, and whether a note is Read-only or Editable.
    link: /docs/path-tester
  - title: Read on mobile and tablet
    details: Keep reference notes in Reading view while browsing. Matching runs locally, with no network requests from the plugin.
    link: /guides/mobile-reading-view
---

## Get started

In Obsidian, open **Settings → Community plugins → Browse**, search for **Read Only View**, then select **Install** and **Enable**. Requires Obsidian **1.10.3 or newer**; supports desktop and mobile.

::: tip Choose your scope
New installations use **All Markdown files** mode. To protect selected notes or folders, open **Settings → Read Only View**, select **Only matched paths**, and add an **Include** rule under **Path rules**.
:::

![Read Only View settings with Only matched paths selected](../docs/images/community-images/Read-Only-View-matched-paths-mode-1200x800.png)

## Find your workflow

- [How do I keep all Obsidian notes in Reading view?](./guides/make-all-notes-read-only.md): use **All Markdown files** or an Include glob `**`.
- [Make one note read-only](./guides/make-note-read-only.md): keep a reference note in Reading view.
- [Make a folder read-only](./guides/make-folder-read-only.md): protect `Reference/` or `Archive/` while leaving drafts editable.
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
