// ── Label Modal — SQLite version ─────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('labelModal', () => ({
    step:           'form',   // 'form' | 'rates' | 'result'
    addrText:       '',
    parcel:         { type: 'box', weightLbs: '', weightOz: '', length: '', width: '', height: '' },
    rates:          [],
    purchaseResult: null,
    ratePrice:      0,
    carrier:        null,
    reverbLinks:       null,
    reverbSaleAmount:  null,
    reverbOrderNum:    null,
    loading:        false,
    errMsg:         '',
    saveMsg:        '',
    savingShip:     false,
    reverbShipMsg:  '',   // separate from saveMsg so it isn't overwritten by saveShipping()

    init() {
      this.$watch('$store.dw.activeModal', val => {
        if (val === 'label') this._open();
      });
    },

    async _open() {
      this.step              = 'form';
      this.addrText          = '';
      this.rates             = [];
      this.purchaseResult    = null;
      this.ratePrice         = 0;
      this.carrier           = null;
      this.reverbLinks       = null;
      this.reverbSaleAmount  = null;
      this.reverbOrderNum    = null;
      this.loading           = false;
      this.errMsg            = '';
      this.saveMsg           = '';
      this.savingShip        = false;
      this.reverbShipMsg     = '';

      const dw      = Alpine.store('dw');
      const r       = dw.records.find(x => x.id === dw.activeRecordId);
      if (!r) return;

      const listing = dw.activeListing(r);
      const isReverb = listing?.site?.name === 'Reverb';
      const orderNum = isReverb ? listing?.platform_listing_id : null;

      if (orderNum) {
        this.reverbOrderNum = orderNum;
        try {
          const res = await fetch(`/api/reverb/my/orders/selling/${orderNum}`);
          if (res.ok) {
            const order = await res.json();
            this.reverbLinks      = order._links || null;
            // direct_checkout_payout is post-fee seller payout; amount_product is pre-fee listing price
            this.reverbSaleAmount = parseFloat(order.direct_checkout_payout?.amount) || parseFloat(order.amount_product?.amount) || null;
            this.reverbOrderNum   = order.order_number || orderNum;
            console.log('[Reverb order] direct_checkout_payout:', order.direct_checkout_payout, '| amount_product:', order.amount_product?.amount);
            if (order.shipping_address) {
              this.addrText = this._addrToText(order.shipping_address);
            }
          }
        } catch(e) { console.warn('Reverb order fetch failed:', e); }
      }
    },

    get record() {
      const dw = Alpine.store('dw');
      return dw.records.find(r => r.id === dw.activeRecordId) || null;
    },

    get itemName() {
      return this.record ? this.record.name || '—' : '—';
    },

    setType(type) {
      this.parcel.type = type;
      if (type === 'poly') { this.parcel.width = ''; this.parcel.height = ''; }
    },

    _addrToText(a) {
      const lines = [a.name, a.street_address];
      if (a.extended_address) lines.push(a.extended_address);
      lines.push(`${a.locality} ${a.region} ${a.postal_code}`);
      if (a.country_code && a.country_code !== 'US') lines.push(a.country_code);
      return lines.join('\n');
    },

    _parseAddress(text) {
      const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 3) return null;
      const name = lines[0];
      let rest = lines.slice(1);
      let country = 'US';
      const last = rest[rest.length - 1];
      if (/^[A-Z]{2}$/.test(last))       { country = last; rest = rest.slice(0, -1); }
      else if (/united states/i.test(last)) { country = 'US'; rest = rest.slice(0, -1); }
      const csz    = rest[rest.length - 1];
      const streets = rest.slice(0, -1);
      const parts  = csz.split(/\s+/);
      if (parts.length < 2) return null;
      const zip   = parts[parts.length - 1];
      const state = parts[parts.length - 2];
      const city  = parts.slice(0, parts.length - 2).join(' ');
      return { name, street1: streets[0] || '', street2: streets[1] || '', city, state, zip, country };
    },

    async getRates() {
      this.errMsg = '';
      const addr = this._parseAddress(this.addrText);
      if (!addr)                { this.errMsg = 'Could not parse address — check format'; return; }
      const totalLbs = (parseFloat(this.parcel.weightLbs) || 0) + (parseFloat(this.parcel.weightOz) || 0) / 16;
      if (!totalLbs)            { this.errMsg = 'Weight required'; return; }
      if (!this.parcel.length)  { this.errMsg = 'Length required'; return; }
      if (this.parcel.type === 'box' && (!this.parcel.width || !this.parcel.height)) {
        this.errMsg = 'Width and height required for boxes'; return;
      }
      const parcel = {
        weight: totalLbs,
        length: this.parcel.length,
        width:  this.parcel.type === 'box' ? this.parcel.width  : '1',
        height: this.parcel.type === 'box' ? this.parcel.height : '1',
      };
      this.loading = true;
      try {
        const res  = await fetch('/api/label/rates', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ toAddress: addr, parcel }),
        });
        const data = await res.json();
        if (!res.ok || !data.rates) {
          this.errMsg = data.error || 'No rates returned';
          return;
        }
        this.rates = data.rates;
        this.step  = 'rates';
      } catch(e) {
        this.errMsg = e.message;
      } finally {
        this.loading = false;
      }
    },

    async purchase(rateId, price, carrier) {
      this.carrier   = carrier || null;
      this.ratePrice = price;
      this.loading   = true;
      this.errMsg    = '';
      try {
        const res  = await fetch('/api/label/purchase', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ rateObjectId: rateId }),
        });
        const data = await res.json();
        if (!res.ok) {
          this.errMsg = data.error || 'Purchase failed';
          this.step   = 'rates';
          return;
        }
        this.purchaseResult = data;
        this.step = 'result';
        // Auto-fire both on purchase — don't wait for button clicks
        if (this.reverbLinks?.ship && data.trackingNumber) this.markShipped();
        this.saveShipping();
      } catch(e) {
        this.errMsg = e.message;
        this.step   = 'rates';
      } finally {
        this.loading = false;
      }
    },

    async saveShipping() {
      const r = this.record;
      if (!r) return;
      this.savingShip = true;
      this.saveMsg    = '';
      const dw      = Alpine.store('dw');
      const listing = dw.activeListing(r);

      try {
        // ── 1. Create or update the order ──────────────────────────────────────
        const dateSold         = new Date().toISOString().split('T')[0];
        const sale_price       = this.reverbSaleAmount || null;
        const platform_order_num = this.reverbOrderNum || null;

        let orderId;
        if (r.order) {
          await dw.updateOrder(r.order.id, { sale_price, date_sold: dateSold, platform_order_num });
          orderId = r.order.id;
        } else {
          const newOrder = await dw.createOrder({
            listing_id:          listing?.id || null,
            sale_price,
            date_sold:           dateSold,
            platform_order_num,
          });
          orderId = newOrder.id;
        }

        // ── 2. Mark item sold ──────────────────────────────────────────────────
        if (r.status !== 'Sold') {
          await dw.updateItem(r.id, { status: 'Sold' });
        }

        // ── 3. Create or update the shipment ──────────────────────────────────
        const shipmentFields = {
          carrier:         this.carrier || null,
          service:         this.purchaseResult?.service || null,
          tracking_id:     this.purchaseResult?.trackingId     || null,
          tracking_number: this.purchaseResult?.trackingNumber || null,
          tracker_url:     this.purchaseResult?.trackerUrl     || null,
          label_url:       this.purchaseResult?.labelUrl       || null,
          shipping_cost:   this.ratePrice,
        };
        if (r.shipment) {
          await dw.updateShipment(r.shipment.id, shipmentFields);
        } else {
          await dw.createShipment({ order_id: orderId, ...shipmentFields });
        }

        // createShipment calls fetchAll internally — store is fresh
        this.saveMsg = '✓ saved';
      } catch(e) {
        this.saveMsg = 'ERROR: ' + e.message;
      } finally {
        this.savingShip = false;
      }
    },

    async markShipped() {
      if (!this.reverbLinks?.ship?.href || !this.purchaseResult?.trackingNumber) return;
      this.reverbShipMsg = 'Notifying Reverb...';
      const apiPath = this.reverbLinks.ship.href
        .replace(/^https?:\/\/api\.reverb\.com\/api\//, '');
      const carrierMap = { USPS: 'USPS', UPS: 'UPS', FedEx: 'FedEx', DHL: 'DHL', DHLExpress: 'DHLExpress' };
      const provider   = (this.carrier && carrierMap[this.carrier]) || this.carrier || 'Other';
      try {
        const res = await fetch(`/api/reverb/${apiPath}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            provider,
            tracking_number:   this.purchaseResult.trackingNumber,
            send_notification: true,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.message || `HTTP ${res.status}`);
        }
        this.reverbShipMsg = '✓ buyer notified';
      } catch(e) {
        this.reverbShipMsg = 'Reverb error: ' + e.message;
        console.error('[markShipped] error:', e);
      }
    },
  }));
});
