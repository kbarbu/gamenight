/*
 * Countdown game mode.
 * 13 rounds: letters, letters, numbers (x4) then the conundrum, followed by the podium.
 */
(function () {
  const GN = (window.GN = window.GN || {});
  const { esc, uid, shuffle, randInt, openModal, confirmDialog, toast, fmtTime, ordinal } = GN.util;

  /* ===================== constants ===================== */

  const ROUND_PLAN = (() => {
    const plan = [];
    for (let i = 0; i < 4; i++) plan.push('letters', 'letters', 'numbers');
    plan.push('conundrum');
    return plan;
  })();

  const CLOCK_SECONDS = 30;
  const TEAM_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ffa94d', '#38d9a9', '#f783ac'];

  // Tile frequencies matched to the tiers on countdown-solver.uk/how-to-play (E most common vowel,
  // R S T N most common consonants, J K Q V X Z rare) using the standard Countdown tile counts.
  const VOWEL_TILES = { A: 15, E: 21, I: 13, O: 13, U: 5 };
  const CONSONANT_TILES = {
    B: 2, C: 3, D: 6, F: 2, G: 3, H: 2, J: 1, K: 1, L: 5, M: 4, N: 8,
    P: 4, Q: 1, R: 9, S: 9, T: 9, V: 1, W: 1, X: 1, Y: 1, Z: 1,
  };
  const LARGE_TILES = [25, 50, 75, 100];
  const SMALL_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const DEFAULT_THEME_URL = 'audio/countdown-theme.mp3';

  const isVowel = (ch) => 'AEIOU'.includes(ch);
  const expand = (counts) => Object.keys(counts).reduce((a, k) => a.concat(Array(counts[k]).fill(k)), []);

  const TYPE_LABEL = { letters: 'Letters round', numbers: 'Numbers round', conundrum: 'Conundrum' };

  /* ===================== game state ===================== */

  function newClock() { return { state: 'idle', remaining: CLOCK_SECONDS }; }

  function scramble(word) {
    let out = word;
    for (let i = 0; i < 30 && out === word; i++) out = shuffle(word.split('')).join('');
    return out;
  }

  function makeRound(type, game) {
    if (type === 'letters') {
      return {
        type, tiles: [], vPile: shuffle(expand(VOWEL_TILES)), cPile: shuffle(expand(CONSONANT_TILES)),
        clock: newClock(), lengths: null, awards: null, solutions: null,
      };
    }
    if (type === 'numbers') {
      return {
        type, tiles: [], largePile: shuffle(LARGE_TILES), smallPile: shuffle(SMALL_TILES),
        target: null, clock: newClock(), reached: null, awards: null, solution: null,
      };
    }
    return {
      type, word: game.conundrumWord, scramble: scramble(game.conundrumWord), started: false,
      clock: newClock(), lockedOut: [], buzzed: null, solvedBy: null, revealed: false, alts: [],
    };
  }

  function create(setup) {
    const pool = GN.datasets.conundrumPool(setup.setId);
    let word = pool.length ? pool[randInt(0, pool.length - 1)] : '';
    if (!word) {
      const nine = (window.COUNTDOWN_WORDS || []).filter((w) => w.length === 9);
      word = nine[randInt(0, nine.length - 1)].toUpperCase();
    }
    const now = Date.now();
    return {
      id: uid(), type: 'countdown', createdAt: now, updatedAt: now, status: 'playing',
      setId: setup.setId || GN.datasets.BUILTIN_ID, setName: setup.setName || 'Built-in conundrums',
      teams: setup.teams.map((name, i) => ({
        name: String(name || '').trim() || 'Team ' + (i + 1), color: TEAM_COLORS[i % TEAM_COLORS.length], score: 0,
      })),
      conundrumWord: word, roundIndex: 0, rounds: [],
    };
  }

  function ranked(game) {
    const list = game.teams.map((t, i) => Object.assign({ i }, t)).sort((a, b) => b.score - a.score || a.i - b.i);
    let rank = 0;
    let prev = null;
    list.forEach((t, k) => {
      if (t.score !== prev) { rank = k + 1; prev = t.score; }
      t.rank = rank;
    });
    return list;
  }

  function describe(game) {
    if (game.status === 'finished') {
      const top = ranked(game);
      const winners = top.filter((t) => t.rank === 1).map((t) => t.name);
      return { line: 'Finished', detail: 'Winner' + (winners.length > 1 ? 's' : '') + ': ' + winners.join(' & ') };
    }
    const type = ROUND_PLAN[game.roundIndex];
    return { line: 'Round ' + (game.roundIndex + 1) + ' of ' + ROUND_PLAN.length, detail: TYPE_LABEL[type] };
  }

  /* ===================== mount ===================== */

  function mount(root, game, hooks) {
    hooks = hooks || {};
    const ui = { freshFrom: 9999, showSol: false, rolling: false, rollValue: 0, solving: false };
    let raf = null;
    let clockEnd = 0;
    let dirty = false;
    let saveTimer = null;
    let lastSaved = game.updatedAt || null;
    let confettiStop = null;
    let destroyed = false;

    // Normalise anything that was mid-clock when the page was closed.
    game.rounds.forEach((r) => { if (r && r.clock && r.clock.state === 'running') r.clock.state = 'paused'; });
    if (game.status === 'playing') ensureRound();

    /* ---------- audio ---------- */
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = GN.store.getPref('volume', 0.8);
    let musicOk = null; // null = unknown, true = loaded, false = missing
    let customTheme = false;
    let objectUrl = null;
    audio.addEventListener('canplaythrough', () => { musicOk = true; });
    audio.addEventListener('error', () => { musicOk = false; });
    audio.src = DEFAULT_THEME_URL;
    GN.store.getBlob('countdown-theme').then((blob) => {
      if (blob && !destroyed) { customTheme = true; setThemeBlob(blob); }
    });

    function setThemeBlob(blob) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      musicOk = null;
      audio.src = objectUrl;
      audio.load();
    }
    const muted = () => GN.store.getPref('muted', false);
    function playMusic(fromStart) {
      if (muted() || musicOk === false) return;
      try {
        if (fromStart) audio.currentTime = 0;
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* ignore */ }
    }
    function pauseMusic() { try { audio.pause(); } catch (e) { /* ignore */ } }
    function stopMusic() { try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ } }
    function buzzer() {
      if (muted()) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
      } catch (e) { /* ignore */ }
    }

    /* ---------- helpers ---------- */
    const round = () => game.rounds[game.roundIndex];
    function ensureRound() {
      if (!game.rounds[game.roundIndex]) game.rounds[game.roundIndex] = makeRound(ROUND_PLAN[game.roundIndex], game);
    }
    function controlTeam() {
      let n = 0;
      for (let i = 0; i < game.roundIndex; i++) if (ROUND_PLAN[i] !== 'conundrum') n++;
      return n % game.teams.length;
    }
    function teamTag(i) {
      const t = game.teams[i];
      return '<span class="team-dot" style="background:' + t.color + '"></span><strong>' + esc(t.name) + '</strong>';
    }

    /* ---------- saving ---------- */
    function save() {
      clearTimeout(saveTimer);
      saveTimer = null;
      lastSaved = GN.store.saveGame(game);
      dirty = false;
      paintSaveState();
    }
    function scheduleSave() {
      dirty = true;
      paintSaveState();
      if (!saveTimer) saveTimer = setTimeout(save, 500);
    }
    function paintSaveState() {
      const el = root.querySelector('#saveState');
      if (!el) return;
      el.className = 'save-state' + (dirty ? ' pending' : '');
      el.textContent = dirty ? 'Saving…' : lastSaved ? 'Saved ' + new Date(lastSaved).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Not saved yet';
    }
    function commit() {
      render();
      scheduleSave();
    }

    const autoSaveInterval = setInterval(() => { if (dirty || (round() && round().clock.state === 'running')) save(); }, 10000);
    const onLeave = () => save();
    const onVisibility = () => { if (document.hidden) save(); };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    /* ---------- clock ---------- */
    const RING = 2 * Math.PI * 122;

    // The yellow arc is the time still to come: it starts at the hand and runs clockwise to 12 o'clock,
    // so its leading edge sweeps clockwise together with the hand as time runs out.
    function arcAttrs(frac) {
      const left = Math.max(0, 1 - frac);
      return {
        dash: (RING * left).toFixed(2) + ' ' + RING.toFixed(2),
        rotate: 'rotate(' + (-90 + frac * 360).toFixed(2) + ' 150 150)',
        opacity: left <= 0.002 ? '0' : '1',
      };
    }

    function clockHtml(c) {
      const rem = Math.max(0, c.remaining);
      const frac = 1 - rem / CLOCK_SECONDS;
      const arc = arcAttrs(frac);
      let ticks = '';
      for (let i = 0; i < 30; i++) {
        const major = i % 5 === 0;
        ticks += '<line class="tick' + (major ? ' major' : '') + '" x1="150" y1="' + (major ? 8 : 11) + '" x2="150" y2="19" transform="rotate(' + i * 12 + ' 150 150)"/>';
      }
      const label = c.state === 'done' ? 'TIME!' : 'SECONDS';
      return (
        '<div class="clock" data-state="' + c.state + '" data-low="' + (c.state !== 'idle' && rem <= 5 ? 1 : 0) + '">' +
        '<svg viewBox="0 0 300 300" role="img" aria-label="30 second clock">' +
        '<circle class="clock-face" cx="150" cy="150" r="146"/>' + ticks +
        '<circle class="clock-track" cx="150" cy="150" r="122"/>' +
        '<circle class="clock-arc" cx="150" cy="150" r="122" stroke-dasharray="' + arc.dash + '" stroke-opacity="' + arc.opacity + '" transform="' + arc.rotate + '"/>' +
        '<g class="clock-hand" transform="rotate(' + (frac * 360).toFixed(2) + ' 150 150)"><line x1="150" y1="84" x2="150" y2="28"/></g>' +
        '<text class="clock-num" x="150" y="172" text-anchor="middle">' + Math.ceil(rem) + '</text>' +
        '<text class="clock-label" x="150" y="206" text-anchor="middle">' + label + '</text>' +
        '</svg></div>'
      );
    }

    function paintClock() {
      const r = round();
      const el = root.querySelector('.clock');
      if (!r || !el) return;
      const c = r.clock;
      const rem = Math.max(0, c.remaining);
      const frac = 1 - rem / CLOCK_SECONDS;
      el.dataset.state = c.state;
      el.dataset.low = c.state !== 'idle' && rem <= 5 ? '1' : '0';
      const arc = arcAttrs(frac);
      const arcEl = el.querySelector('.clock-arc');
      arcEl.setAttribute('stroke-dasharray', arc.dash);
      arcEl.setAttribute('stroke-opacity', arc.opacity);
      arcEl.setAttribute('transform', arc.rotate);
      el.querySelector('.clock-hand').setAttribute('transform', 'rotate(' + (frac * 360).toFixed(2) + ' 150 150)');
      el.querySelector('.clock-num').textContent = Math.ceil(rem);
      el.querySelector('.clock-label').textContent = c.state === 'done' ? 'TIME!' : 'SECONDS';
    }

    function loop() {
      raf = null;
      const r = round();
      if (!r || r.clock.state !== 'running') return;
      const rem = Math.max(0, (clockEnd - performance.now()) / 1000);
      r.clock.remaining = rem;
      paintClock();
      if (rem <= 0) finishClock(true);
      else raf = requestAnimationFrame(loop);
    }
    function startLoop() { if (!raf) raf = requestAnimationFrame(loop); }

    function startClock() {
      const r = round();
      const c = r.clock;
      if (c.state === 'done' || c.state === 'running') return;
      if (r.type === 'conundrum' && r.buzzed != null) return;
      const fresh = c.state === 'idle';
      if (fresh) c.remaining = CLOCK_SECONDS;
      if (r.type === 'conundrum' && !r.started) { r.started = true; ui.freshFrom = 0; }
      clockEnd = performance.now() + c.remaining * 1000;
      c.state = 'running';
      playMusic(fresh);
      commit();
      startLoop();
    }
    function pauseClock() {
      const r = round();
      if (r.clock.state !== 'running') return;
      r.clock.remaining = Math.max(0, (clockEnd - performance.now()) / 1000);
      r.clock.state = 'paused';
      pauseMusic();
      commit();
    }
    function finishClock(natural) {
      const r = round();
      r.clock.state = 'done';
      r.clock.remaining = 0;
      const playing = !audio.paused;
      stopMusic();
      if (natural && !playing) buzzer();
      commit();
    }
    function toggleClock() {
      const r = round();
      if (r.clock.state === 'running') pauseClock();
      else if (r.clock.state === 'idle' || r.clock.state === 'paused') startClock();
    }

    function clockControls(r, startLabel) {
      const s = r.clock.state;
      if (s === 'idle') {
        return '<div class="clock-controls"><button class="btn primary big" data-act="clock-toggle">&#9654; ' + (startLabel || 'Start clock') + '</button>' +
          (r.type !== 'conundrum' ? '<button class="btn ghost small" data-act="clock-skip">Skip clock</button>' : '') + '</div>';
      }
      if (s === 'running') {
        return '<div class="clock-controls"><button class="btn secondary" data-act="clock-toggle">&#10073;&#10073; Pause</button>' +
          (r.type !== 'conundrum' ? '<button class="btn ghost small" data-act="clock-end">End early</button>' : '') + '</div>';
      }
      if (s === 'paused') {
        const buzzing = r.type === 'conundrum' && r.buzzed != null;
        return '<div class="clock-controls">' + (buzzing ? '' : '<button class="btn primary" data-act="clock-toggle">&#9654; Resume</button>') +
          '<button class="btn ghost small" data-act="clock-end">End early</button></div>';
      }
      return '<div class="clock-controls"><span class="times-up">Time&rsquo;s up</span></div>';
    }

    /* ---------- stages ---------- */

    function tilesHtml(list, count, extraClass, bigClass) {
      let out = '';
      for (let i = 0; i < count; i++) {
        const t = list[i];
        if (t === undefined) { out += '<div class="tile empty"></div>'; continue; }
        const val = typeof t === 'object' ? t.v : t;
        const cls = 'tile' + (typeof t === 'object' && t.large ? ' large' : '') + (i >= ui.freshFrom ? ' pop' : '') + (extraClass ? ' ' + extraClass : '');
        const delay = i >= ui.freshFrom ? ' style="animation-delay:' + (i - ui.freshFrom) * 110 + 'ms"' : '';
        out += '<div class="' + cls + '"' + delay + '>' + esc(val) + '</div>';
      }
      return '<div class="tiles ' + (bigClass || '') + '">' + out + '</div>';
    }

    function lettersStage(r) {
      const ctrl = controlTeam();
      const vc = r.tiles.filter(isVowel).length;
      const cc = r.tiles.length - vc;
      let mid;
      if (r.tiles.length < 9) {
        mid =
          '<p class="chooser">' + teamTag(ctrl) + ' chooses the letters</p>' +
          '<div class="pick-row">' +
          '<button class="stack stack-vowel" data-act="pick-vowel"' + (vc >= 5 ? ' disabled' : '') + '><span class="stack-title">Vowel</span><span class="stack-sub">' + vc + ' picked &middot; max 5</span></button>' +
          '<button class="stack stack-cons" data-act="pick-cons"' + (cc >= 6 ? ' disabled' : '') + '><span class="stack-title">Consonant</span><span class="stack-sub">' + cc + ' picked &middot; max 6</span></button>' +
          '</div>' +
          '<div class="pick-extra"><button class="btn ghost small" data-act="random-letters">Random pick</button>' +
          (r.tiles.length ? '<button class="btn ghost small" data-act="undo-tile">Undo last</button>' : '') + '</div>' +
          '<p class="hint">At least 3 vowels and 4 consonants &middot; ' + (9 - r.tiles.length) + ' to go</p>';
      } else {
        mid = clockBlock(r, 'Letters are set. Start the clock when everyone is ready.');
      }
      return '<div class="stage-inner">' + tilesHtml(r.tiles, 9, 'letter', 'tiles-9') + mid + (ui.showSol ? lettersSolution(r) : '') + '</div>';
    }

    function clockBlock(r, message, startLabel) {
      // Once time is up and a solution is on screen, drop the clock to make room for it.
      if (ui.showSol && r.clock.state === 'done') return '';
      return '<div class="clock-block">' + clockHtml(r.clock) + '<div class="clock-side">' +
        (message && r.clock.state === 'idle' ? '<p class="hint">' + message + '</p>' : '') + clockControls(r, startLabel) + '</div></div>';
    }

    function lettersSolution(r) {
      if (!r.solutions) return '';
      const s = r.solutions;
      const cards = s.top.length
        ? s.top.map((w) =>
            '<div class="sol-word"><div class="sol-letters">' + w.split('').map((ch) => '<span>' + ch + '</span>').join('') + '</div>' +
            '<div class="sol-meta">' + w.length + ' letters &middot; ' + (w.length === 9 ? 18 : w.length) + ' pts</div></div>').join('')
        : '<p class="muted">No valid words found in the built-in word list.</p>';
      return '<section class="solution"><h3>Top 3 longest words</h3><div class="sol-words">' + cards + '</div>' +
        '<p class="muted small">' + s.total + ' words found in the built-in word list. Always check borderline words against a dictionary.</p></section>';
    }

    function numbersStage(r) {
      const ctrl = controlTeam();
      const large = r.tiles.filter((t) => t.large).length;
      const small = r.tiles.length - large;
      const ledVal = ui.rolling ? ui.rollValue : r.target;
      const led = '<div class="led-wrap"><div class="led-label">TARGET</div><div class="led' + (ui.rolling ? ' rolling' : '') + '">' + (ledVal == null ? '---' : ledVal) + '</div></div>';
      let mid;
      if (r.tiles.length < 6) {
        mid =
          '<p class="chooser">' + teamTag(ctrl) + ' chooses the numbers</p>' +
          '<div class="pick-row">' +
          '<button class="stack stack-large" data-act="pick-large"' + (large >= 4 ? ' disabled' : '') + '><span class="stack-title">Large</span><span class="stack-sub">25 &middot; 50 &middot; 75 &middot; 100 &middot; ' + large + '/4 picked</span></button>' +
          '<button class="stack stack-small" data-act="pick-small"' + (small >= 6 ? ' disabled' : '') + '><span class="stack-title">Small</span><span class="stack-sub">1 to 10, two of each &middot; ' + small + ' picked</span></button>' +
          '</div>' +
          '<div class="pick-extra"><button class="btn ghost small" data-act="random-numbers">Random pick</button>' +
          (r.tiles.length ? '<button class="btn ghost small" data-act="undo-tile">Undo last</button>' : '') + '</div>' +
          '<p class="hint">Choose 0 to 4 large numbers &middot; ' + (6 - r.tiles.length) + ' to go</p>';
      } else if (r.target == null) {
        mid = '<div class="clock-controls"><button class="btn primary big" data-act="reveal-target"' + (ui.rolling ? ' disabled' : '') + '>' + (ui.rolling ? 'Rolling…' : 'Reveal target') + '</button>' +
          '<button class="btn ghost small" data-act="undo-tile"' + (ui.rolling ? ' disabled' : '') + '>Undo last</button></div>';
      } else {
        mid = clockBlock(r, 'Target locked in. Start the clock when everyone is ready.');
      }
      return '<div class="stage-inner">' + led + tilesHtml(r.tiles, 6, 'number', 'tiles-6') + mid + (ui.showSol ? numbersSolution(r) : '') + '</div>';
    }

    function numbersSolution(r) {
      if (!r.solution) return '';
      const s = r.solution;
      const head = s.diff === 0 ? 'Exact solution for ' + r.target : 'No exact solution. Closest is ' + s.value + ' (' + s.diff + ' away)';
      const body = s.steps.length
        ? '<ol class="steps">' + s.steps.map((st) => '<li>' + esc(st) + '</li>').join('') + '</ol>'
        : '<p class="muted">Just use the ' + s.value + ' tile on its own.</p>';
      return '<section class="solution"><h3>' + head + '</h3>' + body + '</section>';
    }

    function conundrumStage(r) {
      const word = r.revealed ? r.word : r.started ? r.scramble : 'CONUNDRUM';
      const cls = r.revealed ? 'solved' : r.started ? 'scrambled' : 'idle-word';
      let mid = '';
      const state = r.clock.state;
      if (!r.started) {
        mid = '<div class="clock-block">' + clockHtml(r.clock) + '<div class="clock-side"><p class="hint">Tap start to reveal the nine letters and start the clock.</p>' + clockControls(r, 'Reveal &amp; start') + '</div></div>';
      } else {
        mid = '<div class="clock-block">' + clockHtml(r.clock) + '<div class="clock-side">' + (r.revealed ? '' : clockControls(r)) + '</div></div>';
      }
      let panel = '';
      if (r.revealed) {
        const who = r.solvedBy != null ? '<p class="verdict good">' + teamTag(r.solvedBy) + ' got it &mdash; <strong>+10</strong></p>' : '<p class="verdict">Nobody got it this time.</p>';
        const alts = r.alts && r.alts.length ? '<p class="muted small">Other valid anagrams: ' + r.alts.map(esc).join(', ') + '</p>' : '';
        panel = '<section class="solution"><h3>The answer is ' + esc(r.word) + '</h3>' + who + alts + '</section>';
      } else if (r.buzzed != null) {
        panel =
          '<section class="solution buzz-panel"><h3>' + teamTag(r.buzzed) + ' buzzed in</h3><p class="muted">Is their answer correct?</p>' +
          '<div class="verdict-row"><button class="btn good big" data-act="buzz-correct">&#10003; Correct (+10)</button>' +
          '<button class="btn danger big" data-act="buzz-wrong">&#10007; Wrong</button></div></section>';
      } else if (r.started && state === 'running') {
        panel = '<div class="buzzers">' + game.teams.map((t, i) => {
          const locked = r.lockedOut.includes(i);
          return '<button class="buzzer" style="--team:' + t.color + '" data-act="buzz" data-team="' + i + '"' + (locked ? ' disabled' : '') + '>' +
            '<span class="buzz-key">' + (i + 1) + '</span><span class="buzz-name">' + esc(t.name) + '</span>' + (locked ? '<span class="buzz-lock">locked out</span>' : '') + '</button>';
        }).join('') + '</div><p class="hint">Teams buzz with these buttons, or press their number key.</p>';
      } else if (r.started && state === 'done') {
        panel = '<p class="hint">Time&rsquo;s up! Press <strong>Reveal answer</strong> below.</p>';
      } else if (r.started && state === 'paused') {
        panel = '<p class="hint">Clock paused.</p>';
      }
      return '<div class="stage-inner">' + tilesHtml(word.split(''), 9, 'conundrum ' + cls, 'tiles-9') + mid + panel + '</div>';
    }

    /* ---------- podium ---------- */

    function podiumStage() {
      const list = ranked(game);
      const top = list.slice(0, 3);
      const rest = list.slice(3);
      const order = [top[1], top[0], top[2]].filter(Boolean);
      const pods = order.map((t) => {
        const place = Math.min(t.rank, 3);
        return '<div class="pod pod-' + place + (t.rank === 1 ? ' champ' : '') + '" style="--team:' + t.color + '">' +
          (t.rank === 1 ? '<div class="crown" aria-hidden="true">&#9819;</div>' : '') +
          '<div class="pod-team">' + esc(t.name) + '</div><div class="pod-score">' + t.score + '<small>pts</small></div>' +
          '<div class="pod-block"><span>' + t.rank + '</span></div></div>';
      }).join('');
      const restHtml = rest.length
        ? '<aside class="podium-rest"><h3>Other teams</h3><ol>' + rest.map((t) =>
            '<li style="--team:' + t.color + '"><span class="rest-rank">' + ordinal(t.rank) + '</span><span class="rest-name">' + esc(t.name) + '</span><span class="rest-score">' + t.score + '</span></li>').join('') + '</ol></aside>'
        : '';
      return '<div class="podium-wrap' + (rest.length ? ' has-rest' : '') + '"><canvas id="confetti" aria-hidden="true"></canvas>' +
        '<div class="podium-main"><h2 class="podium-title">Final results</h2><div class="podium">' + pods + '</div>' +
        '<div class="podium-actions"><button class="btn primary" data-act="play-again">Play again</button>' +
        '<button class="btn ghost" data-act="back-to-conundrum">Back to conundrum</button>' +
        '<button class="btn ghost" data-act="home">Home</button></div></div>' + restHtml + '</div>';
    }

    function startConfetti() {
      stopConfetti();
      const canvas = root.querySelector('#confetti');
      if (!canvas || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = (canvas.width = canvas.offsetWidth);
      const h = (canvas.height = canvas.offsetHeight);
      const colors = ['#ffd43b', '#ff6b6b', '#4dabf7', '#69db7c', '#da77f2', '#ffffff'];
      const bits = Array.from({ length: 140 }, () => ({
        x: Math.random() * w, y: -20 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 2.2,
        vy: 2 + Math.random() * 3.5, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: colors[Math.floor(Math.random() * colors.length)],
      }));
      const end = performance.now() + 6000;
      let id;
      function frame(now) {
        ctx.clearRect(0, 0, w, h);
        bits.forEach((b) => {
          b.x += b.vx; b.y += b.vy; b.r += b.vr;
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
        });
        if (now < end) id = requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
      }
      id = requestAnimationFrame(frame);
      confettiStop = () => cancelAnimationFrame(id);
    }
    function stopConfetti() { if (confettiStop) { confettiStop(); confettiStop = null; } }

    /* ---------- chrome: header, dock, scorebar ---------- */

    function headerHtml() {
      const playing = game.status === 'playing';
      const r = playing ? round() : null;
      const title = playing ? 'Round ' + (game.roundIndex + 1) + ' of ' + ROUND_PLAN.length + ' &middot; ' + TYPE_LABEL[r.type] : 'Final results';
      return '<header class="game-head">' +
        '<button class="btn ghost small" data-act="home">&larr; Home</button>' +
        '<div class="head-title"><span class="eyebrow">Countdown</span><h1>' + title + '</h1></div>' +
        '<div class="head-tools"><span id="saveState" class="save-state"></span>' +
        '<button class="btn ghost small" data-act="save">Save</button>' +
        '<button class="btn ghost small" data-act="mute" aria-pressed="' + muted() + '" title="Toggle music">' + (muted() ? '&#9834; Off' : '&#9834; On') + '</button>' +
        '<button class="btn ghost small" data-act="music">Music&hellip;</button></div></header>';
    }

    function dockHtml() {
      if (game.status !== 'playing') return '<div class="dock empty"></div>';
      const r = round();
      const done = r.clock.state === 'done';
      const btn = (act, label, cls, disabled, title) =>
        '<button class="btn ' + cls + '" data-act="' + act + '"' + (disabled ? ' disabled' : '') + (title ? ' title="' + title + '"' : '') + '>' + label + '</button>';
      let h = btn('guide', 'Scoring guide', 'ghost');
      if (r.type === 'letters') {
        h += btn('score', 'Score round', 'secondary', !done) +
          btn('solve', ui.showSol ? 'Hide top 3 words' : 'Top 3 words', 'accent', !done, 'Reveal the longest words after the clock stops') +
          btn('next', game.roundIndex === ROUND_PLAN.length - 2 ? 'Conundrum &rarr;' : 'Next round &rarr;', 'primary', !done);
      } else if (r.type === 'numbers') {
        h += btn('score', 'Score round', 'secondary', !done) +
          btn('solve', ui.solving ? 'Solving…' : ui.showSol ? 'Hide solution' : 'Show closest solution', 'accent', !done || ui.solving, 'Reveal the best answer after the clock stops') +
          btn('next', game.roundIndex === ROUND_PLAN.length - 2 ? 'Conundrum &rarr;' : 'Next round &rarr;', 'primary', !done);
      } else {
        h += btn('reveal-answer', 'Reveal answer', 'accent', r.revealed || !(r.started && (done || r.lockedOut.length === game.teams.length))) +
          btn('finish', 'See podium &rarr;', 'primary', !r.revealed);
      }
      return '<div class="dock">' + h + '</div>';
    }

    function scorebarHtml() {
      if (game.status !== 'playing') return '';
      const r = round();
      const ctrl = r.type === 'conundrum' ? -1 : controlTeam();
      return '<footer class="scorebar" style="--teams:' + game.teams.length + '">' + game.teams.map((t, i) =>
        '<div class="team-card' + (i === ctrl ? ' in-control' : '') + (ui.flash === i ? ' flash' : '') + '" style="--team:' + t.color + '">' +
        '<div class="team-name" title="' + esc(t.name) + '">' + (r.type === 'conundrum' ? '<span class="key">' + (i + 1) + '</span>' : '') + esc(t.name) + (i === ctrl ? '<span class="chooser-tag">choosing</span>' : '') + '</div>' +
        '<div class="team-score-row">' +
        '<button class="adj" data-act="adj" data-team="' + i + '" data-d="-1" aria-label="Remove a point from ' + esc(t.name) + '">&minus;</button>' +
        '<span class="team-score">' + t.score + '</span>' +
        '<button class="adj" data-act="adj" data-team="' + i + '" data-d="1" aria-label="Add a point to ' + esc(t.name) + '">+</button>' +
        '</div></div>').join('') + '</footer>';
    }

    function render() {
      if (destroyed) return;
      stopConfetti();
      let stage = '';
      if (game.status === 'finished') stage = podiumStage();
      else {
        const r = round();
        stage = r.type === 'letters' ? lettersStage(r) : r.type === 'numbers' ? numbersStage(r) : conundrumStage(r);
      }
      ui.freshFrom = 9999;
      ui.flash = -1;
      root.innerHTML =
        '<div class="game-shell cd' + (game.status === 'finished' ? ' finished' : '') + '">' + headerHtml() +
        '<main class="stage">' + stage + '</main>' + dockHtml() + scorebarHtml() + '</div>';
      paintSaveState();
      if (game.status === 'finished') startConfetti();
      const r = game.status === 'playing' ? round() : null;
      if (r && r.clock.state === 'running') startLoop();
    }

    /* ---------- actions ---------- */

    function pickLetter(kind) {
      const r = round();
      if (r.tiles.length >= 9) return;
      const vc = r.tiles.filter(isVowel).length;
      const cc = r.tiles.length - vc;
      if (kind === 'v') { if (vc >= 5) return; r.tiles.push(r.vPile.shift()); }
      else { if (cc >= 6) return; r.tiles.push(r.cPile.shift()); }
      ui.freshFrom = r.tiles.length - 1;
      commit();
    }

    function randomLetters() {
      const r = round();
      let vc = r.tiles.filter(isVowel).length;
      let cc = r.tiles.length - vc;
      const start = r.tiles.length;
      let target = [3, 4, 4, 4, 5][randInt(0, 4)];
      target = Math.max(target, vc);
      target = Math.min(target, 9 - cc);
      while (r.tiles.length < 9) {
        if (vc < target) { r.tiles.push(r.vPile.shift()); vc++; }
        else { r.tiles.push(r.cPile.shift()); cc++; }
      }
      // Shuffle only the newly drawn tiles so vowels and consonants are mixed up naturally.
      const head = r.tiles.slice(0, start);
      r.tiles = head.concat(shuffle(r.tiles.slice(start)));
      ui.freshFrom = start;
      commit();
    }

    function pickNumber(kind) {
      const r = round();
      if (r.tiles.length >= 6) return;
      const large = r.tiles.filter((t) => t.large).length;
      if (kind === 'large') { if (large >= 4) return; r.tiles.push({ v: r.largePile.shift(), large: true }); }
      else r.tiles.push({ v: r.smallPile.shift(), large: false });
      ui.freshFrom = r.tiles.length - 1;
      commit();
    }

    function randomNumbers() {
      const r = round();
      const start = r.tiles.length;
      let large = r.tiles.filter((t) => t.large).length;
      const wantLarge = Math.max(large, [0, 1, 1, 2, 2, 2, 3, 3, 4][randInt(0, 8)]);
      const added = [];
      while (r.tiles.length < 6) {
        if (large < wantLarge && large < 4) { const t = { v: r.largePile.shift(), large: true }; r.tiles.push(t); added.push(t); large++; }
        else { const t = { v: r.smallPile.shift(), large: false }; r.tiles.push(t); added.push(t); }
      }
      r.tiles = r.tiles.slice(0, start).concat(shuffle(added));
      ui.freshFrom = start;
      commit();
    }

    function undoTile() {
      const r = round();
      if (!r.tiles.length || r.clock.state !== 'idle' || ui.rolling) return;
      const t = r.tiles.pop();
      if (r.type === 'letters') (isVowel(t) ? r.vPile : r.cPile).unshift(t);
      else (t.large ? r.largePile : r.smallPile).unshift(t.v);
      r.target = r.target != null && r.tiles.length < 6 ? null : r.target;
      commit();
    }

    function revealTarget() {
      const r = round();
      if (ui.rolling || r.target != null || r.tiles.length < 6) return;
      const final = randInt(100, 999);
      ui.rolling = true;
      ui.rollValue = randInt(100, 999);
      render();
      let ticks = 0;
      const iv = setInterval(() => {
        if (destroyed) { clearInterval(iv); return; }
        ticks++;
        ui.rollValue = randInt(100, 999);
        const el = root.querySelector('.led');
        if (el) el.textContent = ui.rollValue;
        if (ticks >= 28) {
          clearInterval(iv);
          ui.rolling = false;
          r.target = final;
          commit();
        }
      }, 70);
    }

    function skipClock() {
      const r = round();
      r.clock.state = 'done';
      r.clock.remaining = 0;
      commit();
    }

    function endClockEarly() {
      const r = round();
      if (r.clock.state === 'running' || r.clock.state === 'paused') finishClock(false);
    }

    function toggleSolution() {
      const r = round();
      if (ui.showSol) { ui.showSol = false; commit(); return; }
      if (r.type === 'letters') {
        if (!r.solutions) r.solutions = GN.solvers.solveLetters(r.tiles.join(''), window.COUNTDOWN_WORDS || [], 3);
        ui.showSol = true;
        commit();
      } else if (r.type === 'numbers') {
        if (r.solution) { ui.showSol = true; commit(); return; }
        ui.solving = true;
        render();
        setTimeout(() => {
          if (destroyed) return;
          r.solution = GN.solvers.solveNumbers(r.tiles.map((t) => t.v), r.target);
          ui.solving = false;
          ui.showSol = true;
          commit();
        }, 40);
      }
    }

    function applyAwards(r, awards) {
      const old = r.awards || [];
      game.teams.forEach((t, i) => { t.score += (awards[i] || 0) - (old[i] || 0); });
      r.awards = awards;
    }

    function adjust(i, d) {
      const t = game.teams[i];
      t.score = Math.max(0, t.score + d);
      ui.flash = i;
      commit();
    }

    async function nextRound() {
      const r = round();
      if (r.clock.state !== 'done') return;
      if (!r.awards) {
        const ok = await confirmDialog({
          title: 'No points added yet',
          message: 'You haven’t scored this round. Move on without giving any points?',
          confirmLabel: 'Move on', cancelLabel: 'Go back',
        });
        if (!ok) return;
      }
      game.roundIndex++;
      ui.showSol = false;
      ensureRound();
      stopMusic();
      commit();
      save();
    }

    function revealAnswer() {
      const r = round();
      if (r.type !== 'conundrum' || r.revealed) return;
      r.revealed = true;
      r.clock.state = 'done';
      r.clock.remaining = Math.max(0, r.clock.remaining);
      r.alts = findAlts(r.word);
      stopMusic();
      commit();
    }

    function findAlts(word) {
      const sig = word.toLowerCase().split('').sort().join('');
      return (window.COUNTDOWN_WORDS || [])
        .filter((w) => w.length === 9 && w !== word.toLowerCase() && w.split('').sort().join('') === sig)
        .map((w) => w.toUpperCase());
    }

    function buzz(i) {
      const r = round();
      if (!r || r.type !== 'conundrum' || r.clock.state !== 'running' || r.lockedOut.includes(i) || i >= game.teams.length) return;
      r.clock.remaining = Math.max(0, (clockEnd - performance.now()) / 1000);
      r.clock.state = 'paused';
      r.buzzed = i;
      pauseMusic();
      commit();
    }

    function buzzCorrect() {
      const r = round();
      if (r.buzzed == null) return;
      game.teams[r.buzzed].score += 10;
      r.awards = game.teams.map((_, i) => (i === r.buzzed ? 10 : 0));
      r.solvedBy = r.buzzed;
      r.buzzed = null;
      r.revealed = true;
      r.clock.state = 'done';
      r.alts = findAlts(r.word);
      stopMusic();
      commit();
    }

    function buzzWrong() {
      const r = round();
      if (r.buzzed == null) return;
      r.lockedOut.push(r.buzzed);
      r.buzzed = null;
      if (r.lockedOut.length >= game.teams.length || r.clock.remaining <= 0.05) {
        r.clock.state = 'done';
        stopMusic();
        commit();
      } else {
        r.clock.state = 'paused';
        startClock();
      }
    }

    function finishGame() {
      const r = round();
      if (!r.revealed) return;
      game.status = 'finished';
      commit();
      save();
    }

    function goHome() {
      pauseMusic();
      save();
      if (hooks.onHome) hooks.onHome();
      else location.hash = '#/';
    }

    function playAgain() {
      save();
      const g = create({ teams: game.teams.map((t) => t.name), setId: game.setId, setName: game.setName });
      GN.store.saveGame(g);
      location.hash = '#/game/' + g.id;
    }

    /* ---------- modals ---------- */

    function guideHtml(type) {
      if (type === 'letters') {
        return '<table class="guide-table"><thead><tr><th>Valid word</th><th>Points</th></tr></thead><tbody>' +
          '<tr><td>3&ndash;8 letters</td><td>1 point per letter</td></tr><tr><td>9 letters (all of them)</td><td><strong>18 points</strong></td></tr></tbody></table>' +
          '<ul class="guide-list"><li>The <strong>longest valid word</strong> wins the round. Check the longest word first.</li>' +
          '<li>If teams tie on length and both words are valid, <strong>both teams score</strong>.</li>' +
          '<li>An invalid word scores nothing, so check the next longest word.</li>' +
          '<li>No proper nouns, abbreviations, hyphens or American spellings.</li></ul>';
      }
      if (type === 'numbers') {
        return '<table class="guide-table"><thead><tr><th>Distance from target</th><th>Points</th></tr></thead><tbody>' +
          '<tr><td>Exact</td><td><strong>10 points</strong></td></tr><tr><td>1&ndash;5 away</td><td>7 points</td></tr>' +
          '<tr><td>6&ndash;10 away</td><td>5 points</td></tr><tr><td>More than 10 away</td><td>0 points</td></tr></tbody></table>' +
          '<ul class="guide-list"><li>Teams that are equally close both score.</li>' +
          '<li>Use + &minus; &times; &divide; only. Each tile at most once. Every step must be a positive whole number.</li>' +
          '<li>A working with a mistake in it does not score.</li></ul>';
      }
      return '<table class="guide-table"><thead><tr><th>Conundrum</th><th>Points</th></tr></thead><tbody>' +
        '<tr><td>First team to buzz in with the correct answer</td><td><strong>10 points</strong></td></tr></tbody></table>' +
        '<ul class="guide-list"><li>The answer is a single nine-letter word using every letter.</li>' +
        '<li>A wrong answer locks that team out for the rest of the round.</li>' +
        '<li>Teams buzz with their button or by pressing their number key (1&ndash;8).</li></ul>';
    }

    function openGuide() {
      const r = round();
      openModal({
        title: 'Scoring guide: ' + TYPE_LABEL[r.type].toLowerCase(),
        body: guideHtml(r.type),
        actions: [{ label: 'Got it', kind: 'primary' }],
      });
    }

    function openScoreModal() {
      const r = round();
      if (r.type === 'conundrum') return;
      const isLetters = r.type === 'letters';
      const st = game.teams.map((t, i) => ({
        val: isLetters ? (r.lengths && r.lengths[i] != null ? r.lengths[i] : 0) : (r.reached && r.reached[i] != null ? r.reached[i] : ''),
        pts: 0, manual: false,
      }));

      function suggest() {
        if (isLetters) {
          const lens = st.map((s) => Math.max(0, Math.min(9, parseInt(s.val, 10) || 0)));
          const max = Math.max(0, ...lens);
          return lens.map((l) => (l > 0 && l === max ? (l === 9 ? 18 : l) : 0));
        }
        return st.map((s) => {
          if (s.val === '' || s.val == null || isNaN(+s.val)) return 0;
          const d = Math.abs(+s.val - r.target);
          return d === 0 ? 10 : d <= 5 ? 7 : d <= 10 ? 5 : 0;
        });
      }
      function distText(i) {
        if (isLetters) return '';
        const s = st[i];
        if (s.val === '' || isNaN(+s.val)) return 'no answer';
        const d = Math.abs(+s.val - r.target);
        return d === 0 ? 'exact!' : d + ' away';
      }

      const sug = suggest();
      st.forEach((s, i) => {
        s.pts = r.awards ? r.awards[i] : sug[i];
        s.manual = r.awards ? r.awards[i] !== sug[i] : false;
      });

      const rows = game.teams.map((t, i) => {
        const valInput = isLetters
          ? '<div class="stepper"><button type="button" data-step="-1" aria-label="One fewer letter">&minus;</button>' +
            '<input class="val" type="number" min="0" max="9" inputmode="numeric" value="' + st[i].val + '" aria-label="Valid word length for ' + esc(t.name) + '">' +
            '<button type="button" data-step="1" aria-label="One more letter">+</button></div>'
          : '<div class="num-entry"><input class="val" type="number" min="0" inputmode="numeric" placeholder="Number reached" value="' + st[i].val + '" aria-label="Number reached by ' + esc(t.name) + '"><span class="dist">' + distText(i) + '</span></div>';
        return '<div class="score-row" data-i="' + i + '"><span class="srow-name"><span class="team-dot" style="background:' + t.color + '"></span>' + esc(t.name) + '</span>' + valInput +
          '<label class="pts-wrap"><input class="pts" type="number" min="0" max="99" inputmode="numeric" value="' + st[i].pts + '" aria-label="Points for ' + esc(t.name) + '"><span>pts</span></label></div>';
      }).join('');

      const intro = isLetters
        ? 'Enter the length of each team’s <strong>valid</strong> word (0 if they had none or it was invalid). Points are worked out for you; edit them if you rule differently.'
        : 'Enter the number each team reached (leave blank if they had none). Points are worked out from the distance to <strong>' + r.target + '</strong>; edit them if you rule differently.';

      const body = document.createElement('div');
      body.innerHTML = '<p class="modal-text">' + intro + '</p><div class="score-table"><div class="score-head"><span>Team</span><span>' + (isLetters ? 'Valid word length' : 'Number reached') + '</span><span>Points</span></div>' + rows + '</div>';

      function refresh() {
        const s2 = suggest();
        body.querySelectorAll('.score-row').forEach((row) => {
          const i = +row.dataset.i;
          if (!st[i].manual) { st[i].pts = s2[i]; row.querySelector('.pts').value = s2[i]; }
          const d = row.querySelector('.dist');
          if (d) d.textContent = distText(i);
        });
      }
      body.addEventListener('input', (e) => {
        const row = e.target.closest('.score-row');
        if (!row) return;
        const i = +row.dataset.i;
        if (e.target.classList.contains('pts')) { st[i].pts = e.target.value; st[i].manual = true; }
        else if (e.target.classList.contains('val')) { st[i].val = e.target.value; refresh(); }
      });
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-step]');
        if (!b) return;
        const row = b.closest('.score-row');
        const inp = row.querySelector('.val');
        const next = Math.max(0, Math.min(9, (parseInt(inp.value, 10) || 0) + +b.dataset.step));
        inp.value = next;
        st[+row.dataset.i].val = next;
        refresh();
      });

      openModal({
        title: 'Score this round', body, wide: true,
        actions: [
          { label: 'Cancel', kind: 'ghost' },
          {
            label: r.awards ? 'Update scores' : 'Add to scores', kind: 'primary',
            onClick: () => {
              const awards = st.map((s) => Math.max(0, Math.min(99, Math.round(+s.pts || 0))));
              if (isLetters) r.lengths = st.map((s) => Math.max(0, Math.min(9, parseInt(s.val, 10) || 0)));
              else r.reached = st.map((s) => (s.val === '' || isNaN(+s.val) ? null : +s.val));
              applyAwards(r, awards);
              commit();
              save();
              toast('Scores updated');
            },
          },
        ],
      });
    }

    function openMusic() {
      const body = document.createElement('div');
      function paint() {
        const status = musicOk === true ? '<span class="pill good">Theme loaded</span>' : musicOk === false ? '<span class="pill bad">No theme file found</span>' : '<span class="pill">Checking…</span>';
        body.innerHTML =
          '<p class="modal-text">' + status + (customTheme ? ' <span class="muted">(your uploaded file)</span>' : '') + '</p>' +
          '<p class="modal-text">The theme plays when a clock starts and stops when it ends. Two ways to add your music:</p>' +
          '<ol class="guide-list"><li><strong>Upload here</strong> &ndash; pick an audio file below. It is kept in this browser.</li>' +
          '<li><strong>Add it to the repo</strong> &ndash; put an MP3 at <code>audio/countdown-theme.mp3</code> and it is used for everyone.</li></ol>' +
          '<div class="music-row"><label class="btn secondary file-btn">Choose audio file<input type="file" accept="audio/*" hidden id="themeFile"></label>' +
          (customTheme ? '<button class="btn ghost" id="themeReset" type="button">Remove uploaded file</button>' : '') +
          '<button class="btn ghost" id="themeTest" type="button">Test play</button></div>' +
          '<label class="volume">Volume <input type="range" min="0" max="1" step="0.05" value="' + audio.volume + '" id="themeVol"></label>';
      }
      paint();
      body.addEventListener('change', async (e) => {
        if (e.target.id === 'themeFile' && e.target.files[0]) {
          const f = e.target.files[0];
          customTheme = true;
          setThemeBlob(f);
          await GN.store.saveBlob('countdown-theme', f);
          toast('Theme music loaded');
          setTimeout(paint, 400);
        }
      });
      body.addEventListener('input', (e) => {
        if (e.target.id === 'themeVol') { audio.volume = +e.target.value; GN.store.setPref('volume', audio.volume); }
      });
      body.addEventListener('click', async (e) => {
        if (e.target.id === 'themeReset') {
          await GN.store.deleteBlob('countdown-theme');
          customTheme = false;
          musicOk = null;
          audio.src = DEFAULT_THEME_URL;
          audio.load();
          setTimeout(paint, 400);
        } else if (e.target.id === 'themeTest') {
          if (audio.paused) { playMusic(true); e.target.textContent = 'Stop'; }
          else { stopMusic(); e.target.textContent = 'Test play'; }
        }
      });
      openModal({ title: 'Theme music', body, actions: [{ label: 'Done', kind: 'primary' }], onClose: () => { if (round() && round().clock.state !== 'running') stopMusic(); } });
    }

    /* ---------- events ---------- */

    function onClick(e) {
      const el = e.target.closest('[data-act]');
      if (!el || !root.contains(el) || el.disabled) return;
      switch (el.dataset.act) {
        case 'home': goHome(); break;
        case 'save': save(); toast('Game saved'); break;
        case 'mute': GN.store.setPref('muted', !muted()); if (muted()) pauseMusic(); render(); break;
        case 'music': openMusic(); break;
        case 'guide': openGuide(); break;
        case 'score': openScoreModal(); break;
        case 'solve': toggleSolution(); break;
        case 'next': nextRound(); break;
        case 'pick-vowel': pickLetter('v'); break;
        case 'pick-cons': pickLetter('c'); break;
        case 'random-letters': randomLetters(); break;
        case 'pick-large': pickNumber('large'); break;
        case 'pick-small': pickNumber('small'); break;
        case 'random-numbers': randomNumbers(); break;
        case 'undo-tile': undoTile(); break;
        case 'reveal-target': revealTarget(); break;
        case 'clock-toggle': toggleClock(); break;
        case 'clock-skip': skipClock(); break;
        case 'clock-end': endClockEarly(); break;
        case 'adj': adjust(+el.dataset.team, +el.dataset.d); break;
        case 'buzz': buzz(+el.dataset.team); break;
        case 'buzz-correct': buzzCorrect(); break;
        case 'buzz-wrong': buzzWrong(); break;
        case 'reveal-answer': revealAnswer(); break;
        case 'finish': finishGame(); break;
        case 'play-again': playAgain(); break;
        case 'back-to-conundrum': game.status = 'playing'; commit(); break;
        default: break;
      }
    }

    function onKey(e) {
      if (GN.util.modalOpen() || game.status !== 'playing') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea', 'button', 'a'].includes(tag)) return;
      const r = round();
      if (e.code === 'Space') {
        const usable = r.type === 'letters' ? r.tiles.length === 9 : r.type === 'numbers' ? r.target != null : true;
        if (usable && !(r.type === 'conundrum' && (r.revealed || r.buzzed != null))) { e.preventDefault(); toggleClock(); }
      } else if (r.type === 'conundrum' && /^[1-8]$/.test(e.key)) {
        buzz(+e.key - 1);
      }
    }

    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);

    render();

    return {
      save,
      destroy() {
        if (destroyed) return;
        save();
        destroyed = true;
        clearInterval(autoSaveInterval);
        clearTimeout(saveTimer);
        if (raf) cancelAnimationFrame(raf);
        stopConfetti();
        stopMusic();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        root.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('pagehide', onLeave);
        window.removeEventListener('beforeunload', onLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        root.innerHTML = '';
      },
    };
  }

  GN.countdown = { create, mount, describe, ranked, ROUND_PLAN, TEAM_COLORS };
})();