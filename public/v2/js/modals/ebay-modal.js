// ── eBay Sync Modal ───────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('ebayModal', () => ({
    loading:          false,
    errMsg:           '',
    orders:           [],
    listings:         [],
    matched:          [],
    unmatched:        [],
    unlinkedRecs:     [],
    linkSelections:   {},
    savingLinks:      false,
    linksMsg:         '',
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
        if (val === 'ebay') this.run();
      });
    },

    async run() {
      this.loading        = true;
      this.errMsg         = '';
      this.orders           = [];
      this.listings         = [];
      this.matched          = [];
      this.unmatched        = [];
      this.unlinkedRecs     = [];
      this.linkSelections   = {};
      this.linksMsg         = '';
      this.detailDiffs      = [];
      this.detailSelections = {};
      this.detailsMsg       = '';
      this.syncingDetails   = false;
      this.newListings      = [];
      this.newSelections    = {};
      this.importingNew     = false;
      this.importMsg        = '';
      try {
        const [ordersRes, listingsRes] = await Promise.all([
          fetch('/api/ebay/orders'),
          fetch('/api/ebay/listings'),
        ]);
        if (!ordersRes.ok) throw new Error(`Orders HTTP ${ordersRes.status}`);
        const ordersData   = await ordersRes.json();
        this.orders        = ordersData.orders || [];
        // listings may fail if not yet re-authed — degrade gracefully
        if (listingsRes.ok) {
          const listingsData = await listingsRes.json();
          this.listings      = listingsData.listings || [];
        }
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
        // Match by legacyItemId from order line items ↔ listing.platform_listing_id
        const lineItem = order.lineItems?.[0];
        const legacyId = lineItem ? String(lineItem.legacyItemId) : null;
        const rec = legacyId
          ? dw.records.find(r =>
              (r.listings || []).some(l =>
                l.site?.name === 'eBay' && l.platform_listing_id === legacyId
              )
            )
          : null;

        if (rec) this.matched.push({ order, rec, lineItem });
        else     this.unmatched.push(order);
      }

      // Unlinked: Listed eBay items with no platform_listing_id
      this.unlinkedRecs = dw.records.filter(r => {
        if (r.status !== 'Listed') return false;
        return (r.listings || []).some(
          l => l.site?.name === 'eBay' && l.status === 'active' && !l.platform_listing_id
        );
      });

      const sel = {};
      for (const r of this.unlinkedRecs) sel[r.id] = '';
      this.linkSelections = sel;

      // Listing detail diffs (name + price) for linked records
      this.detailDiffs = dw.records.reduce((acc, r) => {
        const ebayListing = (r.listings || []).find(
          l => l.site?.name === 'eBay' && l.platform_listing_id
        );
        if (!ebayListing) return acc;
        const ebayItem = this.listings.find(l => l.legacyItemId === ebayListing.platform_listing_id);
        if (!ebayItem) return acc;
        const newName  = ebayItem.title || '';
        const newPrice = ebayItem.price || 0;
        const oldName  = r.name || '';
        const oldPrice = ebayListing.list_price || 0;
        if (newName !== oldName || newPrice !== oldPrice) {
          acc.push({ rec: r, listing: ebayListing, newName, newPrice, oldName, oldPrice });
        }
        return acc;
      }, []);

      const detailSel = {};
      for (const d of this.detailDiffs) detailSel[d.rec.id] = true;
      this.detailSelections = detailSel;

      // New on eBay: active listings with no matching local record
      const usedIds = new Set(
        dw.records.flatMap(r => r.listings || [])
          .map(l => l.platform_listing_id)
          .filter(Boolean)
      );
      this.newListings = this.listings.filter(l => !usedIds.has(l.legacyItemId));
      const newSel = {};
      for (const l of this.newListings) newSel[l.legacyItemId] = true;
      this.newSelections = newSel;
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
          console.error('eBay syncDetails:', e);
          errors++;
        }
      }
      this.detailsMsg     = errors ? `${saved} synced, ${errors} failed` : `✓ ${saved} synced`;
      this.syncingDetails = false;
      setTimeout(async () => { await dw.fetchAll(); this._process(); }, 800);
    },

    async importNew() {
      const selected = this.newListings.filter(l => this.newSelections[l.legacyItemId]);
      if (!selected.length) return;
      this.importingNew = true;
      this.importMsg    = '';
      let saved = 0, errors = 0;
      const dw = Alpine.store('dw');
      const ebaySite = dw.sites.find(s => s.name === 'eBay');
      if (!ebaySite) { this.importMsg = 'eBay site not found'; this.importingNew = false; return; }
      for (const listing of selected) {
        try {
          const item = await dw.createItem({ name: listing.title || 'Untitled', cost: 0 });
          await dw.createListing({
            item_id:             item.id,
            site_id:             ebaySite.id,
            list_price:          listing.price,
            platform_listing_id: listing.legacyItemId,
          });
          saved++;
        } catch(e) {
          console.error('eBay importNew:', e);
          errors++;
        }
      }
      this.importMsg    = errors ? `${saved} imported, ${errors} failed` : `✓ ${saved} imported`;
      this.importingNew = false;
      setTimeout(async () => { await dw.fetchAll(); this._process(); }, 800);
    },

    openShip(rec, order) {
      const dw             = Alpine.store('dw');
      dw.activeEbayOrderId = order.orderId;
      dw.previousModal     = { type: 'ebay' };
      dw.openModal('label', rec.id);
    },

    async saveLinks() {
      const toLink = this.unlinkedRecs
        .filter(r => this.linkSelections[r.id])
        .map(r => {
          const listing = (r.listings || []).find(
            l => l.site?.name === 'eBay' && l.status === 'active' && !l.platform_listing_id
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
          console.error('eBay saveLinks:', e);
          errors++;
        }
      }
      this.linksMsg    = errors ? `${saved} saved, ${errors} failed` : `✓ ${saved} saved`;
      this.savingLinks = false;
      setTimeout(async () => { await dw.fetchAll(); this._process(); }, 800);
    },

    // Orders available to link — unmatched only (matched ones are already taken)
    get linkableOrders() {
      return this.unmatched;
    },

    buyerName(order) {
      return order.buyer?.buyerRegistrationAddress?.fullName || order.orderId;
    },

    lineItemTitle(order) {
      return order.lineItems?.[0]?.title || '—';
    },

    lineItemId(order) {
      const id = order.lineItems?.[0]?.legacyItemId;
      return id ? String(id) : '';
    },
  }));
});
