#!/usr/bin/env node
// Standalone Reverb scraper — invoked as a child process by server/comps.js
// so that Chromium crashes cannot kill the main Express server.
//
// Usage: node reverb-scrape.js <name> <minPrice> <chromePath>
// Output: JSON array of listing objects on stdout, exit 0
// On error: error message on stderr, exit 1

const puppeteerExtra = require('puppeteer-extra');
puppeteerExtra.use(require('puppeteer-extra-plugin-stealth')());

const [,, name, minPriceStr, chromePath] = process.argv;
const minPrice = parseFloat(minPriceStr) || 0;

const url = `https://reverb.com/marketplace?query=${encodeURIComponent(name)}&show_only_sold=true&sort=published_at|desc`;

(async () => {
  const browser = await puppeteerExtra.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const pageTitle = await page.title();
    await page.waitForSelector('ul.rc-listing-grid', { timeout: 10000 }).catch(e => {
      throw new Error(`selector not found (page title: "${pageTitle}") — ${e.message}`);
    });

    const listings = await page.evaluate(() => {
      return [...document.querySelectorAll('li.rc-listing-grid__item')].map(el => {
        const title     = el.querySelector('h2.rc-listing-card__title')?.textContent?.trim() || '';
        const condition = el.querySelector('div.rc-listing-card__condition')?.textContent?.trim() || '';
        const priceRaw  = el.querySelector('div.rc-price-block__price')?.textContent?.trim() || '';
        const shipRaw   = el.querySelector('div.rc-price-block__shipping')?.textContent?.trim() || '';
        const price     = parseFloat(priceRaw.replace(/[^\d.]/g, '')) || 0;
        const shipping  = parseFloat(shipRaw.replace(/[^\d.]/g, '')) || 0;
        return {
          title, condition,
          sold_price:     price,
          shipping,
          total_landed:   +(price + shipping).toFixed(2),
          sale_type:      'BIN',
          end_date:       '',
          listing_status: 'sold',
          source:         'Reverb',
        };
      });
    });

    const filtered = listings
      .filter(l => !minPrice || l.sold_price >= minPrice)
      .map(l => ({ ...l, query: name }));

    process.stdout.write(JSON.stringify(filtered));
  } finally {
    await browser.close();
  }
})().catch(e => {
  process.stderr.write(e.message);
  process.exit(1);
});
