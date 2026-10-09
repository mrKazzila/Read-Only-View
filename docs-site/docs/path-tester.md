---
title: How to Check Whether an Obsidian Note Will Be Read-Only
description: Diagnose whether an Obsidian note is Read-only or Editable using source resolution, matching Include and Exclude rules, and the all-Markdown preset.
---

<script setup>
import settingsScreenshot from "../../docs/images/documentation/Read-Only-View-path-tester-read-only-1200x800.png";
</script>
# How to Check Whether an Obsidian Note Will Be Read-Only

**Path tester** is built into **Settings → Read Only View**. Use it to understand why a specific note is protected or remains editable; this website does not run the tester or access your vault.

## Can I test a note path before opening the note? {#test-a-note}

Yes. **Path tester** evaluates the current configuration for the supplied path without requiring you to open the note. Obsidian URLs and system paths must resolve to existing items; enter a specific Markdown note to get a read-only result.

1. Configure your [Path rules](./path-rules.md) and wait for **Saved.**
2. Find **Path tester** in the plugin settings.
3. Paste a vault-relative note path such as `Reference/Handbook.md`, an Obsidian URL, or a desktop system path.
4. Review the detected source type and resolved vault path.
5. Check the matching include and exclude rules, the all-Markdown preset explanation, and the final **Read-only** or **Editable** status.

<img :src="settingsScreenshot" alt="Path tester resolving an Obsidian URL and reporting Read-only" />

## Interpret a result

With **Enabled** on, **Only matched paths** selected, glob matching off, an **Include** for `Reference/`, and an **Exclude** for `Reference/Drafts/`:

| Tested path | Expected result | Reason |
| --- | --- | --- |
| `Reference/Handbook.md` | Read-only | Include matches; no exclude matches |
| `Reference/Drafts/Handbook.md` | Editable | Exclude wins |
| `Inbox/Capture.md` | Editable | No include matches |

In **All Markdown files**, a note can be read-only without any include matches. The preset determines the result unless an exclude matches. Turning **Enabled** off disables protection.

## Explain read-only status from the context menu

Right-click a Markdown note and choose **Explain read-only status** to see its final status, reason, and matching Include/Exclude rules without opening settings.

For a folder, the same action includes nested Markdown notes and reports **ALL PROTECTED**, **MIXED**, **NOT PROTECTED**, or **NO MARKDOWN NOTES**. It shows counts and up to five editable examples to help locate exceptions.

This action only reports the current configuration. It does not change rules, settings, files, or editor state. See [Explain read-only status for notes and folders](../guides/why-is-my-note-read-only.md) for the dialog labels, examples, and an explanation of protection after Unlock.

## Resolve input problems

- **Wrong vault or missing note:** an Obsidian URL must resolve to an existing Markdown note in the current vault.
- **System path on mobile:** import new absolute paths on desktop, or enter the portable vault-relative path instead.
- **Folder instead of a note:** for a system folder, the tester shows the resolved folder and asks for a specific Markdown note before evaluating matches.
- **Unexpected Editable status:** check excludes, the row's Enabled checkbox, letter case, and whether glob matching is on.
- **Unexpected Read-only status:** check whether **All Markdown files** is selected.

The result explains the current configuration; it is not a filesystem-permission check or a guarantee for every embedded view. If open notes do not reflect saved changes, run **Re-apply rules now** from the Command Palette and reopen the note if necessary.

For a step-by-step diagnosis of unexpected results, see [Troubleshooting read-only notes](./troubleshooting.md).
