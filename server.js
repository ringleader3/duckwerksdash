require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json());
const noCache = { setHeaders: (res) => res.set('Cache-Control', 'no-store') };
app.use(express.static(path.join(__dirname, 'public/v2'), noCache));
app.use('/v2', express.static(path.join(__dirname, 'public/v2'), noCache));
app.use('/dg-photos', express.static(path.join(__dirname, 'public/dg-photos')));

// ── CONFIG ────────────────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({
    shippingProvider: (process.env.SHIPPING_PROVIDER || 'EASYPOST').toUpperCase(),
    hostname:         require('os').hostname(),
    environment:      process.env.SERVER_ENVIRONMENT || 'Development',
  });
});

// ── API ROUTERS ───────────────────────────────────────────────────────────────

app.use('/api',           require('./server/catalog'));    // /api/sites, /api/categories
app.use('/api/items',     require('./server/items'));
app.use('/api/lots',      require('./server/lots'));
app.use('/api/listings',  require('./server/listings'));
app.use('/api/orders',    require('./server/orders'));
app.use('/api/shipments', require('./server/shipments'));
app.use('/api/shippo',    require('./server/shippo'));
app.use('/api/label',     require('./server/label'));
app.use('/api/reverb',    require('./server/reverb'));
app.use('/api/ebay',      require('./server/ebay'));
app.use('/api/ebay',      require('./server/ebay-listings'));
app.use('/api/comps',     require('./server/comps').router);

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Duckwerks running at http://localhost:${PORT}`);
  const ebayAuth = require('./server/ebay-auth');
  console.log(`eBay auth: ${ebayAuth.readTokens() ? 'tokens present' : 'NOT AUTHORIZED — visit /api/ebay/auth'}`);
  const provider = (process.env.SHIPPING_PROVIDER || 'EASYPOST').toUpperCase();
  console.log(`Shipping provider: ${provider}`);
  if (provider === 'EASYPOST') {
    const testOk = !!process.env.EASYPOST_TEST_TOKEN, liveOk = !!process.env.EASYPOST_LIVE_TOKEN;
    const mode   = process.env.EASYPOST_TEST_MODE === 'true' ? 'TEST' : 'LIVE';
    console.log(`  EasyPost: mode=${mode}, test=${testOk ? 'OK' : 'MISSING'}, live=${liveOk ? 'OK' : 'MISSING'}`);
  }
});
