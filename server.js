require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static(__dirname)); // serves duckwerks-dashboard.html

const SHIPPO_API = 'https://api.goshippo.com';
const SHIPPO_API_VERSION = '2018-02-08';

function getShippoToken(testMode) {
  const token = testMode ? process.env.SHIPPO_TEST_TOKEN : process.env.SHIPPO_LIVE_TOKEN;
  if (!token) throw new Error(`Shippo ${testMode ? 'test' : 'live'} token not configured`);
  return token;
}

// ── CONFIG ENDPOINT ───────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({ airtablePat: process.env.AIRTABLE_PAT || '' });
});

// ── LABEL ENDPOINTS ───────────────────────────────────────────────────────────

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

// Get rates: creates a shipment and returns sorted rates
app.post('/api/label/rates', async (req, res) => {
  const { testMode, toAddress, parcel } = req.body;
  let token;
  try { token = getShippoToken(testMode); } catch (e) { return res.status(500).json({ error: e.message }); }

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

// Purchase label: buy a rate, return tracking + label URL
app.post('/api/label/purchase', async (req, res) => {
  const { testMode, rateObjectId } = req.body;
  let token;
  try { token = getShippoToken(testMode); } catch (e) { return res.status(500).json({ error: e.message }); }

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

// ── GENERIC SHIPPO PROXY ───────────────────────────────────────────────────────

// Generic Shippo proxy — POST /api/shippo/:path
// Body: { testMode: bool, ...shippoPayload }
app.post('/api/shippo/:path(*)', async (req, res) => {
  const { testMode, ...payload } = req.body;
  let token;
  try {
    token = getShippoToken(testMode);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

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

// Generic Shippo proxy — GET /api/shippo/:path
app.get('/api/shippo/:path(*)', async (req, res) => {
  const testMode = req.query.testMode === 'true';
  let token;
  try {
    token = getShippoToken(testMode);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Duckwerks proxy running at http://localhost:${PORT}/duckwerks-dashboard.html`);
  console.log(`Shippo test mode: ${!!process.env.SHIPPO_TEST_TOKEN}`);
});
