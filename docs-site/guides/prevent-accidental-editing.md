---
title: How to Prevent Accidental Editing in Obsidian
description: Keep reference notes in Reading view while leaving working notes editable, and deliberately pause Read Only View when you need to make changes.
---
# How to Prevent Accidental Editing in Obsidian

If you mostly read reference notes, configure Read Only View to keep those notes in Reading view. It helps when an unintended tap, click, or view switch takes you into editing while you are trying to read.

## Separate reading notes from working notes

A practical setup keeps reference material protected and daily writing editable:

1. [Install Read Only View](./make-note-read-only.md#protect-a-reference-note) and open its settings.
2. Keep **Enabled** on and choose **Only matched paths**.
3. Keep **Use glob patterns** off under **Advanced → Matching**.
4. Add enabled **Include** rules for `Reference/` and `Archive/`.
5. If needed, add an **Exclude** rule for `Reference/Drafts/`.
6. Wait for **Saved.** and check a representative note with [Path tester](../docs/path-tester.md).

Notes outside those includes remain editable unless another rule matches them. If you mainly read the entire vault, use **All Markdown files** with exclusions for working folders instead.

## Make editing deliberate

Use **Disable read-only mode** in the Command Palette before editing protected material. This pauses protection globally; it does not automatically resume. Run **Enable read-only mode** when you finish. **Re-apply rules now** enforces the current configuration across open Markdown notes.

For a continuing exception, use an exclude rule instead of repeatedly pausing protection.

## Phones, tablets, and preview contexts

An unwanted switch into editing can interrupt reading and bring up the keyboard on a touch device. Keeping matching notes in Reading view helps reduce these interruptions. See the [mobile guide](./mobile-reading-view.md) for configuration details.

The plugin also blocks editor input in supported CodeMirror-backed Markdown contexts, including some preview contexts. Coverage of every hover or embedded view is not guaranteed because it depends on Obsidian's internal behavior.

## Protection is not access control

Read Only View does not enforce security permissions, make files immutable, or stop another plugin or application from changing them. Its purpose is to reduce accidental edits during normal reading in Obsidian. It does not replace backups or file-access controls.
