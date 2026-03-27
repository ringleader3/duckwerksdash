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
        listings.push({ title: item.title, legacyItemId, price: item.price?.value });
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
router.get('/traffic', async (req, res) => {
  try {
    const headers = await ebayHeaders();
    const end     = new Date();
    const start   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fmt     = d => d.toISOString().split('.')[0] + 'Z';
    // Build URL manually — URLSearchParams encodes [ ] which eBay rejects
    const url = `${EBAY_API}/sell/analytics/v1/traffic_report`
      + `?dimension=LISTING_ID`
      + `&filter=date_range:[${fmt(start)}..${fmt(end)}],traffic_source:ALL`
      + `&metric=PAGE_VIEW_COUNT,WATCHER_COUNT,LISTING_IMPRESSION_ORGANIC,LISTING_CLICK_THROUGH_RATE`;
    const response = await fetch(url, { headers });
    const data     = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'eBay traffic report failed', detail: e.message });
  }
});

// GET /api/ebay/feedback — all feedback received as seller (paginated)
router.get('/feedback', async (req, res) => {
  try {
    const headers  = await ebayHeaders();
    const feedback = [];
    let url = `${EBAY_API}/sell/feedback/v1/feedback?feedback_type=RECEIVED_AS_SELLER&limit=200`;

    while (url) {
      const response = await fetch(url, { headers });
      const data     = await response.json();
      (data.feedbackList || []).forEach(f => feedback.push(f));
      url = data.next || null;
    }

    res.json({ feedback });
  } catch (e) {
    res.status(502).json({ error: 'eBay feedback request failed', detail: e.message });
  }
});

// GET /api/ebay/orders/fulfilled — fulfilled orders (paginated)
router.get('/orders/fulfilled', async (req, res) => {
  try {
    const headers = await ebayHeaders();
    const orders  = [];
    let offset    = 0;
    const limit   = 200;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Build URL manually — eBay rejects encoded { } |
      const url = `${EBAY_API}/sell/fulfillment/v1/order`
        + `?filter=orderfulfillmentstatus:{FULFILLED}`
        + `&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, { headers });
      const data     = await response.json();
      const batch    = data.orders || [];
      orders.push(...batch);
      if (batch.length < limit || orders.length >= (data.total || 0)) break;
      offset += limit;
    }

    res.json({ orders });
  } catch (e) {
    res.status(502).json({ error: 'eBay fulfilled orders request failed', detail: e.message });
  }
});

module.exports = router;
