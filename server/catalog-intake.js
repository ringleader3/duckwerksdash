const { google } = require('googleapis');
const path       = require('path');
const router     = require('express').Router();

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

function generateTitle({ manufacturer, mold, plastic, run, weight, color, condition }) {
  const parts = [manufacturer, mold, plastic];
  if (run) parts.push(run);
  parts.push(`${weight}g`, color, condition);
  const title = parts.join(' ');
  if (title.length <= 80) return title;
  return title.slice(0, 81).replace(/\s+\S*$/, '');
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
router.get('/manufacturers', async (req, res) => {
  try {
    const sheets = getSheets();
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!F:F`,
    });
    const rows  = (resp.data.values || []).slice(1);
    const names = [...new Set(rows.map(r => r[0]).filter(Boolean))].sort();
    res.json({ manufacturers: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/molds
router.get('/molds', async (req, res) => {
  try {
    const sheets = getSheets();
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!G:G`,
    });
    const rows  = (resp.data.values || []).slice(1);
    const names = [...new Set(rows.map(r => r[0]).filter(Boolean))].sort();
    res.json({ molds: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalog-intake/plastics
router.get('/plastics', async (req, res) => {
  try {
    const sheets = getSheets();
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!I:I`,
    });
    const rows  = (resp.data.values || []).slice(1);
    const names = [...new Set(rows.map(r => r[0]).filter(Boolean))].sort();
    res.json({ plastics: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/catalog-intake/disc
router.post('/disc', async (req, res) => {
  try {
    const { discNum, box, manufacturer, mold, type, plastic, run, notes, condition, weight, color, listPrice } = req.body;
    const title = generateTitle({ manufacturer, mold, plastic, run, weight, color, condition });
    // Column order: A=Disc#, B=Box, C=ListTitle, D=Description(blank),
    // E=Sold, F=Manufacturer, G=Mold, H=Type, I=Plastic, J=Run/Edition,
    // K=Notes, L=Condition, M=Weight, N=Color, O=EstValue(blank), P=ListPrice, Q=Platform, R=Status(blank)
    const row = [
      discNum,       // A
      box,           // B
      title,         // C List Title
      '',            // D Description
      'FALSE',       // E Sold
      manufacturer,  // F
      mold,          // G
      type,          // H
      plastic,       // I
      run || '',     // J Run/Edition
      notes || '',   // K Notes
      condition,     // L
      weight,        // M
      color,         // N
      '',            // O Est. Value
      listPrice,     // P
      'Ebay',        // Q Platform
      '',            // R Status
    ];
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:R`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] },
    });
    res.json({ discNum, title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
