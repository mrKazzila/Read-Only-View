<script setup>
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import data from '../generated/star-analytics.json';

const selected = ref('reconstructed');
const rows = computed(() => data.history[selected.value]);
const width = 760;
const height = 280;
const padding = 44;
const timestamp = (date) => Date.parse(`${date}T00:00:00Z`);
const chart = computed(() => {
  const values = rows.value;
  if (!values.length) return { points: [], segments: [], min: 0, max: 0 };
  const first = timestamp(values[0].date);
  const last = timestamp(values.at(-1).date);
  const min = Math.min(...values.map((point) => point.stars));
  const max = Math.max(...values.map((point) => point.stars));
  const points = values.map((point) => ({
    ...point,
    x: first === last ? width / 2 : padding + (timestamp(point.date) - first) / (last - first) * (width - 2 * padding),
    y: max === min ? height / 2 : height - padding - (point.stars - min) / (max - min) * (height - 2 * padding),
  }));
  const segments = [];
  for (let index = 1; index < points.length; index++) {
    if (timestamp(points[index].date) - timestamp(points[index - 1].date) === 86400000) {
      segments.push({ from: points[index - 1], to: points[index] });
    }
  }
  return { points, segments, min, max };
});
const signed = (value) => value == null ? 'Insufficient data' : `${value > 0 ? '+' : ''}${value}`;
const summary = data.summary;
</script>

<template>
  <section aria-label="Star history dashboard" class="star-dashboard">
    <div class="star-cards">
      <div><span>Current stars</span><strong>{{ summary.current_stars ?? 'Insufficient data' }}</strong></div>
      <div><span>Change over 7 days</span><strong>{{ signed(summary.last_7_days) }}</strong></div>
      <div><span>Change over 30 days</span><strong>{{ signed(summary.last_30_days) }}</strong></div>
    </div>
    <p>Latest total snapshot: {{ summary.as_of ?? 'Not collected yet' }} (UTC).
      Dataset updated: {{ data.history.updated_at ?? 'Not collected yet' }}.</p>
    <p>Average daily net change: {{ summary.average_daily_growth == null ? 'Insufficient data' : summary.average_daily_growth.toFixed(2) }}.
      Best observed day: {{ summary.best_growth_day ? `${summary.best_growth_day.date} (${signed(summary.best_growth_day.delta)})` : 'Insufficient data' }}.</p>

    <h2>Star growth</h2>
    <label for="star-series">Data series </label>
    <select id="star-series" v-model="selected">
      <option value="reconstructed">Reconstructed API history</option>
      <option value="snapshots">Observed total snapshots</option>
    </select>
    <p v-if="selected === 'reconstructed'">Cumulative daily counts returned by GitHub, not verified historical totals.
      API day boundaries may differ from UTC; the latest day may be incomplete.</p>
    <p v-else>Measured totals at collection time in UTC. Missing days remain gaps. Changes can be negative.</p>
    <p v-if="!rows.length" role="status">No data available for this series yet.</p>
    <svg v-else class="star-chart" :viewBox="`0 0 ${width} ${height}`" role="img" aria-labelledby="star-chart-title star-chart-description">
      <title id="star-chart-title">{{ selected === 'reconstructed' ? 'Reconstructed stars' : 'Observed total stars' }}</title>
      <desc id="star-chart-description">Stars by date. Exact dates, counts and changes are available in the data table below.</desc>
      <line :x1="padding" :y1="height - padding" :x2="width - padding" :y2="height - padding" class="axis" />
      <text x="4" :y="padding">{{ chart.max }}</text>
      <text x="4" :y="height - padding">{{ chart.min }}</text>
      <line v-for="segment in chart.segments" :key="segment.to.date" :x1="segment.from.x" :y1="segment.from.y" :x2="segment.to.x" :y2="segment.to.y" class="trend" />
      <circle v-for="point in chart.points" :key="point.date" :cx="point.x" :cy="point.y" r="3" class="point">
        <title>{{ point.date }}: {{ point.stars }} stars</title>
      </circle>
      <text :x="padding" :y="height - 10">{{ rows[0].date }}</text>
      <text :x="width - padding" :y="height - 10" text-anchor="end">{{ rows.at(-1).date }}</text>
    </svg>
    <details v-if="rows.length">
      <summary>Read exact dates and values</summary>
      <div class="star-table" tabindex="0" aria-label="Star history values">
        <table><thead><tr><th>Date</th><th>Stars</th><th>Change since previous point</th></tr></thead>
          <tbody><tr v-for="point in rows" :key="point.date"><td>{{ point.date }}</td><td>{{ point.stars }}</td><td>{{ point.delta == null ? 'Unknown' : signed(point.delta) }}</td></tr></tbody>
        </table>
      </div>
    </details>
    <p><a :href="withBase('/data/star-history.json')">Download aggregate history JSON</a></p>
    <h2>Recent events</h2>
    <p v-if="!data.events.length">No project events have been recorded yet.</p>
    <div v-else class="star-table" tabindex="0" aria-label="Project events">
      <table><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Observed change (3-day window)</th></tr></thead>
        <tbody><tr v-for="(event, index) in data.events" :key="index"><td>{{ event.date }}</td><td>{{ event.type }}</td><td>{{ event.title }}</td><td>{{ signed(event.observed_change) }}</td></tr></tbody>
      </table>
    </div>
    <p>Star growth around an event is an observational metric and does not establish that the event caused the change.</p>
  </section>
</template>

<style scoped>
.star-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.star-cards > div { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.star-cards span, .star-cards strong { display: block; }
.star-cards strong { margin-top: 8px; font-size: 1.25rem; }
select { max-width: 100%; padding: 8px; border: 1px solid var(--vp-c-divider); border-radius: 4px; background: var(--vp-c-bg); }
.star-chart { display: block; width: 100%; margin: 20px 0; overflow: visible; }
.star-chart text { fill: var(--vp-c-text-2); font-size: 14px; }
.axis { stroke: var(--vp-c-divider); }
.trend { stroke: var(--vp-c-brand-1); stroke-width: 2; }
.point { fill: var(--vp-c-brand-1); }
.star-table { overflow-x: auto; max-height: 420px; }
.star-table table { margin: 12px 0; }
summary { cursor: pointer; }
@media (max-width: 600px) {
  .star-cards { grid-template-columns: 1fr; }
  .star-chart text { font-size: 24px; }
}
</style>
