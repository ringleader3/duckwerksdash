// server/inventory.js — GET/PATCH /api/inventory
const router = require('express').Router();
const db     = require('./db');

const getBySku = db.prepare('SELECT * FROM inventory WHERE sku = ?');
const listAll  = db.prepare('SELECT * FROM inventory ORDER BY created_at DESC');
const patch    = db.prepare(`
  UPDATE inventory SET
    location = COALESCE(@location, location),
    category = COALESCE(@category, category),
    status   = COALESCE(@status, status),
    metadata = COALESCE(@metadata, metadata)
  WHERE sku = @sku
`);

// GET /api/inventory — list all
router.get('/', (req, res) => {
  const rows = listAll.all();
  res.json({ inventory: rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })) });
});

// GET /api/inventory/:sku
router.get('/:sku', (req, res) => {
  const row = getBySku.get(req.params.sku);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : null });
});

// PATCH /api/inventory/:sku — partial update
router.patch('/:sku', (req, res) => {
  const { location, category, status, metadata } = req.body;
  const row = getBySku.get(req.params.sku);
  if (!row) return res.status(404).json({ error: 'not found' });
  patch.run({
    sku:      req.params.sku,
    location: location  ?? null,
    category: category  ?? null,
    status:   status    ?? null,
    metadata: metadata !== undefined ? JSON.stringify(metadata) : null,
  });
  const updated = getBySku.get(req.params.sku);
  res.json({ ...updated, metadata: updated.metadata ? JSON.parse(updated.metadata) : null });
});

module.exports = router;
