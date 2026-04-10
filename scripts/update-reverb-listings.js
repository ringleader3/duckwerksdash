#!/usr/bin/env node
/**
 * update-reverb-listings.js
 *
 * Reads duckwerks-listing-rewrites.docx, finds all [REWRITE] entries,
 * and updates each listing's description on Reverb via the API.
 *
 * Usage:
 *   node scripts/update-reverb-listings.js            # dry run (default)
 *   node scripts/update-reverb-listings.js --confirm  # actually update
 */

require('dotenv').config();
const { execSync } = require('child_process');
const https = require('https');
const path = require('path');

const DOCX_PATH = path.join(__dirname, '..', 'duckwerks-listing-rewrites.docx');
const REVERB_API = 'https://api.reverb.com/api';
const DRY_RUN = !process.argv.includes('--confirm');

// --- Parse docx ---

function decodeEntities(str) {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Returns [{text, mono}] — one entry per non-empty paragraph
function extractParagraphs(filePath) {
  const xml = execSync(`unzip -p "${filePath}" word/document.xml`).toString();

  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

  const results = [];
  let paraMatch;

  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const paraXml = paraMatch[0];
    const mono = paraXml.includes('Courier New');

    // Collect all <w:t> text runs within this paragraph
    let text = '';
    let tMatch;
    while ((tMatch = textRegex.exec(paraXml)) !== null) {
      text += tMatch[1];
    }
    textRegex.lastIndex = 0; // reset for next paragraph

    text = decodeEntities(text).trim();
    if (text) results.push({ text, mono });
  }

  return results;
}

function parseRewrites(paragraphs) {
  const results = [];
  let i = 0;

  while (i < paragraphs.length) {
    const { text } = paragraphs[i];
    const rewriteMatch = text.match(/^\[REWRITE\]\s+(https:\/\/reverb\.com\/item\/(\d+)-\S+)/);

    if (rewriteMatch) {
      const url = rewriteMatch[1];
      const id = rewriteMatch[2];

      // Find "REWRITE COPY:" paragraph
      let copyStart = -1;
      for (let j = i + 1; j < paragraphs.length && j < i + 5; j++) {
        if (paragraphs[j].text.trim() === 'REWRITE COPY:') {
          copyStart = j + 1;
          break;
        }
      }

      if (copyStart === -1) {
        console.warn(`  WARNING: No "REWRITE COPY:" found for listing ${id} — skipping`);
        i++;
        continue;
      }

      // Collect description paragraphs until the next [REWRITE] / [ALREADY GOOD] marker.
      // Also stop if the NEXT paragraph is a marker — that means the current one is
      // the following listing's title, which bleeds in before its [REWRITE] line.
      const descParas = [];
      let j = copyStart;
      while (j < paragraphs.length) {
        const t = paragraphs[j].text;
        if (t.startsWith('[REWRITE]') || t.startsWith('[ALREADY GOOD]')) break;
        const next = paragraphs[j + 1]?.text || '';
        if (next.startsWith('[REWRITE]') || next.startsWith('[ALREADY GOOD]')) break;
        descParas.push(paragraphs[j]);
        j++;
      }

      results.push({ id, url, descParas });
      i = j;
    } else {
      i++;
    }
  }

  return results;
}

// --- Formatting ---

const SPEC_LINE    = /^[A-Za-z][A-Za-z0-9 /()+-]{1,30}: \S/;
const SHIPPING_LINE = /^All my pedals ship with Free shipping/;

// Reverb descriptions render as HTML. Supported: <p>, <strong>, <em>, <ul>/<li>.
// - Shipping spiel  → <p><strong>…</strong></p>
// - Spec lines      → grouped into <ul><li><em>…</em></li></ul>
// - Everything else → <p>…</p>
function toHtml(descParas) {
  const out = [];
  let i = 0;
  while (i < descParas.length) {
    const { text } = descParas[i];
    if (SHIPPING_LINE.test(text)) {
      out.push(`<p><strong>${text}</strong></p>`);
      i++;
    } else if (SPEC_LINE.test(text)) {
      // Collect consecutive spec lines into one <ul>
      const items = [];
      while (i < descParas.length && SPEC_LINE.test(descParas[i].text)) {
        items.push(`<li><em>${descParas[i].text}</em></li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
    } else {
      out.push(`<p>${text}</p>`);
      i++;
    }
  }
  return out.join('\n');
}

// --- Reverb API ---

function reverbPut(listingId, body) {
  return new Promise((resolve, reject) => {
    const pat = process.env.REVERB_PAT;
    if (!pat) return reject(new Error('REVERB_PAT not set in .env'));

    const payload = JSON.stringify(body);
    const options = {
      hostname: 'api.reverb.com',
      path: `/api/listings/${listingId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/hal+json',
        'Accept-Version': '3.0',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// --- Main ---

async function main() {
  console.log(`\nDuckWerks — Reverb Listing Description Updater`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --confirm to actually update)' : '*** LIVE — will update Reverb listings ***'}\n`);

  let paragraphs;
  try {
    paragraphs = extractParagraphs(DOCX_PATH);
  } catch (e) {
    console.error(`Failed to read docx: ${e.message}`);
    process.exit(1);
  }

  const rewrites = parseRewrites(paragraphs);

  if (!rewrites.length) {
    console.log('No [REWRITE] entries found.');
    return;
  }

  console.log(`Found ${rewrites.length} listing(s) to update:\n`);

  let successCount = 0;
  let failCount = 0;

  for (const { id, url, descParas } of rewrites) {
    const preview = descParas[0]?.text.slice(0, 80) || '';
    console.log(`Listing ${id}`);
    console.log(`  URL:     ${url}`);
    console.log(`  Preview: ${preview}...`);

    if (DRY_RUN) {
      console.log(`  → [DRY RUN] would PUT /api/listings/${id}\n`);
    } else {
      try {
        const result = await reverbPut(id, { description: toHtml(descParas) });
        if (result.status >= 200 && result.status < 300) {
          console.log(`  → OK (${result.status})\n`);
          successCount++;
        } else {
          const msg = result.body?.message || result.body?.errors || JSON.stringify(result.body).slice(0, 120);
          console.log(`  → FAILED (${result.status}): ${msg}\n`);
          failCount++;
        }
      } catch (e) {
        console.log(`  → ERROR: ${e.message}\n`);
        failCount++;
      }
    }
  }

  if (!DRY_RUN) {
    console.log(`Done. ${successCount} updated, ${failCount} failed.`);
  } else {
    console.log(`Dry run complete. Run with --confirm to push ${rewrites.length} updates.`);
  }
}

main();
