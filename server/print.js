// ── Print proxy — forwards to the Mac print server ───────────────────────────
// Requires PRINT_SERVER_URL in .env, e.g.:
//   PRINT_SERVER_URL=http://MBA.local:3002
const express = require('express');
const router  = express.Router();

const PRINT_SERVER_URL = process.env.PRINT_SERVER_URL;

// POST /api/print/label — { url }
router.post('/label', async (req, res) => {
  if (!PRINT_SERVER_URL) {
    return res.status(503).json({ error: 'PRINT_SERVER_URL not configured' });
  }
  try {
    const r = await fetch(`${PRINT_SERVER_URL}/print/label`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch(e) {
    res.status(502).json({ error: `Print server unreachable: ${e.message}` });
  }
});

// GET /api/print/status
router.get('/status', async (req, res) => {
  if (!PRINT_SERVER_URL) return res.json({ configured: false });
  try {
    const r    = await fetch(`${PRINT_SERVER_URL}/status`);
    const data = await r.json();
    res.json({ configured: true, ...data });
  } catch(e) {
    res.status(502).json({ configured: true, error: `Print server unreachable: ${e.message}` });
  }
});

module.exports = router;
