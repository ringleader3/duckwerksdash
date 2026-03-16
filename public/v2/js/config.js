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

const AIRTABLE_API = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
