/*
 * Storage for saved games, question sets and preferences.
 * Uses the browser's localStorage so saves survive refreshes and closing the tab.
 * If localStorage is blocked (private mode, strict settings) it quietly falls back
 * to keeping everything in memory for the current visit.
 */
(function () {
  const GN = (window.GN = window.GN || {});

  const KEYS = { games: 'gn.games.v1', sets: 'gn.datasets.v1', prefs: 'gn.prefs.v1' };
  const memory = {};
  let persistent = true;

  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      persistent = false;
      return memory[key] ? JSON.parse(memory[key]) : fallback;
    }
  }

  function write(key, value) {
    const raw = JSON.stringify(value);
    try {
      window.localStorage.setItem(key, raw);
      memory[key] = raw;
    } catch (e) {
      persistent = false;
      memory[key] = raw;
    }
  }

  /* ----- games ----- */
  function allGames() { return read(KEYS.games, []); }

  function listGames() {
    return allGames().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  function getGame(id) { return allGames().find((g) => g.id === id) || null; }

  function saveGame(game) {
    game.updatedAt = Date.now();
    const list = allGames();
    const i = list.findIndex((g) => g.id === game.id);
    if (i >= 0) list[i] = game; else list.push(game);
    write(KEYS.games, list);
    return game.updatedAt;
  }

  function deleteGame(id) { write(KEYS.games, allGames().filter((g) => g.id !== id)); }

  /* ----- question sets ----- */
  function listSets(gameType) {
    const all = read(KEYS.sets, []);
    return (gameType ? all.filter((s) => s.game === gameType) : all).sort((a, b) => b.createdAt - a.createdAt);
  }
  function getSet(id) { return read(KEYS.sets, []).find((s) => s.id === id) || null; }
  function saveSet(set) {
    const list = read(KEYS.sets, []);
    const i = list.findIndex((s) => s.id === set.id);
    if (i >= 0) list[i] = set; else list.push(set);
    write(KEYS.sets, list);
  }
  function deleteSet(id) { write(KEYS.sets, read(KEYS.sets, []).filter((s) => s.id !== id)); }

  /* ----- preferences ----- */
  function getPref(key, fallback) {
    const p = read(KEYS.prefs, {});
    return key in p ? p[key] : fallback;
  }
  function setPref(key, value) {
    const p = read(KEYS.prefs, {});
    p[key] = value;
    write(KEYS.prefs, p);
  }

  /* ----- binary files (e.g. the theme music) kept in IndexedDB ----- */
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = window.indexedDB.open('gn-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('blobs');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function blobOp(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', mode);
      const req = fn(tx.objectStore('blobs'));
      tx.oncomplete = () => resolve(req && req.result !== undefined ? req.result : null);
      tx.onerror = () => reject(tx.error);
    }));
  }
  const saveBlob = (key, blob) => blobOp('readwrite', (s) => s.put(blob, key)).catch(() => null);
  const getBlob = (key) => blobOp('readonly', (s) => s.get(key)).catch(() => null);
  const deleteBlob = (key) => blobOp('readwrite', (s) => s.delete(key)).catch(() => null);

  GN.store = {
    listGames, getGame, saveGame, deleteGame,
    listSets, getSet, saveSet, deleteSet,
    getPref, setPref,
    saveBlob, getBlob, deleteBlob,
    isPersistent: () => persistent,
  };
})();
