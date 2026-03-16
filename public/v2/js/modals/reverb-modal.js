// ── Reverb Sync Modal — Phase 7 ──────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('reverbModal', () => ({
    loading:       false,
    errMsg:        '',
    orders:        [],
    listings:      [],
    matched:       [],
    unmatched:     [],
    toSave:        [],
    unlinkedRecs:  [],
    linkSelections: {},
    matchesMsg:    '',
    savingMatches: false,
    linksMsg:      '',
    savingLinks:   false,

    init() {
      this.$watch('$store.dw.activeModal', val => {
        if (val === 'reverb') this.run();
      });
    },

    get usedListingIds() {
      const dw = Alpine.store('dw');
      return new Set(dw.records.map(r => dw.str(r, F.reverbListingId)).filter(Boolean));
    },

    get sortedListings() {
      return [...this.listings].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    },

    async run() {
      this.loading       = true;
      this.errMsg        = '';
      this.matchesMsg    = '';
      this.linksMsg      = '';
      this.orders        = [];
      this.listings      = [];
      this.matched       = [];
      this.unmatched     = [];
      this.toSave        = [];
      this.unlinkedRecs  = [];
      this.linkSelections = {};
      try {
        const [ordersRes, listingsRes] = await Promise.all([
          fetch('/api/reverb/my/orders/selling/awaiting_shipment'),
          fetch('/api/reverb/my/listings'),
        ]);
        if (!ordersRes.ok)   throw new Error(`Orders HTTP ${ordersRes.status}`);
        if (!listingsRes.ok) throw new Error(`Listings HTTP ${listingsRes.status}`);
        const [ordersData, listingsData] = await Promise.all([
          ordersRes.json(),
          listingsRes.json(),
        ]);
        this.orders   = ordersData.orders   || [];
        this.listings = listingsData.listings || [];
        this._process();
      } catch(e) {
        this.errMsg = e.message;
      } finally {
        this.loading = false;
      }
    },

    _process() {
      const dw = Alpine.store('dw');
      this.matched   = [];
      this.unmatched = [];
      for (const order of this.orders) {
        const listingId = String(order.product_id);
        const rec = dw.records.find(r => dw.str(r, F.reverbListingId) === listingId);
        if (rec) this.matched.push({ order, rec });
        else     this.unmatched.push(order);
      }
      this.toSave = this.matched.filter(
        m => dw.str(m.rec, F.reverbOrderNum) !== String(m.order.order_number)
      );
      this.unlinkedRecs = dw.records.filter(r =>
        dw.str(r, F.status) === 'Listed' &&
        dw.siteLabel(r) === 'Reverb' &&
        !dw.str(r, F.reverbListingId)
      );
      // Initialize selections map
      const sel = {};
      for (const r of this.unlinkedRecs) sel[r.id] = '';
      this.linkSelections = sel;
    },

    async saveMatches() {
      if (!this.toSave.length) return;
      this.savingMatches = true;
      this.matchesMsg    = '';
      let saved = 0, errors = 0;
      const dw = Alpine.store('dw');
      for (const { order, rec } of this.toSave) {
        try {
          await dw.updateRecord(rec.id, { [F.reverbOrderNum]: String(order.order_number) });
          saved++;
        } catch(e) {
          console.error('saveMatches:', e);
          errors++;
        }
      }
      this.matchesMsg    = errors ? `${saved} saved, ${errors} failed` : `✓ ${saved} saved`;
      this.savingMatches = false;
      setTimeout(() => this._process(), 800);
    },

    async saveLinks() {
      const toLink = this.unlinkedRecs
        .filter(r => this.linkSelections[r.id])
        .map(r   => ({ rec: r, listingId: this.linkSelections[r.id] }));
      if (!toLink.length) { this.linksMsg = 'nothing selected'; return; }

      this.savingLinks = true;
      this.linksMsg    = '';
      let saved = 0, errors = 0;
      const dw = Alpine.store('dw');
      for (const { rec, listingId } of toLink) {
        try {
          await dw.updateRecord(rec.id, { [F.reverbListingId]: listingId });
          saved++;
        } catch(e) {
          console.error('saveLinks:', e);
          errors++;
        }
      }
      this.linksMsg    = errors ? `${saved} saved, ${errors} failed` : `✓ ${saved} saved`;
      this.savingLinks = false;
      setTimeout(() => this._process(), 800);
    },
  }));
});
