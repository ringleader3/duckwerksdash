// ── Lot Modal — Phase 5 ───────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('lotModal', () => ({
    sortKey: 'name',
    sortDir: 'asc',

    get lot() {
      const dw = Alpine.store('dw');
      return dw.lots.find(l => l.name === dw.activeLotName) || null;
    },

    get items() {
      return this.lot?.items || [];
    },

    get sortedItems() {
      const dw  = Alpine.store('dw');
      const arr = [...this.items];
      const k   = this.sortKey;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      return arr.sort((a, b) => {
        let av, bv;
        if (k === 'name')      { return dir * (a.name || '').localeCompare(b.name || ''); }
        if (k === 'status')    { return dir * (a.status || '').localeCompare(b.status || ''); }
        if (k === 'cost')      { av = a.cost || 0;                              bv = b.cost || 0; }
        if (k === 'listPrice') { av = dw.activeListing(a)?.list_price || 0;    bv = dw.activeListing(b)?.list_price || 0; }
        if (k === 'eaf')       { av = dw.payout(a);                            bv = dw.payout(b); }
        if (k === 'profit')    { av = a.order?.profit || 0;                    bv = b.order?.profit || 0; }
        if (k === 'sale')      { av = a.order?.sale_price || 0;                bv = b.order?.sale_price || 0; }
        return dir * ((av || 0) - (bv || 0));
      });
    },

    sortBy(key) {
      if (this.sortKey === key) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; }
      else { this.sortKey = key; this.sortDir = 'asc'; }
    },

    sortIndicator(key) {
      if (this.sortKey !== key) return '';
      return this.sortDir === 'asc' ? ' ↑' : ' ↓';
    },

    totalCost() {
      return this.items.reduce((sum, r) => sum + (r.cost || 0), 0);
    },

    recovered() {
      return this.items
        .filter(r => r.status === 'Sold')
        .reduce((sum, r) => sum + (r.order?.sale_price || 0), 0);
    },

    recoveryPct() {
      const cost = this.totalCost();
      const rec  = this.recovered();
      if (cost > 0) return Math.min(100, Math.round((rec / cost) * 100));
      const total = this.items.length;
      return total > 0 ? Math.round((this.countByStatus('Sold') / total) * 100) : 0;
    },

    estUpside() {
      const dw = Alpine.store('dw');
      return this.items
        .filter(r => r.status === 'Listed')
        .reduce((sum, r) => sum + dw.estProfit(r), 0);
    },

    estTotalProfit() {
      const soldProfit = this.items
        .filter(r => r.status === 'Sold')
        .reduce((sum, r) => sum + (r.order?.profit || 0), 0);
      return soldProfit + this.estUpside();
    },

    totalRecovered() {
      return this.recovered() - (this.lot?.total_cost || this.totalCost());
    },

    countByStatus(status) {
      return this.items.filter(r => r.status === status).length;
    },

    recoveryBarClass() {
      const pct = this.recoveryPct();
      if (pct >= 100) return 'green';
      if (pct >= 50)  return 'yellow';
      return 'red';
    },

    badgeClass(status) {
      const s = (status || '').toLowerCase();
      if (s === 'listed')   return 'badge-listed';
      if (s === 'sold')     return 'badge-sold';
      if (s === 'pending')  return 'badge-pending';
      if (s === 'prepping') return 'badge-prepping';
      return 'badge-other';
    },

    listPriceDisplay(r) {
      const dw = Alpine.store('dw');
      const lp = dw.activeListing(r)?.list_price || 0;
      return lp > 0 ? dw.fmt0(lp) : '—';
    },

    eafDisplay(r) {
      const dw = Alpine.store('dw');
      if (r.status === 'Sold') return '—';
      const lp = dw.activeListing(r)?.list_price || 0;
      return lp > 0 ? dw.fmt0(dw.payout(r)) : '—';
    },

    profitValue(r) {
      return r.status === 'Sold' ? (r.order?.profit || 0) : Alpine.store('dw').estProfit(r);
    },

    profitDisplay(r) {
      const p = this.profitValue(r);
      return (p >= 0 ? '+' : '') + Alpine.store('dw').fmt0(p);
    },

    openItem(r) {
      const dw = Alpine.store('dw');
      dw.previousModal = { type: 'lot', recordId: null, lotName: dw.activeLotName };
      dw.openModal('item', r.id);
    },
  }));
});
