// ── Comp Research View ─────────────────────────────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('compsView', () => ({

    inputText: '',
    results:   [],   // [{ name, status, analysis, csv, error }]
    running:   false,

    parseItems(raw) {
      return raw.split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const [namePart, ...hintParts] = line.split('|').map(s => s.trim());
          const hints = {};
          hintParts.forEach(h => {
            const eq = h.indexOf('=');
            if (eq === -1) return;
            const key = h.slice(0, eq).trim();
            const val = h.slice(eq + 1).trim();
            if (key === 'min_price')  hints.minPrice   = parseFloat(val) || undefined;
            if (key === 'alternates') hints.alternates = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
            if (key === 'notes')      hints.notes      = val;
          });
          return { name: namePart, ...hints };
        });
    },

    async run() {
      const items = this.parseItems(this.inputText);
      if (!items.length) return;

      this.running = true;
      this.results = items.map(i => ({ name: i.name, status: 'searching', analysis: '', csv: '', error: '' }));

      // Search all items in parallel
      let searchResults;
      try {
        const response = await fetch('/api/comps/search', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ items }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search failed');
        searchResults = data.results;
      } catch (e) {
        this.results.forEach(r => { r.status = 'error'; r.error = e.message; });
        this.running = false;
        return;
      }

      // Update all to 'analyzing'
      this.results.forEach(r => { r.status = 'analyzing'; });

      // Analyze each item sequentially to avoid rate limits
      for (let i = 0; i < searchResults.length; i++) {
        const item   = searchResults[i];
        const result = this.results[i];
        try {
          const response = await fetch('/api/comps/analyze', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ item }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Analysis failed');
          result.analysis = data.analysis;
          result.csv      = data.csv;
          result.status   = 'done';
        } catch (e) {
          result.status = 'error';
          result.error  = e.message;
        }
      }

      this.running = false;
    },

    csvRows(csv) {
      if (!csv) return [];
      const lines = csv.split('\n').filter(Boolean);
      if (lines.length < 2) return [];
      const headers = lines[0].split(',');
      return lines.slice(1).map(line => {
        const cols = [];
        let cur = '', inQ = false;
        for (const ch of line + ',') {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
          else cur += ch;
        }
        return headers.reduce((obj, h, i) => { obj[h] = cols[i] || ''; return obj; }, {});
      });
    },

    copyCSV(csv) {
      navigator.clipboard.writeText(csv);
    },

    copyAll() {
      const all = this.results
        .filter(r => r.csv)
        .map(r => r.csv)
        .join('\n');
      navigator.clipboard.writeText(all);
    },

    _buildTXT(result) {
      return `COMP RESEARCH: ${result.name}\n${'='.repeat(60)}\n\n${result.analysis}\n\n${'─'.repeat(60)}\n\n${result.csv}`;
    },

    _triggerDownload(filename, content) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    downloadTXT(result) {
      const filename = result.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_comps.txt';
      this._triggerDownload(filename, this._buildTXT(result));
    },

    downloadAll() {
      const content = this.results
        .filter(r => r.csv)
        .map(r => this._buildTXT(r))
        .join('\n\n' + '='.repeat(60) + '\n\n');
      this._triggerDownload('comps_all.txt', content);
    },

  }));
});
