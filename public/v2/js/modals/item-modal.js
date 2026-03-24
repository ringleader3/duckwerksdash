// ── Item Modal ────────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('itemModal', () => ({
    editMode:        false,
    saving:          false,
    saveMsg:         '',
    form:            {},
    trackingInfo:    null,
    trackingLoading: false,

    init() {
      this.$watch('$store.dw.activeRecordId', () => {
        this.editMode = false; this.saveMsg = ''; this.form = {};
        this.trackingInfo = null; this.trackingLoading = false;
        this._loadTracking();
      });
      if (Alpine.store('dw').activeRecordId) this._loadTracking();
    },

    get record() {
      const dw = Alpine.store('dw');
      return dw.records.find(r => r.id === dw.activeRecordId) || null;
    },

    get isSold() { return this.record?.status === 'Sold'; },

    startEdit() {
      const r = this.record;
      if (!r) return;
      const listing = Alpine.store('dw').activeListing(r);
      this.form = {
        name:               r.name,
        status:             r.status,
        category:           r.category?.name || '',
        lot:                r.lot?.name || '',
        url:                listing?.url || '',
        platform_listing_id: listing?.platform_listing_id || '',
        list_price:         listing?.list_price ?? '',
        cost:               r.cost ?? '',
        sale:               r.order?.sale_price ?? '',
        shipping_estimate:  listing?.shipping_estimate ?? '',
        listing_id:         listing?.id || null,
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

        // Update listing fields if listing exists
        if (f.listing_id) {
          const listingFields = {};
          if (f.url               !== undefined) listingFields.url                = f.url || null;
          if (f.platform_listing_id !== undefined) listingFields.platform_listing_id = f.platform_listing_id || null;
          if (f.list_price         !== '') listingFields.list_price        = parseFloat(f.list_price);
          if (f.shipping_estimate  !== '') listingFields.shipping_estimate = parseFloat(f.shipping_estimate);
          if (Object.keys(listingFields).length) {
            await dw.updateListing(f.listing_id, listingFields);
          }
        }

        this.saveMsg = 'saved';
        setTimeout(() => { this.editMode = false; this.saveMsg = ''; }, 900);
      } catch (e) {
        this.saveMsg = 'ERROR: ' + e.message;
      } finally {
        this.saving = false;
      }
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
      this.trackingInfo = null;
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
      if (!s) return '—';
      return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
    get trackEstDelivery() {
      const raw = this.trackingInfo?.estDelivery;
      if (!raw) return null;
      return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
  }));
});
