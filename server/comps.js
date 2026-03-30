const express  = require('express');
const router   = express.Router();
const { getAppToken } = require('./ebay-auth');

const EBAY_API = 'https://api.ebay.com';

// POST /api/comps/search
// Body: { items: [{ name, minPrice, notes, alternates }] }
// Returns: { results: [{ name, hints, listings: [...] }] }
router.post('/search', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }

  try {
    const token   = await getAppToken();
    const results = await Promise.all(items.map(item => searchItem(token, item)));
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: 'eBay search failed', detail: e.message });
  }
});

async function searchItem(token, item) {
  const { name, minPrice, alternates } = item;

  // Search the primary item name first, then any alternates
  const queries    = [name, ...(alternates || [])];
  const allListings = [];

  for (const q of queries) {
    const params = new URLSearchParams({
      q,
      limit: '30',
      sort: '-itemEndDate',
      fieldgroups: 'EXTENDED',
    });

    // soldItems:{true} filters to sold/completed listings only
    let filter = 'itemLocationCountry:US,soldItems:{true}';
    if (minPrice) filter += `,price:[${minPrice}..],priceCurrency:USD`;
    params.set('filter', filter);

    const url      = `${EBAY_API}/buy/browse/v1/item_summary/search?${params}`;
    const response = await fetch(url, {
      headers: {
        'Authorization':           `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`eBay Browse API error for "${q}": ${response.status} — ${text}`);
    }

    const data  = await response.json();
    const items = data.itemSummaries || [];

    for (const i of items) {
      const salePrice = parseFloat(i.price?.value || 0);
      const shipping  = parseFloat(i.shippingOptions?.[0]?.shippingCost?.value || 0);
      allListings.push({
        query:        q,
        title:        i.title,
        condition:    i.condition || '',
        sold_price:   salePrice,
        shipping,
        total_landed: +(salePrice + shipping).toFixed(2),
        sale_type:    normalizeBuyingOption(i.buyingOptions),
        end_date:     i.itemEndDate || i.soldDate || '',
        item_id:      i.legacyItemId || i.itemId,
      });
    }
  }

  return { name: item.name, hints: item, listings: allListings };
}

function normalizeBuyingOption(opts) {
  if (!opts) return 'BIN';
  const s = opts.join(',').toLowerCase();
  if (s.includes('best_offer')) return 'OBO';
  if (s.includes('auction'))    return 'Auction';
  return 'BIN';
}

module.exports = { router };
