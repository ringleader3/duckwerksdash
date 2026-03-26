// ── Duckwerks v2 — Alpine Store ───────────────────────────────────────────────
// Single source of truth. All API calls happen here.
// Views and modals read $store.dw.* — they never call the API directly.

document.addEventListener('alpine:init', () => {
  Alpine.store('dw', {

    // ── State ─────────────────────────────────────────────────────────────────
    records:          [],
    _lots:            [],        // raw lot rows from /api/lots
    categories:       [],        // from /api/categories
    sites:            [],        // from /api/sites
    loading:          false,
    error:            null,
    activeView:       'dashboard',
    activeModal:      null,
    activeRecordId:   null,
    activeEbayOrderId:   null,
    activeReverbOrderNum: null,
    activeLotName:    null,
    previousModal:    null,
    categoryFilter:   null,
    pendingFilters:   null,
    shippingProvider: 'EASYPOST',

    // ── Init ──────────────────────────────────────────────────────────────────
    async init() {
      const saved = localStorage.getItem('dw-view');
      if (saved && ['dashboard', 'items', 'lots'].includes(saved)) {
        this.activeView = saved;
      }
      Alpine.effect(() => { localStorage.setItem('dw-view', this.activeView); });

      try {
        const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
        if (cfg.shippingProvider) this.shippingProvider = cfg.shippingProvider;
        await this.fetchAll();
      } catch (e) {
        this.error = 'Failed to initialize: ' + e.message;
      }
    },

    // ── Data Fetch ────────────────────────────────────────────────────────────
    async fetchAll() {
      this.loading = true;
      this.error   = null;
      try {
        const [items, lots, cats, sites] = await Promise.all([
          fetch('/api/items').then(r => { if (!r.ok) throw new Error('items fetch failed'); return r.json(); }),
          fetch('/api/lots').then(r => { if (!r.ok) throw new Error('lots fetch failed'); return r.json(); }),
          fetch('/api/categories').then(r => r.json()).catch(() => []),
          fetch('/api/sites').then(r => r.json()).catch(() => []),
        ]);
        this.records    = items;
        this._lots      = lots;
        this.categories = cats;
        this.sites      = sites;
      } catch (e) {
        this.error = 'Failed to load records: ' + e.message;
      } finally {
        this.loading = false;
      }
    },

    // ── Modal Helpers ─────────────────────────────────────────────────────────
    printLabel(url) {
      window.open(`/api/label/print-pdf?url=${encodeURIComponent(url)}`, '_blank');
    },
    openModal(type, recordId = null, lotName = null) {
      this.activeModal    = type;
      this.activeRecordId = recordId;
      this.activeLotName  = lotName;
    },
    closeModal() {
      if (this.previousModal) {
        const prev = this.previousModal;
        this.previousModal  = null;
        this.activeModal    = prev.type;
        this.activeRecordId = prev.recordId;
        this.activeLotName  = prev.lotName;
        return;
      }
      this.activeModal    = null;
      this.activeRecordId = null;
      this.activeLotName  = null;
    },

    navToItems(status, category, site) {
      this.pendingFilters = {
        status:   status   || 'All',
        category: category || null,
        site:     site     || 'All',
      };
      this.previousModal = null;
      this.activeView = 'items';
      this.closeModal();
    },

    // ── Computed record sets ──────────────────────────────────────────────────
    get listedRecords() { return this.records.filter(r => r.status === 'Listed'); },
    get soldRecords()   { return this.records.filter(r => r.status === 'Sold'); },

    // Lots: _lots from API enriched with their items array
    get lots() {
      return this._lots.map(lot => ({
        ...lot,
        items: this.records.filter(r => r.lot?.id === lot.id),
      }));
    },

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Best active listing for display (highest list_price among active listings)
    activeListing(r) {
      const active = (r.listings || []).filter(l => l.status === 'active');
      if (!active.length) return r.listings?.[0] || null;
      return active.reduce((best, l) => (l.list_price || 0) > (best.list_price || 0) ? l : best, active[0]);
    },

    // Site label from best active listing
    siteLabel(r) {
      return this.activeListing(r)?.site?.name || '';
    },

    // Listing URL — constructed from site + platform_listing_id; falls back to stored url
    listingUrl(r) {
      const l = this.activeListing(r);
      if (!l) return null;
      if (l.platform_listing_id) {
        const site = l.site?.name;
        if (site === 'eBay')   return `https://www.ebay.com/itm/${l.platform_listing_id}`;
        if (site === 'Reverb') return `https://reverb.com/item/${l.platform_listing_id}`;
      }
      return l.url || null;
    },

    // Est. profit for a listed item.
    // Uses shipment cost if shipped, else listing shipping_estimate, else $10 placeholder.
    // Fees come from listing.site.
    estProfit(r) {
      const listing = this.activeListing(r);
      const lp      = listing?.list_price || 0;
      const cost    = r.cost || 0;

      let ship;
      if (r.shipment?.shipping_cost != null) {
        ship = r.shipment.shipping_cost;
      } else if (listing?.shipping_estimate != null) {
        ship = listing.shipping_estimate;
      } else {
        ship = 10; // placeholder
      }

      let fee = 0;
      if (listing?.site) {
        const s = listing.site;
        fee = s.fee_on_shipping ? (lp + ship) * s.fee_rate + s.fee_flat
                                :  lp         * s.fee_rate + s.fee_flat;
      }
      return lp - cost - ship - fee;
    },

    // Post-fee payout for a listed item (est.)
    payout(r) {
      const listing = this.activeListing(r);
      const lp      = listing?.list_price || 0;
      const ship    = listing?.shipping_estimate ?? 10;
      let fee = 0;
      if (listing?.site) {
        const s = listing.site;
        fee = s.fee_on_shipping ? (lp + ship) * s.fee_rate + s.fee_flat
                                :  lp         * s.fee_rate + s.fee_flat;
      }
      return lp - fee;
    },

    fmt0(n)  { return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    fmtK(n)  { return Math.abs(n) >= 1000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000).toFixed(1) + 'K' : this.fmt0(n); },
    pct(a, b){ return b > 0 ? Math.round((a / b) * 100) : 0; },

    // ── Writes ────────────────────────────────────────────────────────────────
    async updateItem(id, fields) {
      const res = await fetch(`/api/items/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      const updated = await res.json();
      const idx = this.records.findIndex(r => r.id === id);
      if (idx !== -1) this.records[idx] = updated;
    },

    async deleteItem(id) {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      this.records = this.records.filter(r => r.id !== id);
    },

    async createItem(fields) {
      const res = await fetch('/api/items', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const created = await res.json();
      this.records.push(created);
      return created;
    },

    async createListing(fields) {
      const res = await fetch('/api/listings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Create listing failed: ${res.status}`);
      // Refresh item in store (status changed to Listed)
      const itemRes = await fetch(`/api/items`).then(r => r.json());
      this.records = itemRes;
      return await res.json();
    },

    async updateListing(id, fields) {
      const res = await fetch(`/api/listings/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Update listing failed: ${res.status}`);
      await this.fetchAll(); // listings are nested in items — full refresh needed
    },

    async createOrder(fields) {
      const res = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Create order failed: ${res.status}`);
      const created = await res.json(); // capture before fetchAll — body stream can only be read once
      await this.fetchAll();
      return created;
    },

    async updateOrder(id, fields) {
      const res = await fetch(`/api/orders/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Update order failed: ${res.status}`);
    },

    async createShipment(fields) {
      const res = await fetch('/api/shipments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Create shipment failed: ${res.status}`);
      const created = await res.json(); // capture before fetchAll — body stream can only be read once
      await this.fetchAll();
      return created;
    },

    async updateShipment(id, fields) {
      const res = await fetch(`/api/shipments/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Update shipment failed: ${res.status}`);
    },

    // ── Tracking ──────────────────────────────────────────────────────────────
    _carrierName(raw) {
      const map = { UPSDAP: 'UPS', UPS: 'UPS', USPS: 'USPS', FedEx: 'FedEx',
                    DHLExpress: 'DHL Express', DHL: 'DHL' };
      return map[raw] || raw || null;
    },

    async fetchTracker(trackingId) {
      if (!trackingId) return null;
      try {
        const res  = await fetch(`/api/label/tracker/${trackingId}`);
        const data = await res.json();
        if (!res.ok || data.skipped) return null;
        const events      = data.tracking_details || [];
        const deliveryEvt = events.find(e => e.status === 'delivered');
        return {
          status:      data.status,
          carrier:     this._carrierName(data.carrier),
          estDelivery: data.est_delivery_date || null,
          deliveredAt: deliveryEvt?.datetime || null,
          events,
          publicUrl:   data.public_url || null,
        };
      } catch (e) {
        console.warn('fetchTracker failed:', e);
        return null;
      }
    },

    isInTransit(r, trackingData) {
      if (r.status !== 'Sold' || !r.shipment?.tracking_id) return false;
      const td = trackingData[r.id];
      if (!td || td.status !== 'delivered') return true;
      if (!td.deliveredAt) return false;
      return (Date.now() - new Date(td.deliveredAt).getTime()) < 3 * 24 * 60 * 60 * 1000;
    },

  });
});
