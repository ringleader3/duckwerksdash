const router = require('express').Router();
const db     = require('./db');

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const lookup = db.prepare(
  'SELECT speed, glide, turn, fade, stability FROM flight_numbers WHERE manufacturer_key = ? AND mold_key = ?'
);

// GET /api/flight-numbers?manufacturer=X&mold=Y
router.get('/', (req, res) => {
  const mfgKey  = normalize(req.query.manufacturer);
  const moldKey = normalize(req.query.mold);
  if (!mfgKey || !moldKey) return res.json({ found: false });
  const row = lookup.get(mfgKey, moldKey);
  if (!row) return res.json({ found: false });
  res.json({ found: true, ...row });
});

module.exports = router;
