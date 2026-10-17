/*
 * Question-set (data set) parsing.
 *
 * Accepted file types: .csv, .json, .txt
 *   Countdown   -> a list of nine-letter words used for the final Conundrum.
 *                  CSV:  one word per row (optional header "word")
 *                  JSON: ["COASTLINE", "PORCELAIN", ...]  or  {"words": [...]}
 *                  TXT:  one word per line (commas / spaces also work)
 *   Other games -> rows are kept as-is (CSV with a header row, or a JSON array of
 *                  objects) so they can be used when those game modes are added.
 */
(function () {
  const GN = (window.GN = window.GN || {});

  const BUILTIN_ID = 'builtin-conundrums';

  function stripBom(t) { return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t; }

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let q = false;
    for (const ch of firstLine) {
      if (ch === '"') q = !q;
      else if (!q && ch in counts) counts[ch]++;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';
  }

  function parseCSV(text) {
    text = stripBom(text);
    const delim = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows.map((r) => r.map((c) => c.trim()));
  }

  function extOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  /* ----- Countdown ----- */

  const HEADER_RE = /^(word|words|answer|answers|conundrum|conundrums|solution|solutions)$/i;

  function pickWordFromObject(o) {
    if (typeof o === 'string') return o;
    if (!o || typeof o !== 'object') return '';
    for (const k of Object.keys(o)) {
      if (HEADER_RE.test(k) && typeof o[k] === 'string') return o[k];
    }
    const firstString = Object.values(o).find((v) => typeof v === 'string');
    return firstString || '';
  }

  function parseCountdown(fileName, rawText) {
    const text = stripBom(rawText).trim();
    if (!text) throw new Error('That file is empty.');
    const ext = extOf(fileName);
    let tokens = [];
    let format = ext || 'text';

    if (ext === 'json' || /^[\[{]/.test(text)) {
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON: ' + e.message); }
      if (!Array.isArray(data)) {
        data = data.words || data.conundrums || data.items || data.answers || [];
      }
      if (!Array.isArray(data)) throw new Error('Could not find a list of words in the JSON.');
      tokens = data.map(pickWordFromObject);
      format = 'json';
    } else if (ext === 'csv' || ext === 'tsv') {
      const rows = parseCSV(text);
      let col = 0;
      let startRow = 0;
      const headerIdx = rows.length ? rows[0].findIndex((c) => HEADER_RE.test(c)) : -1;
      if (headerIdx >= 0) { col = headerIdx; startRow = 1; }
      else if (rows.length && rows[0].length && !/^[A-Za-z]{9}$/.test(rows[0][0]) && /^[A-Za-z ]{1,20}$/.test(rows[0][0]) && rows.length > 1) {
        startRow = 1; // looks like an unrelated header row such as "Conundrum list"
      }
      tokens = rows.slice(startRow).map((r) => r[col] || '');
      format = 'csv';
    } else {
      tokens = text.split(/[\r\n,;\t ]+/);
      format = 'txt';
    }

    const seen = new Set();
    const items = [];
    const rejected = [];
    tokens.forEach((t) => {
      const w = String(t || '').trim().replace(/^["']+|["']+$/g, '');
      if (!w || HEADER_RE.test(w)) return;
      if (/^[A-Za-z]{9}$/.test(w)) {
        const up = w.toUpperCase();
        if (!seen.has(up)) { seen.add(up); items.push(up); }
      } else rejected.push(w);
    });
    return { items, rejected, format, total: items.length + rejected.length };
  }

  /* ----- Other games (kept as raw rows for later) ----- */

  function parseGeneric(fileName, rawText) {
    const text = stripBom(rawText).trim();
    if (!text) throw new Error('That file is empty.');
    const ext = extOf(fileName);
    let items = [];
    let format = ext || 'text';
    if (ext === 'json' || /^[\[{]/.test(text)) {
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON: ' + e.message); }
      if (!Array.isArray(data)) data = data.questions || data.items || data.rows || data.words || [];
      if (!Array.isArray(data)) throw new Error('Could not find a list of questions in the JSON.');
      items = data;
      format = 'json';
    } else if (ext === 'csv' || ext === 'tsv') {
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('A CSV needs a header row followed by at least one row of data.');
      const head = rows[0];
      items = rows.slice(1).map((r) => {
        const o = {};
        head.forEach((h, i) => { o[h || 'column' + (i + 1)] = r[i] || ''; });
        return o;
      });
      format = 'csv';
    } else {
      items = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      format = 'txt';
    }
    return { items, rejected: [], format, total: items.length };
  }

  function parse(gameType, fileName, text) {
    return gameType === 'countdown' ? parseCountdown(fileName, text) : parseGeneric(fileName, text);
  }

  /* ----- Conundrum pool lookup ----- */

  function builtinWords() {
    return (window.BUILTIN_CONUNDRUMS || []).slice();
  }

  function conundrumSets() {
    const sets = [{ id: BUILTIN_ID, name: 'Built-in conundrums', count: builtinWords().length, builtin: true }];
    GN.store.listSets('countdown').forEach((s) => sets.push({ id: s.id, name: s.name, count: s.items.length, builtin: false }));
    return sets;
  }

  function conundrumPool(setId) {
    if (setId && setId !== BUILTIN_ID) {
      const s = GN.store.getSet(setId);
      if (s && s.items && s.items.length) return s.items.slice();
    }
    return builtinWords();
  }

  function exampleFile() {
    const sample = ['COASTLINE', 'PORCELAIN', 'GARDENING', 'ADVENTURE', 'CHOCOLATE', 'FURNITURE'];
    return 'word\n' + sample.join('\n') + '\n';
  }

  GN.datasets = { BUILTIN_ID, parse, conundrumSets, conundrumPool, exampleFile, parseCSV };
})();
