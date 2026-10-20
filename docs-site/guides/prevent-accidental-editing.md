---
title: How to Prevent Accidental Editing in Obsidian
description: Prevent accidental edits in Obsidian with protected reference folders and editable drafts. Compare standard Reading view with enforced read-only behavior.
---
# How to Prevent Accidental Editing in Obsidian

If you mostly read reference notes, configure Read Only View to keep those notes in Reading view. It helps when an unintended tap, click, or view switch takes you into editing while you are trying to read.

## Reading view vs read-only protection {#reading-view-vs-read-only}

Obsidian's built-in **Reading view** lets you read formatted Markdown. **Live Preview** and **Source mode** are editing modes. You can choose **Settings → Editor → Default view for new tabs → Reading view** if you only want new tabs to start in Reading view. You can still switch back to editing. See [Obsidian's views and editing modes](https://obsidian.md/help/edit-and-read).

Read Only View adds enforcement for paths you select: it returns protected Markdown notes to Reading view and blocks input in supported Markdown editors. It does not create an operating-system read-only file attribute.

| What you need | Setup |
| --- | --- |
| Start new tabs in Reading view and switch freely | Obsidian's default view setting |
| Keep reference notes in Reading view after an accidental mode switch | Read Only View with Include rules |
| Keep most notes protected, with editable writing folders | Read Only View in All Markdown files mode with Excludes |

Use the built-in setting if it solves your problem. For enforced protection, follow the folder setup below or [make one note read-only](./make-note-read-only.md).

## Separate reading notes from working notes

A practical setup keeps reference material protected and daily writing editable:

1. [Install Read Only View](../index.md#installation) and open its settings.
2. Keep **Enabled** on and choose **Only matched paths**.
3. Keep **Use glob patterns** off under **Advanced → Matching**.
4. Add enabled **Include** rules for `Reference/` and `Archive/`.
5. If needed, add an **Exclude** rule for `Reference/Drafts/`.
6. Wait for **Saved.** and check a representative note with [Path tester](../docs/path-tester.md).

Notes outside those includes remain editable unless another rule matches them. If you mainly read the entire vault, follow [the whole-vault setup with editable exceptions](./make-all-notes-read-only.md).

## Make editing deliberate

Use **Disable read-only mode** in the Command Palette before editing protected material. This pauses protection globally; it does not automatically resume. Run **Enable read-only mode** when you finish. **Re-apply rules now** enforces the current configuration across open Markdown notes.

For a continuing exception, use an exclude rule instead of repeatedly pausing protection.

## Phones, tablets, and preview contexts

An unwanted switch into editing can interrupt reading and bring up the keyboard on a touch device. Keeping matching notes in Reading view helps reduce these interruptions. See the [mobile guide](./mobile-reading-view.md) for configuration details.

The plugin also blocks editor input in supported CodeMirror-backed Markdown contexts, including some preview contexts. Coverage of every hover or embedded view is not guaranteed because it depends on Obsidian's internal behavior.

## Protection is not access control

Read Only View does not enforce security permissions, make files immutable, or stop another plugin or application from changing them. Its purpose is to reduce accidental edits during normal reading in Obsidian. It does not replace backups or file-access controls.
