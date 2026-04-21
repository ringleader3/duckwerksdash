// server/shipments.js — POST/PATCH /api/shipments
const express = require('express');
const router  = express.Router();
const db      = require('./db');

// POST create shipment (label purchased)
router.post('/', (req, res) => {
  const { order_id, carrier, service, tracking_id, tracking_number,
          tracker_url, label_url, shipping_cost } = req.body;
  if (!order_id) return res.status(400).json({ error: 'order_id is required' });
  const result = db.prepare(`
    INSERT INTO shipments
      (order_id, carrier, service, tracking_id, tracking_number, tracker_url, label_url, shipping_cost, shipped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(order_id, carrier || null, service || null, tracking_id || null,
         tracking_number || null, tracker_url || null, label_url || null, shipping_cost ?? null);
  res.status(201).json(db.prepare('SELECT * FROM shipments WHERE id = ?').get(result.lastInsertRowid));
});

// PATCH update shipment (tracking updates, label reprint)
router.patch('/:id', (req, res) => {
  const allowed = ['carrier', 'service', 'tracking_id', 'tracking_number',
                   'tracker_url', 'label_url', 'shipping_cost', 'shipped_at'];
  const sets = [], vals = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
  });
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE shipments SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});

module.exports = router;
