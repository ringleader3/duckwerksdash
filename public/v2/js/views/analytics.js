// ── Analytics View ────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('analyticsView', () => ({
    activeTab:     'listed',

    // Listed tab state
    listedRows:    [],
    listedLoading: false,
    listedLoaded:  false,
    listedError:   null,
    sortKey:       'views',
    sortDir:       'desc',

    // Sold tab state
    soldRows:    [],
    soldLoading: false,
    soldLoaded:  false,
    soldError:   null,

    async init() {
      this.$watch('activeTab', tab => {
        if (tab === 'listed' && !this.listedLoaded) this._loadListed();
        if (tab === 'sold'   && !this.soldLoaded)   this._loadSold();
      });
      this._loadListed();
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

    get sortedListedRows() {
      return [...this.listedRows].sort((a, b) => {
        const av = a[this.sortKey] ?? -1;
        const bv = b[this.sortKey] ?? -1;
        if (av < bv) return this.sortDir === 'asc' ? -1 : 1;
        if (av > bv) return this.sortDir === 'asc' ?  1 : -1;
        return 0;
      });
    },

    get sortedSoldRows() {
      return [...this.soldRows].sort((a, b) => b.daysSince - a.daysSince);
    },

    async _loadListed() { /* Task 3 */ },
    async _loadSold()   { /* Task 5 */ },
  }));
});
