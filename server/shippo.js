const express = require('express');
const router = express.Router();

const SHIPPO_API = 'https://api.goshippo.com';
const SHIPPO_API_VERSION = '2018-02-08';

// testMode is controlled server-side via SHIPPO_TEST_MODE in .env — never trust the client
const SHIPPO_TEST_MODE = process.env.SHIPPO_TEST_MODE === 'true';

function getShippoToken() {
  const token = SHIPPO_TEST_MODE ? process.env.SHIPPO_TEST_TOKEN : process.env.SHIPPO_LIVE_TOKEN;
  if (!token) throw new Error(`Shippo ${SHIPPO_TEST_MODE ? 'test' : 'live'} token not configured`);
  return token;
}

function fromAddress() {
  return {
    name:    process.env.FROM_NAME,
    street1: process.env.FROM_STREET1,
    city:    process.env.FROM_CITY,
    state:   process.env.FROM_STATE,
    zip:     process.env.FROM_ZIP,
    country: process.env.FROM_COUNTRY || 'US',
    phone:   process.env.FROM_PHONE,
  };
}

async function shippoPost(token, path, body) {
  const response = await fetch(`${SHIPPO_API}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `ShippoToken ${token}`,
      'Content-Type': 'application/json',
      'SHIPPO-API-VERSION': SHIPPO_API_VERSION,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

// ── LABEL USAGE ───────────────────────────────────────────────────────────────

// TODO: Confirm billing window dates with Shippo support before relying on this.
// Set to 'calendar-month' (1st of current month) or 'rolling-30' (last 30 days).
const BILLING_WINDOW = 'calendar-month';
const LABEL_LIMIT    = 30;

router.get('/usage', async (_req, res) => {
  // Always use the live token — the 30-label limit applies to live labels only
  const token = process.env.SHIPPO_LIVE_TOKEN;
  if (!token) return res.status(500).json({ error: 'Live token not configured' });

  let since;
  if (BILLING_WINDOW === 'rolling-30') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    since = d.toISOString();
  } else {
    const now = new Date();
    since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }

  try {
    const url = new URL(`${SHIPPO_API}/transactions/`);
    url.searchParams.set('results', '300');
    url.searchParams.set('object_created_after', since);
    url.searchParams.set('object_test', 'false');  // exclude test labels at the API level
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `ShippoToken ${token}`,
        'SHIPPO-API-VERSION': SHIPPO_API_VERSION,
      },
    });
    const data = await response.json();
    // Filter to SUCCESS only — excludes WAITING, QUEUED, ERROR, REFUNDED (drafts/failures)
    const purchased = (data.results || []).filter(t => t.status === 'SUCCESS');
    res.json({ count: purchased.length, limit: LABEL_LIMIT, window: BILLING_WINDOW, since });
  } catch (e) {
    res.status(502).json({ error: 'Shippo request failed', detail: e.message });
  }
});

// ── LABEL ENDPOINTS ───────────────────────────────────────────────────────────

router.post('/rates', async (req, res) => {
  const { toAddress, parcel } = req.body;
  let token;
  try { token = getShippoToken(); } catch (e) { return res.status(500).json({ error: e.message }); }

  try {
    const { status, data } = await shippoPost(token, 'shipments/', {
      address_from: fromAddress(),
      address_to: toAddress,
      parcels: [{
        weight: String(parcel.weight),
        mass_unit: 'lb',
        length: String(parcel.length),
        width: String(parcel.width),
        height: String(parcel.height),
        distance_unit: 'in',
      }],
      async: false,
    });
    if (status !== 201) return res.status(status).json(data);
    const rates = (data.rates || [])
      .filter(r => r.object_id)
      .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))
      .map(r => ({
        object_id: r.object_id,
        carrier:   r.provider,
        service:   r.servicelevel?.name || r.servicelevel_token,
        price:     parseFloat(r.amount),
        currency:  r.currency,
        days:      r.estimated_days,
      }));
    res.json({ rates });
  } catch (e) {
    res.status(502).json({ error: 'Shippo request failed', detail: e.message });
  }
});

router.post('/purchase', async (req, res) => {
  const { rateObjectId } = req.body;
  let token;
  try { token = getShippoToken(); } catch (e) { return res.status(500).json({ error: e.message }); }

  try {
    const { status, data } = await shippoPost(token, 'transactions/', {
      rate: rateObjectId,
      label_file_type: 'PDF',
      async: false,
    });
    if (status !== 201) return res.status(status).json(data);
    if (data.status !== 'SUCCESS') return res.status(400).json({ error: 'Label creation failed', messages: data.messages });
    res.json({
      trackingNumber: data.tracking_number,
      labelUrl:       data.label_url,
      trackingUrl:    data.tracking_url_provider,
    });
  } catch (e) {
    res.status(502).json({ error: 'Shippo request failed', detail: e.message });
  }
});

// ── GENERIC SHIPPO PROXY ──────────────────────────────────────────────────────

router.post('/:path(*)', async (req, res) => {
  const payload = req.body;
  let token;
  try { token = getShippoToken(); } catch (e) { return res.status(500).json({ error: e.message }); }

  const url = `${SHIPPO_API}/${req.params.path}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ShippoToken ${token}`,
        'Content-Type': 'application/json',
        'SHIPPO-API-VERSION': SHIPPO_API_VERSION,
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Shippo request failed', detail: e.message });
  }
});

router.get('/:path(*)', async (req, res) => {
  let token;
  try { token = getShippoToken(); } catch (e) { return res.status(500).json({ error: e.message }); }

  const url = `${SHIPPO_API}/${req.params.path}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `ShippoToken ${token}`,
        'SHIPPO-API-VERSION': SHIPPO_API_VERSION,
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Shippo request failed', detail: e.message });
  }
});

module.exports = router;
