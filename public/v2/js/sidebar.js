// ── Sidebar — Phase 2 ─────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('sidebar', () => ({
    query: '',
    results: [],

    init() {
      // '/' focuses search when not already in an input
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
          e.preventDefault();
          this.$refs.searchInput.focus();
        }
      });
    },

    search() {
      const q = this.query.trim().toLowerCase();
      if (!q) { this.results = []; return; }

      const dw = Alpine.store('dw');
      const out = [];
      const seenLots = new Set();
      const seenCats = new Set();

      for (const r of dw.records) {
        const name   = dw.str(r, F.name).toLowerCase();
        const lot    = dw.str(r, F.lot);
        const lotKey = lot.toLowerCase();
        const cat    = dw.str(r, F.category);
        const catKey = cat.toLowerCase();
        const status = dw.str(r, F.status);

        // Item match on name
        if (name.includes(q)) {
          out.push({
            key:        r.id,
            type:       'item',
            typeIcon:   '◈',
            label:      dw.str(r, F.name),
            badge:      status,
            badgeClass: 'badge-' + status.toLowerCase(),
            dimmed:     status === 'Sold',
            id:         r.id,
          });
        }

        // Lot match (deduplicated)
        if (lotKey && lotKey.includes(q) && !seenLots.has(lotKey)) {
          seenLots.add(lotKey);
          const lotItems  = dw.records.filter(x => dw.str(x, F.lot).toLowerCase() === lotKey);
          const cost      = lotItems.reduce((s, x) => s + dw.num(x, F.cost), 0);
          const recovered = lotItems
            .filter(x => dw.str(x, F.status) === 'Sold')
            .reduce((s, x) => s + dw.num(x, F.sale), 0);
          const pct = dw.pct(recovered, cost);
          out.push({
            key:        'lot-' + lotKey,
            type:       'lot',
            typeIcon:   '▤',
            label:      lot + ' — ' + lotItems.length + ' items',
            badge:      pct + '%',
            badgeClass: pct >= 100 ? 'badge-sold' : 'badge-pending',
            dimmed:     false,
            lotName:    lot,
          });
        }

        // Category match (deduplicated)
        if (catKey && catKey.includes(q) && !seenCats.has(catKey)) {
          seenCats.add(catKey);
          const listedCount = dw.records.filter(
            x => dw.str(x, F.category).toLowerCase() === catKey && dw.str(x, F.status) === 'Listed'
          ).length;
          out.push({
            key:        'cat-' + catKey,
            type:       'category',
            typeIcon:   '⊞',
            label:      cat + ' — ' + listedCount + ' listed',
            badge:      null,
            badgeClass: '',
            dimmed:     false,
            catName:    cat,
          });
        }
      }

      this.results = out.slice(0, 15);
    },

    clear() {
      this.query  = '';
      this.results = [];
    },

    pick(result) {
      const dw = Alpine.store('dw');
      if (result.type === 'item') {
        dw.openModal('item', result.id);
      } else if (result.type === 'lot') {
        dw.openModal('lot', null, result.lotName);
      } else if (result.type === 'category') {
        dw.categoryFilter = result.catName;
        dw.activeView     = 'items';
      }
      this.clear();
    },
  }));
});
