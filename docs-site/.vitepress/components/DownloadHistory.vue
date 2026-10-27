<script setup>
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import data from '../generated/download-analytics.json';

const selected = ref('downloads');
const signed = (value) => value == null ? 'Insufficient data' : `${value > 0 ? '+' : ''}${value.toLocaleString('en-US')}`;
const timestamp = (date) => Date.parse(`${date}T00:00:00Z`);
const rows = computed(() => data.rows.filter((row) => row[selected.value] != null));
const chart = computed(() => {
  const values = rows.value;
  if (!values.length) return { points: [], segments: [], min: 0, max: 0 };
  const min = Math.min(0, ...values.map((row) => row[selected.value]));
  const max = Math.max(0, ...values.map((row) => row[selected.value]));
  const first = timestamp(values[0].date);
  const last = timestamp(values.at(-1).date);
  const points = values.map((row) => ({ ...row,
    x: first === last ? 380 : 72 + (timestamp(row.date) - first) / (last - first) * 616,
    y: min === max ? 140 : 236 - (row[selected.value] - min) / (max - min) * 192,
  }));
  const segments = [];
  if (selected.value === 'downloads') {
    for (let i = 1; i < points.length; i++) {
      if (timestamp(points[i].date) - timestamp(points[i - 1].date) === 86400000) {
        segments.push({ from: points[i - 1], to: points[i] });
      }
    }
  }
  return { points, segments, min, max };
});
</script>

<template>
  <section aria-label="Download history dashboard">
    <div class="download-cards">
      <div><span>Total downloads</span><strong>{{ data.total?.toLocaleString('en-US') ?? 'Insufficient data' }}</strong></div>
      <div><span>Change over 7 days</span><strong>{{ signed(data.last_7_days) }}</strong></div>
      <div><span>Change over 30 days</span><strong>{{ signed(data.last_30_days) }}</strong></div>
    </div>
    <p>Latest source snapshot: {{ data.as_of ?? 'Not collected yet' }} (UTC).</p>
    <h2>Download growth</h2>
    <label for="download-series">Data series </label>
    <select id="download-series" v-model="selected">
      <option value="downloads">Total downloads</option>
      <option value="delta">Change between observations</option>
    </select>
    <p v-if="selected === 'delta'">Each point represents the change over its labelled interval, which may span several days. Negative values are source corrections.</p>
    <p v-else>Published totals; missing dates remain gaps. Source statistics may be delayed.</p>
    <p v-if="!rows.length" role="status">No data available for this series yet.</p>
    <svg v-else class="download-chart" viewBox="0 0 760 280" role="img" aria-labelledby="download-chart-title download-chart-description">
      <title id="download-chart-title">{{ selected === 'downloads' ? 'Total downloads by date' : 'Download changes between observations' }}</title>
      <desc id="download-chart-description">Exact dates, interval boundaries and values are in the table below. Missing dates are not interpolated.</desc>
      <line x1="72" y1="236" x2="688" y2="236" class="axis" />
      <text x="4" y="44">{{ chart.max.toLocaleString('en-US') }}</text>
      <text x="4" y="236">{{ chart.min.toLocaleString('en-US') }}</text>
      <line v-for="segment in chart.segments" :key="segment.to.date" :x1="segment.from.x" :y1="segment.from.y" :x2="segment.to.x" :y2="segment.to.y" class="trend" />
      <circle v-for="point in chart.points" :key="point.date" :cx="point.x" :cy="point.y" r="3" class="point">
        <title>{{ selected === 'delta' ? `${point.from} → ${point.date}: ${signed(point.delta)}${point.delta < 0 ? ' (source correction)' : ''}` : `${point.date}: ${point.downloads} downloads` }}</title>
      </circle>
      <text x="72" y="270">{{ rows[0].date }}</text>
      <text x="688" y="270" text-anchor="end">{{ rows.at(-1).date }}</text>
    </svg>
    <details v-if="data.rows.length">
      <summary>Read exact dates and values</summary>
      <div class="download-table" tabindex="0" aria-label="Download history values">
        <table>
          <thead><tr><th>Snapshot (UTC)</th><th>Downloads</th><th>Interval (UTC)</th><th>Change</th></tr></thead>
          <tbody><tr v-for="row in data.rows" :key="row.date">
            <td>{{ row.date }}</td><td>{{ row.downloads.toLocaleString('en-US') }}</td>
            <td>{{ row.from ? `${row.from} → ${row.date}` : 'Unknown' }}</td>
            <td>{{ signed(row.delta) }}{{ row.delta < 0 ? ' (source correction)' : '' }}</td>
          </tr></tbody>
        </table>
      </div>
    </details>
    <p><a :href="withBase('/data/download-history.json')">Download aggregate history JSON</a></p>
  </section>
</template>

<style scoped>
.download-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.download-cards > div { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.download-cards span, .download-cards strong { display: block; }
.download-cards strong { margin-top: 8px; font-size: 1.25rem; }
select { max-width: 100%; padding: 8px; border: 1px solid var(--vp-c-divider); border-radius: 4px; background: var(--vp-c-bg); }
.download-chart { display: block; width: 100%; margin: 20px 0; overflow: visible; }
.download-chart text { fill: var(--vp-c-text-2); font-size: 14px; }
.axis { stroke: var(--vp-c-divider); }
.trend { stroke: var(--vp-c-brand-1); stroke-width: 2; }
.point { fill: var(--vp-c-brand-1); }
.download-table { overflow-x: auto; max-height: 420px; }
.download-table table { margin: 12px 0; }
summary { cursor: pointer; }
@media (max-width: 600px) {
  .download-cards { grid-template-columns: 1fr; }
  .download-chart text { font-size: 20px; }
}
</style>
