// server/ebay-builders.js — category-specific payload builders
// Each builder takes raw item data and returns a normalized payload
// for the list/update routes. Add new builders here for new categories.

const LISTING_FOOTER = '\nAll sales final and all items sold as is. Please ask questions before purchasing.\nAll my listings ship with Free shipping for your ease, none of this $30 shipping on a 1 pound item. I price my listings fairly but please feel free to make an offer.\nI am a single person listing and selling 250 or so discs, so I might have missed a mark or two in my descriptions. Please ask if you want more photos or details about any of my discs, or let me know if you see any issues. \nThanks for looking!';

const DG_CATEGORY   = '184356'; // Sporting Goods > Disc Golf > Discs
const MIN_OFFER_PCT = 0.75;

const DISC_TYPE_MAP     = { 'Putter': 'Putting Disc', 'Midrange': 'Midrange Disc' };
const MANUFACTURER_MAP  = { 'Streamline': 'Streamline Discs' };

const VALID_COLORS = new Set([
  'Beige', 'Black', 'Blue', 'Bronze', 'Brown', 'Gold', 'Gray', 'Green',
  'Multi-Color', 'Orange', 'Pink', 'Purple', 'Red', 'Silver', 'White', 'Yellow',
]);

// eBay Inventory API does not accept bare "USED" — map it to the closest specific enum
const CONDITION_MAP = { 'USED': 'USED_EXCELLENT' };

function normalizeDiscType(type) { return DISC_TYPE_MAP[type] || type; }
function normalizeManufacturer(m) { return MANUFACTURER_MAP[m] || m; }
function normalizeCondition(c) { return CONDITION_MAP[c] || c || 'NEW'; }
function minOffer(price) { return Math.floor(parseFloat(price) * MIN_OFFER_PCT); }

function generateDiscTitle({ manufacturer, mold, plastic, run, weight, color, condition }) {
  const parts = [manufacturer, mold, plastic];
  if (run) parts.push(run);
  parts.push(`${weight}g`, color);
  if (condition === 'USED') parts.push('Used');
  const title = parts.join(' ');
  if (title.length <= 80) return title;
  return title.slice(0, 81).replace(/\s+\S*$/, '');
}

function buildDiscSpecLines(blob) {
  const lines = [];
  if (blob.manufacturer) lines.push(`Brand: ${blob.manufacturer}`);
  if (blob.mold)         lines.push(`Mold: ${blob.mold}`);
  if (blob.type)         lines.push(`Type: ${blob.type}`);
  if (blob.plastic)      lines.push(`Plastic: ${blob.plastic}`);
  if (blob.run)          lines.push(`Run/Edition: ${blob.run}`);
  if (blob.weight)       lines.push(`Weight: ${blob.weight}g`);
  if (blob.stability)    lines.push(`Stability: ${blob.stability}`);
  const hasVal = v => v != null && v !== '';
  if (hasVal(blob.speed) || hasVal(blob.glide) || hasVal(blob.turn) || hasVal(blob.fade)) {
    const parts = [];
    if (hasVal(blob.speed)) parts.push(`Speed: ${blob.speed}`);
    if (hasVal(blob.glide)) parts.push(`Glide: ${blob.glide}`);
    if (hasVal(blob.turn))  parts.push(`Turn: ${blob.turn}`);
    if (hasVal(blob.fade))  parts.push(`Fade: ${blob.fade}`);
    lines.push(`Flight Numbers: ${parts.join(' | ')}`);
  }
  if (blob.notes) lines.push(`Notes: ${blob.notes}`);
  return lines;
}

// Unified description renderer — used by disc builder routes.
// description: optional curated prose string
// specLines: string[] of "Key: Value" lines assembled by builder
// Returns full HTML string with mobile schema.org snippet, spec list, and footer.
function renderDescriptionHtml({ description, specLines = [] }) {
  const footerLines = LISTING_FOOTER.split('\n').filter(Boolean);
  const footer      = footerLines.map(l => `<p>${l}</p>`).join('');
  const specList    = specLines.length
    ? `<ul>${specLines.filter(l => l.trim()).map(l => `<li>${l}</li>`).join('')}</ul>`
    : '';

  if (description) {
    const paraLines  = description.split('\n').filter(Boolean);
    const mobileText = specLines.join('  |  ') + '  |  ' + paraLines.join(' ');
    const fullHtml   = paraLines.map(l => `<p>${l}</p>`).join('');
    return `<div vocab="https://schema.org/" typeof="Product" style="display:none"><span property="description">${mobileText}</span></div>${fullHtml}${specList}${footer}`;
  }

  const mobileText = specLines.join('  |  ');
  return `<div vocab="https://schema.org/" typeof="Product" style="display:none"><span property="description">${mobileText}</span></div>${specList}${footer}`;
}

// Renders plain-text description from skill checkpoint (pipe-separated spec blocks + prose).
// Used by list-item and update-item routes when payload arrives pre-built from skill.
function renderSkillDescriptionHtml(text) {
  const blocks    = text.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
  const htmlParts = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.every(l => l.includes(' | '))) {
      htmlParts.push(`<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`);
    } else {
      lines.forEach(l => htmlParts.push(`<p>${l}</p>`));
    }
  }

  const mobileText = text.replace(/\n+/g, '  |  ');
  return `<div vocab="https://schema.org/" typeof="Product" style="display:none"><span property="description">${mobileText}</span></div>${htmlParts.join('')}`;
}

// Builds a normalized payload from a disc inventory blob.
// blob: the metadata JSON from the inventory table (already parsed)
// Returns the normalized payload shape the list/update routes accept.
function buildDiscPayload(blob) {
  const title     = blob.list_title || generateDiscTitle(blob);
  const specLines = buildDiscSpecLines(blob);
  const price     = parseFloat(blob.listPrice);
  const condition = normalizeCondition(blob.condition);

  const aspects = {
    Type: ['Disc Golf Disc'],
    ...(blob.manufacturer && { Brand:                [normalizeManufacturer(blob.manufacturer)] }),
    ...(blob.mold         && { Model:                [blob.mold] }),
    ...(blob.type         && { 'Disc Type':           [normalizeDiscType(blob.type)] }),
    ...(blob.plastic      && { 'Disc Plastic Type':   [blob.plastic] }),
    ...(blob.weight       && { 'Disc Weight':         [`${blob.weight} grams`] }),
    ...(blob.color && VALID_COLORS.has(blob.color) && { Color: [blob.color] }),
    ...(blob.speed != null && blob.speed !== '' && { 'Speed Rating':        [String(blob.speed)] }),
    ...(blob.glide != null && blob.glide !== '' && { 'Glide Rating':        [String(blob.glide)] }),
    ...(blob.turn  != null && blob.turn  !== '' && { 'Turn (Right) Rating': [String(blob.turn)] }),
    ...(blob.fade  != null && blob.fade  !== '' && { 'Fade (Left) Rating':  [String(blob.fade)] }),
  };

  return {
    title,
    description: blob.description || null,
    specLines,
    condition,
    price,
    minOffer:   minOffer(price),
    categoryId: DG_CATEGORY,
    aspects,
  };
}

module.exports = { buildDiscPayload, renderDescriptionHtml, renderSkillDescriptionHtml, minOffer };
