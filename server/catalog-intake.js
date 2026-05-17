// server/catalog-intake.js — catalog intake routes (manufacturers, molds, plastics, disc save)
const router            = require('express').Router();
const db                = require('./db');
const { normalizeBlob } = require('./inventory-schemas');

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const lookupFlight = db.prepare(
  'SELECT speed, glide, turn, fade, stability FROM flight_numbers WHERE manufacturer_key = ? AND mold_key = ?'
);

const maxDiscNum = db.prepare(
  "SELECT MAX(CAST(SUBSTR(sku, 5) AS INTEGER)) as max FROM inventory WHERE sku LIKE 'DWG-%'"
);

const upsert = db.prepare(`
  INSERT INTO inventory (sku, location, category, status, metadata)
  VALUES (@sku, @location, 'disc', 'intake', @metadata)
  ON CONFLICT(sku) DO UPDATE SET
    location = excluded.location,
    metadata = excluded.metadata
`);

const markSoldStmt = db.prepare(
  "UPDATE inventory SET status = 'sold' WHERE sku = ?"
);

// GET /api/catalog-intake/next-disc-num
router.get('/next-disc-num', (req, res) => {
  try {
    const { max } = maxDiscNum.get();
    res.json({ nextDiscNum: (max || 0) + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/manufacturers
router.get('/manufacturers', (req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT manufacturer FROM flight_numbers ORDER BY manufacturer').all();
    res.json({ manufacturers: rows.map(r => r.manufacturer).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/molds
router.get('/molds', (req, res) => {
  try {
    const { manufacturer } = req.query;
    const rows = manufacturer
      ? db.prepare('SELECT DISTINCT mold FROM flight_numbers WHERE manufacturer_key = ? ORDER BY mold').all(normalize(manufacturer))
      : db.prepare('SELECT DISTINCT mold FROM flight_numbers ORDER BY mold').all();
    res.json({ molds: rows.map(r => r.mold).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/plastics
router.get('/plastics', (req, res) => {
  try {
    const { manufacturer } = req.query;
    const rows = manufacturer
      ? db.prepare('SELECT plastic, tier FROM disc_plastics WHERE manufacturer_key = ? ORDER BY tier DESC, plastic').all(normalize(manufacturer))
      : db.prepare('SELECT DISTINCT plastic, tier FROM disc_plastics ORDER BY tier DESC, plastic').all();
    res.json({ plastics: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog-intake/disc
router.post('/disc', (req, res) => {
  try {
    const { discNum, box, manufacturer, mold, type, plastic, run, notes, condition, weight, color, listPrice } = req.body;
    const flight   = lookupFlight.get(normalize(manufacturer), normalize(mold)) || {};
    const sku      = `DWG-${String(discNum).padStart(3, '0')}`;
    const metadata = JSON.stringify(normalizeBlob('disc', {
      manufacturer, mold, type, plastic,
      run:       run   || null,
      notes:     notes || null,
      condition,
      weight, color, listPrice,
      speed:     flight.speed     ?? null,
      glide:     flight.glide     ?? null,
      turn:      flight.turn      ?? null,
      fade:      flight.fade      ?? null,
      stability: flight.stability ?? null,
    }));
    upsert.run({ sku, location: box || null, metadata });
    res.json({ discNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// markDiscSold(sku) — called by orders.js when an eBay order is fulfilled
function markDiscSold(sku) {
  if (!sku || !sku.match(/^DWG-\d+$/i)) return;
  markSoldStmt.run(sku);
}

module.exports = { router, markDiscSold };
