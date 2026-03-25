// ── Sidebar — Phase 2 ─────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('sidebar', () => ({
    query: '',
    results: [],
    selectedIndex: -1,

    init() {
      // '/' focuses search when not already in an input
      document.addEventListener('keydown', (e) => {
        const inInput = ['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
        if (e.key === '/' && !inInput) {
          e.preventDefault();
          this.$refs.searchInput.focus();
        }
        if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          this.$refs.searchInput.focus();
        }
      });
    },

    navigate(e) {
      if (!this.results.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
        this.$nextTick(() => this._scrollActiveIntoView());
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.$nextTick(() => this._scrollActiveIntoView());
      } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
        e.preventDefault();
        this.pick(this.results[this.selectedIndex]);
      }
    },

    _scrollActiveIntoView() {
      const el = this.$refs.searchResults?.querySelector('.search-result-active');
      if (el) el.scrollIntoView({ block: 'nearest' });
    },

    search() {
      const q = this.query.trim().toLowerCase();
      if (!q) { this.results = []; this.selectedIndex = -1; return; }

      const dw = Alpine.store('dw');
      const out = [];
      const seenLots = new Set();
      const seenCats = new Set();

      for (const r of dw.records) {
        const name   = (r.name || '').toLowerCase();
        const lot    = r.lot?.name || '';
        const lotKey = lot.toLowerCase();
        const cat    = r.category?.name || '';
        const catKey = cat.toLowerCase();
        const status = r.status;

        // Item match on name
        if (name.includes(q)) {
          out.push({
            key:        r.id,
            type:       'item',
            typeIcon:   '◈',
            label:      r.name,
            badge:      status,
            badgeClass: 'badge-' + status.toLowerCase(),
            dimmed:     status === 'Sold',
            id:         r.id,
          });
        }

        // Lot match (deduplicated)
        if (lotKey && lotKey.includes(q) && !seenLots.has(lotKey)) {
          seenLots.add(lotKey);
          const lotItems  = dw.records.filter(x => (x.lot?.name || '').toLowerCase() === lotKey);
          const cost      = lotItems.reduce((s, x) => s + (x.cost || 0), 0);
          const recovered = lotItems
            .filter(x => x.status === 'Sold')
            .reduce((s, x) => s + (x.order?.sale_price || 0), 0);
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
            x => (x.category?.name || '').toLowerCase() === catKey && x.status === 'Listed'
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
      this.selectedIndex = -1;
    },

    clear() {
      this.query         = '';
      this.results       = [];
      this.selectedIndex = -1;
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
