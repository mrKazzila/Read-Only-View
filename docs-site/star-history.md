---
title: GitHub Star History
description: Privacy-safe aggregate GitHub star history and observed daily totals for Read-Only View.
---

<script setup>
import StarHistory from './.vitepress/components/StarHistory.vue';
</script>

# Read-Only View — Star History

<StarHistory />

## About these numbers

Data comes from the official [GitHub Star History and Count API](https://docs.github.com/en/rest/activity/starring#get-repository-star-history).
Only aggregate counts are collected. This page makes no GitHub API requests and contains no visitor analytics.

Daily collection runs at 03:17 UTC (GitHub may delay scheduled runs). Total snapshots represent collection time, not end-of-day counts. The 7- and 30-day cards require snapshots on both boundary dates and remain unavailable until enough observations exist. Missing intermediate dates do not invalidate a difference between known boundaries; they cannot reveal individual daily changes.

The reconstructed curve sums the API's daily counts from the first available week. It is separate from observed totals and may change when the API revises its history. We cannot infer historical removed stars or exact historical net totals. API week/day boundaries are not guaranteed to align with UTC; displayed dates use the UTC date of the week timestamp plus the day offset. The first week can include days before repository creation.

An event's three-day window covers its previous day, event day and following day. Its change compares observed totals on event day −2 and event day +1. It is unavailable without both snapshots. Calendar alignment with API history is approximate.

Maintain events and run the collector using the [repository Star History instructions](https://github.com/mrKazzila/Read-Only-View#star-history).
