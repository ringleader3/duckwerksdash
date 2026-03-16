// ── Duckwerks v2 — Alpine Store ───────────────────────────────────────────────
// Single source of truth. All Airtable calls happen here.
// Views and modals read $store.dw.* — they never call Airtable directly.

document.addEventListener('alpine:init', () => {
  Alpine.store('dw', {

    // ── State ─────────────────────────────────────────────────────────────────
    records:       [],
    loading:       false,
    error:         null,
    airtablePat:   null,
    activeView:    'dashboard',   // 'dashboard' | 'items' | 'lots'
    activeModal:   null,          // 'item' | 'add' | 'lot' | 'label' | 'reverb'
    activeRecordId: null,
    activeLotName:  null,

    // ── Init ──────────────────────────────────────────────────────────────────
    async init() {
      try {
        const cfg = await fetch('/api/config').then(r => r.json());
        this.airtablePat = cfg.airtablePat;
        await this.fetchAll();
      } catch (e) {
        this.error = 'Failed to initialize: ' + e.message;
      }
    },

    // ── Data Fetch ────────────────────────────────────────────────────────────
    async fetchAll() {
      if (!this.airtablePat) return;
      this.loading = true;
      this.error = null;
      try {
        const fields = Object.values(F).map(id => `fields[]=${id}`).join('&');
        let all = [], offset = null;
        do {
          const url = `${AIRTABLE_API}?${fields}&returnFieldsByFieldId=true${offset ? '&offset=' + offset : ''}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${this.airtablePat}` }
          });
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

    fmt0(n)  { return '$' + Math.round(Math.abs(n)).toLocaleString(); },
    fmtK(n)  { return Math.abs(n) >= 1000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000).toFixed(1) + 'K' : this.fmt0(n); },
    pct(a, b){ return b > 0 ? Math.round((a / b) * 100) : 0; },

    siteLabel(r) {
      const s = this.str(r, F.site).toLowerCase();
      if (s.includes('ebay'))   return 'eBay';
      if (s.includes('reverb')) return 'Reverb';
      return this.str(r, F.site);
    },

  });
});
