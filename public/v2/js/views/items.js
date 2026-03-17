// ── Items View — Phase 3 ──────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('itemsView', () => ({
    statusFilter: 'Listed',
    siteFilter:   'All',
    nameSearch:   '',
    openStatusId: null,
    sortKey:      'createdTime',
    sortDir:      'desc',

    init() {
      document.addEventListener('click', () => { this.openStatusId = null; });
      this.$watch('$store.dw.pendingFilters', v => {
        if (v) {
          this.statusFilter = v.status;
          this.siteFilter   = v.site;
          Alpine.store('dw').categoryFilter  = v.category;
          Alpine.store('dw').pendingFilters  = null;
        }
      });
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
      const key = this.sortKey;
      const dir = this.sortDir;
      recs = [...recs].sort((a, b) => {
        let av, bv;
        if      (key === 'createdTime') { av = new Date(a.createdTime).getTime(); bv = new Date(b.createdTime).getTime(); }
        else if (key === 'name')        { av = dw.str(a, F.name).toLowerCase();  bv = dw.str(b, F.name).toLowerCase(); }
        else if (key === 'lot')         { av = dw.str(a, F.lot).toLowerCase();   bv = dw.str(b, F.lot).toLowerCase(); }
        else if (key === 'category')    { av = dw.str(a, F.category).toLowerCase(); bv = dw.str(b, F.category).toLowerCase(); }
        else if (key === 'site')        { av = dw.siteLabel(a).toLowerCase();    bv = dw.siteLabel(b).toLowerCase(); }
        else if (key === 'status')      { av = dw.str(a, F.status).toLowerCase(); bv = dw.str(b, F.status).toLowerCase(); }
        else if (key === 'listPrice')   { av = dw.num(a, F.listPrice);           bv = dw.num(b, F.listPrice); }
        else if (key === 'eaf')         { av = dw.eaf(dw.num(a, F.listPrice));   bv = dw.eaf(dw.num(b, F.listPrice)); }
        else if (key === 'profit')      { av = dw.estProfit(a);                  bv = dw.estProfit(b); }
        else if (key === 'shipping')    { av = dw.num(a, F.shipping);            bv = dw.num(b, F.shipping); }
        else return 0;
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1  : -1;
        return 0;
      });
      return recs;
    },

    sortBy(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortKey = key;
        this.sortDir = 'asc';
      }
    },

    sortIndicator(key) {
      if (this.sortKey !== key) return '';
      return this.sortDir === 'asc' ? ' ↑' : ' ↓';
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
      const fields = { [F.status]: status };
      if (status === 'Sold') fields[F.dateSold] = new Date().toISOString().split('T')[0];
      await Alpine.store('dw').updateRecord(r.id, fields);
    },

    dateAdded(r) {
      const d = new Date(r.createdTime);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    daysListed(r) {
      const created = new Date(r.createdTime);
      const now     = new Date();
      return Math.floor((now - created) / (1000 * 60 * 60 * 24));
    },

    needsAttention(r) {
      const dw = Alpine.store('dw');
      return dw.str(r, F.status) === 'Listed' && this.daysListed(r) >= 20;
    },

    openItem(r) {
      Alpine.store('dw').openModal('item', r.id);
    },
  }));
});
