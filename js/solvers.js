/* Solvers for the Countdown letters and numbers rounds. */
(function () {
  const GN = (window.GN = window.GN || {});

  /* ---------- Letters ---------- */

  let prepared = null;
  function prepare(words) {
    if (prepared && prepared.src === words) return prepared;
    // Pre-compute 26-slot letter counts lazily per word at query time (cheap enough for ~70k words).
    prepared = { src: words };
    return prepared;
  }

  function canMake(word, avail) {
    const left = avail.slice();
    for (let i = 0; i < word.length; i++) {
      const k = word.charCodeAt(i) - 97;
      if (k < 0 || k > 25 || --left[k] < 0) return false;
    }
    return true;
  }

  /**
   * Find the longest words that can be built from the given letters.
   * Returns { top: [WORD, ...up to topN], total: number }
   */
  function solveLetters(letters, words, topN) {
    topN = topN || 3;
    prepare(words);
    const avail = new Array(26).fill(0);
    const lower = String(letters).toLowerCase();
    for (const ch of lower) {
      const k = ch.charCodeAt(0) - 97;
      if (k >= 0 && k < 26) avail[k]++;
    }
    const found = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length <= lower.length && canMake(w, avail)) found.push(w);
    }
    found.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
    return { top: found.slice(0, topN).map((w) => w.toUpperCase()), total: found.length };
  }

  /* ---------- Numbers ---------- */

  const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  /**
   * Find an exact (or closest) solution for the numbers round.
   * Returns { value, diff, steps: ["100 × 7 = 700", ...] }
   */
  function solveNumbers(nums, target) {
    let best = null;

    function consider(item) {
      const d = Math.abs(item.v - target);
      if (!best || d < best.diff || (d === best.diff && item.size < best.item.size)) {
        best = { diff: d, item };
      }
    }

    const start = nums.map((v) => ({ v, a: null, b: null, op: '', size: 0 }));
    start.forEach(consider);

    function rec(list) {
      const n = list.length;
      for (let i = 0; i < n - 1; i++) {
        const ai = list[i];
        let dupA = false;
        for (let k = 0; k < i; k++) {
          if (list[k].v === ai.v) { dupA = true; break; }
        }
        if (dupA) continue;
        for (let j = i + 1; j < n; j++) {
          const bj = list[j];
          let dupB = false;
          for (let k = i + 1; k < j; k++) {
            if (list[k].v === bj.v) { dupB = true; break; }
          }
          if (dupB) continue;

          let big = ai, small = bj;
          if (small.v > big.v) { big = bj; small = ai; }
          const x = big.v, y = small.v;

          const results = [];
          results.push(['+', x + y]);
          if (x !== 1 && y !== 1) results.push(['*', x * y]);
          if (x !== y) results.push(['-', x - y]);
          if (y !== 1 && x % y === 0) results.push(['/', x / y]);

          for (let r = 0; r < results.length; r++) {
            const item = { v: results[r][1], a: big, b: small, op: results[r][0], size: big.size + small.size + 1 };
            consider(item);
            if (n > 2) {
              const next = [];
              for (let k = 0; k < n; k++) if (k !== i && k !== j) next.push(list[k]);
              next.push(item);
              rec(next);
            }
          }
        }
      }
    }

    rec(start);

    const steps = [];
    (function walk(item) {
      if (!item.a) return;
      walk(item.a);
      walk(item.b);
      steps.push(`${item.a.v} ${SYMBOLS[item.op]} ${item.b.v} = ${item.v}`);
    })(best.item);

    return { value: best.item.v, diff: best.diff, steps };
  }

  GN.solvers = { solveLetters, solveNumbers };
})();
