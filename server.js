require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use('/v2', express.static(path.join(__dirname, 'public/v2')));
app.use(express.static(__dirname));

// ── CONFIG ────────────────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({ airtablePat: process.env.AIRTABLE_PAT || '' });
});

// ── API ROUTERS ───────────────────────────────────────────────────────────────

app.use('/api/shippo', require('./server/shippo'));
app.use('/api/label',  require('./server/shippo'));
app.use('/api/reverb', require('./server/reverb'));

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Duckwerks proxy running at http://localhost:${PORT}/duckwerks-dashboard.html`);
  const testOk = !!process.env.SHIPPO_TEST_TOKEN, liveOk = !!process.env.SHIPPO_LIVE_TOKEN;
  console.log(`Shippo tokens: test=${testOk ? 'OK' : 'MISSING'}, live=${liveOk ? 'OK' : 'MISSING'} (active mode set by SHIPPO_TEST_MODE in HTML)`);
});
