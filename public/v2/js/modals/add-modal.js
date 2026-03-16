// ── Add Modal — Phase 4 ───────────────────────────────────────────────────────
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
      listPrice: '',
      cost:      '',
    },

    reset() {
      this.form    = { name: '', status: 'Prepping', category: '', site: '', lot: '', newLot: '', listPrice: '', cost: '' };
      this.saveMsg = '';
      this.saving  = false;
    },

    async save(keepOpen = false) {
      if (!this.form.name.trim()) { this.saveMsg = 'Name is required'; return; }

      const fields = {};
      fields[F.name]   = this.form.name.trim();
      fields[F.status] = this.form.status;
      if (this.form.category)       fields[F.category]  = this.form.category;
      if (this.form.site)           fields[F.site]       = this.form.site;
      const lotVal = this.form.newLot.trim() || this.form.lot;
      if (lotVal) fields[F.lot] = lotVal;
      if (this.form.listPrice !== '') fields[F.listPrice] = parseFloat(this.form.listPrice);
      if (this.form.cost      !== '') fields[F.cost]      = parseFloat(this.form.cost);

      this.saving  = true;
      this.saveMsg = '';
      try {
        await Alpine.store('dw').createRecord(fields);
        if (keepOpen) {
          const sticky = { status: this.form.status, category: this.form.category, site: this.form.site, lot: this.form.lot, newLot: this.form.newLot };
          this.reset();
          Object.assign(this.form, sticky);
          this.saveMsg = 'Saved!';
        } else {
          this.reset();
          Alpine.store('dw').closeModal();
        }
      } catch (e) {
        this.saveMsg = 'ERROR: ' + e.message;
        this.saving  = false;
      }
    },
  }));
});
