/* Small shared helpers: escaping, random, modal dialogs, toasts. */
(function () {
  const GN = (window.GN = window.GN || {});

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

  function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'today at ' + t;
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'yesterday at ' + t;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + t;
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------- Modals ---------- */

  const modalStack = [];

  function openModal(opts) {
    const o = Object.assign({ title: '', body: '', actions: [], wide: false, className: '', onClose: null }, opts);
    const prevFocus = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal' + (o.wide ? ' modal-wide' : '') + (o.className ? ' ' + o.className : '');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', o.title);
    modal.innerHTML =
      '<div class="modal-head"><h2>' + esc(o.title) + '</h2>' +
      '<button class="icon-btn" type="button" data-modal-close aria-label="Close">&times;</button></div>' +
      '<div class="modal-body"></div><div class="modal-foot"></div>';

    const bodyEl = modal.querySelector('.modal-body');
    const footEl = modal.querySelector('.modal-foot');
    if (typeof o.body === 'string') bodyEl.innerHTML = o.body;
    else if (o.body) bodyEl.appendChild(o.body);

    const api = { el: modal, body: bodyEl, foot: footEl, close, setActions };

    function setActions(list) {
      footEl.innerHTML = '';
      footEl.style.display = list.length ? '' : 'none';
      list.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (a.kind || 'ghost');
        b.textContent = a.label;
        if (a.disabled) b.disabled = true;
        if (a.id) b.dataset.id = a.id;
        b.addEventListener('click', () => {
          const r = a.onClick ? a.onClick(api) : undefined;
          if (a.close !== false && r !== false) close();
        });
        footEl.appendChild(b);
      });
    }

    function close() {
      if (!backdrop.isConnected) return;
      backdrop.remove();
      const i = modalStack.indexOf(api);
      if (i >= 0) modalStack.splice(i, 1);
      if (!modalStack.length) document.body.classList.remove('modal-open');
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* ignore */ }
      if (o.onClose) o.onClose();
    }

    setActions(o.actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open');
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    modal.querySelector('[data-modal-close]').addEventListener('click', close);
    modalStack.push(api);
    requestAnimationFrame(() => backdrop.classList.add('show'));

    const first = modal.querySelector('input, select, textarea') || footEl.querySelector('button.primary') || footEl.querySelector('button');
    if (first) setTimeout(() => { try { first.focus(); } catch (e) { /* ignore */ } }, 30);
    return api;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStack.length) {
      modalStack[modalStack.length - 1].close();
      e.stopPropagation();
    }
  }, true);

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v) => { if (!answered) { answered = true; resolve(v); } };
      openModal({
        title: opts.title || 'Are you sure?',
        body: '<p class="modal-text">' + esc(opts.message || '') + '</p>',
        onClose: () => done(false),
        actions: [
          { label: opts.cancelLabel || 'Cancel', kind: 'ghost', onClick: () => done(false) },
          { label: opts.confirmLabel || 'Confirm', kind: opts.danger ? 'danger' : 'primary', onClick: () => done(true) },
        ],
      });
    });
  }

  /* ---------- Toasts ---------- */

  function toast(msg) {
    let host = document.getElementById('toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 2900);
  }

  GN.util = {
    esc, uid, shuffle, randInt, fmtTime, ordinal, openModal, confirmDialog, toast,
    modalOpen: () => modalStack.length > 0,
  };
})();
