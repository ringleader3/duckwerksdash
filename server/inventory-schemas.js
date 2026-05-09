// Canonical blob schemas per inventory category.
// All keys must be present in every blob of that type — missing values are null.
// Add new categories here as their intake paths are defined.

const SCHEMAS = {
  disc: {
    list_title:   null,
    description:  null,
    manufacturer: null,
    mold:         null,
    type:         null,
    plastic:      null,
    run:          null,
    notes:        null,
    condition:    null,  // eBay enum: NEW | NEW_OTHER | USED
    weight:       null,
    color:        null,
    speed:        null,
    glide:        null,
    turn:         null,
    fade:         null,
    stability:    null,
    listPrice:    null,
  },
};

// Returns a blob with all schema keys present, overlaid with existing values.
// If no schema exists for the category, returns the blob unchanged.
function normalizeBlob(category, blob) {
  const schema = SCHEMAS[category];
  if (!schema) return blob;
  return { ...schema, ...(blob || {}) };
}

module.exports = { SCHEMAS, normalizeBlob };
