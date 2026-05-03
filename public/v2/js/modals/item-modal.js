// ── Item Modal ────────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('itemModal', () => ({
    editMode:        false,
    saving:          false,
    saveMsg:         '',
    form:            {},
    trackingInfo:    null,
    trackingLoading: false,
    markSoldId:      null,
    markSoldPrice:   '',

    init() {
      this.$watch('$store.dw.activeRecordId', () => {
        this.editMode = false; this.saveMsg = ''; this.form = {};
        this.trackingInfo = null; this.trackingLoading = false;
        this.markSoldId = null; this.markSoldPrice = '';
        this._loadTracking();
      });
      if (Alpine.store('dw').activeRecordId) this._loadTracking();
    },

    get record() {
      const dw = Alpine.store('dw');
      return dw.records.find(r => r.id === dw.activeRecordId) || null;
    },

    get isSold() { return this.record?.status === 'Sold'; },
    get itemSku() { return this.record?.sku || null; },

    startEdit() {
      const r = this.record;
      if (!r) return;
      const listing = Alpine.store('dw').activeListing(r);
      this.form = {
        name:      r.name,
        status:    r.status,
        category:  r.category?.name || '',
        lot:       r.lot?.name || '',
        cost:      r.cost ?? '',
        quantity:  r.quantity ?? 1,
        sale:      r.order?.sale_price ?? '',
        listings:  (r.listings || []).map(l => ({
          id:                  l.id,
          site:                l.site?.name || '',
          status:              l.status,
          list_price:          l.list_price ?? '',
          shipping_estimate:   l.shipping_estimate ?? '',
          url:                 l.url || '',
          platform_listing_id: l.platform_listing_id || '',
        })),
        pendingListings: [],
        shipment: r.shipment ? {
          tracking_id:     r.shipment.tracking_id     || '',
          tracking_number: r.shipment.tracking_number || '',
          tracker_url:     r.shipment.tracker_url     || '',
          shipping_cost:   r.shipment.shipping_cost   ?? '',
        } : null,
      };
      this.editMode = true; this.saveMsg = '';
    },

    cancelEdit() { this.editMode = false; this.saveMsg = ''; },

    async save() {
      const dw = Alpine.store('dw');
      const f  = this.form;
      const r  = this.record;
      const itemFields = {};

      if (f.name)     itemFields.name     = f.name;
      if (f.status)   itemFields.status   = f.status;
      if (f.cost !== '') itemFields.cost = parseFloat(f.cost);
      if (r.quantity > 1 && f.quantity > 0) itemFields.quantity = parseInt(f.quantity, 10);

      // Resolve category_id and lot_id
      if (f.category) {
        const cat = (await fetch('/api/categories').then(r=>r.json())).find(c=>c.name===f.category);
        if (cat) itemFields.category_id = cat.id;
      }
      if (f.lot !== undefined) {
        const lot = dw.lots.find(l => l.name === f.lot);
        itemFields.lot_id = lot?.id || null;
      }

      this.saving = true; this.saveMsg = '';
      try {
        await dw.updateItem(r.id, itemFields);

        if (r.order?.id && f.sale !== '') {
          await dw.updateOrder(r.order.id, { sale_price: parseFloat(f.sale) });
        }

        if (r.shipment?.id && f.shipment) {
          const sf = {};
          if (f.shipment.tracking_id     !== (r.shipment.tracking_id     || '')) sf.tracking_id     = f.shipment.tracking_id     || null;
          if (f.shipment.tracking_number !== (r.shipment.tracking_number || '')) sf.tracking_number = f.shipment.tracking_number || null;
          if (f.shipment.tracker_url     !== (r.shipment.tracker_url     || '')) sf.tracker_url     = f.shipment.tracker_url     || null;
          if (f.shipment.shipping_cost   !== (r.shipment.shipping_cost   ?? '')) sf.shipping_cost   = f.shipment.shipping_cost !== '' ? parseFloat(f.shipment.shipping_cost) : null;
          if (Object.keys(sf).length) await dw.updateShipment(r.shipment.id, sf);
        }

        // Update per-listing fields (price, shipping, URL, platform_listing_id)
        for (const lf of (f.listings || [])) {
          if (lf.id) {
            const listingFields = {
              url:                 lf.url || null,
              platform_listing_id: lf.platform_listing_id || null,
            };
            if (lf.list_price        !== '') listingFields.list_price        = parseFloat(lf.list_price);
            if (lf.shipping_estimate !== '') listingFields.shipping_estimate = parseFloat(lf.shipping_estimate);
            await dw.updateListing(lf.id, listingFields, { skipRefresh: true });
          }
        }

        // Create new listings from pendingListings
        const pending = (f.pendingListings || []).filter(pl => pl.site);
        if (pending.length) {
          const sites = await fetch('/api/sites').then(r => r.json());
          for (const pl of pending) {
            const site = sites.find(s => s.name === pl.site);
            if (!site) continue;
            const listing = { item_id: r.id, site_id: site.id };
            if (pl.list_price        !== '') listing.list_price        = parseFloat(pl.list_price);
            if (pl.shipping_estimate !== '') listing.shipping_estimate = parseFloat(pl.shipping_estimate);
            if (pl.url)                 listing.url                 = pl.url;
            if (pl.platform_listing_id) listing.platform_listing_id = pl.platform_listing_id;
            await dw.createListing(listing);
          }
          if (f.status && f.status !== 'Listed') await dw.updateItem(r.id, { status: f.status });
        }

        await dw.fetchAll();

        this.saveMsg = 'saved';
        setTimeout(() => { this.editMode = false; this.saveMsg = ''; }, 900);
      } catch (e) {
        this.saveMsg = 'ERROR: ' + e.message;
      } finally {
        this.saving = false;
      }
    },

    listingStatusBadge(status) {
      if (status === 'active') return 'badge-listed';
      if (status === 'sold')   return 'badge-sold';
      return 'badge-other';
    },

    listingUrl(l) {
      if (l.platform_listing_id) {
        const site = l.site?.name;
        if (site === 'eBay')   return `https://www.ebay.com/itm/${l.platform_listing_id}`;
        if (site === 'Reverb') return `https://reverb.com/item/${l.platform_listing_id}`;
      }
      return l.url || null;
    },

    markSold(listingId) {
      this.markSoldId    = listingId;
      this.markSoldPrice = '';
    },

    cancelMarkSold() {
      this.markSoldId    = null;
      this.markSoldPrice = '';
    },

    async confirmMarkSold(listingId) {
      const dw = Alpine.store('dw');
      const r  = this.record;
      // End all OTHER active listings
      const others = (r.listings || []).filter(l => l.status === 'active' && l.id !== listingId);
      await Promise.all(others.map(l =>
        dw.updateListing(l.id, { status: 'ended', ended_at: new Date().toISOString() }, { skipRefresh: true })
      ));
      // Create order — auto-sets sold listing to 'sold' and item to 'Sold'
      await dw.createOrder({
        listing_id: listingId,
        sale_price: this.markSoldPrice ? parseFloat(this.markSoldPrice) : null,
        date_sold:  new Date().toISOString().split('T')[0],
      });
      this.markSoldId    = null;
      this.markSoldPrice = '';
    },

    badgeClass(status) {
      const s = (status || '').toLowerCase();
      if (s === 'listed')   return 'badge-listed';
      if (s === 'sold')     return 'badge-sold';
      if (s === 'prepping') return 'badge-prepping';
      return 'badge-other';
    },
    catBadgeClass(cat) { return CAT_BADGE[cat] || 'badge-other'; },

    async clearTracking() {
      const r = this.record;
      if (!r?.shipment?.id) return;
      await Alpine.store('dw').updateShipment(r.shipment.id, {
        tracking_id: null, tracking_number: null, tracker_url: null
      });
      // Optimistically clear so the watcher can't race fetchAll and reload tracking
      r.shipment.tracking_id     = null;
      r.shipment.tracking_number = null;
      r.shipment.tracker_url     = null;
      this.trackingInfo = null;
      await Alpine.store('dw').fetchAll();
    },

    async _loadTracking() {
      const r = this.record;
      if (!r?.shipment?.tracking_id) return;
      this.trackingLoading = true;
      this.trackingInfo    = await Alpine.store('dw').fetchTracker(r.shipment.tracking_id);
      this.trackingLoading = false;
    },

    get trackStatusBadgeClass() {
      const s = this.trackingInfo?.status;
      switch (s) {
        case 'delivered':        return 'badge-sold';
        case 'out_for_delivery': return 'badge-pending';
        case 'in_transit':       return 'badge-listed';
        case 'return_to_sender':
        case 'failure':          return 'badge-prepping';
        default:                 return 'badge-other';
      }
    },
    get trackStatusLabel() {
      const s = this.trackingInfo?.status;
      if (!s) return 'n/a';
      return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
    get trackEstDelivery() {
      const raw = this.trackingInfo?.estDelivery;
      if (!raw) return null;
      return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
  }));
});
