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
      return this.lot ? this.lot.items : [];
    },

    get sortedItems() {
      const dw  = Alpine.store('dw');
      const arr = [...this.items];
      const k   = this.sortKey;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      return arr.sort((a, b) => {
        let av, bv;
        if (k === 'name')      { return dir * dw.str(a, F.name).localeCompare(dw.str(b, F.name)); }
        if (k === 'status')    { return dir * dw.str(a, F.status).localeCompare(dw.str(b, F.status)); }
        if (k === 'cost')      { av = dw.num(a, F.cost);      bv = dw.num(b, F.cost); }
        if (k === 'listPrice') { av = dw.num(a, F.listPrice); bv = dw.num(b, F.listPrice); }
        if (k === 'eaf')       { av = dw.eaf(dw.num(a, F.listPrice)); bv = dw.eaf(dw.num(b, F.listPrice)); }
        if (k === 'estProfit') { av = dw.estProfit(a); bv = dw.estProfit(b); }
        if (k === 'sale')      { av = dw.num(a, F.sale); bv = dw.num(b, F.sale); }
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
      const dw = Alpine.store('dw');
      return this.items.reduce((sum, r) => sum + dw.num(r, F.cost), 0);
    },

    recovered() {
      const dw = Alpine.store('dw');
      return this.items
        .filter(r => dw.str(r, F.status) === 'Sold')
        .reduce((sum, r) => sum + dw.num(r, F.sale), 0);
    },

    recoveryPct() {
      const cost = this.totalCost();
      const rec  = this.recovered();
      return cost > 0 ? Math.min(100, Math.round((rec / cost) * 100)) : 0;
    },

    estUpside() {
      const dw = Alpine.store('dw');
      return this.items
        .filter(r => dw.str(r, F.status) === 'Listed')
        .reduce((sum, r) => sum + dw.eaf(dw.num(r, F.listPrice)), 0);
    },

    // Est profit if all listed items sell
    estTotalProfit() {
      const dw   = Alpine.store('dw');
      const sold = this.recovered();
      const soldCost = this.items
        .filter(r => dw.str(r, F.status) === 'Sold')
        .reduce((sum, r) => sum + dw.num(r, F.cost), 0);
      const listedProfit = this.items
        .filter(r => dw.str(r, F.status) === 'Listed')
        .reduce((sum, r) => sum + dw.estProfit(r), 0);
      return (sold - soldCost) + listedProfit;
    },


    countByStatus(status) {
      const dw = Alpine.store('dw');
      return this.items.filter(r => dw.str(r, F.status) === status).length;
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
      const lp = dw.num(r, F.listPrice);
      return lp > 0 ? dw.fmt0(lp) : '—';
    },

    eafDisplay(r) {
      const dw = Alpine.store('dw');
      if (dw.str(r, F.status) === 'Sold') return '—';
      const lp = dw.num(r, F.listPrice);
      return lp > 0 ? dw.fmt0(dw.eaf(lp)) : '—';
    },

    profitValue(r) {
      const dw = Alpine.store('dw');
      return dw.str(r, F.status) === 'Sold' ? dw.num(r, F.profit) : dw.estProfit(r);
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
