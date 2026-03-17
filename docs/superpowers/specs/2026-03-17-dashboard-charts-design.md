# Dashboard Charts — Design Spec
_Date: 2026-03-17_

## Overview

Add a 4-chart analytics section to the bottom of the Dashboard view. Charts are purely additive — no existing panels are modified. Uses Chart.js via CDN, consistent with the no-build Alpine.js stack.

## Goals

- At-a-glance business pulse: are revenue and profit trending up?
- Active inventory visibility: what's in flight, what's stuck, what's the near-term value?
- Lot ROI: which lots are recovered vs underwater?
- No fluff — functional over fancy

## Charts

### 1. Monthly Revenue + Profit
- **Type:** Bar + Line combo (Chart.js type: `bar` with a `line` dataset overlay)
- **X-axis:** Last 12 months (or all months with data if < 12), formatted as `Mon YYYY`
- **Data:** `soldRecords` grouped by `dateSold` month
  - Bar dataset: sum of `F.sale` per month (revenue)
  - Line dataset: sum of `F.sale - F.cost - F.shipping` per month (profit)
- **Colors:** Bar = `--blue`, Line = `--green`

### 2. Inventory Pipeline
- **Type:** Horizontal stacked bar
- **Data:** Count of all records by status bucket
  - Unlisted: status is not Listed, Sold, or Pending
  - Listed: `listedRecords.length`
  - Pending: `pendingRecords.length`
  - Sold: `soldRecords.length` (shown dimmed as trailing context)
- **Labels:** Each segment labeled with count + total EAF value for Listed, total cost for Unlisted
- **Colors:** Unlisted = `--muted`, Listed = `--yellow`, Pending = `--blue`, Sold = `--green`

### 3. Lot ROI
- **Type:** Horizontal bar chart, one bar per lot
- **Data:** Reuse `dashView.lotRows` — `{ name, cost, recovered, pct }`
- **Bar value:** `pct` (recovery %, capped at 100)
- **Color per bar:** `--green` if pct ≥ 100, `--yellow` if pct ≥ 50, `--red` if pct < 50
- **Sorted:** Descending by cost (same as existing lot table)

### 4. Near-term Upside by Category
- **Type:** Vertical bar chart
- **Data:** `listedRecords` grouped by `F.category`, summing `estProfit(r)` per group
- **Categories:** Music, Computer, Gaming (plus "Other" if uncategorized items exist)
- **Colors:** Match existing `CAT_COLOR` map (`--blue`, `--purple`, `--orange`)
- **Purpose:** Shows where the near-term money is coming from

## Layout

New `<section>` at the bottom of the Dashboard view (below Recently Listed panel):

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Monthly Rev  │  Inventory   │   Lot ROI    │  Near-term   │
│ + Profit     │  Pipeline    │              │  Upside      │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

- CSS grid: `grid-template-columns: repeat(4, 1fr)`, `gap: 16px`
- Each chart in a card matching existing `--surface` / `--border` styling
- Section header: `ANALYTICS` in the same uppercase muted label style as other dashboard sections
- Charts sized at a fixed canvas height (~220px) for consistency

## Files

### New: `public/v2/js/charts.js`
Registers `Alpine.data('chartsSection', ...)`. Responsibilities:
- `init()`: watches `$store.dw.loading` — calls `buildCharts()` when loading transitions to false
- `buildCharts()`: destroys any existing Chart instances, then creates all 4
- Helper methods per chart: `buildRevenueChart()`, `buildPipelineChart()`, `buildLotROIChart()`, `buildUpsideChart()`
- `charts: {}` — stores Chart.js instances keyed by name for cleanup

### Modified: `public/v2/index.html`
1. Add CDN script tag: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>`
2. Add `<script src="/v2/js/charts.js"></script>` after `store.js` in load order
3. Add charts section markup inside the dashboard `x-show` block, below recently-listed panel

## Alpine Integration Notes

- `chartsSection` reads from `$store.dw` (same pattern as all other views — no direct Airtable calls)
- `$watch('$store.dw.loading', (val) => { if (!val) this.buildCharts(); })` handles async data arrival
- Guard against empty data: if `soldRecords.length === 0`, show a "no data yet" placeholder per chart
- Canvas elements referenced via `$refs`: `$refs.revenueCanvas`, `$refs.pipelineCanvas`, etc.
- Chart.js global defaults set once in `init()`: `Chart.defaults.color`, `Chart.defaults.borderColor` to match dark theme

## Chart.js Configuration Notes

- **Dark theme:** Set `Chart.defaults.color = '#999'` and `Chart.defaults.borderColor = 'rgba(255,255,255,0.08)'`
- **No legend** on Pipeline and Upside charts (self-labeling); legend on Revenue chart for Revenue/Profit lines
- **Tooltips:** Default Chart.js tooltips are fine — no custom formatting needed
- **Responsive:** `responsive: true`, `maintainAspectRatio: false` on all charts so they fill their card

## Out of Scope

- No date range picker / filtering — charts always show all available data
- No click-through from charts to filtered views (potential future enhancement)
- No animation tuning — Chart.js defaults are fine
- The existing KPI cards, lot recovery table, recently sold, and recently listed panels are untouched
