const { google } = require('googleapis');
const path       = require('path');
const router     = require('express').Router();
const db         = require('./db');

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const lookupFlight = db.prepare(
  'SELECT speed, glide, turn, fade, stability FROM flight_numbers WHERE manufacturer_key = ? AND mold_key = ?'
);

const SHEET_ID   = '1Gmdw2qcHRA_9wz29CXul3pTCT92pX56V4FPLkrhNnHE';
const SHEET_NAME = 'duckwerks-dg-catalog';
const KEY_PATH   = path.join(__dirname, '..', 'docs', 'handicaps-244e5d936e6c.json');

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// GET /api/catalog-intake/next-disc-num
router.get('/next-disc-num', async (req, res) => {
  try {
    const sheets = getSheets();
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    });
    const rows    = resp.data.values || [];
    const dataRows = rows.slice(1).filter(r => r[0]);
    const lastNum  = dataRows.length > 0 ? parseInt(dataRows[dataRows.length - 1][0], 10) : 0;
    res.json({ nextDiscNum: (isNaN(lastNum) ? 0 : lastNum) + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/manufacturers
router.get('/manufacturers', (req, res) => {
  try {
    const rows  = db.prepare('SELECT DISTINCT manufacturer FROM flight_numbers ORDER BY manufacturer').all();
    const names = rows.map(r => r.manufacturer).filter(Boolean);
    res.json({ manufacturers: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/molds
router.get('/molds', (req, res) => {
  try {
    const { manufacturer } = req.query;
    const rows = manufacturer
      ? db.prepare('SELECT DISTINCT mold FROM flight_numbers WHERE manufacturer_key = ? ORDER BY mold').all(normalize(manufacturer))
      : db.prepare('SELECT DISTINCT mold FROM flight_numbers ORDER BY mold').all();
    const names = rows.map(r => r.mold).filter(Boolean);
    res.json({ molds: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/plastics
router.get('/plastics', (req, res) => {
  try {
    const { manufacturer } = req.query;
    const rows = manufacturer
      ? db.prepare('SELECT plastic, tier FROM disc_plastics WHERE manufacturer_key = ? ORDER BY tier DESC, plastic').all(normalize(manufacturer))
      : db.prepare('SELECT DISTINCT plastic, tier FROM disc_plastics ORDER BY tier DESC, plastic').all();
    res.json({ plastics: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog-intake/disc
router.post('/disc', async (req, res) => {
  try {
    const { discNum, box, manufacturer, mold, type, plastic, run, notes, condition, weight, color, listPrice } = req.body;
    const flight = lookupFlight.get(normalize(manufacturer), normalize(mold)) || {};
    // Column order: A=Disc#, B=Box, C=ListTitle(blank), D=Description(blank),
    // E=Sold, F=Manufacturer, G=Mold, H=Type, I=Plastic, J=Run/Edition,
    // K=Notes, L=Condition, M=Weight, N=Color, O=EstValue(blank), P=ListPrice, Q=Platform, R=Status(blank)
    // S=Comp Pull, T=speed, U=glide, V=turn, W=fade, X=stability
    const row = [
      discNum,              // A
      box,                  // B
      '',                   // C List Title
      '',                   // D Description
      'FALSE',              // E Sold
      manufacturer,         // F
      mold,                 // G
      type,                 // H
      plastic,              // I
      run || '',            // J Run/Edition
      notes || '',          // K Notes
      condition,            // L
      weight,               // M
      color,                // N
      '',                   // O Est. Value
      listPrice,            // P
      'Ebay',               // Q Platform
      '',                   // R Status
      '',                   // S Comp Pull
      flight.speed     ?? '', // T
      flight.glide     ?? '', // U
      flight.turn      ?? '', // V
      flight.fade      ?? '', // W
      flight.stability ?? '', // X
    ];
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:X`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] },
    });
    res.json({ discNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// markDiscSold(sku) — sets column E = TRUE for a DWG-XXX SKU
// Exported for use by orders.js when an item is marked Sold
async function markDiscSold(sku) {
  const match = sku && sku.match(/^DWG-(\d+)$/i);
  if (!match) return;
  const discNum = parseInt(match[1], 10);
  const row     = discNum + 1; // row 1 is header
  const sheets  = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range:         `${SHEET_NAME}!E${row}`,
    valueInputOption: 'RAW',
    requestBody:   { values: [['TRUE']] },
  });
}

module.exports = { router, markDiscSold };
