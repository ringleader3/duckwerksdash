// ── Multi-Unit Modal ───────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('multiUnitModal', () => ({
    init() {
      this.$watch('$store.dw.activeModal', val => {
        if (val !== 'multi-unit') return;
      });
    },

    get item() {
      const dw = Alpine.store('dw');
      return dw.records.find(r => r.id === dw.activeRecordId) || null;
    },

    orders() {
      if (!this.item) return [];
      return (this.item.listings || [])
        .flatMap(l => l.order ? [l.order] : [])
        .sort((a, b) => (a.date_sold || '').localeCompare(b.date_sold || ''));
    },

    remaining() {
      if (!this.item) return 0;
      return Math.max(0, this.item.quantity - this.item.quantity_sold);
    },

    totalCost() {
      if (!this.item) return 0;
      return this.item.quantity * (this.item.cost || 0);
    },

    recovered() {
      return this.orders().reduce((s, o) => s + (o.sale_price || 0), 0);
    },

    realizedProfit() {
      return this.orders().reduce((s, o) => s + (o.profit || 0), 0);
    },

    forecastedProfit() {
      if (!this.item) return 0;
      const dw      = Alpine.store('dw');
      const listP   = dw.activeListing(this.item)?.list_price || 0;
      const estUnit = listP > 0 ? dw.estProfit(this.item) : 0;
      return this.realizedProfit() + (this.remaining() * estUnit);
    },

    progressPct() {
      if (!this.item || this.item.quantity === 0) return 0;
      return Math.min(100, Math.round((this.item.quantity_sold / this.item.quantity) * 100));
    },

    progressClass() {
      const pct = this.progressPct();
      if (pct >= 100) return 'green';
      if (pct >= 50)  return 'yellow';
      return 'red';
    },

    listPrice() {
      if (!this.item) return '—';
      const dw = Alpine.store('dw');
      const lp = dw.activeListing(this.item)?.list_price;
      return lp ? dw.fmt0(lp) : '—';
    },

    shipmentStatus(order) {
      const s = order.shipment;
      if (!s)            return 'Pending';
      if (s.shipped_at)  return 'Shipped';
      if (s.tracking_id) return 'Shipped';
      return 'Pending';
    },

    shipmentBadgeClass(order) {
      const st = this.shipmentStatus(order);
      if (st === 'Shipped') return 'badge badge-listed';
      return 'badge badge-prepping';
    },
  }));
});
