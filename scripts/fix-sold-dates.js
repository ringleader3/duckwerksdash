// One-off: pull last 20 sold orders from Reverb and update date_sold in DB
import 'dotenv/config';
import Database from 'better-sqlite3';

const db  = new Database('data/duckwerks.db');
const pat = process.env.REVERB_PAT;

const res  = await fetch('https://api.reverb.com/api/my/orders/selling?per_page=20&page=1', {
  headers: {
    'Authorization':  `Bearer ${pat}`,
    'Accept':         'application/hal+json',
    'Accept-Version': '3.0',
  },
});

if (!res.ok) { console.error('Reverb API error:', res.status, await res.text()); process.exit(1); }

const data   = await res.json();
const orders = data.orders || [];
console.log(`Fetched ${orders.length} orders from Reverb\n`);

const getOrder = db.prepare('SELECT id, date_sold FROM orders WHERE platform_order_num = ?');
const setDate  = db.prepare('UPDATE orders SET date_sold = ? WHERE id = ?');

for (const o of orders) {
  const orderNum  = String(o.order_number);
  const reverbDate = o.created_at?.split('T')[0];
  if (!reverbDate) continue;

  const row = getOrder.get(orderNum);
  if (!row) { console.log(`  ${orderNum}  — not in DB (skip)`); continue; }

  if (row.date_sold === reverbDate) {
    console.log(`  ${orderNum}  date_sold already correct: ${reverbDate}`);
  } else {
    setDate.run(reverbDate, row.id);
    console.log(`  ${orderNum}  updated: ${row.date_sold} → ${reverbDate}`);
  }
}

console.log('\nDone.');
