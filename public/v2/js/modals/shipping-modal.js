// ── Shipping Modal ────────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('shippingModal', () => ({
    loading: false,
    usage:   null,   // { count, limit, window, since }
    errMsg:  '',

    init() {
      this.$watch('$store.dw.activeModal', val => {
        if (val === 'shipping') this._open();
      });
    },

    async _open() {
      this.loading = true;
      this.errMsg  = '';
      this.usage   = null;
      try {
        const res  = await fetch('/api/label/usage');
        const data = await res.json();
        if (!res.ok) { this.errMsg = data.error || 'Failed to load usage'; return; }
        this.usage = data;
      } catch (e) {
        this.errMsg = e.message;
      } finally {
        this.loading = false;
      }
    },

    get usageColor() {
      if (!this.usage) return 'var(--muted)';
      const remaining = this.usage.limit - this.usage.count;
      if (remaining <= 2)  return 'var(--red)';
      if (remaining <= 5)  return 'var(--yellow)';
      return 'var(--green)';
    },

    get periodLabel() {
      if (!this.usage?.since) return '';
      const d = new Date(this.usage.since);
      if (this.usage.window === 'rolling-30') return 'last 30 days';
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    },
  }));
});
