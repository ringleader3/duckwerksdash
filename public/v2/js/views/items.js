// ── Items View — Phase 3 ──────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('itemsView', () => ({
    statusFilter: 'Listed',
    siteFilter:   'All',
    nameSearch:   '',
    openStatusId: null,

    init() {
      document.addEventListener('click', () => { this.openStatusId = null; });
    },

    get rows() {
      const dw = Alpine.store('dw');
      let recs = dw.records;

      if (dw.categoryFilter) {
        recs = recs.filter(r => dw.str(r, F.category) === dw.categoryFilter);
      }
      if (this.statusFilter !== 'All') {
        recs = recs.filter(r => dw.str(r, F.status) === this.statusFilter);
      }
      if (this.siteFilter !== 'All') {
        recs = recs.filter(r => dw.siteLabel(r) === this.siteFilter);
      }
      const q = this.nameSearch.trim().toLowerCase();
      if (q) {
        recs = recs.filter(r => dw.str(r, F.name).toLowerCase().includes(q));
      }
      return recs;
    },

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

    eafDisplay(r) {
      const dw = Alpine.store('dw');
      const lp = dw.num(r, F.listPrice);
      return lp > 0 ? dw.fmt0(dw.eaf(lp)) : '—';
    },

    profitDisplay(r) {
      const dw = Alpine.store('dw');
      const p  = dw.estProfit(r);
      return (p >= 0 ? '+' : '') + dw.fmt0(p);
    },

    shipDisplay(r) {
      const dw = Alpine.store('dw');
      return r.fields[F.shipping] != null ? dw.fmt0(dw.num(r, F.shipping)) : '~$10';
    },

    shipIsEst(r) {
      return r.fields[F.shipping] == null;
    },

    toggleStatusMenu(id, e) {
      e.stopPropagation();
      this.openStatusId = this.openStatusId === id ? null : id;
    },

    async changeStatus(r, status, e) {
      e.stopPropagation();
      this.openStatusId = null;
      await Alpine.store('dw').updateRecord(r.id, { [F.status]: status });
    },

    openItem(r) {
      Alpine.store('dw').openModal('item', r.id);
    },
  }));
});
