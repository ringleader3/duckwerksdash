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
    detailDiffs:      [],
    detailSelections: {},
    detailsMsg:       '',
    syncingDetails:   false,
    newListings:      [],
    newSelections:    {},
    importingNew:     false,
    importMsg:        '',

    init() {
      this.$watch('$store.dw.activeModal', val => {
        if (val === 'reverb') this.run();
      });
    },

    // Set of platform_listing_ids already linked to a record
    get usedListingIds() {
      const dw = Alpine.store('dw');
      return new Set(
        dw.records.flatMap(r => r.listings || [])
          .map(l => l.platform_listing_id)
          .filter(Boolean)
      );
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
      this.linkSelections  = {};
      this.detailDiffs     = [];
      this.detailSelections = {};
      this.detailsMsg      = '';
      this.syncingDetails  = false;
      this.newListings     = [];
      this.newSelections   = {};
      this.importingNew    = false;
      this.importMsg       = '';
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
        const rec = dw.records.find(r =>
          (r.listings || []).some(l =>
            l.site?.name === 'Reverb' && l.status === 'active' &&
            l.platform_listing_id === listingId
          )
        );
        if (rec) this.matched.push({ order, rec });
        else     this.unmatched.push(order);
      }

      // toSave: matched items where order_number differs from stored platform_order_num
      this.toSave = this.matched.filter(m => {
        const existingOrderNum = m.rec.order?.platform_order_num;
        return existingOrderNum !== String(m.order.order_number);
      });

      // Unlinked: Listed Reverb items with no platform_listing_id
      this.unlinkedRecs = dw.records.filter(r => {
        if (r.status !== 'Listed') return false;
        return (r.listings || []).some(
          l => l.site?.name === 'Reverb' && l.status === 'active' && !l.platform_listing_id
        );
      });

      // Initialize selections map
      const sel = {};
      for (const r of this.unlinkedRecs) sel[r.id] = '';
      this.linkSelections = sel;

      // Compute listing detail diffs (name + price) for linked records
      this.detailDiffs = dw.records.reduce((acc, r) => {
        const reverbListing = (r.listings || []).find(
          l => l.site?.name === 'Reverb' && l.platform_listing_id
        );
        if (!reverbListing) return acc;
        const listing = this.listings.find(
          l => String(l.id) === reverbListing.platform_listing_id
        );
        if (!listing) return acc;
        const newName  = listing.title || '';
        const newPrice = parseFloat(listing.price?.amount) || 0;
        const oldName  = r.name || '';
        const oldPrice = reverbListing.list_price || 0;
        if (newName !== oldName || newPrice !== oldPrice) {
          acc.push({ rec: r, listing: reverbListing, newName, newPrice, oldName, oldPrice });
        }
        return acc;
      }, []);

      const detailSel = {};
      for (const d of this.detailDiffs) detailSel[d.rec.id] = true;
      this.detailSelections = detailSel;

      // New on Reverb: live listings with no matching local record
      const usedIds = new Set(
        dw.records.flatMap(r => r.listings || [])
          .map(l => l.platform_listing_id)
          .filter(Boolean)
      );
      this.newListings = this.listings.filter(l => !usedIds.has(String(l.id)));
      const newSel = {};
      for (const l of this.newListings) newSel[l.id] = true;
      this.newSelections = newSel;
    },

    async saveMatches() {
      if (!this.toSave.length) return;
      this.savingMatches = true;
      this.matchesMsg    = '';
      let saved = 0, errors = 0;
      const dw = Alpine.store('dw');
      for (const { order, rec } of this.toSave) {
        try {
          if (rec.order?.id) {
            await dw.updateOrder(rec.order.id, { platform_order_num: String(order.order_number) });
          }
          // If no order exists yet, the label modal will create it — skip silently
          saved++;
        } catch(e) {
          console.error('saveMatches:', e);
          errors++;
        }
      }
      this.matchesMsg    = errors ? `${saved} saved, ${errors} failed` : `✓ ${saved} saved`;
      this.savingMatches = false;
      setTimeout(async () => { await Alpine.store('dw').fetchAll(); this._process(); }, 800);
    },

    async saveLinks() {
      const toLink = this.unlinkedRecs
        .filter(r => this.linkSelections[r.id])
        .map(r => {
          const listing = (r.listings || []).find(
            l => l.site?.name === 'Reverb' && l.status === 'active' && !l.platform_listing_id
          );
          return { rec: r, listing, listingId: this.linkSelections[r.id] };
        })
        .filter(({ listing }) => listing);
      if (!toLink.length) { this.linksMsg = 'nothing selected'; return; }

      this.savingLinks = true;
      this.linksMsg    = '';
      let saved = 0, errors = 0;
      const dw = Alpine.store('dw');
      for (const { listing, listingId } of toLink) {
        try {
          await dw.updateListing(listing.id, { platform_listing_id: listingId });
          saved++;
        } catch(e) {
          console.error('saveLinks:', e);
          errors++;
        }
      }
      this.linksMsg    = errors ? `${saved} saved, ${errors} failed` : `✓ ${saved} saved`;
      this.savingLinks = false;
      setTimeout(async () => { await Alpine.store('dw').fetchAll(); this._process(); }, 800);
    },

    async importNew() {
      const selected = this.newListings.filter(l => this.newSelections[l.id]);
      if (!selected.length) return;
      this.importingNew = true;
      this.importMsg    = '';
      let saved = 0, errors = 0;
      const dw = Alpine.store('dw');
      const reverbSite = dw.sites.find(s => s.name === 'Reverb');
      if (!reverbSite) { this.importMsg = 'Reverb site not found'; this.importingNew = false; return; }
      for (const listing of selected) {
        try {
          const item = await dw.createItem({ name: listing.title || 'Untitled', cost: 0 });
          await dw.createListing({
            item_id:             item.id,
            site_id:             reverbSite.id,
            list_price:          parseFloat(listing.price?.amount) || 0,
            shipping_estimate:   parseFloat(listing.shipping?.local?.amount) || null,
            url:                 listing._links?.web?.href || '',
            platform_listing_id: String(listing.id),
          });
          saved++;
        } catch(e) {
          console.error('importNew:', e);
          errors++;
        }
      }
      this.importMsg    = errors ? `${saved} imported, ${errors} failed` : `✓ ${saved} imported`;
      this.importingNew = false;
      setTimeout(async () => { await dw.fetchAll(); this._process(); }, 800);
    },

    async syncDetails() {
      const selected = this.detailDiffs.filter(d => this.detailSelections[d.rec.id]);
      if (!selected.length) return;
      this.syncingDetails = true;
      this.detailsMsg     = '';
      let saved = 0, errors = 0;
      const dw = Alpine.store('dw');
      for (const { rec, listing, newName, newPrice } of selected) {
        try {
          await dw.updateListing(listing.id, { list_price: newPrice });
          await dw.updateItem(rec.id, { name: newName });
          saved++;
        } catch(e) {
          console.error('syncDetails:', e);
          errors++;
        }
      }
      this.detailsMsg     = errors ? `${saved} synced, ${errors} failed` : `✓ ${saved} synced`;
      this.syncingDetails = false;
      setTimeout(async () => { await dw.fetchAll(); this._process(); }, 800);
    },
  }));
});
