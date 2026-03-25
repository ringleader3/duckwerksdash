// ── Add Modal ─────────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('addModal', () => ({
    saving:  false,
    saveMsg: '',
    form: {
      name:      '',
      status:    'Prepping',
      category:  '',
      site:      '',
      lot:       '',
      newLot:    '',
      cost:      '',
      listPrice: '',
      shipping:  '',
      notes:     '',
    },

    reset() {
      this.form    = { name: '', status: 'Prepping', category: '', site: '', lot: '', newLot: '', cost: '', listPrice: '', shipping: '', notes: '' };
      this.saveMsg = '';
      this.saving  = false;
    },

    async save(keepOpen = false) {
      if (!this.form.name.trim()) { this.saveMsg = 'Name is required'; return; }

      const dw   = Alpine.store('dw');
      const body = { name: this.form.name.trim() };

      if (this.form.cost !== '') body.cost = parseFloat(this.form.cost);
      if (this.form.notes)       body.notes = this.form.notes.trim() || null;

      // Resolve category_id
      if (this.form.category) {
        const cats = await fetch('/api/categories').then(r => r.json());
        const cat  = cats.find(c => c.name === this.form.category);
        if (cat) body.category_id = cat.id;
      }

      // Resolve site_id for listing creation after item save
      let siteId = null;
      if (this.form.site) {
        const sites = await fetch('/api/sites').then(r => r.json());
        const site  = sites.find(s => s.name === this.form.site);
        if (site) siteId = site.id;
      }

      // Resolve lot_id (create new lot if needed)
      const lotName = this.form.newLot.trim() || this.form.lot;
      if (lotName) {
        let lot = dw.lots.find(l => l.name === lotName);
        if (!lot) {
          const res = await fetch('/api/lots', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: lotName }),
          });
          lot = await res.json();
          await fetch('/api/lots').then(r => r.json()).then(lots => { dw._lots = lots; });
        }
        body.lot_id = lot.id;
      }

      this.saving = true; this.saveMsg = '';
      try {
        const created = await dw.createItem(body);
        if (siteId) {
          const listing = { item_id: created.id, site_id: siteId };
          if (this.form.listPrice !== '') listing.list_price        = parseFloat(this.form.listPrice);
          if (this.form.shipping  !== '') listing.shipping_estimate = parseFloat(this.form.shipping);
          await dw.createListing(listing);
          // createListing auto-sets status=Listed; restore user's choice if different
          if (this.form.status && this.form.status !== 'Listed') {
            await dw.updateItem(created.id, { status: this.form.status });
          }
        } else if (this.form.status && this.form.status !== 'Prepping') {
          await dw.updateItem(created.id, { status: this.form.status });
        }
        if (keepOpen) {
          const sticky = { category: this.form.category, lot: this.form.lot, newLot: this.form.newLot };
          this.reset();
          Object.assign(this.form, sticky);
          this.saveMsg = 'Saved!';
        } else {
          this.reset();
          // Transition to item detail modal for the newly created item
          dw.openModal('item', created.id);
        }
      } catch (e) {
        this.saveMsg = 'ERROR: ' + e.message;
        this.saving  = false;
      }
    },
  }));
});
