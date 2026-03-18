// ── Duckwerks v2 — Alpine Store ───────────────────────────────────────────────
// Single source of truth. All Airtable calls happen here.
// Views and modals read $store.dw.* — they never call Airtable directly.

document.addEventListener('alpine:init', () => {
  Alpine.store('dw', {

    // ── State ─────────────────────────────────────────────────────────────────
    records:       [],
    loading:       false,
    error:         null,
    activeView:    'dashboard',   // 'dashboard' | 'items' | 'lots'
    activeModal:   null,          // 'item' | 'add' | 'lot' | 'label' | 'reverb'
    activeRecordId: null,
    activeLotName:  null,
    categoryFilter:   null,    // set by sidebar category pick; consumed by itemsView
    pendingFilters:   null,    // { status, category, site } — set by navToItems, consumed by itemsView
    shippingProvider: 'SHIPPO',

    // ── Init ──────────────────────────────────────────────────────────────────
    async init() {
      // Restore last active view from localStorage
      const saved = localStorage.getItem('dw-view');
      if (saved && ['dashboard', 'items', 'lots'].includes(saved)) {
        this.activeView = saved;
      }
      // Persist view changes automatically
      Alpine.effect(() => {
        localStorage.setItem('dw-view', this.activeView);
      });

      try {
        const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
        if (cfg.shippingProvider) this.shippingProvider = cfg.shippingProvider;
        await this.fetchAll();
      } catch (e) {
        this.error = 'Failed to initialize: ' + e.message;
      }
    },

    // ── Data Fetch ────────────────────────────────────────────────────────────
    async fetchAll() {
      this.loading = true;
      this.error = null;
      try {
        const fields = Object.values(F).map(id => `fields[]=${id}`).join('&');
        let all = [], offset = null;
        do {
          const params = `${fields}&returnFieldsByFieldId=true${offset ? '&offset=' + offset : ''}`;
          const res = await fetch(`/api/airtable/${BASE_ID}/${TABLE_ID}?${params}`);
          if (!res.ok) throw new Error(`Airtable error ${res.status}`);
          const data = await res.json();
          all = all.concat(data.records);
          offset = data.offset || null;
        } while (offset);
        this.records = all;
      } catch (e) {
        this.error = 'Failed to load records: ' + e.message;
      } finally {
        this.loading = false;
      }
    },

    // ── Modal Helpers ─────────────────────────────────────────────────────────
    openModal(type, recordId = null, lotName = null) {
      this.activeModal    = type;
      this.activeRecordId = recordId;
      this.activeLotName  = lotName;
    },
    closeModal() {
      this.activeModal    = null;
      this.activeRecordId = null;
      this.activeLotName  = null;
    },

    // Navigate to Items view, resetting all filters then applying the specified ones
    navToItems(status, category, site) {
      this.pendingFilters = {
        status:   status   || 'All',
        category: category || null,
        site:     site     || 'All',
      };
      this.activeView = 'items';
      this.closeModal();
    },

    // ── Computed: filtered record sets ────────────────────────────────────────
    get listedRecords()  { return this.records.filter(r => this.str(r, F.status) === 'Listed'); },
    get soldRecords()    { return this.records.filter(r => this.str(r, F.status) === 'Sold'); },
    get pendingRecords() { return this.records.filter(r => this.str(r, F.status) === 'Pending'); },

    // Unique lot names derived from records
    get lots() {
      const names = [...new Set(
        this.records.map(r => this.str(r, F.lot)).filter(Boolean)
      )].sort();
      return names.map(name => ({
        name,
        items: this.records.filter(r => this.str(r, F.lot) === name),
      }));
    },

    // ── Data Helpers (same as v1) ─────────────────────────────────────────────
    str(r, field) {
      const v = r?.fields?.[field];
      if (v == null) return '';
      if (typeof v === 'object' && v.name) return v.name;
      return String(v).trim();
    },
    num(r, field) { return parseFloat(r?.fields?.[field]) || 0; },

    // Earnings after Reverb fees: 5% selling + 3.19% processing + $0.49 flat
    // Apply to listPrice only — F.sale already stores post-fee payout
    eaf(p) { return p > 0 ? Math.max(0, p * 0.9181 - 0.49) : 0; },

    // Est. profit for a listed item. Use $10 shipping placeholder if not set (show yellow)
    estProfit(r) {
      const lp   = this.num(r, F.listPrice);
      const cost = this.num(r, F.cost);
      const ship = r.fields[F.shipping] != null ? this.num(r, F.shipping) : 10;
      return this.eaf(lp) - cost - ship;
    },

    fmt0(n)  { return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    fmtK(n)  { return Math.abs(n) >= 1000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000).toFixed(1) + 'K' : this.fmt0(n); },
    pct(a, b){ return b > 0 ? Math.round((a / b) * 100) : 0; },

    siteLabel(r) {
      const s = this.str(r, F.site).toLowerCase();
      if (s.includes('ebay'))   return 'eBay';
      if (s.includes('reverb')) return 'Reverb';
      return this.str(r, F.site);
    },

    // ── Writes ────────────────────────────────────────────────────────────────
    async updateRecord(recordId, fields) {
      const res = await fetch(`/api/airtable/${BASE_ID}/${TABLE_ID}/${recordId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields, returnFieldsByFieldId: true }),
      });
      if (!res.ok) throw new Error(`Airtable update error ${res.status}`);
      const updated = await res.json();
      const idx = this.records.findIndex(r => r.id === recordId);
      if (idx !== -1) this.records[idx] = updated;
    },

    async createRecord(fields) {
      const res = await fetch(`/api/airtable/${BASE_ID}/${TABLE_ID}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields, returnFieldsByFieldId: true }),
      });
      if (!res.ok) throw new Error(`Airtable create error ${res.status}`);
      const created = await res.json();
      this.records.push(created);
    },

  });
});
