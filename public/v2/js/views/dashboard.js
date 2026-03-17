// ── Dashboard View — Phase 6 ──────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('dashView', () => ({

    // ── KPI Stat Cards ────────────────────────────────────────────────────────

    get totalInvested() {
      const dw = Alpine.store('dw');
      return dw.records.reduce((sum, r) => sum + dw.num(r, F.cost), 0);
    },

    get revenue() {
      const dw = Alpine.store('dw');
      return dw.soldRecords.reduce((sum, r) => sum + dw.num(r, F.sale), 0);
    },

    get profit() {
      const dw = Alpine.store('dw');
      return dw.soldRecords.reduce((sum, r) => {
        return sum + dw.num(r, F.sale) - dw.num(r, F.cost) - dw.num(r, F.shipping);
      }, 0);
    },

    get pipeline() {
      const dw = Alpine.store('dw');
      return dw.listedRecords.reduce((sum, r) => sum + dw.eaf(dw.num(r, F.listPrice)), 0);
    },

    get notListed() {
      const dw = Alpine.store('dw');
      return dw.records.filter(r => {
        const s = dw.str(r, F.status);
        return s !== 'Listed' && s !== 'Sold';
      }).length;
    },

    // ── Lot Recovery Table ────────────────────────────────────────────────────

    get lotRows() {
      const dw = Alpine.store('dw');
      return dw.lots.map(lot => {
        const cost      = lot.items.reduce((s, r) => s + dw.num(r, F.cost), 0);
        const recovered = lot.items
          .filter(r => dw.str(r, F.status) === 'Sold')
          .reduce((s, r) => s + dw.num(r, F.sale), 0);
        const pct    = cost > 0 ? Math.min(100, Math.round((recovered / cost) * 100)) : 0;
        const upside = lot.items
          .filter(r => dw.str(r, F.status) === 'Listed')
          .reduce((s, r) => s + dw.eaf(dw.num(r, F.listPrice)), 0);
        return { name: lot.name, cost, recovered, pct, upside };
      }).sort((a, b) => b.cost - a.cost);
    },

    barClass(pct) {
      if (pct >= 100) return 'green';
      if (pct >= 50)  return 'yellow';
      return 'red';
    },

    // ── Recently Sold ─────────────────────────────────────────────────────────

    get recentlySold() {
      const dw = Alpine.store('dw');
      return [...dw.soldRecords]
        .sort((a, b) => {
          const da = dw.str(a, F.dateSold) || a.createdTime;
          const db = dw.str(b, F.dateSold) || b.createdTime;
          return new Date(db) - new Date(da);
        })
        .slice(0, 10);
    },

    get recentlyListed() {
      const dw = Alpine.store('dw');
      return [...dw.listedRecords]
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
        .slice(0, 10);
    },

    listedDate(r) {
      const d = new Date(r.createdTime);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    soldDate(r) {
      const dw = Alpine.store('dw');
      const raw = dw.str(r, F.dateSold) || r.createdTime;
      if (!raw) return '—';
      const d = new Date(raw);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    itemProfit(r) {
      const dw = Alpine.store('dw');
      return dw.num(r, F.sale) - dw.num(r, F.cost) - dw.num(r, F.shipping);
    },

  }));
});
