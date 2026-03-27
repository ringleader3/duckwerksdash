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
        this.buildMomentumChart();
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

    buildMomentumChart() {
      const dw = Alpine.store('dw');
      if (dw.soldRecords.length === 0) return;

      const { net, overage, hasFacebook } = this.momentumData();
      const labels = ['3d', '7d', '14d', '30d', '60d', '90d'];

      const datasets = [
        { label: 'Net (All)',           data: net['All'],        stack: 'hero',     backgroundColor: 'rgba(72,187,120,0.85)',  order: 1 },
        { label: 'Cost+Fees (All)',     data: overage['All'],    stack: 'hero',     backgroundColor: 'rgba(255,255,255,0.07)', order: 1 },
        { label: 'Net (Reverb)',        data: net['Reverb'],     stack: 'reverb',   backgroundColor: 'rgba(237,100,50,0.8)',   order: 1 },
        { label: 'Cost+Fees (Reverb)',  data: overage['Reverb'], stack: 'reverb',   backgroundColor: 'rgba(237,100,50,0.2)',   order: 1 },
        { label: 'Net (eBay)',          data: net['eBay'],       stack: 'ebay',     backgroundColor: 'rgba(236,201,75,0.8)',   order: 1 },
        { label: 'Cost+Fees (eBay)',    data: overage['eBay'],   stack: 'ebay',     backgroundColor: 'rgba(236,201,75,0.2)',   order: 1 },
      ];

      if (hasFacebook) {
        datasets.push(
          { label: 'Net (Facebook)',       data: net['Facebook'],    stack: 'facebook', backgroundColor: 'rgba(153,153,153,0.7)',  order: 1 },
          { label: 'Cost+Fees (Facebook)', data: overage['Facebook'],stack: 'facebook', backgroundColor: 'rgba(153,153,153,0.2)', order: 1 }
        );
      }

      this.charts.momentum = new Chart(this.$refs.momentumCanvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 10,
                padding: 8,
                filter: item => !item.text.startsWith('Cost+Fees'),
              },
            },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const isOverage = ctx.dataset.label.startsWith('Cost+Fees');
                  const stack = ctx.dataset.stack;
                  const site  = stack === 'hero' ? 'All' : stack.charAt(0).toUpperCase() + stack.slice(1);
                  if (isOverage) {
                    // Find the net dataset for this stack to compute gross = net + overage
                    const netDs = ctx.chart.data.datasets.find(
                      d => d.stack === ctx.dataset.stack && !d.label.startsWith('Cost+Fees')
                    );
                    const gross = (netDs?.data[ctx.dataIndex] || 0) + ctx.parsed.y;
                    return ` Gross (${site}): $${gross.toFixed(2)}`;
                  }
                  return ` Net (${site}): $${ctx.parsed.y.toFixed(2)}`;
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: v => '$' + v.toFixed(0) } },
          },
        },
      });
    },

  }));
});
