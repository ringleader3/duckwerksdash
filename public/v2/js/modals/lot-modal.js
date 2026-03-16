// ── Lot Modal — Phase 5 ───────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('lotModal', () => ({

    get lot() {
      const dw = Alpine.store('dw');
      return dw.lots.find(l => l.name === dw.activeLotName) || null;
    },

    get items() {
      return this.lot ? this.lot.items : [];
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

    openItem(r) {
      Alpine.store('dw').openModal('item', r.id);
    },
  }));
});
