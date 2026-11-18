/* ui.js — outils d'interface : DOM, messages, fenêtres, icônes, canevas d'écriture. */
(function (root) {
  'use strict';
  const doc = root.document;
  const UI = {};

  // Element.append(null) écrirait le texte « null » à l'écran : on ignore null, undefined et false (comme h()).
  // Ainsi un champ vide (pas d'exemple, pas de pinyin…) n'affiche jamais rien de parasite.
  if (root.Element && root.Element.prototype && root.Element.prototype.append) {
    const nativeAppend = root.Element.prototype.append;
    root.Element.prototype.append = function () {
      return nativeAppend.apply(this, Array.prototype.filter.call(arguments, k => k !== null && k !== undefined && k !== false));
    };
  }

  /* ---------- DOM ---------- */
  function appendKids(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(k => appendKids(el, k)); return; }
    el.appendChild(kid.nodeType ? kid : doc.createTextNode(String(kid)));
  }

  UI.h = function h(tag, props) {
    const el = doc.createElement(tag);
    if (props) {
      Object.keys(props).forEach(k => {
        const v = props[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'value') el.value = v;
        else if (k.length > 2 && k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      });
    }
    for (let i = 2; i < arguments.length; i++) appendKids(el, arguments[i]);
    return el;
  };
  const h = UI.h;

  UI.zh = (text, cls) => h('span', { class: 'zh' + (cls ? ' ' + cls : ''), lang: 'zh-Hans' }, text);
  UI.clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  UI.today = () => Core.addDays(Core.isoLocal(new Date()), Store.getSetting('dayOffset', 0));
  UI.setFocus = on => { doc.body.classList.toggle('focus', !!on); };

  let idSeq = 0;
  UI.id = () => 'f' + (++idSeq);

  // Texte avec le mot surligné (renvoie des nœuds).
  UI.highlight = (text, needle) => Core.splitHighlight(text, needle).map(p => (p.hit ? h('mark', null, p.t) : p.t));

  /* ---------- Icônes (SVG statiques) ---------- */
  const S = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">';
  const ICONS = {
    chevL: S + '<path d="M15 5l-7 7 7 7"/></svg>',
    chevR: S + '<path d="M9 5l7 7-7 7"/></svg>',
    close: S + '<path d="M6 6l12 12M18 6L6 18"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" focusable="false"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    home: S + '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
    book: S + '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/></svg>',
    sliders: S + '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    undo: S + '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-4"/></svg>',
    trash: S + '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
    check: S + '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    pen: S + '<path d="M4 20l1-4L16 5l3 3L8 19z"/></svg>',
    paper: S + '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/></svg>',
    plus: S + '<path d="M12 5v14M5 12h14"/></svg>',
    speaker: S + '<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" focusable="false"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" focusable="false"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" focusable="false"><rect x="5" y="5" width="2.6" height="14" rx="1"/><path d="M19 5.5v13L9.5 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" focusable="false"><rect x="16.4" y="5" width="2.6" height="14" rx="1"/><path d="M5 5.5v13L14.5 12z"/></svg>',
    repeat: S + '<path d="M4 11V9a3 3 0 0 1 3-3h11"/><path d="M15 3l3 3-3 3"/><path d="M20 13v2a3 3 0 0 1-3 3H6"/><path d="M9 21l-3-3 3-3"/></svg>',
    headphones: S + '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
    shuffle: S + '<path d="M4 7h3.5a4 4 0 0 1 3.2 1.6l3.6 4.8a4 4 0 0 0 3.2 1.6H20"/><path d="M4 17h3.5a4 4 0 0 0 3.2-1.6"/><path d="M14.5 8.6A4 4 0 0 1 17.7 7H20"/><path d="M18 4.5L20.5 7 18 9.5"/><path d="M18 14.5l2.5 2.5-2.5 2.5"/></svg>',
    grid: S + '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16M4 12h16"/></svg>',
    eye: S + '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>'
  };
  UI.icon = name => {
    const s = doc.createElement('span');
    s.className = 'ico';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  };
  const icon = UI.icon;

  /* ---------- Messages ---------- */
  UI.toast = function (msg, kind) {
    const box = doc.getElementById('toasts');
    if (!box) return;
    // un seul message à la fois : le nouveau remplace les précédents (pas de pile de messages)
    Array.from(box.children).forEach(old => { if (old.parentNode) old.parentNode.removeChild(old); });
    const t = h('div', { class: 'toast' + (kind ? ' ' + kind : ''), role: 'status' }, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2800);
  };

  /* ---------- Fenêtres (jamais alert/confirm du navigateur) ---------- */
  UI.confirm = function (message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const box = doc.getElementById('dialog-root');
      let done = false;
      const onKey = e => { if (e.key === 'Escape') close(false); };
      const close = v => {
        if (done) return;
        done = true;
        doc.removeEventListener('keydown', onKey);
        box.classList.remove('open');
        UI.clear(box);
        resolve(v);
      };
      doc.addEventListener('keydown', onKey);
      UI.clear(box);
      box.append(
        h('div', { class: 'scrim', onclick: () => close(false) }),
        h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
          h('p', { class: 'dialog-msg' }, message),
          opts.detail ? h('p', { class: 'muted small' }, opts.detail) : null,
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', onclick: () => close(false) }, opts.cancel || 'Annuler'),
            h('button', { class: 'btn ' + (opts.danger ? 'danger-fill' : 'primary'), onclick: () => close(true) }, opts.ok || 'Confirmer'))));
      box.classList.add('open');
    });
  };

  UI.sheet = function (title, content, opts) {
    opts = opts || {};
    const box = doc.getElementById('sheet-root');
    let closed = false;
    const onKey = e => { if (e.key === 'Escape') close(); };
    const close = () => {
      if (closed) return;
      closed = true;
      doc.removeEventListener('keydown', onKey);
      box.classList.remove('open');
      UI.clear(box);
      if (opts.onClose) opts.onClose();
    };
    doc.addEventListener('keydown', onKey);
    UI.clear(box);
    box.append(
      h('div', { class: 'scrim', onclick: close }),
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'sheet-head' },
          h('h2', null, title),
          h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: close }, icon('close'))),
        h('div', { class: 'sheet-body' }, content)));
    box.classList.add('open');
    return { close: close };
  };

  /* ---------- Composants ---------- */
  UI.pageHead = function (o) {
    return h('header', { class: 'head' },
      o.back ? h('button', { class: 'icon-btn', 'aria-label': 'Retour', onclick: o.back }, icon('chevL')) : null,
      h('div', { class: 'head-text' }, h('h1', null, o.title), o.sub ? h('p', { class: 'sub' }, o.sub) : null),
      o.actions ? h('div', { class: 'head-actions' }, o.actions) : null);
  };

  UI.focusTop = function (o) {
    return h('div', { class: 'focus-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Quitter', onclick: o.onQuit }, icon('close')),
      h('div', { class: 'focus-title' }, o.title),
      o.right ? h('div', { class: 'focus-right' }, o.right) : null);
  };

  UI.bar = (ratio, over) => h('div', { class: 'bar' + (over ? ' over' : ''), role: 'presentation' },
    h('i', { style: { width: Math.max(0, Math.min(1, ratio || 0)) * 100 + '%' } }));

  UI.field = function (label, control, hint) {
    const id = UI.id();
    if (control.setAttribute && !control.id && /^(INPUT|TEXTAREA|SELECT)$/.test(control.tagName)) control.id = id;
    return h('div', { class: 'field' },
      h('label', { class: 'lbl', for: control.id || id }, label),
      control,
      hint ? h('p', { class: 'hint' }, hint) : null);
  };

  // Boutons exclusifs : options = [{ value, label }]
  UI.seg = function (options, value, onChange) {
    const wrap = h('div', { class: 'seg', role: 'group' });
    function draw(v) {
      UI.clear(wrap);
      options.forEach(o => wrap.appendChild(h('button', {
        type: 'button', class: 'seg-btn', 'aria-pressed': String(o.value === v),
        onclick: () => { draw(o.value); onChange(o.value); }
      }, o.label)));
    }
    draw(value);
    return wrap;
  };

  UI.empty = function (title, text, actions) {
    return h('div', { class: 'empty' }, h('h2', null, title), text ? h('p', { class: 'muted' }, text) : null,
      actions ? h('div', { class: 'stack' }, actions) : null);
  };

  /* ---------- Canevas d'écriture (stylet ou doigt) ---------- */
  class InkPad {
    constructor(host, opts) {
      opts = opts || {};
      this.host = host;
      this.strokes = [];
      this.cur = null;
      this.readOnly = false;
      this.penOnly = !!opts.penOnly;
      this.onChange = opts.onChange || null;
      this.w = 0; this.h = 0; this.dpr = 0;
      this.canvas = doc.createElement('canvas');
      this.canvas.className = 'ink';
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', 'Zone d’écriture');
      host.appendChild(this.canvas);
      this.ctx = this.canvas.getContext ? this.canvas.getContext('2d') : null;
      this._bind();
      this._resize();
      if (root.ResizeObserver) { this.ro = new root.ResizeObserver(() => this._resize()); this.ro.observe(host); }
      else { this._onWin = () => this._resize(); root.addEventListener('resize', this._onWin); }
      if (root.requestAnimationFrame) this.raf = root.requestAnimationFrame(() => this._resize());
    }

    _bind() {
      const cv = this.canvas;
      cv.addEventListener('pointerdown', e => {
        if (this.readOnly || this.cur) return;
        if (e.pointerType === 'touch' && this.penOnly) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ }
        this.cur = { type: e.pointerType, pts: [], id: e.pointerId, drawn: 1 };
        this._add(e);
        this._dot(this.cur);
      });
      cv.addEventListener('pointermove', e => {
        if (!this.cur || e.pointerId !== this.cur.id) return;
        e.preventDefault();
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
        (evs && evs.length ? evs : [e]).forEach(ev => this._add(ev));
        this._drawNew();
      });
      const end = e => {
        if (!this.cur || e.pointerId !== this.cur.id) return;
        this.strokes.push(this.cur);
        this.cur = null;
        this._changed();
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('contextmenu', e => e.preventDefault());
    }

    _add(ev) {
      const r = this.canvas.getBoundingClientRect();
      this.cur.pts.push({ x: ev.clientX - r.left, y: ev.clientY - r.top, p: ev.pressure || 0 });
    }

    _color() { return root.getComputedStyle ? root.getComputedStyle(this.canvas).color : '#000'; }
    _width(p, type) { return type === 'pen' ? 2.4 + 3.6 * (p > 0 ? p : 0.5) : 3.6; }

    _dot(s) {
      const c = this.ctx; if (!c) return;
      const p = s.pts[0];
      c.fillStyle = this._color();
      c.beginPath(); c.arc(p.x, p.y, this._width(p.p, s.type) / 2, 0, Math.PI * 2); c.fill();
    }

    _seg(a, b, type) {
      const c = this.ctx; if (!c) return;
      c.strokeStyle = this._color(); c.lineCap = 'round'; c.lineJoin = 'round';
      c.lineWidth = this._width((a.p + b.p) / 2, type);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }

    _drawNew() {
      const s = this.cur;
      for (let i = Math.max(1, s.drawn); i < s.pts.length; i++) this._seg(s.pts[i - 1], s.pts[i], s.type);
      s.drawn = s.pts.length;
    }

    _redraw() {
      const c = this.ctx; if (!c) return;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      this.strokes.forEach(s => {
        if (s.pts.length === 1) this._dot(s);
        else for (let i = 1; i < s.pts.length; i++) this._seg(s.pts[i - 1], s.pts[i], s.type);
      });
    }

    _resize() {
      const r = this.host.getBoundingClientRect();
      const dpr = root.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height));
      if (w === this.w && hh === this.h && dpr === this.dpr) return;
      this.w = w; this.h = hh; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(hh * dpr);
      this._redraw();
    }

    _changed() { if (this.onChange) this.onChange(this.hasInk()); }

    hasInk() { return this.strokes.length > 0 || !!this.cur; }
    undo() { if (this.readOnly) return; this.strokes.pop(); this._redraw(); this._changed(); }
    clear() { if (this.readOnly) return; this.strokes = []; this._redraw(); this._changed(); }
    setReadOnly(v) { this.readOnly = !!v; this.host.classList.toggle('readonly', !!v); }
    setPenOnly(v) { this.penOnly = !!v; }
    destroy() {
      if (this.ro) this.ro.disconnect();
      if (this._onWin) root.removeEventListener('resize', this._onWin);
      if (this.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(this.raf);
      if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    }
  }
  UI.InkPad = InkPad;

  root.UI = UI;
})(typeof self !== 'undefined' ? self : this);
