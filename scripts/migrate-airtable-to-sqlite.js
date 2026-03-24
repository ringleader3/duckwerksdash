// scripts/migrate-airtable-to-sqlite.js
// Migrates all Airtable records to the SQLite DB.
// Requires server running at localhost:3000 (for Airtable proxy).
// Safe to re-run: clears and rebuilds lots, items, listings, orders, shipments each time.
// Does NOT reseed sites/categories (they're already in the DB from db.js).

const db = require('../server/db');

const BASE_ID  = 'appLj1a6YcqzA9uum';
const TABLE_ID = 'tbly2xgKYqgF96kWw';
const F = {
  name:            'fldY4lOcgWYz1Xh7f',
  status:          'fldE6NtzEZzAVH5TC',
  listPrice:       'fldFYd9nqbYVITVSI',
  cost:            'fld6gdPNNaCMmeZU4',
  sale:            'fldwZSF8D6sWUT9zt',
  shipping:        'fldlrSl2HdhA02NUp',
  lot:             'fldxpAbnsKO1zBdJ9',
  category:        'fldijAUBNfrgfJO1P',
  site:            'fld7d1DwvXTqJpJe9',
  url:             'fldz2lwmbIw9AeNam',
  reverbListingId: 'fldMtW0wQEMcUG9X1',
  reverbOrderNum:  'fldman6gKCzhYPv8S',
  dateSold:        'fldcIJOUtePuaxAVH',
  trackingId:      'fld83D6AubuZqZAQQ',
  trackingNumber:  'fldWWo58dN1cFKiSl',
  trackerUrl:      'fldTJ2Dm782UWe5dW',
  labelUrl:        'fld6gsm3lU2L1cK4V',
};

function str(r, f) { const v = r?.fields?.[f]; return v ? String(v).trim() : ''; }
function num(r, f) { return parseFloat(r?.fields?.[f]) || 0; }

async function fetchAllAirtable() {
  const fields = Object.values(F).map(id => `fields[]=${id}`).join('&');
  let all = [], offset = null;
  do {
    const params = `${fields}&returnFieldsByFieldId=true${offset ? '&offset=' + offset : ''}`;
    const res    = await fetch(`http://localhost:3000/api/airtable/${BASE_ID}/${TABLE_ID}?${params}`);
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status}`);
    const data = await res.json();
    all    = all.concat(data.records);
    offset = data.offset || null;
  } while (offset);
  return all;
}

async function migrate() {
  console.log('Fetching Airtable records...');
  const records = await fetchAllAirtable();
  console.log(`  Fetched ${records.length} records`);

  // Clear existing migrated data (preserve sites/categories seed)
  db.transaction(() => {
    db.prepare('DELETE FROM shipments').run();
    db.prepare('DELETE FROM orders').run();
    db.prepare('DELETE FROM listings').run();
    db.prepare('DELETE FROM items').run();
    db.prepare('DELETE FROM lots').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('lots','items','listings','orders','shipments')").run();
  })();

  // ── Seed lots from unique lot-name strings ────────────────────────────────
  const lotNames = [...new Set(records.map(r => str(r, F.lot)).filter(Boolean))].sort();
  const insertLot = db.prepare('INSERT INTO lots (name) VALUES (?)');
  db.transaction(() => { lotNames.forEach(n => insertLot.run(n)); })();
  const lotMap = {}; // name → id
  db.prepare('SELECT id, name FROM lots').all().forEach(l => { lotMap[l.name] = l.id; });
  console.log(`  Seeded ${lotNames.length} lots`);

  // ── Reference lookups ─────────────────────────────────────────────────────
  const siteMap = {}; // name → id (case-insensitive)
  db.prepare('SELECT id, name FROM sites').all().forEach(s => { siteMap[s.name.toLowerCase()] = s.id; });

  const catMap = {}; // name → id
  db.prepare('SELECT id, name FROM categories').all().forEach(c => { catMap[c.name] = c.id; });

  function siteId(r) {
    const s = str(r, F.site).toLowerCase();
    if (s.includes('ebay'))       return siteMap['ebay'];
    if (s.includes('reverb'))     return siteMap['reverb'];
    if (s.includes('facebook'))   return siteMap['facebook'];
    if (s.includes('craigslist')) return siteMap['craigslist'];
    return null;
  }

  // ── Insert items ──────────────────────────────────────────────────────────
  const insertItem = db.prepare(`
    INSERT INTO items (name, lot_id, category_id, cost, notes, status, created_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
  `);
  const itemIdMap = {}; // airtable record id → sqlite item id

  db.transaction(() => {
    records.forEach(r => {
      const status = str(r, F.status) || 'Prepping';
      const result = insertItem.run(
        str(r, F.name) || '(unnamed)',
        lotMap[str(r, F.lot)] || null,
        catMap[str(r, F.category)] || null,
        num(r, F.cost),
        null,
        status,
        r.createdTime || new Date().toISOString()
      );
      itemIdMap[r.id] = result.lastInsertRowid;
    });
  })();
  console.log(`  Inserted ${records.length} items`);

  // ── Insert listings, orders, shipments ────────────────────────────────────
  const insertListing  = db.prepare(`
    INSERT INTO listings (item_id, site_id, platform_listing_id, list_price, shipping_estimate, url, status, listed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrder    = db.prepare(`
    INSERT INTO orders (listing_id, platform_order_num, sale_price, date_sold)
    VALUES (?, ?, ?, ?)
  `);
  const insertShipment = db.prepare(`
    INSERT INTO shipments (order_id, tracking_id, tracking_number, tracker_url, label_url, shipping_cost, shipped_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `);

  let listingCount = 0, orderCount = 0, shipmentCount = 0;

  db.transaction(() => {
    records.forEach(r => {
      const itemId = itemIdMap[r.id];
      const status = str(r, F.status);
      const sid    = siteId(r);
      const lp     = r.fields[F.listPrice];

      // Insert listing if item has a site (regardless of status — covers Listed and Sold)
      if (sid && (lp != null || status === 'Listed' || status === 'Sold')) {
        const listingStatus = status === 'Sold' ? 'sold' : 'active';
        const liResult = insertListing.run(
          itemId, sid,
          str(r, F.reverbListingId) || null,
          lp != null ? parseFloat(lp) : null,
          r.fields[F.shipping] != null ? parseFloat(r.fields[F.shipping]) : null, // shipping_estimate
          str(r, F.url) || null,
          listingStatus,
          r.createdTime || new Date().toISOString()
        );
        listingCount++;

        // Insert order if sold
        if (status === 'Sold' && (r.fields[F.sale] != null || str(r, F.dateSold))) {
          const orderResult = insertOrder.run(
            liResult.lastInsertRowid,
            str(r, F.reverbOrderNum) || null,
            r.fields[F.sale] != null ? parseFloat(r.fields[F.sale]) : null,
            str(r, F.dateSold) || new Date().toISOString().split('T')[0]
          );
          orderCount++;

          // Insert shipment if has tracking
          if (str(r, F.trackingId)) {
            insertShipment.run(
              orderResult.lastInsertRowid,
              str(r, F.trackingId),
              str(r, F.trackingNumber) || null,
              str(r, F.trackerUrl) || null,
              str(r, F.labelUrl) || null,
              r.fields[F.shipping] != null ? parseFloat(r.fields[F.shipping]) : null
            );
            shipmentCount++;
          }
        }
      }
    });
  })();

  console.log(`  Inserted ${listingCount} listings, ${orderCount} orders, ${shipmentCount} shipments`);

  // ── Validation report ─────────────────────────────────────────────────────
  console.log('\n── Validation Report ──────────────────────────────────────');
  const counts = ['lots','items','listings','orders','shipments'].map(t => ({
    table: t, count: db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n
  }));
  counts.forEach(c => console.log(`  ${c.table}: ${c.count}`));

  // Spot-check 5 random items
  console.log('\n── Spot Check (5 random items) ──────────────────────────');
  const sample = db.prepare(`
    SELECT i.name, i.status, i.cost, l.name as lot,
           li.list_price, li.status as listing_status,
           o.sale_price, s.tracking_number
    FROM items i
    LEFT JOIN lots l ON l.id = i.lot_id
    LEFT JOIN listings li ON li.item_id = i.id
    LEFT JOIN orders o ON o.listing_id = li.id
    LEFT JOIN shipments s ON s.order_id = o.id
    ORDER BY RANDOM() LIMIT 5
  `).all();
  sample.forEach(r => console.log(
    `  "${r.name}" | ${r.status} | cost $${r.cost} | lot: ${r.lot || '—'} | list: $${r.list_price || '—'} | sale: $${r.sale_price || '—'} | tracking: ${r.tracking_number || '—'}`
  ));

  console.log('\nMigration complete.');
}

migrate().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
