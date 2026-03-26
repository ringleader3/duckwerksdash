// ── eBay Sync Modal ───────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('ebayModal', () => ({
    loading:        false,
    errMsg:         '',
    orders:         [],
    listings:       [],
    matched:        [],
    unmatched:      [],
    unlinkedRecs:   [],
    linkSelections: {},
    savingLinks:    false,
    linksMsg:       '',

    init() {
      this.$watch('$store.dw.activeModal', val => {
        if (val === 'ebay') this.run();
      });
    },

    async run() {
      this.loading        = true;
      this.errMsg         = '';
      this.orders         = [];
      this.listings       = [];
      this.matched        = [];
      this.unmatched      = [];
      this.unlinkedRecs   = [];
      this.linkSelections = {};
      this.linksMsg       = '';
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
