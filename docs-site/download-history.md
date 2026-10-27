---
title: Plugin Download History
description: Official published download totals and historical changes for the Read Only View Obsidian plugin.
---

<script setup>
import DownloadHistory from './.vitepress/components/DownloadHistory.vue';
</script>

# Read-Only View — Download History

<DownloadHistory />

## About these numbers

Data comes from the official [Obsidian plugin statistics](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugin-stats.json), using the `read-only-view` entry. Downloads are not unique users or active installations. Updates and repeat downloads can contribute to totals.

History uses the last published file snapshot per UTC day, starting from the first public plugin release on February 23, 2026. Dates represent publication of statistics, not the actual time of downloads. The source can be delayed or corrected; negative changes remain visible as source corrections. An absent plugin entry is not treated as zero.

Daily collection runs at 03:17 UTC, subject to GitHub scheduling delays. Missing dates remain gaps, and changes compare adjacent available observations with their full interval. The 7- and 30-day cards require both exact boundary dates relative to the latest snapshot; otherwise they show **Insufficient data**. No missing values are estimated.

The downloadable JSON preserves each snapshot's source commit and original `updated` timestamp. The browser makes no API requests and this page contains no visitor analytics.

See also [Star History](./star-history) and the [maintenance instructions](https://github.com/mrKazzila/Read-Only-View/blob/master/CONTRIBUTING.md#download-history-maintenance).
