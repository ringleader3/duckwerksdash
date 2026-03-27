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
      // Debounce: rapid fetchAll() calls (e.g. syncDetails loop) each toggle loading,
      // triggering this watch multiple times. Without debouncing, the rapid
      // destroy+create cycle leaves Chart.js RAF callbacks firing on null ctx.
      clearTimeout(this._buildTimer);
      this._buildTimer = setTimeout(() => {
        Object.values(this.charts).forEach(c => c.destroy());
        this.charts = {};
        this.buildRevenueChart();
        this.buildPipelineChart();
        this.buildLotROIChart();
        this.buildUpsideChart();
      }, 50);
    },

    momentumData() {
      const dw = Alpine.store('dw');
      const WINDOWS = [3, 7, 14, 30, 60, 90];
      const now = new Date();

      // Per-window, per-site gross and net
      const sites = ['All', 'Reverb', 'eBay', 'Facebook'];
      const gross = {}; // gross[site][windowIdx]
      const net   = {}; // net[site][windowIdx]
      for (const s of sites) {
        gross[s] = Array(WINDOWS.length).fill(0);
        net[s]   = Array(WINDOWS.length).fill(0);
      }

      for (const r of dw.soldRecords) {
        const raw = r.order?.date_sold;
        if (!raw) continue;
        const sold     = new Date(raw + (raw.includes('T') ? '' : 'T00:00:00'));
        const ageMs    = now - sold;
        const ageDays  = ageMs / (1000 * 60 * 60 * 24);

        const saleGross = r.order?.sale_price || 0;
        const cost      = r.cost || 0;
        const shipping  = r.shipment?.shipping_cost || 0;

        // Fee: find the sold listing by presence of an order (not l.status — that's 'active'/'ended')
        // Fee base is saleGross (actual sale price), not list_price — intentional for actuals.
        const listing  = r.listings?.find(l => l.order) || r.listings?.[0];
        const site     = listing?.site;
        const siteName = site?.name || 'Other';
        let fee = 0;
        if (site) {
          fee = site.fee_on_shipping
            ? (saleGross + shipping) * site.fee_rate + site.fee_flat
            : saleGross * site.fee_rate + site.fee_flat;
        }
        const saleNet = saleGross - cost - shipping - fee;

        for (let i = 0; i < WINDOWS.length; i++) {
          if (ageDays <= WINDOWS[i]) {
            gross['All'][i] += saleGross;
            net['All'][i]   += saleNet;
            if (sites.includes(siteName)) {
              gross[siteName][i] += saleGross;
              net[siteName][i]   += saleNet;
            }
          }
        }
      }

      // overage[site][i] = gross - net (the fees+cost visual layer)
      const overage = {};
      for (const s of sites) {
        overage[s] = WINDOWS.map((_, i) => Math.max(0, gross[s][i] - net[s][i]));
      }

      return { gross, net, overage, hasFacebook: gross['Facebook'].some(v => v > 0) };
    },

    buildRevenueChart() {
      const dw = Alpine.store('dw');
      if (dw.soldRecords.length === 0) return;

      // Group sold records by month.
      // Use YYYY-MM as the sort key (parseable by Date), store display label separately.
      const byMonth = {};
      dw.soldRecords.forEach(r => {
        const raw = r.order?.date_sold;
        if (!raw) return;
        const d    = new Date(raw);
        const sortKey    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const displayKey = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        if (!byMonth[sortKey]) byMonth[sortKey] = { display: displayKey, revenue: 0, profit: 0 };
        const sale     = r.order?.sale_price || 0;
        const cost     = r.cost || 0;
        const shipping = r.shipment?.shipping_cost || 0;
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
      if (dw.records.length === 0) return;

      const listedRecs   = dw.listedRecords;
      const soldRecs     = dw.soldRecords;
      const unlistedRecs = dw.records.filter(r => r.status !== 'Listed' && r.status !== 'Sold');

      // Value annotations: EAF total for Listed, cost total for Unlisted
      const listedEAF     = listedRecs.reduce((s, r) => s + dw.payout(r), 0);
      const unlistedCost  = unlistedRecs.reduce((s, r) => s + (r.cost || 0), 0);
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
    buildLotROIChart() {
      const dw = Alpine.store('dw');
      if (dw.lots.length === 0) return;

      // Recompute lot rows (can't access dashView.lotRows from here)
      const rows = dw.lots.map(lot => {
        const cost      = lot.items.reduce((s, r) => s + (r.cost || 0), 0);
        const recovered = lot.items
          .filter(r => r.status === 'Sold')
          .reduce((s, r) => s + (r.order?.sale_price || 0), 0);
        const pct = cost > 0 ? Math.min(100, Math.round((recovered / cost) * 100)) : 0;
        return { name: lot.name, pct };
      }).sort((a, b) => b.pct - a.pct);

      const labels = rows.map(r => r.name);
      const data   = rows.map(r => r.pct);
      const colors = rows.map(r =>
        r.pct >= 100 ? 'rgba(72,187,120,0.7)'   :  // --green
        r.pct >= 50  ? 'rgba(236,201,75,0.7)'   :  // --yellow
                       'rgba(245,101,101,0.7)'     // --red
      );

      this.charts.lot = new Chart(this.$refs.lotCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Recovery %',
            data,
            backgroundColor: colors,
            borderRadius: 2,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}% recovered` } },
          },
          scales: {
            x: {
              min: 0,
              max: 100,
              ticks: { callback: v => v + '%' },
            },
          },
        },
      });
    },
    buildUpsideChart() {
      const dw = Alpine.store('dw');
      if (dw.listedRecords.length === 0) return;

      const colorMap = {
        Music:    'rgba(66,153,225,0.7)',    // --blue
        Computer: 'rgba(159,122,234,0.7)',   // --purple
        Gaming:   'rgba(237,137,54,0.7)',    // --orange
        Other:    'rgba(153,153,153,0.5)',   // --muted
      };

      const byCategory = {};
      dw.listedRecords.forEach(r => {
        const cat = r.category?.name || 'Other';
        const key = colorMap[cat] ? cat : 'Other';
        byCategory[key] = (byCategory[key] || 0) + dw.estProfit(r);
      });

      const labels = Object.keys(byCategory);
      const data   = labels.map(l => byCategory[l]);
      const colors = labels.map(l => colorMap[l] || colorMap.Other);

      this.charts.upside = new Chart(this.$refs.upsideCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Est. Profit',
            data,
            backgroundColor: colors,
            borderRadius: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` $${ctx.parsed.y.toFixed(2)} est. profit`,
              },
            },
          },
          scales: {
            y: { ticks: { callback: v => '$' + v.toFixed(0) } },
          },
        },
      });
    },

  }));
});
