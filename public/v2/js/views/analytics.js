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
    soldSortKey: 'daysSince',
    soldSortDir: 'desc',

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

    soldSortBy(key) {
      if (this.soldSortKey === key) {
        this.soldSortDir = this.soldSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.soldSortKey = key;
        this.soldSortDir = 'asc';
      }
    },

    soldSortIndicator(key) {
      if (this.soldSortKey !== key) return '';
      return this.soldSortDir === 'asc' ? ' ↑' : ' ↓';
    },

    openItem(itemId) {
      if (itemId) Alpine.store('dw').openModal('item', itemId);
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
      return [...this.soldRows].sort((a, b) => {
        let av = a[this.soldSortKey];
        let bv = b[this.soldSortKey];
        // Date objects: compare timestamps
        if (av instanceof Date) av = av.getTime();
        if (bv instanceof Date) bv = bv.getTime();
        av = av ?? -1;
        bv = bv ?? -1;
        if (typeof av === 'string') return this.soldSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        if (av < bv) return this.soldSortDir === 'asc' ? -1 : 1;
        if (av > bv) return this.soldSortDir === 'asc' ?  1 : -1;
        return 0;
      });
    },

    async _loadListed() {
      this.listedLoading = true;
      this.listedError   = null;
      try {
        // Fetch Reverb listings + eBay traffic in parallel
        const [reverbListings, ebayTraffic, ebayListings] = await Promise.all([
          this._fetchReverbListings(),
          fetch('/api/ebay/traffic').then(r => r.json()).catch(() => ({})),
          fetch('/api/ebay/listings').then(r => r.json()).catch(() => ({})),
        ]);

        // ebayTraffic.listings: { [legacyListingId]: { views, impressions, ctr } }
        const ebayMap = ebayTraffic.listings || {};

        // watchCount map: legacyItemId → count (null until eBay App Check approved)
        const watchMap = {};
        for (const l of (ebayListings.listings || [])) {
          if (l.legacyItemId) watchMap[l.legacyItemId] = l.watchCount;
        }

        const dw   = Alpine.store('dw');
        const rows = [];

        // Reverb rows
        for (const l of reverbListings) {
          const lid   = String(l.id);
          const local = dw.records.find(r =>
            r.listings?.some(li => String(li.platform_listing_id) === lid)
          );
          rows.push({
            name:        local?.name || l.title || '—',
            site:        'Reverb',
            listingId:   lid,
            itemId:      local?.id || null,
            views:       l.stats?.views   ?? null,
            watchers:    l.stats?.watches ?? null,
            impressions: null,
            ctr:         null,
          });
        }

        // eBay rows — from store records with active eBay listings
        for (const r of dw.records) {
          if (r.status !== 'Listed' || dw.siteLabel(r) !== 'eBay') continue;
          const listing = dw.activeListing(r);
          const lid     = listing?.platform_listing_id ? String(listing.platform_listing_id) : null;
          const traffic = lid ? (ebayMap[lid] || {}) : {};
          rows.push({
            name:        r.name,
            site:        'eBay',
            listingId:   lid || '',
            itemId:      r.id || null,
            views:       traffic.views       ?? null,
            watchers:    lid ? (watchMap[lid] ?? null) : null,
            impressions: traffic.impressions ?? null,
            ctr:         traffic.ctr != null ? Math.round(traffic.ctr * 100) : null,
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
      let nextPath   = 'my/listings?per_page=100&state=live';
      while (nextPath) {
        const data = await fetch('/api/reverb/' + nextPath).then(r => r.json());
        (data.listings || []).forEach(l => listings.push(l));
        const nextHref = data._links?.next?.href || '';
        nextPath = nextHref ? nextHref.replace('https://api.reverb.com/api/', '') : null;
      }
      return listings;
    },

    async _loadSold() {
      this.soldLoading = true;
      this.soldError   = null;
      try {
        const [reverbOrders, ebayData] = await Promise.all([
          this._fetchReverbPendingFeedback(),
          fetch('/api/ebay/fulfilled-orders').then(r => r.json()).catch(() => ({ orders: [] })),
        ]);

        const dw   = Alpine.store('dw');
        const rows = [];

        // Reverb rows — needs_feedback_for_seller: true
        for (const order of reverbOrders) {
          const orderNum  = String(order.order_number);
          const local     = dw.records.find(r => String(r.order?.platform_order_num) === orderNum);
          const soldDate  = new Date(order.created_at);
          const daysSince = Math.floor((Date.now() - soldDate.getTime()) / (1000 * 60 * 60 * 24));
          rows.push({
            name:       local?.name || order.title || '—',
            site:       'Reverb',
            orderNum,
            itemId:     local?.id || null,
            soldDate,
            daysSince,
            orderUrl:   order._links?.web?.href || null,
          });
        }

        // eBay rows — all FULFILLED orders within 60d feedback window
        // Note: eBay's per-order feedback API is not publicly accessible;
        // showing all recently fulfilled orders so you can check/nudge as needed
        for (const order of (ebayData.orders || [])) {
          const local = dw.records.find(r =>
            r.order?.platform_order_num &&
            (String(r.order.platform_order_num) === String(order.orderId) ||
             String(r.order.platform_order_num) === String(order.legacyOrderId))
          );
          const soldDate  = new Date(order.creationDate);
          const daysSince = Math.floor((Date.now() - soldDate.getTime()) / (1000 * 60 * 60 * 24));
          const orderUrl  = order.orderId
            ? `https://www.ebay.com/mesh/ord/details?orderId=${order.orderId}`
            : null;
          rows.push({
            name:       local?.name || order.lineItems?.[0]?.title || '—',
            site:       'eBay',
            orderNum:   order.orderId || order.legacyOrderId,
            itemId:     local?.id || null,
            soldDate,
            daysSince,
            orderUrl,
          });
        }

        this.soldRows   = rows;
        this.soldLoaded = true;
      } catch (e) {
        this.soldError = 'Failed to load feedback data: ' + e.message;
      } finally {
        this.soldLoading = false;
      }
    },

    async _fetchReverbPendingFeedback() {
      // Collect order numbers from list (needs_feedback_for_seller only on detail endpoint)
      const orderNums = [];
      let nextPath    = 'my/orders/selling?per_page=50';
      let pages       = 0;
      while (nextPath && pages < 6) {
        const data = await fetch('/api/reverb/' + nextPath).then(r => r.json());
        (data.orders || []).forEach(o => { if (o.order_number) orderNums.push(o.order_number); });
        const nextHref = data._links?.next?.href || '';
        nextPath = nextHref ? nextHref.replace('https://api.reverb.com/api/', '') : null;
        pages++;
      }

      // Fetch details in parallel, filter for needs_feedback_for_seller
      const details = await Promise.all(
        orderNums.map(num =>
          fetch(`/api/reverb/my/orders/selling/${num}`).then(r => r.json()).catch(() => null)
        )
      );
      return details.filter(o => o?.needs_feedback_for_seller === true);
    },
  }));
});
