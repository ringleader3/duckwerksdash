// ── Lots View ─────────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('lotsView', () => ({
    sortKey: 'name',
    sortDir: 'asc',

    get rows() {
      const dw = Alpine.store('dw');
      const key = this.sortKey, dir = this.sortDir;
      return [...dw.lots].sort((a, b) => {
        let av, bv;
        if      (key === 'name')      { return dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); }
        else if (key === 'cost')      { av = a.items.reduce((s, r) => s + (r.cost||0), 0); bv = b.items.reduce((s, r) => s + (r.cost||0), 0); }
        else if (key === 'recovered') {
          av = a.items.filter(r => r.status==='Sold').reduce((s,r)=>s+(r.order?.sale_price||0),0);
          bv = b.items.filter(r => r.status==='Sold').reduce((s,r)=>s+(r.order?.sale_price||0),0);
        }
        else if (key === 'roi') {
          const cA = a.items.reduce((s,r)=>s+(r.cost||0),0);
          const rA = a.items.filter(r=>r.status==='Sold').reduce((s,r)=>s+(r.order?.sale_price||0),0);
          const cB = b.items.reduce((s,r)=>s+(r.cost||0),0);
          const rB = b.items.filter(r=>r.status==='Sold').reduce((s,r)=>s+(r.order?.sale_price||0),0);
          av = cA > 0 ? rA / cA : 0; bv = cB > 0 ? rB / cB : 0;
        }
        else if (key === 'upside') {
          const dw2 = Alpine.store('dw');
          av = a.items.filter(r=>r.status==='Listed').reduce((s,r)=>s+dw2.payout(r),0);
          bv = b.items.filter(r=>r.status==='Listed').reduce((s,r)=>s+dw2.payout(r),0);
        }
        else return 0;
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ?  1 : -1;
        return 0;
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

    countByStatus(lot, status) { return lot.items.filter(r => r.status === status).length; },
    totalCost(lot)      { return lot.items.reduce((s, r) => s + (r.cost || 0), 0); },
    totalRecovered(lot) { return lot.items.filter(r => r.status==='Sold').reduce((s,r)=>s+(r.order?.sale_price||0),0); },
    recoveryPct(lot) {
      const cost = this.totalCost(lot);
      const rec  = this.totalRecovered(lot);
      return cost > 0 ? Math.min(100, Math.round((rec / cost) * 100)) : 0;
    },
    recoveryBarClass(pct) {
      if (pct >= 100) return 'green';
      if (pct >= 50)  return 'yellow';
      return 'red';
    },
    estUpside(lot) {
      const dw = Alpine.store('dw');
      return lot.items.filter(r => r.status !== 'Sold').reduce((s, r) => s + dw.payout(r), 0);
    },

    openLot(lot) { Alpine.store('dw').openModal('lot', null, lot.name); },
  }));
});
