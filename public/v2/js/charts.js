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

    buildRevenueChart()  { /* Task 3 */ },
    buildPipelineChart() { /* Task 4 */ },
    buildLotROIChart()   { /* Task 5 */ },
    buildUpsideChart()   { /* Task 6 */ },

  }));
});
