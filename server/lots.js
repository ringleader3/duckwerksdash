// server/lots.js — GET/POST/PATCH /api/lots
const express = require('express');
const router  = express.Router();
const db      = require('./db');

// GET all lots with item summary derived from items table
router.get('/', (_req, res) => {
  const lots = db.prepare('SELECT * FROM lots ORDER BY name').all();
  const itemSummary = db.prepare(`
    SELECT lot_id,
      COUNT(*) as item_count,
      SUM(CASE WHEN status = 'Sold' THEN 1 ELSE 0 END) as items_sold,
      SUM(CASE WHEN status = 'Listed' THEN 1 ELSE 0 END) as items_listed,
      SUM(CASE WHEN status = 'Prepping' THEN 1 ELSE 0 END) as items_prepping
    FROM items WHERE lot_id IS NOT NULL GROUP BY lot_id
  `);
  const summaryMap = {};
  itemSummary.all().forEach(s => { summaryMap[s.lot_id] = s; });
  res.json(lots.map(l => ({
    ...l,
    item_count:     summaryMap[l.id]?.item_count     || 0,
    items_sold:     summaryMap[l.id]?.items_sold     || 0,
    items_listed:   summaryMap[l.id]?.items_listed   || 0,
    items_prepping: summaryMap[l.id]?.items_prepping || 0,
  })));
});

// POST create lot
router.post('/', (req, res) => {
  const { name, purchase_date, total_cost, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare(
      'INSERT INTO lots (name, purchase_date, total_cost, notes) VALUES (?, ?, ?, ?)'
    ).run(name, purchase_date || null, total_cost || 0, notes || null);
    const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(lot);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'lot name already exists' });
    throw e;
  }
});

// PATCH update lot
router.patch('/:id', (req, res) => {
  const { name, purchase_date, total_cost, notes } = req.body;
  const sets = [], vals = [];
  if (name          !== undefined) { sets.push('name = ?');          vals.push(name); }
  if (purchase_date !== undefined) { sets.push('purchase_date = ?'); vals.push(purchase_date); }
  if (total_cost    !== undefined) { sets.push('total_cost = ?');    vals.push(total_cost); }
  if (notes         !== undefined) { sets.push('notes = ?');         vals.push(notes); }
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE lots SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(req.params.id);
  if (!lot) return res.status(404).json({ error: 'not found' });
  res.json(lot);
});

// DELETE lot (only if empty)
router.delete('/:id', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM items WHERE lot_id = ?').get(req.params.id);
  if (count.n > 0) return res.status(409).json({ error: 'lot has items — remove them first' });
  db.prepare('DELETE FROM lots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
