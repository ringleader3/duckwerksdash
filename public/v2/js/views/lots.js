// ── Lots View — Phase 5 ───────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('lotsView', () => ({
    sortKey: 'lotName',
    sortDir: 'asc',

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

    get rows() {
      const dw  = Alpine.store('dw');
      const key = this.sortKey;
      const dir = this.sortDir;
      return [...dw.lots].sort((a, b) => {
        let av, bv;
        if (key === 'lotName') {
          av = a.name.toLowerCase(); bv = b.name.toLowerCase();
        } else if (key === 'items') {
          av = a.items.length; bv = b.items.length;
        } else if (key === 'cost') {
          av = a.items.reduce((s, r) => s + dw.num(r, F.cost), 0);
          bv = b.items.reduce((s, r) => s + dw.num(r, F.cost), 0);
        } else if (key === 'recovered') {
          av = a.items.filter(r => dw.str(r, F.status) === 'Sold').reduce((s, r) => s + dw.num(r, F.sale), 0);
          bv = b.items.filter(r => dw.str(r, F.status) === 'Sold').reduce((s, r) => s + dw.num(r, F.sale), 0);
        } else if (key === 'recovery') {
          const cA = a.items.reduce((s, r) => s + dw.num(r, F.cost), 0);
          const rA = a.items.filter(r => dw.str(r, F.status) === 'Sold').reduce((s, r) => s + dw.num(r, F.sale), 0);
          const cB = b.items.reduce((s, r) => s + dw.num(r, F.cost), 0);
          const rB = b.items.filter(r => dw.str(r, F.status) === 'Sold').reduce((s, r) => s + dw.num(r, F.sale), 0);
          av = cA > 0 ? rA / cA : 0; bv = cB > 0 ? rB / cB : 0;
        } else if (key === 'estUpside') {
          av = a.items.filter(r => dw.str(r, F.status) === 'Listed').reduce((s, r) => s + dw.eaf(dw.num(r, F.listPrice)), 0);
          bv = b.items.filter(r => dw.str(r, F.status) === 'Listed').reduce((s, r) => s + dw.eaf(dw.num(r, F.listPrice)), 0);
        } else return 0;
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1  : -1;
        return 0;
      });
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
        .filter(r => dw.str(r, F.status) !== 'Sold')
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
