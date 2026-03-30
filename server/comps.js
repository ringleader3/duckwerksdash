const express    = require('express');
const router     = express.Router();
const Anthropic  = require('@anthropic-ai/sdk');
const fs         = require('fs');
const path       = require('path');
const puppeteer  = require('puppeteer-core');
const { getAppToken } = require('./ebay-auth');

const EBAY_API    = 'https://api.ebay.com';
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const COMP_WORKFLOW = fs.readFileSync(
  path.join(__dirname, '../docs/gear-comp-research.md'), 'utf8'
);

const SYSTEM_PROMPT = `You are a reseller pricing assistant. Your job is to analyze eBay listing data and produce structured comp analysis.

Here is the comp research workflow and CSV format you must follow:

${COMP_WORKFLOW}

When given raw eBay listing data for an item, you will:
1. Write a brief analysis paragraph (2-4 sentences): price range, notable outliers or patterns, recommended list price and floor price. Be specific with dollar amounts.
2. Output a CSV block in the exact format from the workflow doc above.

For the CSV:
- source: use "eBay" for eBay listings and "Reverb" for Reverb listings (check the listing data)
- date_pulled is the date provided
- Use the listing data as-is for title, condition, sold_price, shipping, total_landed, sale_type
- listing_status: use the value from the data — eBay results are confirmed sold (soldItems filter), Reverb results are confirmed sold (show_only_sold=true). Do not override based on end_date.
- notes: flag outliers (parts-only, lot, Japanese import, no PSU, battery-only, etc.) as described in the workflow. Leave empty if nothing notable.

IMPORTANT: You MUST always output both sections. Even if the data is noisy or all listings are active, still produce the CSV — use the notes column to flag questionable listings (kit, charger-only, 2-pack, aftermarket, active/no-sold-date, etc.). Never skip the CSV block.

Format your response EXACTLY as:
ANALYSIS:
<analysis paragraph>

CSV:
\`\`\`
item,source,date_pulled,title,condition,sold_price,shipping,total_landed,sale_type,listing_status,notes
<rows>
\`\`\`

Do not include any other text outside this format.`;

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
    const results = await Promise.all(items.map(async item => {
      const [ebayResult, reverbListings] = await Promise.all([
        searchItem(token, item),
        searchReverb(item.name, item.minPrice).catch(e => {
          console.warn(`Reverb scrape failed for "${item.name}":`, e.message);
          return [];
        }),
      ]);
      return {
        name:     item.name,
        hints:    item,
        listings: [...ebayResult.listings, ...reverbListings],
      };
    }));
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: 'Search failed', detail: e.message });
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
        sale_type:       normalizeBuyingOption(i.buyingOptions),
        end_date:        i.itemEndDate || i.soldDate || '',
        listing_status:  'sold',   // soldItems:{true} filter confirmed working; Browse API just doesn't return date
        source:          'eBay',
        item_id:         i.legacyItemId || i.itemId,
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

async function searchReverb(name, minPrice) {
  const url = `https://reverb.com/marketplace?query=${encodeURIComponent(name)}&show_only_sold=true&sort=published_at|desc`;

  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('ul.rc-listing-grid', { timeout: 10000 });

    const listings = await page.evaluate(() => {
      return [...document.querySelectorAll('li.rc-listing-grid__item')].map(el => {
        const title     = el.querySelector('h2.rc-listing-row-card__title')?.textContent?.trim() || '';
        const condition = el.querySelector('div.rc-listing-row-card__condition')?.textContent?.trim() || '';
        const priceRaw  = el.querySelector('div.rc-price-block__price')?.textContent?.trim() || '';
        const shipRaw   = el.querySelector('div.rc-price-block__shipping')?.textContent?.trim() || '';
        const price     = parseFloat(priceRaw.replace(/[^\d.]/g, '')) || 0;
        const shipping  = parseFloat(shipRaw.replace(/[^\d.]/g, '')) || 0;
        return {
          query: '',  // filled below
          title, condition,
          sold_price:      price,
          shipping,
          total_landed:    +(price + shipping).toFixed(2),
          sale_type:       'BIN',
          end_date:        '',
          listing_status:  'sold',
          source:          'Reverb',
        };
      });
    });

    return listings
      .map(l => ({ ...l, query: name }))
      .filter(l => !minPrice || l.sold_price >= minPrice);
  } finally {
    await browser.close();
  }
}

// POST /api/comps/analyze
// Body: { item: { name, hints, listings: [...] } }
// Returns: { name, analysis, csv }
router.post('/analyze', async (req, res) => {
  const { item } = req.body;
  if (!item || !item.listings) {
    return res.status(400).json({ error: 'item with listings required' });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today     = new Date().toISOString().split('T')[0];
  const userMsg   = `Item: ${item.name}
Date today: ${today}
Hints: ${JSON.stringify(item.hints)}

eBay listings (${item.listings.length} results):
${JSON.stringify(item.listings, null, 2)}`;

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userMsg }],
    });

    const text     = message.content[0]?.text || '';
    const analysis = extractSection(text, 'ANALYSIS:', 'CSV:');
    const csv      = extractCsvBlock(text);

    res.json({ name: item.name, analysis, csv });
  } catch (e) {
    res.status(502).json({ error: 'Claude API error', detail: e.message });
  }
});

function extractSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end   = endMarker ? text.indexOf(endMarker) : text.length;
  if (start === -1) return text.trim();
  return text.slice(start + startMarker.length, end > start ? end : text.length).trim();
}

function extractCsvBlock(text) {
  // Match fenced block with optional language hint
  const fenced = text.match(/```[^\n]*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Fallback: grab everything after "CSV:" and strip any surrounding fences
  const csvIdx = text.indexOf('CSV:');
  if (csvIdx !== -1) {
    return text.slice(csvIdx + 4).trim().replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
  }
  return '';
}

module.exports = { router };
