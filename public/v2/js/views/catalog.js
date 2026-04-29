// ── Catalog Intake View ────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('catalogView', () => ({
    // form state
    nextDiscNum:      null,
    box:              localStorage.getItem('catalog_box') || '',
    manufacturer:     '',
    manufacturerNew:  '',
    mold:             '',
    moldNew:          '',
    type:             '',
    plastic:          '',
    plasticNew:       '',
    run:           '',
    notes:         '',
    condition:     'Unthrown',
    weight:        '',
    color:         '',
    listPrice:     '',

    // flight number display (read-only, from DB lookup)
    flightData:    null,

    // ui state
    manufacturers: [],
    molds:         [],
    plastics:      [],
    toast:         null,   // { msg, ok }
    submitting:    false,

    TYPES:  ['Distance Driver', 'Fairway Driver', 'Midrange Disc', 'Putting Disc'],
    COLORS: [
      'Beige','Black','Blue','Bronze','Brown','Gold','Gray','Green',
      'Multi-Color','Orange','Pink','Purple','Red','Silver','White','Yellow',
    ],

    async init() {
      await Promise.all([this._fetchNextDiscNum(), this._fetchManufacturers(), this._fetchMolds(), this._fetchPlastics()]);
      this.$watch('manufacturer',    () => { this._fetchMolds(); this._fetchFlightNumbers(); });
      this.$watch('manufacturerNew', () => this._fetchFlightNumbers());
      this.$watch('mold',            () => this._fetchFlightNumbers());
      this.$watch('moldNew',         () => this._fetchFlightNumbers());
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

    async _fetchMolds() {
      const mfg = this.manufacturerNew || this.manufacturer;
      const url = mfg ? `/api/catalog-intake/molds?manufacturer=${encodeURIComponent(mfg)}` : '/api/catalog-intake/molds';
      const res  = await fetch(url);
      const data = await res.json();
      this.molds = data.molds || [];
      this.mold  = '';
    },

    async _fetchPlastics() {
      const res  = await fetch('/api/catalog-intake/plastics');
      const data = await res.json();
      this.plastics = data.plastics || [];
    },

    async submit() {
      if (this.submitting) return;
      const missing = [];
      if (!this.box)                                    missing.push('Box');
      if (!this.manufacturerNew && !this.manufacturer)  missing.push('Manufacturer');
      if (!this.moldNew && !this.mold)                  missing.push('Mold');
      if (!this.type)                                   missing.push('Type');
      if (!this.plasticNew && !this.plastic)            missing.push('Plastic');
      if (!this.weight)       missing.push('Weight');
      if (!this.color)        missing.push('Color');
      if (!this.listPrice)    missing.push('List Price');
      if (missing.length) {
        this._showToast(`Missing: ${missing.join(', ')}`, false);
        return;
      }
      this.submitting = true;
      try {
        const res  = await fetch('/api/catalog-intake/disc', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            discNum:      this.nextDiscNum,
            box:          this.box,
            manufacturer: this.manufacturerNew || this.manufacturer,
            mold:         this.moldNew || this.mold,
            type:         this.type,
            plastic:      this.plasticNew || this.plastic,
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

    async _fetchFlightNumbers() {
      const mfg  = this.manufacturerNew || this.manufacturer;
      const mold = this.moldNew || this.mold;
      if (!mfg || !mold) { this.flightData = null; return; }
      try {
        const res  = await fetch(`/api/flight-numbers?manufacturer=${encodeURIComponent(mfg)}&mold=${encodeURIComponent(mold)}`);
        const data = await res.json();
        this.flightData = data.found ? data : null;
        if (data.found && !this.type) {
          const s = data.speed;
          if (s >= 10)     this.type = 'Distance Driver';
          else if (s >= 6) this.type = 'Fairway Driver';
          else if (s >= 4) this.type = 'Midrange Disc';
          else             this.type = 'Putting Disc';
        }
      } catch { this.flightData = null; }
    },

    _reset(nextNum) {
      this.nextDiscNum      = nextNum;
      this.manufacturer     = '';
      this.manufacturerNew  = '';
      this.mold             = '';
      this.moldNew          = '';
      this.type             = '';
      this.plastic          = '';
      this.plasticNew       = '';
      this.run          = '';
      this.notes        = '';
      this.condition    = 'Unthrown';
      this.weight       = '';
      this.color        = '';
      this.listPrice    = '';
      this.flightData   = null;
      // box kept as-is
      this.$nextTick(() => this.$el.querySelector('[data-focus]')?.focus());
    },

    _showToast(msg, ok) {
      this.toast = { msg, ok };
      setTimeout(() => { this.toast = null; }, ok ? 2000 : 5000);
    },
  }));
});
