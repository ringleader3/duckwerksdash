#!/usr/bin/env node
// ── Duckwerks Print Server ────────────────────────────────────────────────────
// Runs on the Mac (the machine with the printers).
// Usage: node scripts/print-server.js
//
// Required .env (in this repo root):
//   LABEL_PRINTER=<exact printer name from `lpstat -p`>
//   LETTER_PRINTER=<exact printer name from `lpstat -p`>
//   PRINT_SERVER_PORT=3002   (optional, default 3002)
//   CHROME_PATH=...          (already set for comps — used for packing slip)
//
// To find printer names: run `lpstat -p` in terminal

require('dotenv').config();
const express  = require('express');
const { exec } = require('child_process');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');

const LABEL_PRINTER  = process.env.LABEL_PRINTER;
const LETTER_PRINTER = process.env.LETTER_PRINTER;
const CHROME_PATH    = process.env.CHROME_PATH;
const PORT           = parseInt(process.env.PRINT_SERVER_PORT || '3002', 10);

if (!LABEL_PRINTER || !LETTER_PRINTER) {
  console.error('ERROR: LABEL_PRINTER and LETTER_PRINTER must be set in .env');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

// Allow requests from the NUC production server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── helpers ───────────────────────────────────────────────────────────────────

function lpPrint(filePath, printer, opts = []) {
  return new Promise((resolve, reject) => {
    const optStr = opts.map(o => `-o ${o}`).join(' ');
    const cmd = `lp -d "${printer}" ${optStr} "${filePath}"`;
    console.log('[print]', cmd);
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

async function downloadToTmp(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf  = Buffer.from(await res.arrayBuffer());
  const file = path.join(os.tmpdir(), `dw-print-${Date.now()}.pdf`);
  fs.writeFileSync(file, buf);
  return file;
}

async function htmlToPdf(html) {
  if (!CHROME_PATH) throw new Error('CHROME_PATH not set — needed for packing slip printing');
  const htmlFile = path.join(os.tmpdir(), `dw-slip-${Date.now()}.html`);
  const pdfFile  = htmlFile.replace('.html', '.pdf');
  fs.writeFileSync(htmlFile, html);
  await new Promise((resolve, reject) => {
    const cmd = `"${CHROME_PATH}" --headless --disable-gpu --no-sandbox --print-to-pdf="${pdfFile}" --print-to-pdf-no-header "file://${htmlFile}"`;
    exec(cmd, (err, stdout, stderr) => {
      fs.unlinkSync(htmlFile);
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
  return pdfFile;
}

function buildPackingSlipHtml({ itemName, toName, toAddress, orderNum, trackingNumber, carrier, service }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: monospace; font-size: 13px; padding: 24px; color: #000; }
  .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
  .store { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
  .section { margin-bottom: 16px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 3px; }
  .value { font-size: 14px; }
  .item { font-size: 15px; font-weight: bold; border: 1px solid #000; padding: 10px; margin-bottom: 16px; }
  .footer { border-top: 1px solid #ccc; padding-top: 10px; font-size: 11px; color: #555; margin-top: 24px; }
</style>
</head>
<body>
  <div class="header">
    <div class="store">DUCKWERKS MUSIC</div>
    <div style="font-size:11px;color:#555;margin-top:4px">Thank you for your purchase!</div>
  </div>

  <div class="item">${itemName || '—'}</div>

  <div class="section">
    <div class="label">Ship To</div>
    <div class="value" style="white-space:pre-line">${toName ? toName + '\n' : ''}${toAddress || '—'}</div>
  </div>

  ${orderNum ? `<div class="section">
    <div class="label">Order</div>
    <div class="value">${orderNum}</div>
  </div>` : ''}

  ${trackingNumber ? `<div class="section">
    <div class="label">Tracking</div>
    <div class="value">${carrier ? carrier + ' ' : ''}${service ? service + ' — ' : ''}${trackingNumber}</div>
  </div>` : ''}

  <div class="footer">
    All sales final. Questions? Message us through the platform you purchased from.<br>
    duckwerks.com
  </div>
</body>
</html>`;
}

// ── routes ────────────────────────────────────────────────────────────────────

// POST /print/label
// Body: { url: string }
app.post('/print/label', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const file = await downloadToTmp(url);
    // 4x6 label — fit to page, no margins
    await lpPrint(file, LABEL_PRINTER, ['media=Custom.4x6in', 'fit-to-page']);
    fs.unlinkSync(file);
    res.json({ ok: true });
  } catch(e) {
    console.error('[print/label]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /print/packingslip
// Body: { itemName, toName, toAddress, orderNum, trackingNumber, carrier, service }
app.post('/print/packingslip', async (req, res) => {
  try {
    const html    = buildPackingSlipHtml(req.body);
    const pdfFile = await htmlToPdf(html);
    await lpPrint(pdfFile, LETTER_PRINTER, ['media=Letter', 'fit-to-page']);
    fs.unlinkSync(pdfFile);
    res.json({ ok: true });
  } catch(e) {
    console.error('[print/packingslip]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /status — health check
app.get('/status', (req, res) => {
  res.json({ ok: true, labelPrinter: LABEL_PRINTER, letterPrinter: LETTER_PRINTER });
});

app.listen(PORT, () => {
  console.log(`Duckwerks Print Server running on http://localhost:${PORT}`);
  console.log(`  Label printer:  ${LABEL_PRINTER}`);
  console.log(`  Letter printer: ${LETTER_PRINTER}`);
});
