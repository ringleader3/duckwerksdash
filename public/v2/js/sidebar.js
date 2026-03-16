// ── Sidebar — Phase 2 ─────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('sidebar', () => ({
    query: '',
    results: [],

    search() {
      if (!this.query.trim()) { this.results = []; return; }
      // Phase 2: implement quick-find
    },

    clear() {
      this.query = '';
      this.results = [];
    },

    pick(result) {
      // Phase 2: navigate or open modal based on result.type
      this.clear();
    },
  }));
});
