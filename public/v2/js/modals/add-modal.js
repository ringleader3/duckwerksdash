// ── Add Modal ─────────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('addModal', () => ({
    saving:  false,
    saveMsg: '',
    form: {
      name:     '',
      category: '',
      lot:      '',
      newLot:   '',
      cost:     '',
      notes:    '',
    },

    reset() {
      this.form    = { name: '', category: '', lot: '', newLot: '', cost: '', notes: '' };
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
