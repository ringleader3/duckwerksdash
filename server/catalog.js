// server/catalog.js — GET /api/sites, GET /api/categories
const express = require('express');
const router  = express.Router();
const db      = require('./db');

router.get('/sites', (_req, res) => {
  res.json(db.prepare('SELECT * FROM sites WHERE active = 1 ORDER BY name').all());
});

router.get('/categories', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

module.exports = router;
