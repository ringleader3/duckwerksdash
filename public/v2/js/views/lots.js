// ── Lots View — Phase 5 ───────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('lotsView', () => ({

    get rows() {
      return Alpine.store('dw').lots;
    },

    countByStatus(lot, status) {
      const dw = Alpine.store('dw');
      return lot.items.filter(r => dw.str(r, F.status) === status).length;
    },

    totalCost(lot) {
      const dw = Alpine.store('dw');
      return lot.items.reduce((sum, r) => sum + dw.num(r, F.cost), 0);
    },

    recovered(lot) {
      const dw = Alpine.store('dw');
      return lot.items
        .filter(r => dw.str(r, F.status) === 'Sold')
        .reduce((sum, r) => sum + dw.num(r, F.sale), 0);
    },

    recoveryPct(lot) {
      const cost = this.totalCost(lot);
      const rec  = this.recovered(lot);
      return cost > 0 ? Math.min(100, Math.round((rec / cost) * 100)) : 0;
    },

    estUpside(lot) {
      const dw = Alpine.store('dw');
      return lot.items
        .filter(r => dw.str(r, F.status) === 'Listed')
        .reduce((sum, r) => sum + dw.eaf(dw.num(r, F.listPrice)), 0);
    },

    recoveryBarClass(pct) {
      if (pct >= 100) return 'green';
      if (pct >= 50)  return 'yellow';
      return 'red';
    },

    openLot(lot) {
      Alpine.store('dw').openModal('lot', null, lot.name);
    },
  }));
});
