#!/usr/bin/env node
const db = require('../server/db');

const rows = db.prepare(`
  SELECT i.sku, i.metadata
  FROM inventory i
  JOIN listings l ON l.item_id = (SELECT id FROM items WHERE sku = i.sku LIMIT 1)
  WHERE i.status != 'sold' AND l.status = 'active' AND l.offer_id IS NOT NULL
  ORDER BY i.sku
`).all();

(async () => {
  let ok = 0, fail = 0;
  for (const row of rows) {
    const disc = JSON.parse(row.metadata);
    const res = await fetch('http://localhost:3000/api/ebay/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disc }),
    });
    const data = await res.json();
    if (data.error) { console.error(row.sku + ': FAIL — ' + data.error); fail++; }
    else { console.log(row.sku + ': OK'); ok++; }
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
})();
