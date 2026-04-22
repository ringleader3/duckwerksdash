#!/usr/bin/env node
// ── Duckwerks Print Server ────────────────────────────────────────────────────
// Runs on the Mac (the machine with the printers).
// Usage: node scripts/print-server.js
//
// Required .env:
//   LABEL_PRINTER=<exact printer name from `lpstat -p`>
//   PRINT_SERVER_PORT=3002   (optional, default 3002)
//
// To find printer names: run `lpstat -p` in terminal

require('dotenv').config();
const express  = require('express');
const { exec } = require('child_process');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');

const LABEL_PRINTER = process.env.LABEL_PRINTER;
const PORT          = parseInt(process.env.PRINT_SERVER_PORT || '3002', 10);

if (!LABEL_PRINTER) {
  console.error('ERROR: LABEL_PRINTER must be set in .env');
  process.exit(1);
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
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
  if (!res.ok) throw new Error(`Failed to fetch label: ${res.status}`);
  const buf  = Buffer.from(await res.arrayBuffer());
  const ext  = url.toLowerCase().includes('.png') ? 'png' : 'pdf';
  const file = path.join(os.tmpdir(), `dw-label-${Date.now()}.${ext}`);
  fs.writeFileSync(file, buf);
  return file;
}

// ── routes ────────────────────────────────────────────────────────────────────

// POST /print/label — { url: string }
app.post('/print/label', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const file = await downloadToTmp(url);
    await lpPrint(file, LABEL_PRINTER, [
      "media=4x6",
      "resolution=203dpi",
      "scaling=100",
    ]);
    fs.unlinkSync(file);
    res.json({ ok: true });
  } catch(e) {
    console.error('[print/label]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /status
app.get('/status', (req, res) => {
  res.json({ ok: true, labelPrinter: LABEL_PRINTER });
});

app.listen(PORT, () => {
  console.log(`Duckwerks Print Server on http://localhost:${PORT}`);
  console.log(`  Label printer: ${LABEL_PRINTER}`);
});
