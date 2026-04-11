const express = require('express');
const router  = express.Router();
const { getAccessToken, getAppToken, authRedirectUrl, exchangeCodeForTokens, writeTokens } = require('./ebay-auth');

const EBAY_API = 'https://api.ebay.com';

// Map EasyPost carrier names to eBay carrier codes
const EBAY_CARRIER_CODES = {
  'USPS':  'USPS',
  'UPS':   'UPS',
  'FedEx': 'FEDEX',
  'DHL':   'DHL',
};

async function ebayHeaders() {
  const token = await getAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    'Accept-Language': 'en-US',
  };
}

// ── OAuth setup routes ────────────────────────────────────────────────────────

// Step 1: visit in browser — redirects to eBay consent page
router.get('/auth', (req, res) => {
  res.redirect(authRedirectUrl());
});

// Step 2: eBay redirects to duckwerks.com/ebay-oauth-callback.php which shows
// the code. Run the curl command shown there to hit this endpoint and save tokens.
router.post('/auth/exchange', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  try {
    const tokens = await exchangeCodeForTokens(code);
    writeTokens({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    Date.now() + tokens.expires_in * 1000,
    });
    res.json({ ok: true, message: 'eBay authorization complete.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fulfillment routes ────────────────────────────────────────────────────────

// GET /api/ebay/orders — orders awaiting fulfillment
// Filter passed as raw string — URLSearchParams would encode { } | which eBay rejects
router.get('/orders', async (req, res) => {
  try {
    const headers  = await ebayHeaders();
    const url      = `${EBAY_API}/sell/fulfillment/v1/order?filter=orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}&limit=50`;
    const response = await fetch(url, { headers });
    const data     = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay orders request failed', detail: e.message });
  }
});

router.get('/orders/sold', async (req, res) => {
  try {
    const headers  = await ebayHeaders();
    const url      = `${EBAY_API}/sell/fulfillment/v1/order?filter=orderfulfillmentstatus:{FULFILLED|IN_PROGRESS}&limit=50`;
    const response = await fetch(url, { headers });
    const data     = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay orders request failed', detail: e.message });
  }
});

// GET /api/ebay/orders/:id — single order (address + payout lookup)
router.get('/orders/:id', async (req, res) => {
  try {
    const headers  = await ebayHeaders();
    const response = await fetch(
      `${EBAY_API}/sell/fulfillment/v1/order/${encodeURIComponent(req.params.id)}`,
      { headers }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay order request failed', detail: e.message });
  }
});

// POST /api/ebay/orders/:id/tracking — push tracking, marks order shipped
router.post('/orders/:id/tracking', async (req, res) => {
  const { id } = req.params;
  const { lineItemId, quantity, trackingNumber, shippingCarrierCode } = req.body;
  const ebayCarrier = EBAY_CARRIER_CODES[shippingCarrierCode] || shippingCarrierCode;
  try {
    const headers  = await ebayHeaders();
    const response = await fetch(
      `${EBAY_API}/sell/fulfillment/v1/order/${encodeURIComponent(id)}/shipping_fulfillment`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lineItems:           [{ lineItemId, quantity: quantity || 1 }],
          trackingNumber,
          shippingCarrierCode: ebayCarrier,
          shippedDate:         new Date().toISOString(),
        }),
      }
    );
    // 201 = success, no response body
    if (response.status === 201) return res.status(201).json({ ok: true });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay tracking push failed', detail: e.message });
  }
});

// ── Browse API: active listings ───────────────────────────────────────────────

// GET /api/ebay/listings — fetch all active listings for seller via Browse API
// Uses app token (client credentials) — no user OAuth required
router.get('/listings', async (req, res) => {
  const username = process.env.EBAY_SELLER_USERNAME;
  if (!username) return res.status(500).json({ error: 'EBAY_SELLER_USERNAME not set in .env' });

  try {
    const token    = await getAppToken();
    const listings = [];
    let offset     = 0;
    const limit    = 200;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url = `${EBAY_API}/buy/browse/v1/item_summary/search`
        + `?category_ids=0&filter=sellers:{${username}}&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: {
          'Authorization':          `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      });
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: 'Browse API error', detail: text });
      }
      const data = await response.json();
      const items = data.itemSummaries || [];

      for (const item of items) {
        // itemId format: "v1|168263363142|0" — extract the numeric legacy ID
        const legacyItemId = item.itemId?.split('|')[1] || '';
        listings.push({ title: item.title, legacyItemId, price: item.price?.value, watchCount: item.watchCount ?? null });
      }

      if (listings.length >= (data.total || 0) || items.length < limit) break;
      offset += limit;
    }

    res.json({ listings });
  } catch (e) {
    res.status(502).json({ error: 'eBay listings request failed', detail: e.message });
  }
});

// GET /api/ebay/traffic — eBay Sell Analytics traffic report, last 30 days, per listing
// Returns { listings: { [listingId]: { views, impressions, ctr } } }
// dimension=LISTING; metric order may vary — normalized server-side using header.metrics
router.get('/traffic', async (req, res) => {
  try {
    const headers = await ebayHeaders();
    const end     = new Date();
    const start   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fmt     = d => d.toISOString().split('.')[0] + 'Z';
    // Build URL manually — URLSearchParams encodes [ ] { } which eBay rejects
    const url = `${EBAY_API}/sell/analytics/v1/traffic_report`
      + `?dimension=LISTING`
      + `&metric=LISTING_VIEWS_TOTAL,LISTING_IMPRESSION_TOTAL,CLICK_THROUGH_RATE`
      + `&filter=marketplace_ids:{EBAY_US},date_range:[${fmt(start)}..${fmt(end)}]`;
    const response = await fetch(url, { headers });
    const data     = await response.json();
    if (data.errors) return res.status(400).json(data);

    // Normalize: map keyed by listing ID with named fields
    // eBay may reorder metrics vs. param order — use header.metrics to resolve positions
    const metricKeys = (data.header?.metrics || []).map(m => m.key);
    const listings   = {};
    for (const rec of (data.records || [])) {
      const lid  = rec.dimensionValues?.[0]?.value;
      if (!lid) continue;
      const vals = rec.metricValues || [];
      const get  = key => {
        const idx = metricKeys.indexOf(key);
        return idx >= 0 ? (vals[idx]?.value ?? null) : null;
      };
      listings[lid] = {
        views:       get('LISTING_VIEWS_TOTAL'),
        impressions: get('LISTING_IMPRESSION_TOTAL'),
        ctr:         get('CLICK_THROUGH_RATE'),
      };
    }
    res.json({ listings });
  } catch (e) {
    res.status(502).json({ error: 'eBay traffic report failed', detail: e.message });
  }
});

// NOTE: eBay Sell Feedback API (sell/feedback/v1) is not publicly accessible.
// Per-order feedback status cannot be retrieved via API.
// The Sold tab instead shows all FULFILLED orders within the 60-day feedback window.

// GET /api/ebay/fulfilled-orders — all orders filtered to FULFILLED status (paginated)
// Note: can't use /orders/fulfilled — shadowed by /orders/:id param route
// Note: eBay's {FULFILLED} single-value filter syntax is unreliable; fetch all and filter server-side
router.get('/fulfilled-orders', async (req, res) => {
  try {
    const headers = await ebayHeaders();
    const orders  = [];
    let offset    = 0;
    const limit   = 200;

    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url = `${EBAY_API}/sell/fulfillment/v1/order?limit=${limit}&offset=${offset}`;
      const response = await fetch(url, { headers });
      const data     = await response.json();
      const batch    = (data.orders || []).filter(o =>
        o.orderFulfillmentStatus === 'FULFILLED' &&
        new Date(o.creationDate) >= cutoff
      );
      orders.push(...batch);
      const total = data.total || 0;
      if ((data.orders || []).length < limit || offset + limit >= total) break;
      offset += limit;
    }

    res.json({ orders });
  } catch (e) {
    res.status(502).json({ error: 'eBay fulfilled orders request failed', detail: e.message });
  }
});

module.exports = router;
