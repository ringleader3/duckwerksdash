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
    detailDiffs:   [],
    detailsMsg:    '',
    syncingDetails: false,

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
      this.detailDiffs    = [];
      this.detailsMsg     = '';
      this.syncingDetails = false;
      try {
        const ordersRes = await fetch('/api/reverb/my/orders/selling/awaiting_shipment');
        if (!ordersRes.ok) throw new Error(`Orders HTTP ${ordersRes.status}`);
        const ordersData = await ordersRes.json();
        this.orders = ordersData.orders || [];

        // Paginated listings fetch
        let allListings = [];
        let nextUrl = '/api/reverb/my/listings';
        while (nextUrl) {
          const res = await fetch(nextUrl);
          if (!res.ok) throw new Error(`Listings HTTP ${res.status}`);
          const data = await res.json();
          allListings = allListings.concat(data.listings || []);
          const nextHref = data._links?.next?.href;
          nextUrl = nextHref
            ? '/api/reverb/' + nextHref.replace('https://api.reverb.com/api/', '')
            : null;
        }
        this.listings = allListings;
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

      // Compute listing detail diffs (name + price) for linked records
      // dw is already declared at the top of _process() — do not add another const dw line
      this.detailDiffs = dw.records
        .filter(r => dw.str(r, F.reverbListingId))
        .reduce((acc, r) => {
          const listing = this.listings.find(
            l => String(l.id) === dw.str(r, F.reverbListingId)
          );
          if (!listing) return acc;
          const newName  = listing.title || '';
          const newPrice = parseFloat(listing.price?.amount) || 0;
          const oldName  = dw.str(r, F.name);
          const oldPrice = parseFloat(r.fields[F.listPrice]) || 0;
          if (newName !== oldName || newPrice !== oldPrice) {
            acc.push({ rec: r, listing, newName, newPrice, oldName, oldPrice });
          }
          return acc;
        }, []);
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
