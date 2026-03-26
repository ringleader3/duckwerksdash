// ── Dashboard View ────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('dashView', () => ({

    trackingData:    {},
    trackingLoading: false,

    init() {
      this.$watch('$store.dw.loading', val => { if (!val) this._loadTracking(); });
      const dw = Alpine.store('dw');
      if (!dw.loading && dw.records.length > 0) this._loadTracking();
    },

    get inTransitRows() {
      const dw = Alpine.store('dw');
      return dw.records.filter(r => dw.isInTransit(r, this.trackingData));
    },

    async _loadTracking() {
      const dw = Alpine.store('dw');
      const toFetch = dw.records.filter(r => r.status === 'Sold' && r.shipment?.tracking_id);
      if (!toFetch.length) return;
      this.trackingLoading = true;
      const results = await Promise.all(toFetch.map(async r => ({
        id: r.id, data: await dw.fetchTracker(r.shipment.tracking_id)
      })));
      const merged = {};
      results.forEach(({ id, data }) => { merged[id] = data; });
      this.trackingData    = merged;
      this.trackingLoading = false;
    },

    trackStatus(r)      { return this.trackingData[r.id]?.status || null; },
    trackCarrier(r)     { return this.trackingData[r.id]?.carrier || '—'; },
    trackEstDelivery(r) {
      const raw = this.trackingData[r.id]?.estDelivery;
      return raw ? new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
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

    get totalInvested() {
      return Alpine.store('dw').records.reduce((s, r) => s + (r.cost || 0), 0);
    },
    get revenue() {
      return Alpine.store('dw').soldRecords.reduce((s, r) => s + (r.order?.sale_price || 0), 0);
    },
    get profit() {
      return Alpine.store('dw').soldRecords.reduce((s, r) => s + (r.order?.profit || 0), 0);
    },
    get pipeline() {
      const dw = Alpine.store('dw');
      return dw.records.filter(r => r.status !== 'Sold').reduce((s, r) => s + dw.estProfit(r), 0);
    },
    get notListed() {
      return Alpine.store('dw').records.filter(r => r.status !== 'Listed' && r.status !== 'Sold').length;
    },

    get lotRows() {
      const dw = Alpine.store('dw');
      return dw.lots.map(lot => {
        const cost      = lot.items.reduce((s, r) => s + (r.cost || 0), 0);
        const recovered = lot.items.filter(r => r.status === 'Sold')
                            .reduce((s, r) => s + (r.order?.sale_price || 0), 0);
        const pct    = cost > 0 ? Math.min(100, Math.round((recovered / cost) * 100)) : 0;
        const upside = lot.items.filter(r => r.status === 'Listed')
                         .reduce((s, r) => s + dw.estProfit(r), 0);
        return { name: lot.name, cost, recovered, pct, upside };
      }).sort((a, b) => b.cost - a.cost);
    },

    barClass(pct) {
      if (pct >= 100) return 'green';
      if (pct >= 50)  return 'yellow';
      return 'red';
    },

    get recentlySold() {
      return [...Alpine.store('dw').soldRecords]
        .filter(r => r.order?.date_sold)
        .sort((a, b) => new Date(b.order.date_sold) - new Date(a.order.date_sold))
        .slice(0, 10);
    },
    get recentlyListed() {
      return [...Alpine.store('dw').listedRecords]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10);
    },

    listedDate(r) {
      return new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },
    soldDate(r) {
      const raw = r.order?.date_sold;
      if (!raw) return '—';
      const [y, m, d] = raw.split('T')[0].split('-');
      return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },
    itemProfit(r) { return r.order?.profit || 0; },

  }));
});
