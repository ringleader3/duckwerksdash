// ── Dashboard Charts — Chart.js ────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('chartsSection', () => ({
    charts: {},

    init() {
      // Set Chart.js dark theme defaults once
      Chart.defaults.color = '#999';
      Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';

      // Dual-path: watch for data load, and handle already-loaded case
      this.$watch('$store.dw.loading', (val) => {
        if (!val) this.buildCharts();
      });
      const dw = Alpine.store('dw');
      if (!dw.loading && dw.records.length > 0) {
        this.buildCharts();
      }
    },

    buildCharts() {
      // Destroy any existing instances before recreating
      Object.values(this.charts).forEach(c => c.destroy());
      this.charts = {};
      this.buildRevenueChart();
      this.buildPipelineChart();
      this.buildLotROIChart();
      this.buildUpsideChart();
    },

    buildRevenueChart() {
      const dw = Alpine.store('dw');
      if (dw.soldRecords.length === 0) return;

      // Group sold records by month.
      // Use YYYY-MM as the sort key (parseable by Date), store display label separately.
      const byMonth = {};
      dw.soldRecords.forEach(r => {
        const raw = dw.str(r, F.dateSold);
        if (!raw) return;
        const d    = new Date(raw);
        const sortKey    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const displayKey = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        if (!byMonth[sortKey]) byMonth[sortKey] = { display: displayKey, revenue: 0, profit: 0 };
        const sale     = dw.num(r, F.sale);
        const cost     = dw.num(r, F.cost);
        const shipping = dw.num(r, F.shipping);
        byMonth[sortKey].revenue += sale;
        byMonth[sortKey].profit  += sale - cost - shipping;
      });

      // Sort chronologically by YYYY-MM key, then use display labels for the chart
      const sortedKeys = Object.keys(byMonth).sort();
      const labels  = sortedKeys.map(k => byMonth[k].display);
      const revenue = sortedKeys.map(k => byMonth[k].revenue);
      const profit  = sortedKeys.map(k => byMonth[k].profit);

      this.charts.revenue = new Chart(this.$refs.revenueCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Revenue',
              data: revenue,
              backgroundColor: 'rgba(66,153,225,0.6)',  // --blue
              order: 2,
            },
            {
              label: 'Profit',
              data: profit,
              type: 'line',
              borderColor: 'rgba(72,187,120,0.9)',       // --green
              backgroundColor: 'transparent',
              pointRadius: 3,
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8 } },
            tooltip: {
              callbacks: {
                label: ctx => ` $${ctx.parsed.y.toFixed(2)}`,
              },
            },
          },
          scales: {
            y: { ticks: { callback: v => '$' + v.toFixed(0) } },
          },
        },
      });
    },
    buildPipelineChart() {
      const dw = Alpine.store('dw');

      // Compute status counts and values fresh (do not reuse notListed getter — it doesn't exclude Pending)
      const listedRecs   = dw.listedRecords;
      const pendingRecs  = dw.pendingRecords;
      const soldRecs     = dw.soldRecords;
      const unlistedRecs = dw.records.filter(r => {
        const s = dw.str(r, F.status);
        return s !== 'Listed' && s !== 'Sold' && s !== 'Pending';
      });

      // Value annotations: EAF total for Listed, cost total for Unlisted
      const listedEAF     = listedRecs.reduce((s, r) => s + dw.eaf(dw.num(r, F.listPrice)), 0);
      const unlistedCost  = unlistedRecs.reduce((s, r) => s + dw.num(r, F.cost), 0);
      const fmt = n => '$' + n.toFixed(0);

      this.charts.pipeline = new Chart(this.$refs.pipelineCanvas, {
        type: 'bar',
        data: {
          labels: ['Inventory'],
          datasets: [
            {
              label: `Unlisted (${unlistedRecs.length} · ${fmt(unlistedCost)} cost)`,
              data: [unlistedRecs.length],
              backgroundColor: 'rgba(153,153,153,0.5)',  // --muted
            },
            {
              label: `Listed (${listedRecs.length} · ${fmt(listedEAF)} EAF)`,
              data: [listedRecs.length],
              backgroundColor: 'rgba(236,201,75,0.7)',   // --yellow
            },
            {
              label: `Pending (${pendingRecs.length})`,
              data: [pendingRecs.length],
              backgroundColor: 'rgba(66,153,225,0.7)',   // --blue
            },
            {
              label: `Sold (${soldRecs.length})`,
              data: [soldRecs.length],
              backgroundColor: 'rgba(72,187,120,0.4)',   // --green dimmed
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}` } },
          },
          scales: {
            x: { stacked: true, ticks: { display: false }, grid: { display: false } },
            y: { stacked: true, ticks: { display: false } },
          },
        },
      });
    },
    buildLotROIChart()   { /* Task 5 */ },
    buildUpsideChart()   { /* Task 6 */ },

  }));
});
