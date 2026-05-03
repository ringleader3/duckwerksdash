require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack || err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason?.stack || reason);
  process.exit(1);
});

app.use(express.json({ limit: '25mb' }));
const noCache = { setHeaders: (res) => res.set('Cache-Control', 'no-store') };

// ── HTML assembler — inlines partials into index.html shell ──────────────────
const fs             = require('fs');
const PARTIALS_DIR   = path.join(__dirname, 'public/v2/partials');
const SHELL_PATH     = path.join(__dirname, 'public/v2/index.html');
const PARTIAL_RE     = /[ \t]*<!-- partial: ([\w\-/]+) -->/g;

function assembleHTML() {
  let shell = fs.readFileSync(SHELL_PATH, 'utf8');
  return shell.replace(PARTIAL_RE, (_match, name) => {
    const filePath = path.join(PARTIALS_DIR, name + '.html');
    return fs.readFileSync(filePath, 'utf8');
  });
}

app.get('/',             (_req, res) => { res.set('Cache-Control', 'no-store').type('html').send(assembleHTML()); });
app.get('/index.html',   (_req, res) => { res.set('Cache-Control', 'no-store').type('html').send(assembleHTML()); });
app.get('/v2',           (_req, res) => { res.set('Cache-Control', 'no-store').type('html').send(assembleHTML()); });
app.get('/v2/',          (_req, res) => { res.set('Cache-Control', 'no-store').type('html').send(assembleHTML()); });
app.get('/v2/index.html',(_req, res) => { res.set('Cache-Control', 'no-store').type('html').send(assembleHTML()); });

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

app.get('/push-test', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Push Test — Duckwerks</title>
  <style>
    body { font: 14px/1.6 monospace; padding: 40px; background: #111; color: #ccc; }
    h1 { font-size: 16px; letter-spacing: .1em; margin-bottom: 24px; }
    button { display: block; margin-bottom: 12px; padding: 8px 16px; font: 13px monospace; cursor: pointer; background: #222; color: #eee; border: 1px solid #444; }
    button:hover { background: #333; }
    #status { margin-top: 20px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <h1>Push Notification Test</h1>
  <button onclick="requestPerm()">Request Permission</button>
  <button onclick="fireTest()">Fire Test Notification</button>
  <div id="status"></div>
  <script>
    const TITLE = 'New Orders';
    const BODY  = 'You have 3 orders awaiting shipment';
    const TAG   = 'dw-orders';
    function log(msg) { document.getElementById('status').textContent = msg; }
    async function requestPerm() {
      const result = await Notification.requestPermission();
      log('Permission: ' + result);
    }
    function fireTest() {
      if (Notification.permission !== 'granted') { log('Permission not granted — click Request Permission first'); return; }
      new Notification(TITLE, { body: BODY, tag: TAG });
      log('Notification fired.');
    }
  </script>
</body>
</html>`);
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
app.use('/api/print',          require('./server/print'));
app.use('/api/catalog-intake',  require('./server/catalog-intake').router);
app.use('/api/flight-numbers',  require('./server/flight-numbers'));

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
