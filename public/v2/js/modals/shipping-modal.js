// ── Shipping Modal — Tracking Panel ──────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('shippingModal', () => ({
    loading:      false,
    refreshing:   false,
    trackingData: {},  // { [recordId]: { status, carrier, estDelivery, publicUrl } | null }
    errMsg:       '',

    init() {
      this.$watch('$store.dw.activeModal', val => {
        if (val === 'shipping') this._open();
      });
    },

    async _open() {
      this.loading      = true;
      this.errMsg       = '';
      this.trackingData = {};
      await this._loadAll();
      this.loading = false;
    },

    get inTransitRecords() {
      const dw        = Alpine.store('dw');
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      return dw.records.filter(r =>
        dw.str(r, F.status) === 'Sold' && dw.str(r, F.trackingId)
      ).filter(r => {
        const td = this.trackingData[r.id];
        if (!td || td.status !== 'delivered') return true;
        if (!td.deliveredAt) return false;
        return (Date.now() - new Date(td.deliveredAt).getTime()) < threeDays;
      });
    },

    async _loadAll() {
      const dw = Alpine.store('dw');
      // Guard: if store hasn't loaded yet, nothing to fetch
      if (dw.loading || !dw.records.length) { this.loading = false; return; }
      // Collect all results locally first — concurrent spread writes would race
      const results = await Promise.all(this.inTransitRecords.map(async r => {
        const tid  = dw.str(r, F.trackingId);
        const data = await dw.fetchTracker(tid);
        return { id: r.id, data };
      }));
      const merged = {};
      results.forEach(({ id, data }) => { merged[id] = data; });
      this.trackingData = merged;
    },

    async refreshAll() {
      this.refreshing   = true;
      this.trackingData = {};
      await this._loadAll();
      this.refreshing = false;
    },

    openItem(r) {
      Alpine.store('dw').openModal('item', r.id);
    },

    trackStatus(r) {
      return this.trackingData[r.id]?.status || null;
    },

    trackCarrier(r) {
      return this.trackingData[r.id]?.carrier || '—';
    },

    trackEstDelivery(r) {
      const raw = this.trackingData[r.id]?.estDelivery;
      if (!raw) return null;
      return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    trackPublicUrl(r) {
      const dw = Alpine.store('dw');
      return this.trackingData[r.id]?.publicUrl || dw.str(r, F.trackerUrl) || null;
    },

    statusBadgeClass(status) {
      switch (status) {
        case 'delivered':        return 'badge-sold';       // green
        case 'out_for_delivery': return 'badge-pending';    // yellow
        case 'in_transit':       return 'badge-listed';     // blue
        case 'return_to_sender':
        case 'failure':          return 'badge-prepping';   // red
        default:                 return 'badge-other';      // muted
      }
    },

    statusLabel(status) {
      if (!status) return 'Unknown';
      return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
  }));
});
