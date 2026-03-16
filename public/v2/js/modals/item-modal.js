// ── Item Modal — Phase 4 ──────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('itemModal', () => ({
    editMode: false,
    saving:   false,
    saveMsg:  '',
    form:     {},

    // Reset edit state whenever a new record is opened
    init() {
      this.$watch('$store.dw.activeRecordId', () => {
        this.editMode = false;
        this.saveMsg  = '';
        this.form     = {};
      });
    },

    get record() {
      const dw = Alpine.store('dw');
      return dw.records.find(r => r.id === dw.activeRecordId) || null;
    },

    get isSold() {
      return this.record ? Alpine.store('dw').str(this.record, F.status) === 'Sold' : false;
    },

    // Kick off edit — snapshot record fields into form
    startEdit() {
      const dw = Alpine.store('dw');
      const r  = this.record;
      if (!r) return;
      this.form = {
        name:            dw.str(r, F.name),
        status:          dw.str(r, F.status),
        category:        dw.str(r, F.category),
        site:            dw.siteLabel(r),
        lot:             dw.str(r, F.lot),
        url:             dw.str(r, F.url),
        reverbListingId: dw.str(r, F.reverbListingId),
        listPrice:       r.fields[F.listPrice] != null ? r.fields[F.listPrice] : '',
        cost:            r.fields[F.cost]      != null ? r.fields[F.cost]      : '',
        sale:            r.fields[F.sale]      != null ? r.fields[F.sale]      : '',
        shipping:        r.fields[F.shipping]  != null ? r.fields[F.shipping]  : '',
      };
      this.editMode = true;
      this.saveMsg  = '';
    },

    cancelEdit() {
      this.editMode = false;
      this.saveMsg  = '';
    },

    async save() {
      const f      = this.form;
      const fields = {};

      if (f.name)     fields[F.name]     = f.name;
      if (f.status)   fields[F.status]   = f.status;
      if (f.status === 'Sold' && !Alpine.store('dw').str(this.record, F.dateSold))
        fields[F.dateSold] = new Date().toISOString().split('T')[0];
      if (f.category) fields[F.category] = f.category;
      if (f.site)     fields[F.site]     = f.site;
      fields[F.lot]             = f.lot             || '';
      fields[F.url]             = f.url             || '';
      fields[F.reverbListingId] = f.reverbListingId || '';
      if (f.listPrice !== '') fields[F.listPrice] = parseFloat(f.listPrice);
      if (f.cost      !== '') fields[F.cost]      = parseFloat(f.cost);
      if (f.sale      !== '') fields[F.sale]      = parseFloat(f.sale);
      if (f.shipping  !== '') fields[F.shipping]  = parseFloat(f.shipping);

      this.saving  = true;
      this.saveMsg = '';
      try {
        await Alpine.store('dw').updateRecord(this.record.id, fields);
        this.saveMsg = 'saved';
        setTimeout(() => { this.editMode = false; this.saveMsg = ''; }, 900);
      } catch (e) {
        this.saveMsg = 'ERROR: ' + e.message;
      } finally {
        this.saving = false;
      }
    },

    // Badge helpers (same as itemsView)
    badgeClass(status) {
      const s = (status || '').toLowerCase();
      if (s === 'listed')   return 'badge-listed';
      if (s === 'sold')     return 'badge-sold';
      if (s === 'pending')  return 'badge-pending';
      if (s === 'prepping') return 'badge-prepping';
      return 'badge-other';
    },

    catBadgeClass(cat) {
      return CAT_BADGE[cat] || 'badge-other';
    },
  }));
});
