// ── Duckwerks v2 — Config ─────────────────────────────────────────────────────
// Single source of truth for Airtable field IDs and app constants.
// All views and store reference F.* — never use field names directly.

const BASE_ID  = 'appLj1a6YcqzA9uum';
const TABLE_ID = 'tbly2xgKYqgF96kWw';

const F = {
  name:            'fldY4lOcgWYz1Xh7f',
  status:          'fldE6NtzEZzAVH5TC',
  listPrice:       'fldFYd9nqbYVITVSI',
  cost:            'fld6gdPNNaCMmeZU4',
  sale:            'fldwZSF8D6sWUT9zt',
  shipping:        'fldlrSl2HdhA02NUp',
  profit:          'fld189wjDfn9EZiHs',
  lot:             'fldxpAbnsKO1zBdJ9',
  category:        'fldijAUBNfrgfJO1P',
  site:            'fld7d1DwvXTqJpJe9',
  url:             'fldz2lwmbIw9AeNam',
  reverbListingId: 'fldMtW0wQEMcUG9X1',
  reverbOrderNum:  'fldman6gKCzhYPv8S',
  dateSold:        'fldcIJOUtePuaxAVH',
  trackingId:      'fld83D6AubuZqZAQQ',
  trackingNumber:  'fldWWo58dN1cFKiSl',
  trackerUrl:      'fldTJ2Dm782UWe5dW',
};

const CAT_COLOR = {
  Music:    'var(--blue)',
  Computer: 'var(--purple)',
  Gaming:   'var(--orange)',
};

const CAT_BADGE = {
  Music:    'badge-music',
  Computer: 'badge-comp',
  Gaming:   'badge-gaming',
};

// Airtable is accessed via /api/airtable proxy — PAT never leaves the server
// Shippo test mode is controlled server-side via SHIPPO_TEST_MODE in .env
