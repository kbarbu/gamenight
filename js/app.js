/* Home page, new-game setup, question-set upload, info modals and routing. */
(function () {
  const GN = (window.GN = window.GN || {});
  const { esc, uid, openModal, confirmDialog, toast, fmtTime } = GN.util;

  const homeRoot = document.getElementById('home');
  const gameRoot = document.getElementById('game');
  let controller = null;

  /* ===================== routing ===================== */

  function destroyController() {
    if (controller) {
      controller.destroy();
      controller = null;
    }
  }

  function route() {
    const m = /^#\/game\/(.+)$/.exec(location.hash);
    if (m) showGame(decodeURIComponent(m[1]));
    else showHome();
  }

  function showHome() {
    destroyController();
    gameRoot.hidden = true;
    homeRoot.hidden = false;
    document.body.dataset.view = 'home';
    renderHome();
    window.scrollTo(0, 0);
  }

  function showGame(id) {
    destroyController();
    const game = GN.store.getGame(id);
    if (!game) {
      toast('That saved game could not be found.');
      location.hash = '#/';
      return;
    }
    homeRoot.hidden = true;
    gameRoot.hidden = false;
    document.body.dataset.view = 'game';
    if (game.type === 'countdown') controller = GN.countdown.mount(gameRoot, game, {});
    else {
      toast('This game mode is not available yet.');
      location.hash = '#/';
    }
  }

  /* ===================== home ===================== */

  function savedCardHtml(g) {
    const def = GN.GAMES[g.type] || { name: g.type, icon: '' };
    const d = g.type === 'countdown' ? GN.countdown.describe(g) : { line: '', detail: '' };
    const teams = g.teams.map((t) =>
      '<span class="team-chip" style="--team:' + t.color + '"><i></i>' + esc(t.name) + ' <b>' + t.score + '</b></span>').join('');
    return '<article class="saved-card g-' + esc(g.type) + '">' +
      '<div class="saved-top"><div class="saved-icon">' + def.icon + '</div>' +
      '<div><h3>' + esc(def.name) + '</h3><p class="saved-sub">' + esc(d.line) + (d.detail ? ' &middot; ' + esc(d.detail) : '') + '</p></div></div>' +
      '<div class="saved-teams">' + teams + '</div>' +
      '<div class="saved-foot"><span class="muted small">Saved ' + esc(fmtTime(g.updatedAt)) + '</span>' +
      '<div class="saved-actions"><button class="btn primary small" data-act="continue" data-id="' + esc(g.id) + '">' + (g.status === 'finished' ? 'View results' : 'Continue') + '</button>' +
      '<button class="btn danger-ghost small" data-act="delete-game" data-id="' + esc(g.id) + '" aria-label="Delete this saved game">Delete</button></div></div>' +
      '</article>';
  }

  function gameCardHtml(id) {
    const g = GN.GAMES[id];
    return '<div class="game-card g-' + id + (g.ready ? '' : ' soon-card') + '" data-act="new-game" data-game="' + id + '" role="button" tabindex="0" aria-label="Start a ' + esc(g.name) + ' game">' +
      '<button class="info-btn" data-act="info" data-game="' + id + '" aria-label="How to play ' + esc(g.name) + '" title="How to play">i</button>' +
      '<div class="gc-icon">' + g.icon + '</div>' +
      '<h3>' + esc(g.name) + '</h3><p>' + esc(g.tagline) + '</p>' +
      '<div class="gc-tags">' + g.tags.map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>' +
      '<span class="gc-cta">' + (g.ready ? 'Start game &rarr;' : 'Coming soon') + '</span></div>';
  }

  function setsHtml() {
    const sets = GN.store.listSets();
    const builtin = '<li class="set-row"><div><strong>Built-in conundrums</strong><span class="muted small">Countdown &middot; ' +
      (window.BUILTIN_CONUNDRUMS || []).length + ' words</span></div><span class="pill">Built in</span></li>';
    const rows = sets.map((s) => {
      const g = GN.GAMES[s.game];
      const noun = s.game === 'countdown' ? 'words' : 'items';
      return '<li class="set-row"><div><strong>' + esc(s.name) + '</strong><span class="muted small">' + esc(g ? g.name : s.game) + ' &middot; ' + s.items.length + ' ' + noun +
        (s.game !== 'countdown' ? ' &middot; saved for later' : '') + '</span></div>' +
        '<button class="btn danger-ghost small" data-act="delete-set" data-id="' + esc(s.id) + '" aria-label="Delete ' + esc(s.name) + '">Delete</button></li>';
    }).join('');
    return '<ul class="set-list">' + builtin + rows + '</ul>';
  }

  function renderHome() {
    const games = GN.store.listGames();
    const saved = games.length
      ? '<section class="home-section"><div class="section-head"><h2>Saved games</h2><p class="muted">Pick up where you left off.</p></div><div class="saved-list">' + games.map(savedCardHtml).join('') + '</div></section>'
      : '';
    const warn = GN.store.isPersistent() ? '' :
      '<div class="notice">Your browser is blocking storage, so saves will only last until you close this tab.</div>';
    homeRoot.innerHTML =
      '<div class="home-wrap"><header class="hero"><div class="logo-mark" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '<div><h1>Game Night</h1><p>Pick a game, gather your teams, and play.</p></div></header>' + warn + saved +
      '<section class="home-section"><div class="section-head"><h2>' + (games.length ? 'Start a new game' : 'Choose a game') + '</h2>' +
      '<p class="muted">Tap the <span class="inline-i">i</span> on any game to learn the rules.</p></div>' +
      '<div class="game-grid">' + GN.GAME_ORDER.map(gameCardHtml).join('') + '</div></section>' +
      '<section class="home-section"><div class="section-head"><h2>Question sets</h2><p class="muted">Upload your own questions or word lists for a game mode.</p></div>' +
      setsHtml() + '<div class="set-actions"><button class="btn secondary" data-act="upload">Upload a question set</button></div></section>' +
      '<footer class="home-foot muted small">Games and question sets are stored in this browser. Clearing site data will remove them.</footer></div>';
  }

  homeRoot.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'info') { e.stopPropagation(); openInfo(el.dataset.game); }
    else if (act === 'new-game') openSetup(el.dataset.game);
    else if (act === 'continue') location.hash = '#/game/' + encodeURIComponent(el.dataset.id);
    else if (act === 'delete-game') {
      const ok = await confirmDialog({
        title: 'Delete saved game?', message: 'This saved game and its scores will be removed. This can’t be undone.',
        confirmLabel: 'Delete game', danger: true,
      });
      if (ok) { GN.store.deleteGame(el.dataset.id); renderHome(); toast('Saved game deleted'); }
    } else if (act === 'delete-set') {
      const ok = await confirmDialog({
        title: 'Delete question set?', message: 'This question set will be removed. Games that have already started keep their questions.',
        confirmLabel: 'Delete set', danger: true,
      });
      if (ok) { GN.store.deleteSet(el.dataset.id); renderHome(); toast('Question set deleted'); }
    } else if (act === 'upload') openUpload();
  });

  homeRoot.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('game-card')) {
      e.preventDefault();
      openSetup(e.target.dataset.game);
    }
  });

  /* ===================== info modal (step-by-step) ===================== */

  function openInfo(id) {
    const g = GN.GAMES[id];
    if (!g) return;
    let i = 0;
    const last = g.steps.length - 1;
    const body = document.createElement('div');
    body.className = 'info-guide';
    let modal;

    function paint() {
      const s = g.steps[i];
      const dots = g.steps.map((_, k) => '<button type="button" class="dot' + (k === i ? ' on' : k < i ? ' done' : '') + '" data-go="' + k + '" aria-label="Go to step ' + (k + 1) + '"></button>').join('');
      body.innerHTML =
        (g.draft ? '<p class="draft-note">Draft rules. The final guide will arrive with this game mode.</p>' : '') +
        '<div class="step-top"><span class="step-meta">Step ' + (i + 1) + ' of ' + g.steps.length + '</span><div class="step-dots">' + dots + '</div></div>' +
        '<div class="step-card"><div class="step-num">' + (i + 1) + '</div><div class="step-text"><h3>' + esc(s.title) + '</h3>' + s.text + '</div></div>';
      if (modal) paintActions();
    }
    function paintActions() {
      modal.setActions([
        { label: '← Back', kind: 'ghost', disabled: i === 0, onClick: () => { i--; paint(); return false; } },
        i < last
          ? { label: 'Next →', kind: 'primary', onClick: () => { i++; paint(); return false; } }
          : { label: 'Done', kind: 'primary' },
      ]);
    }
    body.addEventListener('click', (e) => {
      const d = e.target.closest('[data-go]');
      if (d) { i = +d.dataset.go; paint(); }
    });
    const onKey = (e) => {
      if (e.key === 'ArrowRight' && i < last) { i++; paint(); }
      else if (e.key === 'ArrowLeft' && i > 0) { i--; paint(); }
    };
    document.addEventListener('keydown', onKey);
    modal = openModal({
      title: g.name + ': how to play', body, wide: true, className: 'info-modal',
      onClose: () => document.removeEventListener('keydown', onKey),
    });
    paint();
  }

  /* ===================== new game setup ===================== */

  function openSetup(id) {
    const g = GN.GAMES[id];
    if (!g) return;
    if (!g.ready) {
      openModal({
        title: g.name,
        body: '<p class="modal-text"><strong>' + esc(g.name) + '</strong> is coming soon. Countdown is ready to play now.</p>',
        actions: [
          { label: 'How to play', kind: 'ghost', onClick: () => { setTimeout(() => openInfo(id), 0); } },
          { label: 'OK', kind: 'primary' },
        ],
      });
      return;
    }

    let count = Math.max(1, Math.min(8, GN.store.getPref('teamCount', 2)));
    const names = Array.from({ length: 8 }, (_, i) => 'Team ' + (i + 1));
    const savedNames = GN.store.getPref('teamNames', null);
    if (Array.isArray(savedNames)) savedNames.forEach((n, i) => { if (i < 8 && n) names[i] = n; });
    const sets = GN.datasets.conundrumSets();

    const body = document.createElement('div');
    body.innerHTML =
      '<div class="field"><label>How many teams? <span class="muted">(up to 8)</span></label><div class="count-picker" id="countPicker"></div></div>' +
      '<div class="field"><label>Team names</label><div class="team-inputs" id="teamInputs"></div></div>' +
      '<div class="field"><label for="setSel">Conundrum word list</label><select id="setSel">' +
      sets.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + ' (' + s.count + ' words)</option>').join('') + '</select>' +
      '<p class="hint">One word is picked at random for the final conundrum. Everything else is random.</p></div>';

    const picker = body.querySelector('#countPicker');
    const inputs = body.querySelector('#teamInputs');

    function paintCount() {
      picker.innerHTML = Array.from({ length: 8 }, (_, k) =>
        '<button type="button" class="chip' + (k + 1 === count ? ' on' : '') + '" data-count="' + (k + 1) + '" aria-pressed="' + (k + 1 === count) + '">' + (k + 1) + '</button>').join('');
    }
    function paintInputs() {
      inputs.innerHTML = Array.from({ length: count }, (_, k) =>
        '<label class="team-input" style="--team:' + GN.countdown.TEAM_COLORS[k] + '"><span class="team-dot" style="background:' + GN.countdown.TEAM_COLORS[k] + '"></span>' +
        '<input type="text" maxlength="24" data-i="' + k + '" value="' + esc(names[k]) + '" aria-label="Name for team ' + (k + 1) + '"></label>').join('');
    }
    picker.addEventListener('click', (e) => {
      const b = e.target.closest('[data-count]');
      if (!b) return;
      count = +b.dataset.count;
      paintCount();
      paintInputs();
    });
    inputs.addEventListener('input', (e) => {
      const k = e.target.dataset.i;
      if (k != null) names[+k] = e.target.value;
    });
    paintCount();
    paintInputs();

    openModal({
      title: 'New ' + g.name + ' game', body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Start game', kind: 'primary',
          onClick: () => {
            const teams = names.slice(0, count).map((n, k) => n.trim() || 'Team ' + (k + 1));
            const setId = body.querySelector('#setSel').value;
            const set = sets.find((s) => s.id === setId);
            GN.store.setPref('teamCount', count);
            GN.store.setPref('teamNames', names);
            const game = GN.countdown.create({ teams, setId, setName: set ? set.name : '' });
            GN.store.saveGame(game);
            location.hash = '#/game/' + encodeURIComponent(game.id);
          },
        },
      ],
    });
  }

  /* ===================== upload a question set ===================== */

  function openUpload() {
    let fileText = null;
    let fileName = '';
    let parsed = null;

    const body = document.createElement('div');
    body.innerHTML =
      '<div class="field"><label for="upGame">Game mode</label><select id="upGame">' +
      GN.GAME_ORDER.map((id) => '<option value="' + id + '"' + (id === 'countdown' ? ' selected' : '') + '>' + esc(GN.GAMES[id].name) + (GN.GAMES[id].ready ? '' : ' (coming soon)') + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="upName">Name this set</label><input id="upName" type="text" maxlength="40" placeholder="e.g. Pub quiz conundrums"></div>' +
      '<div class="field"><label>File</label><label class="file-drop" id="fileDrop"><input type="file" id="upFile" accept=".csv,.tsv,.json,.txt,text/csv,application/json,text/plain" hidden><span id="fileLabel">Choose a .csv, .json or .txt file</span></label>' +
      '<p class="hint" id="fmtHelp"></p></div><div id="upPreview" aria-live="polite"></div>';

    const gameSel = body.querySelector('#upGame');
    const nameInp = body.querySelector('#upName');
    const fileInp = body.querySelector('#upFile');
    const help = body.querySelector('#fmtHelp');
    const preview = body.querySelector('#upPreview');
    let modal;

    function paintHelp() {
      help.innerHTML = gameSel.value === 'countdown'
        ? '<strong>Recommended: CSV</strong>, with one nine-letter word per row (a header row called <code>word</code> is fine). Plain <code>.txt</code> (one word per line) and <code>.json</code> (<code>["COASTLINE", "PORCELAIN"]</code>) work too. <a href="#" id="dlExample">Download an example</a>'
        : 'Use a CSV with a header row (for example <code>question,answer</code>) or a JSON list. It is stored now and used when this game mode arrives.';
    }

    function paintPreview() {
      if (!parsed) { preview.innerHTML = ''; modal && modal.foot.querySelector('[data-id="save"]') && (modal.foot.querySelector('[data-id="save"]').disabled = true); return; }
      const isCd = gameSel.value === 'countdown';
      const ok = parsed.items.length;
      let html = '<div class="parse-result ' + (ok ? 'ok' : 'bad') + '"><strong>' + (ok ? 'Found ' + ok + (isCd ? ' usable word' : ' item') + (ok === 1 ? '' : 's') : 'Nothing usable found') + '</strong>';
      if (isCd) {
        if (ok) html += '<p class="muted small">' + esc(parsed.items.slice(0, 8).join(', ')) + (ok > 8 ? '…' : '') + '</p>';
        if (parsed.rejected.length) html += '<p class="muted small">Skipped ' + parsed.rejected.length + ' that were not exactly nine letters (' + esc(parsed.rejected.slice(0, 5).join(', ')) + (parsed.rejected.length > 5 ? '…' : '') + ').</p>';
      } else if (ok) {
        html += '<p class="muted small">' + esc(JSON.stringify(parsed.items[0]).slice(0, 120)) + '</p>';
      }
      html += '</div>';
      preview.innerHTML = html;
      const saveBtn = modal && modal.foot.querySelector('[data-id="save"]');
      if (saveBtn) saveBtn.disabled = !ok;
    }

    function reparse() {
      parsed = null;
      if (fileText != null) {
        try { parsed = GN.datasets.parse(gameSel.value, fileName, fileText); }
        catch (err) { parsed = { items: [], rejected: [], format: '', total: 0 }; preview.innerHTML = '<div class="parse-result bad"><strong>' + esc(err.message) + '</strong></div>'; const b = modal.foot.querySelector('[data-id="save"]'); if (b) b.disabled = true; return; }
      }
      paintPreview();
    }

    gameSel.addEventListener('change', () => { paintHelp(); reparse(); });
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files[0];
      if (!f) return;
      fileName = f.name;
      body.querySelector('#fileLabel').textContent = f.name;
      try { fileText = await f.text(); } catch (err) { fileText = null; preview.innerHTML = '<div class="parse-result bad"><strong>Could not read that file.</strong></div>'; return; }
      if (!nameInp.value.trim()) nameInp.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      reparse();
    });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'dlExample') {
        e.preventDefault();
        const url = URL.createObjectURL(new Blob([GN.datasets.exampleFile()], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'conundrums-example.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
    paintHelp();

    modal = openModal({
      title: 'Upload a question set', body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save question set', kind: 'primary', id: 'save', disabled: true,
          onClick: () => {
            const name = nameInp.value.trim();
            if (!name) { toast('Give the set a name first.'); nameInp.focus(); return false; }
            if (!parsed || !parsed.items.length) return false;
            GN.store.saveSet({
              id: uid(), name, game: gameSel.value, items: parsed.items,
              createdAt: Date.now(), source: fileName, format: parsed.format,
            });
            renderHome();
            toast('Saved “' + name + '” (' + parsed.items.length + ')');
          },
        },
      ],
    });
  }

  /* ===================== boot ===================== */

  window.addEventListener('hashchange', route);
  route();
})();
