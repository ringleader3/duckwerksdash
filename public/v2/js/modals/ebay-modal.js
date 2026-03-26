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
    listingDiffs:     [],
    listingSelections:{},
    syncingDetails:   false,
    detailsMsg:       '',
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
      this.orders            = [];
      this.listings          = [];
      this.matched           = [];
      this.unmatched         = [];
      this.unlinkedRecs      = [];
      this.linkSelections    = {};
      this.linksMsg          = '';
      this.listingDiffs      = [];
      this.listingSelections = {};
      this.detailsMsg        = '';
      this.newListings       = [];
      this.newSelections     = {};
      this.importingNew      = false;
      this.importMsg         = '';
      try {
        const [ordersRes, listingsRes] = await Promise.all([
          fetch('/api/ebay/orders'),
          fetch('/api/ebay/listings'),
        ]);
        if (!ordersRes.ok) throw new Error(`Orders HTTP ${ordersRes.status}`);
        const ordersData   = await ordersRes.json();
        const listingsData = listingsRes.ok ? await listingsRes.json() : { listings: [] };
        this.orders   = ordersData.orders || [];
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

      // Listing Details: diffs between live eBay listings and local records
      this.listingDiffs = dw.records.reduce((acc, r) => {
        const localListing = (r.listings || []).find(
          l => l.site?.name === 'eBay' && l.platform_listing_id
        );
        if (!localListing) return acc;
        const live = this.listings.find(l => l.legacyItemId === localListing.platform_listing_id);
        if (!live) return acc;
        const newName  = live.title || '';
        const newPrice = parseFloat(live.price) || 0;
        const oldName  = r.name || '';
        const oldPrice = localListing.list_price || 0;
        if (newName !== oldName || newPrice !== oldPrice) {
          acc.push({ rec: r, listing: localListing, newName, newPrice, oldName, oldPrice });
        }
        return acc;
      }, []);

      const detailSel = {};
      for (const d of this.listingDiffs) detailSel[d.rec.id] = true;
      this.listingSelections = detailSel;

      // New on eBay: live listings with no matching local record
      const linkedIds = new Set(
        dw.records.flatMap(r =>
          (r.listings || [])
            .filter(l => l.site?.name === 'eBay' && l.platform_listing_id)
            .map(l => l.platform_listing_id)
        )
      );
      const seen = new Set();
      this.newListings = this.listings.filter(l => {
        if (linkedIds.has(l.legacyItemId) || seen.has(l.legacyItemId)) return false;
        seen.add(l.legacyItemId);
        return true;
      });
      const newSel = {};
      for (const l of this.newListings) newSel[l.legacyItemId] = true;
      this.newSelections = newSel;
    },

    async syncDetails() {
      const selected = this.listingDiffs.filter(d => this.listingSelections[d.rec.id]);
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
            list_price:          parseFloat(listing.price) || 0,
            platform_listing_id: listing.legacyItemId,
            url:                 `https://www.ebay.com/itm/${listing.legacyItemId}`,
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
