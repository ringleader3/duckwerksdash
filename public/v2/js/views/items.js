// ── Items View ────────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('itemsView', () => ({
    statusFilter: 'Listed',
    siteFilter:   'All',
    nameSearch:   '',
    openStatusId: null,
    sortKey:      'createdTime',
    sortDir:      'desc',
    trackingData:    {},
    trackingLoading: false,

    init() {
      document.addEventListener('click', () => { this.openStatusId = null; });
      this.$watch('$store.dw.pendingFilters', v => {
        if (v) {
          this.statusFilter = v.status;
          this.siteFilter   = v.site;
          Alpine.store('dw').categoryFilter = v.category;
          Alpine.store('dw').pendingFilters = null;
        }
      });
      this.$watch('statusFilter', val => {
        if (val === 'Sold' || val === 'All') this._loadTracking();
      });
      const dw = Alpine.store('dw');
      if ((this.statusFilter === 'Sold' || this.statusFilter === 'All') && !dw.loading && dw.records.length > 0) this._loadTracking();
      const saved = dwSortable.load('items', 'createdTime', 'desc');
      this.sortKey = saved.col;
      this.sortDir = saved.dir;
    },

    get rows() {
      const dw = Alpine.store('dw');
      let recs = dw.records;

      if (dw.categoryFilter) {
        recs = recs.filter(r => r.category?.name === dw.categoryFilter);
      }
      if (this.statusFilter !== 'All') {
        recs = recs.filter(r => r.status === this.statusFilter);
      }
      if (this.siteFilter !== 'All') {
        const sites = dw.sites || [];
        recs = recs.filter(r => {
          const targetSite = sites.find(s => s.name === this.siteFilter);
          if (!targetSite) return false;
          return (r.listings || []).some(l => l.site?.id === targetSite.id);
        });
      }
      const q = this.nameSearch.trim().toLowerCase();
      if (q) recs = recs.filter(r => r.name.toLowerCase().includes(q));

      const key = this.sortKey, dir = this.sortDir;
      recs = [...recs].sort((a, b) => {
        let av, bv;
        if      (key === 'createdTime') { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); }
        else if (key === 'name')       { av = a.name.toLowerCase();             bv = b.name.toLowerCase(); }
        else if (key === 'lot')        { av = (a.lot?.name||'').toLowerCase();  bv = (b.lot?.name||'').toLowerCase(); }
        else if (key === 'category')   { av = (a.category?.name||'').toLowerCase(); bv = (b.category?.name||'').toLowerCase(); }
        else if (key === 'site')       { av = dw.siteLabel(a).toLowerCase();   bv = dw.siteLabel(b).toLowerCase(); }
        else if (key === 'status')     { av = a.status.toLowerCase();          bv = b.status.toLowerCase(); }
        else if (key === 'listPrice')  { av = dw.activeListing(a)?.list_price || 0; bv = dw.activeListing(b)?.list_price || 0; }
        else if (key === 'eaf')        { av = dw.payout(a);  bv = dw.payout(b); }
        else if (key === 'profit')     { av = dw.estProfit(a); bv = dw.estProfit(b); }
        else if (key === 'shipping')   { av = dw.activeListing(a)?.shipping_estimate || 0; bv = dw.activeListing(b)?.shipping_estimate || 0; }
        else if (key === 'soldDate')   { av = a.order?.date_sold || ''; bv = b.order?.date_sold || ''; }
        else return 0;
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ?  1 : -1;
        return 0;
      });
      return recs;
    },

    sortBy(key) {
      if (this.sortKey === key) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; }
      else { this.sortKey = key; this.sortDir = 'asc'; }
      dwSortable.save('items', this.sortKey, this.sortDir);
    },
    sortGlyph(key) {
      if (this.sortKey !== key) return '↕';
      return this.sortDir === 'asc' ? '↑' : '↓';
    },

    badgeClass(status) {
      const s = (status || '').toLowerCase();
      if (s === 'listed')   return 'badge-listed';
      if (s === 'sold')     return 'badge-sold';
      if (s === 'prepping') return 'badge-prepping';
      return 'badge-other';
    },
    catBadgeClass(cat) { return CAT_BADGE[cat] || 'badge-other'; },

    eafDisplay(r)  {
      const dw = Alpine.store('dw');
      const lp = dw.activeListing(r)?.list_price || 0;
      return lp > 0 ? dw.fmt0(dw.payout(r)) : 'n/a';
    },
    profitDisplay(r) {
      const dw = Alpine.store('dw');
      const p  = dw.estProfit(r);
      return (p >= 0 ? '+' : '') + dw.fmt0(p);
    },
    shipDisplay(r) {
      const dw = Alpine.store('dw');
      if (r.shipment?.shipping_cost != null) return dw.fmt0(r.shipment.shipping_cost);
      const sold = (r.listings || []).find(l => l.status === 'sold');
      if (sold?.shipping_estimate != null) return dw.fmt0(sold.shipping_estimate);
      const inPerson = ['Facebook', 'Craigslist'].includes(sold?.site?.name);
      if (inPerson) return dw.fmt0(0);
      const l = dw.activeListing(r);
      return l?.shipping_estimate != null ? dw.fmt0(l.shipping_estimate) : '~$7';
    },
    shipIsEst(r) {
      if (r.shipment?.shipping_cost != null) return false;
      const sold = (r.listings || []).find(l => l.status === 'sold');
      if (sold?.shipping_estimate != null) return false;
      if (['Facebook', 'Craigslist'].includes(sold?.site?.name)) return false;
      return Alpine.store('dw').activeListing(r)?.shipping_estimate == null;
    },

    toggleStatusMenu(id, e) { e.stopPropagation(); this.openStatusId = this.openStatusId === id ? null : id; },

    async changeStatus(r, status, e) {
      e.stopPropagation();
      this.openStatusId = null;
      const fields = { status };
      if (status === 'Sold' && !r.order?.date_sold) fields.date_sold = new Date().toISOString().split('T')[0];
      await Alpine.store('dw').updateItem(r.id, fields);
    },

    dateAdded(r) {
      return new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },
    daysListed(r) {
      return Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
    },
    needsAttention(r) { return r.status === 'Listed' && this.daysListed(r) >= 20; },
    openItem(r) { Alpine.store('dw').openModal('item', r.id); },

    async _loadTracking() {
      const dw = Alpine.store('dw');
      if (dw.loading || !dw.records.length) return;
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
      if (!status) return 'n/a';
      return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
  }));
});
