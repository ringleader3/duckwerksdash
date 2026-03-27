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

    async _loadListed() {
      this.listedLoading = true;
      this.listedError   = null;
      try {
        const reverbListings = await this._fetchReverbListings();

        const dw   = Alpine.store('dw');
        const rows = [];

        for (const l of reverbListings) {
          const lid   = String(l.id);
          const local = dw.records.find(r =>
            r.listings?.some(li => String(li.platform_listing_id) === lid)
          );
          rows.push({
            name:        local?.name || l.title || '—',
            site:        'Reverb',
            listingId:   lid,
            views:       l.stats?.views   ?? null,
            watchers:    l.stats?.watches ?? null,
            impressions: null,
            ctr:         null,
          });
        }

        this.listedRows   = rows;
        this.listedLoaded = true;
      } catch (e) {
        this.listedError = 'Failed to load listed analytics: ' + e.message;
      } finally {
        this.listedLoading = false;
      }
    },

    async _fetchReverbListings() {
      const listings = [];
      let nextPath   = 'my/listings?per_page=100&state=published';
      while (nextPath) {
        const data = await fetch('/api/reverb/' + nextPath).then(r => r.json());
        (data.listings || []).forEach(l => listings.push(l));
        const nextHref = data._links?.next?.href || '';
        nextPath = nextHref ? nextHref.replace('https://api.reverb.com/api/', '') : null;
      }
      return listings;
    },

    async _loadSold()   { /* Task 5 */ },
  }));
});
