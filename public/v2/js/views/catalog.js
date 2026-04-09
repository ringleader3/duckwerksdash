// ── Catalog Intake View ────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('catalogView', () => ({
    // form state
    nextDiscNum:   null,
    box:           localStorage.getItem('catalog_box') || '',
    manufacturer:  '',
    mold:          '',
    type:          '',
    plastic:       '',
    run:           '',
    notes:         '',
    condition:     'Unthrown',
    weight:        175,
    color:         '',
    listPrice:     25,

    // ui state
    manufacturers: [],
    toast:         null,   // { msg, ok }
    submitting:    false,

    TYPES:  ['Distance Driver', 'Fairway Driver', 'Midrange', 'Putter'],
    COLORS: [
      'Beige','Black','Blue','Bronze','Brown','Gold','Gray','Green',
      'Multi-Color','Orange','Pink','Purple','Red','Silver','White','Yellow',
    ],

    async init() {
      await Promise.all([this._fetchNextDiscNum(), this._fetchManufacturers()]);
    },

    async _fetchNextDiscNum() {
      const res  = await fetch('/api/catalog-intake/next-disc-num');
      const data = await res.json();
      this.nextDiscNum = data.nextDiscNum;
    },

    async _fetchManufacturers() {
      const res  = await fetch('/api/catalog-intake/manufacturers');
      const data = await res.json();
      this.manufacturers = data.manufacturers || [];
    },

    async submit() {
      if (this.submitting) return;
      this.submitting = true;
      try {
        const res  = await fetch('/api/catalog-intake/disc', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            discNum:      this.nextDiscNum,
            box:          this.box,
            manufacturer: this.manufacturer,
            mold:         this.mold,
            type:         this.type,
            plastic:      this.plastic,
            run:          this.run,
            notes:        this.notes,
            condition:    this.condition,
            weight:       this.weight,
            color:        this.color,
            listPrice:    this.listPrice,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');

        this._showToast(`Disc #${data.discNum} saved`, true);
        localStorage.setItem('catalog_box', this.box);
        this._reset(data.discNum + 1);
      } catch (err) {
        this._showToast(err.message, false);
      } finally {
        this.submitting = false;
      }
    },

    _reset(nextNum) {
      this.nextDiscNum  = nextNum;
      this.manufacturer = '';
      this.mold         = '';
      this.type         = '';
      this.plastic      = '';
      this.run          = '';
      this.notes        = '';
      this.condition    = 'Unthrown';
      this.weight       = 175;
      this.color        = '';
      this.listPrice    = 25;
      // box kept as-is
      this.$nextTick(() => this.$el.querySelector('[data-focus]')?.focus());
    },

    _showToast(msg, ok) {
      this.toast = { msg, ok };
      setTimeout(() => { this.toast = null; }, 2000);
    },
  }));
});
