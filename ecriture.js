/* ecriture.js — caractères : ordre des traits animé, écrire à la main (le trait est vérifié),
   fiche caractère (mes composants), « Écrire de mémoire ».
   Règle de la maison : le site ne donne pas le caractère avant que tu aies essayé ; après deux erreurs
   sur un trait, tu peux demander à le voir. Les composants, sens et sons sont ceux que tu saisis. */
(function (root) {
  'use strict';
  const h = UI.h, zh = UI.zh, icon = UI.icon;
  const doc = root.document;
  const Views = root.Views = root.Views || {};
  const U = Views.util;
  const plural = U.plural;
  const enc = encodeURIComponent;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const fresh = w => Store.words.get(w.id) || w;
  const maybeZh = t => (Core.hasCJK(t) ? zh(t) : t);
  const charsMap = () => Store.getSetting('chars', {});
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const seqOf = hanzi => Array.from(hanzi || '').filter(Core.isHan);   // avec les répétitions (妈妈 → 妈, 妈)

  function s(tag, attrs, kids) {
    const el = doc.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(k => { if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, String(attrs[k])); });
    (kids || []).forEach(k => el.appendChild(k));
    return el;
  }

  /* ------------------------------------------------------------------ */
  /* La zone de tracé : regarder, tracer, écrire de mémoire              */
  /* ------------------------------------------------------------------ */
  let boardSeq = 0;

  class Board {
    // opts : { mode, penOnly, onStroke(ev), onDone(res), onState(st) }
    constructor(host, data, opts) {
      opts = opts || {};
      this.host = host; this.data = data; this.n = data.strokes.length;
      this.uid = 'bd' + (++boardSeq);
      this.mode = 'watch'; this.speed = 1; this.numbers = false; this.radical = false;
      this.penOnly = !!opts.penOnly;
      this.onStroke = opts.onStroke || null; this.onDone = opts.onDone || null; this.onState = opts.onState || null;
      this.len = data.medians.map(m => Strokes.pathLength(m));
      this.token = 0; this.pending = []; this.raf = 0; this.cur = null;
      this.busy = false; this.playing = false; this.finished = false;
      this.idx = 0; this.strokeMisses = 0; this.misses = 0; this.hints = 0;
      this.done = new Set();
      this._build();
      this._bind();
      this.setMode(opts.mode || 'watch');
    }

    _build() {
      const d = this.data, svg = this.svg = s('svg', { viewBox: '0 0 1024 1024', class: 'board-svg', focusable: 'false', role: 'img', 'aria-label': 'Zone de tracé' });
      svg.appendChild(s('rect', { x: 6, y: 6, width: 1012, height: 1012, class: 'bd-frame' }));
      ['M512 6V1018', 'M6 512H1018', 'M6 6L1018 1018', 'M1018 6L6 1018'].forEach(p => svg.appendChild(s('path', { d: p, class: 'bd-grid' })));
      const defs = s('defs'), g = s('g', { transform: Strokes.GLYPH_TRANSFORM, class: 'bd-glyph' });
      const gGhost = s('g'), gStr = s('g');
      this.fill = []; this.reveal = [];
      d.strokes.forEach((path, i) => {
        const cid = this.uid + 'c' + i, Lp = this.len[i] + 2;
        defs.appendChild(s('clipPath', { id: cid }, [s('path', { d: path })]));
        gGhost.appendChild(s('path', { d: path, class: 'bd-ghost' }));
        const fp = s('path', { d: path, class: 'bd-fill' + (d.radStrokes.indexOf(i) >= 0 ? ' rad' : ''), 'data-stroke': i });
        const rp = s('path', {
          d: Strokes.medianD(d.medians[i]), class: 'bd-reveal', 'clip-path': 'url(#' + cid + ')', fill: 'none',
          'stroke-width': 280, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          'stroke-dasharray': Lp + ' ' + Lp, 'stroke-dashoffset': Lp
        });
        gStr.appendChild(fp); gStr.appendChild(rp);
        this.fill.push(fp); this.reveal.push(rp);
      });
      g.appendChild(gGhost); g.appendChild(gStr);
      this.nums = s('g', { class: 'bd-nums' });
      this.ink = s('path', { class: 'bd-ink', d: '' });
      svg.appendChild(defs); svg.appendChild(g); svg.appendChild(this.nums); svg.appendChild(this.ink);
      this.host.appendChild(svg);
    }

    /* --- état d'un trait --- */
    _show(i) { this.fill[i].style.opacity = '1'; this._hideReveal(i); this.done.add(i); }
    _hide(i) { this.fill[i].style.opacity = '0'; this._hideReveal(i); this.done.delete(i); }
    _hideReveal(i) {
      const el = this.reveal[i];
      el.style.opacity = '0'; el.classList.remove('hinting');
      el.setAttribute('stroke-dashoffset', String(this.len[i] + 2));
    }

    _cancel() {
      this.token++;
      if (this.raf) { root.cancelAnimationFrame(this.raf); this.raf = 0; }
      const list = this.pending; this.pending = [];
      list.forEach(p => { if (p.timer) clearTimeout(p.timer); p.resolve(false); });
      this.busy = false; this.playing = false;
      for (let i = 0; i < this.n; i++) if (!this.done.has(i)) this._hideReveal(i);
    }

    _sleep(ms) {
      return new Promise(resolve => {
        if (ms <= 0 || reduced()) return resolve(true);
        const p = { resolve: resolve, timer: setTimeout(() => { this.pending = this.pending.filter(x => x !== p); resolve(true); }, ms) };
        this.pending.push(p);
      });
    }

    // Dessine le trait i en `ms` millisecondes. preview : on le laisse visible (indice), sans le compter comme écrit.
    _anim(i, ms, preview) {
      return new Promise(resolve => {
        const el = this.reveal[i], Lp = this.len[i] + 2;
        el.classList.toggle('hinting', !!preview);
        el.style.opacity = '1';
        this.fill[i].style.opacity = '0';
        const end = () => { if (!preview) this._show(i); resolve(true); };
        if (ms <= 0 || reduced()) { el.setAttribute('stroke-dashoffset', '0'); end(); return; }
        el.setAttribute('stroke-dashoffset', String(Lp));
        const p = { resolve: resolve };
        this.pending.push(p);
        const t0 = root.performance.now();
        const step = now => {
          const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          el.setAttribute('stroke-dashoffset', String(Lp * (1 - e)));
          if (k < 1) this.raf = root.requestAnimationFrame(step);
          else { this.pending = this.pending.filter(x => x !== p); this.raf = 0; end(); }
        };
        this.raf = root.requestAnimationFrame(step);
      });
    }

    _dur(i) { return (260 + this.len[i] * 0.9) / this.speed; }

    /* --- numéros d'ordre (sur les traits déjà visibles) --- */
    _renderNums() {
      while (this.nums.firstChild) this.nums.removeChild(this.nums.firstChild);
      if (!this.numbers) return;
      const m = this.data.medians;
      for (let i = 0; i < this.n; i++) {
        if (!this.done.has(i)) continue;
        const a = m[i][0], b = m[i][1];
        let dx = b[0] - a[0], dy = -(b[1] - a[1]); const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;   // direction en repère écran
        const p = Strokes.toScreen(a[0], a[1]);
        const x = Math.max(44, Math.min(980, p[0] - dx * 52)), y = Math.max(44, Math.min(980, p[1] - dy * 52));
        this.nums.appendChild(s('g', { class: 'bd-num' }, [s('circle', { cx: x, cy: y, r: 34 }), (() => { const t = s('text', { x: x, y: y }); t.textContent = String(i + 1); return t; })()]));
      }
    }

    _emit() {
      const st = this.state();
      this.host.setAttribute('data-mode', st.mode);
      this.host.setAttribute('data-idx', st.idx);
      this.host.setAttribute('data-n', st.n);
      this.host.setAttribute('data-misses', st.misses);
      this.host.setAttribute('data-hints', st.hints);
      this.host.setAttribute('data-finished', st.finished ? '1' : '0');
      if (this.onState) this.onState(st);
    }

    state() {
      return {
        mode: this.mode, idx: this.idx, n: this.n, misses: this.misses, hints: this.hints,
        strokeMisses: this.strokeMisses, finished: this.finished, playing: this.playing, busy: this.busy
      };
    }

    /* --- réglages --- */
    setMode(mode) {
      this.mode = mode;
      this.svg.classList.toggle('no-ghost', mode === 'memory');
      this.svg.classList.toggle('inputs', mode !== 'watch');
      this.reset();
    }
    reset() {
      this._cancel();
      this._clearInk();
      this.idx = 0; this.strokeMisses = 0; this.misses = 0; this.hints = 0; this.finished = false;
      this.svg.classList.remove('is-done');
      for (let i = 0; i < this.n; i++) { if (this.mode === 'watch') this._show(i); else this._hide(i); }
      this._renderNums();
      this._emit();
    }
    setSpeed(f) { this.speed = f; }
    setNumbers(on) { this.numbers = !!on; this._renderNums(); }
    setRadical(on) { this.radical = !!on; this.svg.classList.toggle('show-rad', this.radical); }

    /* --- regarder : repart d'une page blanche et dessine les traits un à un --- */
    async play() {
      if (this.mode !== 'watch') return;
      this._cancel();
      const my = this.token;
      for (let i = 0; i < this.n; i++) this._hide(i);
      this._renderNums();
      this.playing = true; this._emit();
      for (let i = 0; i < this.n; i++) {
        if (!(await this._anim(i, this._dur(i), false)) || my !== this.token) return;
        this._renderNums();
        if (!(await this._sleep(280 / this.speed)) || my !== this.token) return;
      }
      this.playing = false; this._emit();
    }

    /* --- indice : montre le trait attendu (après deux erreurs, à la demande) --- */
    async hint() {
      if (this.mode === 'watch' || this.finished || this.busy || this.idx >= this.n) return false;
      this._cancel();
      const my = this.token, i = this.idx;
      this.hints++; this.busy = true; this._emit();
      const ok = await this._anim(i, 750 / this.speed, true);
      if (ok && my === this.token) await this._sleep(900);
      if (my !== this.token) return false;
      this._hideReveal(i); this.busy = false; this._emit();
      return true;
    }

    /* --- écrire : le doigt ou le stylet dessine, le trait est vérifié au relâchement --- */
    _bind() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', e => {
        if (this.mode === 'watch' || this.busy || this.finished || this.cur) return;
        if (e.pointerType === 'touch' && this.penOnly) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ }
        this._clearInk();
        this.cur = { id: e.pointerId, pts: [] };
        this._addPt(e); this._drawInk();
      });
      svg.addEventListener('pointermove', e => {
        if (!this.cur || e.pointerId !== this.cur.id) return;
        e.preventDefault();
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
        (evs && evs.length ? evs : [e]).forEach(ev => this._addPt(ev));
        this._drawInk();
      });
      const end = e => {
        if (!this.cur || e.pointerId !== this.cur.id) return;
        const pts = this.cur.pts; this.cur = null;
        this._judge(pts, e.type === 'pointercancel');
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('contextmenu', e => e.preventDefault());
    }

    _addPt(ev) {
      const r = this.svg.getBoundingClientRect();
      this.cur.pts.push([(ev.clientX - r.left) / (r.width || 1) * 1024, (ev.clientY - r.top) / (r.height || 1) * 1024]);
    }
    _drawInk() {
      const pts = this.cur ? this.cur.pts : [];
      this.ink.setAttribute('class', 'bd-ink');
      this.ink.setAttribute('d', Strokes.medianD(pts.length === 1 ? [pts[0], pts[0]] : pts));
    }
    _clearInk() { this.ink.setAttribute('class', 'bd-ink'); this.ink.setAttribute('d', ''); }

    _judge(pts, cancelled) {
      if (cancelled || !pts.length) { this._clearInk(); return; }
      const user = pts.map(p => Strokes.toGlyph(p[0], p[1])), i = this.idx;
      const r = Strokes.matchStroke(user, this.data.medians[i]);
      if (r.ok) {
        this.strokeMisses = 0; this.busy = true; this._clearInk(); this._emit();
        const my = this.token;
        this._anim(i, 220 / this.speed, false).then(ok => {
          if (!ok || my !== this.token) return;
          this.busy = false; this.idx = i + 1; this._renderNums();
          if (this.idx >= this.n) this._finish();
          this._emit();
          if (this.onStroke) this.onStroke({ ok: true, idx: i, n: this.n, last: this.idx >= this.n });
        });
        return;
      }
      if (r.why === 'court') {   // un effleurement : on ne compte pas d'erreur
        this._clearInk();
        if (this.onStroke) this.onStroke({ ok: false, why: 'court', idx: i, n: this.n, counted: false, strokeMisses: this.strokeMisses });
        return;
      }
      const other = Strokes.findOther(user, this.data.medians, this.done, i);
      this.strokeMisses++; this.misses++;
      this.ink.setAttribute('class', 'bd-ink bad');
      setTimeout(() => { if (!this.cur) this._clearInk(); }, 380);
      this._emit();
      if (this.onStroke) this.onStroke({ ok: false, why: r.why, other: other, idx: i, n: this.n, counted: true, strokeMisses: this.strokeMisses });
    }

    _finish() {
      this.finished = true;
      this.svg.classList.add('is-done');
      if (this.onDone) this.onDone({ misses: this.misses, hints: this.hints, n: this.n, clean: !this.misses && !this.hints });
    }

    destroy() {
      this._cancel();
      if (this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    }
  }

  U.Board = Board;

  // Message sous la zone de tracé après un trait refusé.
  function missText(ev) {
    if (ev.why === 'court') return 'Trait trop court : recommence.';
    if (ev.other >= 0) return 'Ce trait existe dans le caractère, mais ce n’est pas le prochain. Revois l’ordre.';
    if (ev.why === 'sens') return 'Bonne forme, mais dans l’autre sens.';
    return 'Pas tout à fait. Réessaie.';
  }

  /* ------------------------------------------------------------------ */
  /* Téléchargement des tracés (une seule fois, avec ton accord)          */
  /* ------------------------------------------------------------------ */
  function explainErrors(errors) {
    const label = id => { const so = Strokes.SOURCES.find(x => x.id === id); return so ? so.label : id; };
    const nice = m => /failed to fetch|networkerror|load failed|network request/i.test(m) ? 'réseau coupé ou site bloqué'
      : /^HTTP 403/.test(m) ? 'accès refusé (403)' : m;
    return Object.keys(errors || {}).map(id => label(id) + ' : ' + nice(String(errors[id])));
  }

  async function downloadFlow(chars, onDone) {
    const need = Array.from(new Set(chars)).filter(c => Strokes.status(c) === 'none');
    if (!need.length) { UI.toast('Les tracés sont déjà sur ton téléphone.'); if (onDone) onDone(); return; }
    const go = await UI.confirm('Télécharger les tracés de ' + plural(need.length, 'caractère', 'caractères') + ' ?', {
      detail: 'L’appli demande chaque caractère à un serveur public (jsDelivr, ou un miroir si besoin). Aucun autre texte n’est envoyé : ni tes mots, ni tes phrases. Ensuite, les tracés restent sur ton téléphone et marchent hors ligne.',
      ok: 'Télécharger'
    });
    if (!go) return;
    const ctl = { aborted: false };
    let closed = false;
    const fillEl = h('i', { style: { width: '0%' } });
    const line = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, 'Connexion…');
    const body = h('div', { class: 'form' }, line, h('div', { class: 'bar', role: 'presentation' }, fillEl),
      h('button', { class: 'btn block', onclick: () => { ctl.aborted = true; } }, 'Arrêter'));
    const sheet = UI.sheet('Téléchargement des tracés', body, { onClose: () => { closed = true; ctl.aborted = true; } });
    let out;
    try {
      out = await Strokes.download(need, {
        signal: ctl,
        onProgress: (d, t) => { fillEl.style.width = Math.round(d / t * 100) + '%'; line.textContent = d + ' sur ' + t + ' caractères'; }
      });
    } catch (e) { out = { total: need.length, ok: [], missing: [], failed: need, errors: { erreur: String(e && e.message || e) }, stopped: true }; }
    if (closed) { if (onDone) onDone(); return; }
    UI.clear(body);
    const left = need.length - out.ok.length - out.missing.length - out.failed.length;
    const retry = out.failed.length > 0 || left > 0;
    body.append(
      out.ok.length ? h('p', { class: 'note-good' }, plural(out.ok.length, 'caractère téléchargé', 'caractères téléchargés') + '.') : null,
      out.missing.length ? h('p', { class: 'muted' }, 'Pas de tracé dans les données pour : ', out.missing.map(c => zh(c)), '.') : null,
      retry ? h('div', { class: 'stack' },
        h('p', { class: 'note-warn' }, plural(out.failed.length + Math.max(0, left), 'caractère n’a pas été téléchargé', 'caractères n’ont pas été téléchargés') + '. Vérifie ta connexion, puis réessaie.'),
        explainErrors(out.errors).map(t => h('p', { class: 'hint' }, t))) : null,
      retry ? h('button', { class: 'btn primary block', onclick: () => { sheet.close(); downloadFlow(chars, onDone); } }, 'Réessayer') : null,
      h('button', { class: retry ? 'btn block' : 'btn primary block', onclick: () => { sheet.close(); if (onDone) onDone(); } }, 'Fermer'));
  }
  U.downloadStrokes = downloadFlow;

  /* ------------------------------------------------------------------ */
  /* Rangées de la page « leçon » et de l'atelier                         */
  /* ------------------------------------------------------------------ */
  const charsUrl = id => '/lecon/' + enc(id) + '/caracteres';
  const memoireUrl = id => '/lecon/' + enc(id) + '/memoire';
  const hasStrokes = c => Strokes.status(c) === 'ready';

  function writingSummary(id) {
    const words = Store.wordsOf(id), list = Core.lessonChars(words);
    const ready = list.filter(x => hasStrokes(x.ch)).length;
    const info = Core.memoireInfo(words, hasStrokes);
    return { list: list, ready: ready, info: info, words: words };
  }

  U.writingRows = function (ctx, id) {
    const sm = writingSummary(id);
    const row = (ic, title, text, enabled, path) => h('button', { class: 'row' + (enabled ? '' : ' off'), disabled: !enabled, onclick: () => ctx.go(path) },
      h('span', { class: 'num' }, icon(ic)),
      h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub' }, text)),
      h('span', { class: 'row-end' }, icon('chevR')));
    const info = sm.info;
    const memText = !info.total ? 'Ajoute d’abord des mots 生词.'
      : info.ready ? plural(info.ready, 'mot prêt', 'mots prêts') + (info.written ? ', ' + info.written + ' déjà écrit' + (info.written > 1 ? 's' : '') : '') + '.'
        : info.noStrokes ? 'Télécharge d’abord les tracés (écran « Caractères »).' : 'Ces mots n’ont ni pinyin, ni sens, ni définition.';
    return [
      row('grid', 'Caractères et tracés', sm.list.length ? plural(sm.list.length, 'caractère', 'caractères') + ', tracés : ' + sm.ready + ' / ' + sm.list.length + '.' : 'Ajoute d’abord des mots.', sm.list.length > 0, charsUrl(id)),
      row('pen', 'Écrire de mémoire', memText, info.ready > 0, memoireUrl(id))
    ];
  };

  // Bloc de la page « Atelier » (onglet).
  U.writingBlock = function (ctx, lesson) {
    const sm = writingSummary(lesson.id);
    return h('section', { class: 'block' }, h('h2', null, 'Écrire à la main'),
      h('p', { class: 'muted' }, sm.list.length
        ? plural(sm.list.length, 'caractère', 'caractères') + ' dans la leçon, tracés téléchargés : ' + sm.ready + ' / ' + sm.list.length + '.'
        : 'Ajoute des mots à la leçon pour voir leurs caractères.'),
      h('div', { class: 'stack-h' },
        h('button', { class: 'btn block', disabled: !sm.list.length, onclick: () => ctx.go(charsUrl(lesson.id)) }, icon('grid'), 'Caractères'),
        h('button', { class: 'btn primary block', disabled: !sm.info.ready, onclick: () => ctx.go(memoireUrl(lesson.id)) }, icon('pen'), 'De mémoire')));
  };

  /* Réglages : tracés téléchargés sur ce téléphone. */
  U.strokeSettings = function (ctx) {
    const n = Strokes.count();
    return [h('section', { class: 'settings-group' }, h('h2', null, 'Tracés des caractères'),
      h('p', { class: 'mono-note' }, n
        ? plural(n, 'caractère téléchargé', 'caractères téléchargés') + ' sur ce téléphone. Ils ne font pas partie de la sauvegarde JSON : on peut les télécharger de nouveau.'
        : 'Aucun tracé téléchargé. Ils s’obtiennent depuis l’écran « Caractères » d’une leçon.'),
      h('button', { class: 'btn block', onclick: () => {
        const all = [];
        Store.allLessons().forEach(l => Core.lessonChars(Store.wordsOf(l.id)).forEach(x => all.push(x.ch)));
        if (!all.length) { UI.toast('Aucune leçon n’a encore de mots.', 'warn'); return; }
        downloadFlow(all, () => ctx.refresh());
      } }, 'Télécharger les tracés de toutes mes leçons'),
      n ? h('button', { class: 'btn block danger', onclick: async () => {
        if (!(await UI.confirm('Supprimer les tracés téléchargés ?', { detail: 'Tes fiches et tes résultats restent. Tu pourras télécharger les tracés de nouveau.', ok: 'Supprimer', danger: true }))) return;
        await Strokes.clear(); ctx.refresh(); UI.toast('Tracés supprimés');
      } }, 'Supprimer les tracés téléchargés') : null)];
  };

  /* ------------------------------------------------------------------ */
  /* Caractères d'une leçon                                               */
  /* ------------------------------------------------------------------ */
  Views.chars = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const sm = writingSummary(lessonId), map = charsMap();
    ctx.root.append(UI.pageHead({ title: 'Caractères', sub: U.lessonName(lesson), back: () => ctx.go('/lecon/' + lessonId) }));
    if (!sm.list.length) {
      ctx.root.append(UI.empty('Aucun caractère', 'Ajoute des mots à cette leçon : leurs caractères apparaissent ici.',
        h('button', { class: 'btn primary', onclick: () => ctx.go('/lecon/' + lessonId + '/ajout') }, 'Ajouter des mots')));
      return;
    }
    const todo = sm.list.filter(x => Strokes.status(x.ch) === 'none').map(x => x.ch);
    ctx.root.append(h('dl', { class: 'stats two' },
      h('div', null, h('dt', null, 'Caractères'), h('dd', null, String(sm.list.length))),
      h('div', null, h('dt', null, 'Tracés sur le téléphone'), h('dd', null, sm.ready + ' / ' + sm.list.length))));
    if (todo.length) {
      ctx.root.append(h('div', { class: 'stack', style: { margin: '12px 0' } },
        h('button', { class: 'btn primary block', onclick: () => downloadFlow(todo, () => ctx.refresh()) }, 'Télécharger les tracés (' + todo.length + ')'),
        h('p', { class: 'hint' }, 'Une seule fois : ensuite l’ordre des traits marche hors ligne.')));
    } else if (sm.info.ready) {
      ctx.root.append(h('button', { class: 'btn primary block', style: { margin: '12px 0' }, onclick: () => ctx.go(memoireUrl(lessonId)) }, icon('pen'), 'Écrire de mémoire'));
    }
    const rows = h('div', { class: 'rows' });
    sm.list.forEach(x => {
      const e = Core.charEntry(map, x.ch), st = Strokes.status(x.ch);
      const bits = [plural(x.count, 'mot', 'mots')];
      if (e.comps.length) bits.push('composants notés');
      if (e.w.n) bits.push('écrit ' + e.w.n + '×');
      rows.append(h('button', { class: 'row', style: { minHeight: '66px' }, onclick: () => ctx.go('/caractere/' + enc(x.ch) + '?lesson=' + enc(lessonId)) },
        h('span', { class: 'cell sm-cell zh', lang: 'zh-Hans' }, x.ch),
        h('div', { class: 'row-main' }, h('span', { class: 'row-title zh', lang: 'zh-Hans' }, x.words.slice(0, 3).join('　')), h('span', { class: 'row-sub' }, bits.join(' · '))),
        h('span', { class: 'row-end' }, st === 'ready' ? h('span', { class: 'tag' }, 'tracé') : st === 'missing' ? h('span', { class: 'tag red' }, 'introuvable') : h('span', { class: 'tag soft' }, 'à télécharger'), icon('chevR'))));
    });
    ctx.root.append(h('section', { class: 'block' }, h('h2', null, 'Caractères de la leçon'), rows));
  };

  /* ------------------------------------------------------------------ */
  /* Fiche d'un composant (création et modification)                      */
  /* ------------------------------------------------------------------ */
  function openCompSheet(init, onSave, onDelete) {
    init = init || {};
    const st = { role: init.role || 'sens' };
    const inp = h('input', { class: 'inp zh', lang: 'zh-Hans', type: 'text', maxlength: '6', 'aria-label': 'Composant', placeholder: '氵', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const note = h('textarea', { class: 'inp', rows: '2', 'aria-label': 'Précision', autocomplete: 'off', spellcheck: 'false' });
    const ex = h('input', { class: 'inp zh', lang: 'zh-Hans', type: 'text', maxlength: '12', 'aria-label': 'Caractère connu avec le même composant', placeholder: '河', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    inp.value = init.c || ''; note.value = init.note || ''; ex.value = init.ex || '';
    const noteLbl = h('label', { class: 'lbl' });
    const labels = { sens: 'Ce qu’il veut dire (facultatif)', son: 'Comment il se lit (facultatif)', autre: 'Remarque (facultative)' };
    const sync = () => { noteLbl.textContent = labels[st.role]; };
    sync();
    let sheet;
    sheet = UI.sheet(init.c ? 'Modifier le composant' : 'Ajouter un composant', h('div', { class: 'form' },
      UI.field('Composant', inp),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Rôle dans le caractère'),
        UI.seg(Core.COMP_ROLES.map(r => ({ value: r.id, label: r.label })), st.role, v => { st.role = v; sync(); })),
      h('div', { class: 'field' }, noteLbl, note),
      UI.field('Un caractère que je connais avec le même composant (facultatif)', ex),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary block', onclick: () => {
          const c = Core.cleanComp({ c: inp.value, role: st.role, note: note.value, ex: ex.value });
          if (!c) { UI.toast('Écris le composant.', 'warn'); inp.focus(); return; }
          sheet.close(); onSave(c);
        } }, 'Enregistrer'),
        onDelete ? h('button', { class: 'btn block danger', onclick: async () => {
          if (!(await UI.confirm('Supprimer ce composant ?', { ok: 'Supprimer', danger: true }))) return;
          sheet.close(); onDelete();
        } }, 'Supprimer ce composant') : null)));
    setTimeout(() => { try { inp.focus(); } catch (e) { /* sans importance */ } }, 80);
  }

  /* ------------------------------------------------------------------ */
  /* Fiche d'un caractère                                                 */
  /* ------------------------------------------------------------------ */
  Views.charPage = function (ctx, ch) {
    if (Array.from(ch).length !== 1 || !Core.isHan(ch)) return U.notFound(ctx);
    const lessonId = ctx.query.lesson && Store.lessons.has(ctx.query.lesson) ? ctx.query.lesson : '';
    const linkTo = x => '/caractere/' + enc(x) + (lessonId ? '?lesson=' + enc(lessonId) : '');
    ctx.root.append(UI.pageHead({
      title: zh(ch, 'zh-xl'), sub: 'Caractère',
      back: () => ctx.go(lessonId ? '/lecon/' + lessonId + '/caracteres' : '/atelier'),
      actions: U.speakBtn(ch)
    }));

    /* ----- ordre des traits ----- */
    const boardBox = h('section', { class: 'block' });
    ctx.root.append(boardBox);
    let board = null, mode = 'watch', pinned = false;
    ctx.onLeave(() => { if (board) board.destroy(); });

    function drawBoard() {
      if (board) { board.destroy(); board = null; }
      UI.clear(boardBox);
      boardBox.append(h('h2', null, 'Ordre des traits'));
      const st = Strokes.status(ch), data = Strokes.get(ch);
      if (!data) {
        boardBox.append(h('p', { class: 'muted' }, st === 'missing'
          ? 'Les données de tracés n’ont pas ce caractère.' : 'Les tracés de ce caractère ne sont pas encore sur ton téléphone.'),
        st === 'missing' ? null : h('button', { class: 'btn primary block', onclick: () => downloadFlow([ch], drawBoard) }, 'Télécharger les tracés'),
        st === 'missing' ? null : h('p', { class: 'hint' }, 'Une seule fois, avec ton accord. Ensuite, tout marche hors ligne.'));
        return;
      }
      const host = h('div', { class: 'board' });
      const msg = h('p', { class: 'board-msg', role: 'status', 'aria-live': 'polite' });
      const controls = h('div', { class: 'stack' });
      const stat = h('p', { class: 'muted small' });
      const hintBtn = h('button', { class: 'btn block', type: 'button', hidden: true, onclick: () => board.hint() }, icon('eye'), 'Voir ce trait');
      const status = () => {
        const e = Core.charEntry(charsMap(), ch);
        stat.textContent = e.w.n ? 'Écrit de mémoire ' + e.w.n + ' fois, dont ' + e.w.ok + ' sans erreur' + (e.w.last ? ' (dernière fois : ' + Core.formatFr(e.w.last, { weekday: undefined }) + ')' : '') + '.' : '';
      };
      const sayStart = () => {
        msg.hidden = mode === 'watch';
        msg.textContent = mode === 'watch' ? '' : mode === 'trace'
          ? 'Trace le trait 1 sur ' + data.strokes.length + ' avec le doigt ou le stylet.'
          : 'Écris le trait 1 sur ' + data.strokes.length + ', de mémoire.';
      };
      board = new Board(host, data, {
        mode: mode, penOnly: Store.getSetting('penOnly') === true,
        onState: stt => { hintBtn.hidden = !(stt.mode !== 'watch' && !stt.finished && stt.strokeMisses >= 2); hintBtn.disabled = stt.busy; },
        onStroke: ev => {
          if (ev.ok) { if (!ev.last) msg.textContent = 'Bien. Trait ' + (ev.idx + 2) + ' sur ' + ev.n + '.'; return; }
          msg.textContent = missText(ev) + (ev.strokeMisses >= 2 ? ' Tu peux demander à voir ce trait.' : '');
        },
        onDone: res => {
          msg.textContent = res.clean ? 'Caractère écrit sans erreur.' : 'Terminé : ' + plural(res.misses, 'erreur', 'erreurs') + ', ' + plural(res.hints, 'indice', 'indices') + '.';
          if (board.mode === 'memory') { Store.setSetting('chars', Core.bumpCharWrite(charsMap(), ch, res.clean, UI.today())); status(); }
        }
      });
      board.setRadical(pinned); board.setNumbers(false);

      const modeSeg = UI.seg([{ value: 'watch', label: 'Regarder' }, { value: 'trace', label: 'Tracer' }, { value: 'memory', label: 'De mémoire' }], mode, v => {
        mode = v; board.setMode(v); sayStart(); drawControls();
      });
      modeSeg.classList.add('seg-fill');
      const canRad = Core.charEntry(charsMap(), ch).comps.length > 0;
      function drawControls() {
        UI.clear(controls);
        if (mode === 'watch') {
          const chips = h('div', { class: 'chips' },
            h('button', { class: 'chip', type: 'button', 'aria-pressed': String(board.speed < 1), onclick: e => { board.setSpeed(board.speed < 1 ? 1 : 0.55); e.currentTarget.setAttribute('aria-pressed', String(board.speed < 1)); } }, 'Lent'),
            h('button', { class: 'chip', type: 'button', 'aria-pressed': String(board.numbers), onclick: e => { board.setNumbers(!board.numbers); e.currentTarget.setAttribute('aria-pressed', String(board.numbers)); } }, 'Numéros'),
            data.radStrokes.length ? h('button', { class: 'chip', type: 'button', disabled: !canRad, 'aria-pressed': String(pinned), onclick: e => { pinned = !pinned; board.setRadical(pinned); e.currentTarget.setAttribute('aria-pressed', String(pinned)); } }, 'Radical') : null);
          controls.append(
            h('button', { class: 'btn primary block', type: 'button', onclick: () => board.play() }, icon('play'), 'Regarder l’ordre des traits'),
            chips,
            data.radStrokes.length && !canRad ? h('p', { class: 'hint' }, 'Le radical s’affiche après que tu as noté, plus bas, ce que tu vois dans le caractère (Composition) : à toi de chercher d’abord.') : null);
        } else {
          controls.append(hintBtn, h('button', { class: 'btn block', type: 'button', onclick: () => { board.reset(); sayStart(); } }, icon('repeat'), 'Recommencer'));
        }
      }
      sayStart(); drawControls(); status();
      boardBox.append(modeSeg, host, msg, controls, stat);
    }
    drawBoard();

    /* ----- composition : ce que je vois dans le caractère ----- */
    const compBox = h('section', { class: 'block' });
    ctx.root.append(compBox);
    const saveEntry = fn => {
      const e = Core.charEntry(charsMap(), ch); fn(e);
      return Store.setSetting('chars', Core.withChar(charsMap(), ch, e));
    };
    function drawComp() {
      UI.clear(compBox);
      const e = Core.charEntry(charsMap(), ch), map = charsMap();
      compBox.append(h('h2', null, 'Composition'));
      if (!e.comps.length) compBox.append(h('p', { class: 'muted' }, 'Que vois-tu dans ce caractère ? Note le composant qui donne le sens, celui qui donne le son, puis un caractère que tu connais avec le même composant. L’appli ne devine rien : tout vient de toi.'));
      e.comps.forEach((c, i) => {
        const fam = Core.familyOf(map, c.c, ch);
        compBox.append(h('div', { class: 'comp-card' },
          h('div', { class: 'comp-main' }, zh(c.c, 'comp-zh'), h('span', { class: 'tag' }, (Core.COMP_ROLES.find(r => r.id === c.role) || {}).label)),
          c.note ? h('p', null, maybeZh(c.note)) : null,
          c.ex ? h('p', { class: 'muted small' }, 'Je le connais aussi dans : ', maybeZh(c.ex)) : null,
          fam.length ? h('div', { class: 'chips' }, h('span', { class: 'muted small' }, 'Dans mes autres fiches :'),
            fam.map(x => h('button', { class: 'chip sm', type: 'button', onclick: () => ctx.go(linkTo(x)) }, zh(x)))) : null,
          h('button', { class: 'link-btn', type: 'button', onclick: () => openCompSheet(c, async nc => {
            await saveEntry(en => { en.comps[i] = nc; }); drawComp(); drawBoard();
          }, async () => { await saveEntry(en => { en.comps.splice(i, 1); }); drawComp(); drawBoard(); }) }, 'Modifier')));
      });
      compBox.append(h('button', { class: 'btn block', type: 'button', onclick: () => openCompSheet({}, async nc => {
        await saveEntry(en => { en.comps.push(nc); }); drawComp(); drawBoard();
      }) }, icon('plus'), 'Ajouter un composant'));
    }
    drawComp();

    /* ----- mes mots et mes phrases ----- */
    const allWords = Store.allWords();
    const ws = Core.wordsWithChar(allWords, ch), ss = Core.sentencesWithChar(allWords, ch, 5);
    ctx.root.append(
      h('section', { class: 'block' }, h('h2', null, 'Dans mes mots'),
        ws.length ? ws.map(w => h('div', { class: 'word-line' },
          h('span', { class: 'zh word-zh', lang: 'zh-Hans' }, UI.highlight(w.hanzi, ch)),
          h('span', { class: 'muted' }, [w.pinyin, w.fr].filter(Boolean).join(' · ')))) : h('p', { class: 'muted' }, 'Aucun mot enregistré ne contient ce caractère.')),
      h('section', { class: 'block' }, h('h2', null, 'Dans mes phrases'),
        ss.length ? ss.map(x => h('p', { class: 'zh sent-line', lang: 'zh-Hans' }, UI.highlight(x.text, ch)))
          : h('p', { class: 'muted' }, 'Tu n’as pas encore écrit de phrase avec ce caractère.')));
  };

  /* ------------------------------------------------------------------ */
  /* Écrire de mémoire : le sens (ou le pinyin) est donné, tu écris le mot */
  /* ------------------------------------------------------------------ */
  Views.memoire = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const rootEl = ctx.root, lid = lessonId;
    const words = Store.wordsOf(lid), info = Core.memoireInfo(words, hasStrokes);
    const back = () => ctx.go('/lecon/' + lid);
    const queueAll = Core.memoireQueue(words, hasStrokes);

    if (!queueAll.length) {
      const todo = Core.lessonChars(words).filter(x => Strokes.status(x.ch) === 'none').map(x => x.ch);
      rootEl.append(UI.pageHead({ title: 'Écrire de mémoire', sub: U.lessonName(lesson), back: back }),
        !info.total ? UI.empty('Aucun mot à écrire', 'Ajoute des mots 生词 à la leçon.', h('button', { class: 'btn primary', onclick: () => ctx.go('/lecon/' + lid + '/ajout') }, 'Ajouter des mots'))
          : info.noStrokes ? UI.empty('Il manque les tracés', 'Pour vérifier chaque trait, l’appli doit avoir les tracés des caractères. Un téléchargement unique suffit.',
            [todo.length ? h('button', { class: 'btn primary', onclick: () => downloadFlow(todo, () => ctx.refresh()) }, 'Télécharger les tracés (' + todo.length + ')') : null,
              h('button', { class: 'btn', onclick: () => ctx.go(charsUrl(lid)) }, 'Voir les caractères')])
            : UI.empty('Aucun indice pour ces mots', 'Pour t’exercer, chaque mot a besoin d’un pinyin, d’un sens ou d’une définition. Complète leurs fiches.', h('button', { class: 'btn primary', onclick: back }, 'Retour à la leçon')));
      return;
    }

    UI.setFocus(true);
    const SESSION = 5;
    const queue = queueAll.slice(0, SESSION).map(w => w.id);
    let wi = 0, ci = 0, board = null, cur = { misses: 0, hints: 0 };
    const results = [];
    let showPy = Store.getSetting('memoirePinyin', true) !== false;
    ctx.onLeave(() => { if (board) board.destroy(); });

    const midWord = () => ci > 0 || (board && (board.idx > 0 || board.misses > 0));
    const quit = async () => {
      if (midWord() && !(await UI.confirm('Quitter ?', { detail: 'Le mot en cours ne sera pas compté.', ok: 'Quitter' }))) return;
      back();
    };

    function frame(inner, actions) {
      if (board) { board.destroy(); board = null; }
      UI.clear(rootEl);
      rootEl.append(
        UI.focusTop({ title: 'Écrire de mémoire', onQuit: quit, right: h('span', { class: 'muted small' }, Math.min(wi + 1, queue.length) + ' / ' + queue.length) }),
        h('div', { class: 'focus-bar' }, UI.bar(wi / queue.length)),
        inner);
      if (actions && actions.length) rootEl.append(h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-inner' }, actions)));
      root.scrollTo(0, 0);
    }

    function cueEl(w) {
      const box = h('div', { class: 'cue' });
      const draw = () => {
        UI.clear(box);
        const cue = Core.writeCue(w, { pinyin: showPy }) || {};
        const pyBtn = h('button', { class: 'chip sm', type: 'button', 'aria-pressed': String(showPy), onclick: () => {
          showPy = !showPy; Store.setSetting('memoirePinyin', showPy); draw();
        } }, 'Pinyin');
        box.append(
          h('div', { class: 'py-row' }, cue.pinyin ? h('p', { class: 'answer-py' }, cue.pinyin) : null, U.speakBtn(w.hanzi), h('span', { class: 'cue-tools' }, pyBtn)),
          cue.fr ? h('p', { class: 'answer-fr' }, cue.fr) : null,
          cue.defZh ? h('p', { class: 'zh', lang: 'zh-Hans' }, cue.defZh) : null);
      };
      draw();
      return box;
    }

    function cellsEl(seq, upto) {
      return h('div', { class: 'cells xs' }, seq.map((c, k) => h('span', { class: 'cell zh' + (k === upto ? ' cur' : ''), lang: 'zh-Hans' }, k < upto ? c : '')));
    }

    function drawChar() {
      const w = fresh(Store.words.get(queue[wi])), seq = seqOf(w.hanzi), c = seq[ci];
      const data = Strokes.get(c);
      if (!data) { UI.toast('Il manque le tracé de ' + c + '.', 'warn'); advance(); return; }
      const msg = h('p', { class: 'board-msg', role: 'status', 'aria-live': 'polite' }, 'Écris le trait 1 sur ' + data.strokes.length + ', de mémoire.');
      const host = h('div', { class: 'board' });
      const hintBtn = h('button', { class: 'btn block', type: 'button', hidden: true, onclick: () => board.hint() }, icon('eye'), 'Voir ce trait');
      const nextBtn = h('button', { class: 'btn primary block', type: 'button', hidden: true, onclick: advance },
        ci < seq.length - 1 ? 'Caractère suivant' : 'Voir le mot');
      frame(h('div', { class: 'stack' },
        cueEl(w), cellsEl(seq, ci), host, msg, h('div', { class: 'stack' }, nextBtn, hintBtn)));
      board = new Board(host, data, {
        mode: 'memory', penOnly: Store.getSetting('penOnly') === true,
        onState: st => { hintBtn.hidden = !(!st.finished && st.strokeMisses >= 2); hintBtn.disabled = st.busy; },
        onStroke: ev => {
          if (ev.ok) { if (!ev.last) msg.textContent = 'Bien. Trait ' + (ev.idx + 2) + ' sur ' + ev.n + '.'; return; }
          msg.textContent = missText(ev) + (ev.strokeMisses >= 2 ? ' Tu peux demander à voir ce trait.' : '');
        },
        onDone: r => {
          cur.misses += r.misses; cur.hints += r.hints;
          Store.setSetting('chars', Core.bumpCharWrite(charsMap(), c, r.clean, UI.today()));
          msg.textContent = r.clean ? 'Bien écrit, sans erreur.' : 'Terminé : ' + plural(r.misses, 'erreur', 'erreurs') + ', ' + plural(r.hints, 'indice', 'indices') + '.';
          hintBtn.hidden = true; nextBtn.hidden = false;
          if (nextBtn.scrollIntoView) nextBtn.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    function startWord() { ci = 0; cur = { misses: 0, hints: 0 }; drawChar(); }

    async function drawResult() {
      const w = fresh(Store.words.get(queue[wi])), d = UI.today();
      const out = Core.applyHand(w, cur, d);
      await Store.putWord(out.word); await Store.addReview(out.review);
      results[wi] = { hanzi: w.hanzi, misses: cur.misses, hints: cur.hints };
      const clean = !cur.misses && !cur.hints, last = wi >= queue.length - 1;
      frame(h('div', { class: 'stack' },
        h('p', { class: 'step-title' }, clean ? 'Mot écrit sans erreur' : 'Mot écrit'),
        h('div', { class: 'cells' }, seqOf(w.hanzi).map(c => h('span', { class: 'cell zh', lang: 'zh-Hans' }, c))),
        h('div', { class: 'py-row' }, w.pinyin ? h('p', { class: 'answer-py' }, w.pinyin) : null, U.speakBtn(w.hanzi)),
        w.fr ? h('p', { class: 'answer-fr' }, w.fr) : null,
        h('p', { class: clean ? 'note-good' : 'muted' }, clean ? 'Aucune erreur, aucun indice.' : plural(cur.misses, 'erreur', 'erreurs') + ', ' + plural(cur.hints, 'indice demandé', 'indices demandés') + '.')),
      [h('button', { class: 'btn primary block', onclick: () => { wi++; if (wi < queue.length) startWord(); else finish(); } }, last ? 'Terminer' : 'Mot suivant'),
        h('button', { class: 'btn block', onclick: startWord }, 'Réécrire ce mot')]);
    }

    function advance() {
      const seq = seqOf(fresh(Store.words.get(queue[wi])).hanzi);
      ci++;
      if (ci < seq.length) drawChar(); else drawResult();
    }

    function finish() {
      UI.setFocus(false);
      const clean = results.filter(r => r && !r.misses && !r.hints).length;
      const more = Core.memoireQueue(Store.wordsOf(lid), hasStrokes).length;
      UI.clear(rootEl);
      rootEl.append(h('div', { class: 'stack' },
        h('div', { class: 'recap' }, h('p', { class: 'kicker' }, 'Séance terminée'), h('p', { class: 'recap-score' }, plural(results.length, 'mot écrit', 'mots écrits'))),
        h('p', { class: 'muted' }, clean + ' sans erreur ni indice.'),
        h('div', { class: 'rows' }, results.map(r => r ? h('div', { class: 'row static' },
          h('div', { class: 'row-main' }, h('span', { class: 'row-title zh', lang: 'zh-Hans' }, r.hanzi)),
          h('span', { class: 'row-end' }, !r.misses && !r.hints ? h('span', { class: 'tag' }, 'sans erreur')
            : h('span', { class: 'tag red' }, r.misses ? plural(r.misses, 'erreur', 'erreurs') : plural(r.hints, 'indice', 'indices')))) : null)),
        more ? h('button', { class: 'btn primary block', onclick: () => ctx.refresh() }, 'Encore quelques mots') : null,
        h('button', { class: 'btn block', onclick: () => ctx.go(charsUrl(lid)) }, 'Voir les caractères'),
        h('button', { class: 'btn block ghost', onclick: back }, 'Retour à la leçon')));
      root.scrollTo(0, 0);
    }

    startWord();
  };
})(typeof self !== 'undefined' ? self : this);
