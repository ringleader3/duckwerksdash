// ── Dashboard View — Phase 6 ──────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('dashView', () => ({

    // ── Tracking State ────────────────────────────────────────────────────────

    trackingData: {},
    trackingLoading: false,

    init() {
      // Dual-path: watch for records load, handle already-loaded case
      this.$watch('$store.dw.loading', val => {
        if (!val) this._loadTracking();
      });
      const dw = Alpine.store('dw');
      if (!dw.loading && dw.records.length > 0) this._loadTracking();
    },

    get inTransitRows() {
      const dw = Alpine.store('dw');
      return dw.records.filter(r => dw.isInTransit(r, this.trackingData));
    },

    async _loadTracking() {
      const dw = Alpine.store('dw');
      const toFetch = dw.records.filter(r =>
        dw.str(r, F.status) === 'Sold' && dw.str(r, F.trackingId)
      );
      if (!toFetch.length) return;
      this.trackingLoading = true;
      // Collect locally then assign once — avoids concurrent spread race
      const results = await Promise.all(toFetch.map(async r => {
        const tid  = dw.str(r, F.trackingId);
        const data = await dw.fetchTracker(tid);
        return { id: r.id, data };
      }));
      const merged = {};
      results.forEach(({ id, data }) => { merged[id] = data; });
      this.trackingData    = merged;
      this.trackingLoading = false;
    },

    trackStatus(r) {
      return this.trackingData[r.id]?.status || null;
    },

    trackEstDelivery(r) {
      const raw = this.trackingData[r.id]?.estDelivery;
      if (!raw) return '—';
      return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    trackCarrier(r) {
      return this.trackingData[r.id]?.carrier || '—';
    },

    trackStatusBadge(status) {
      switch (status) {
        case 'delivered':        return 'badge-sold';
        case 'out_for_delivery': return 'badge-pending';
        case 'in_transit':       return 'badge-listed';
        case 'return_to_sender':
        case 'failure':          return 'badge-prepping';
        default:                 return 'badge-other';
      }
    },

    trackStatusLabel(status) {
      if (!status) return '—';
      return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },

    // ── KPI Stat Cards ────────────────────────────────────────────────────────

    get totalInvested() {
      const dw = Alpine.store('dw');
      return dw.records.reduce((sum, r) => sum + dw.num(r, F.cost), 0);
    },

    get revenue() {
      const dw = Alpine.store('dw');
      return dw.soldRecords.reduce((sum, r) => sum + dw.num(r, F.sale), 0);
    },

    get profit() {
      const dw = Alpine.store('dw');
      return dw.soldRecords.reduce((sum, r) => {
        return sum + dw.num(r, F.sale) - dw.num(r, F.cost) - dw.num(r, F.shipping);
      }, 0);
    },

    get pipeline() {
      const dw = Alpine.store('dw');
      return dw.records
        .filter(r => dw.str(r, F.status) !== 'Sold')
        .reduce((sum, r) => sum + dw.payout(r), 0);
    },

    get notListed() {
      const dw = Alpine.store('dw');
      return dw.records.filter(r => {
        const s = dw.str(r, F.status);
        return s !== 'Listed' && s !== 'Sold';
      }).length;
    },

    // ── Lot Recovery Table ────────────────────────────────────────────────────

    get lotRows() {
      const dw = Alpine.store('dw');
      return dw.lots.map(lot => {
        const cost      = lot.items.reduce((s, r) => s + dw.num(r, F.cost), 0);
        const recovered = lot.items
          .filter(r => dw.str(r, F.status) === 'Sold')
          .reduce((s, r) => s + dw.num(r, F.sale), 0);
        const pct    = cost > 0 ? Math.min(100, Math.round((recovered / cost) * 100)) : 0;
        const upside = lot.items
          .filter(r => dw.str(r, F.status) === 'Listed')
          .reduce((s, r) => s + dw.payout(r), 0);
        return { name: lot.name, cost, recovered, pct, upside };
      }).sort((a, b) => b.cost - a.cost);
    },

    barClass(pct) {
      if (pct >= 100) return 'green';
      if (pct >= 50)  return 'yellow';
      return 'red';
    },

    // ── Recently Sold ─────────────────────────────────────────────────────────

    get recentlySold() {
      const dw = Alpine.store('dw');
      return [...dw.soldRecords]
        .sort((a, b) => {
          const da = dw.str(a, F.dateSold) || a.createdTime;
          const db = dw.str(b, F.dateSold) || b.createdTime;
          return new Date(db) - new Date(da);
        })
        .slice(0, 10);
    },

    get recentlyListed() {
      const dw = Alpine.store('dw');
      return [...dw.listedRecords]
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
        .slice(0, 10);
    },

    listedDate(r) {
      const d = new Date(r.createdTime);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    soldDate(r) {
      const dw = Alpine.store('dw');
      const raw = dw.str(r, F.dateSold) || r.createdTime;
      if (!raw) return '—';
      const d = new Date(raw);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    itemProfit(r) {
      const dw = Alpine.store('dw');
      return dw.num(r, F.sale) - dw.num(r, F.cost) - dw.num(r, F.shipping);
    },

  }));
});
