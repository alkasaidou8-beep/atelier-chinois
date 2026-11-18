/* app.js — démarrage, navigation, thème, hors ligne. */
(function (root) {
  'use strict';
  const h = UI.h, icon = UI.icon;
  const doc = root.document;
  const Views = root.Views;
  const App = root.App = {};

  /* ---------- Thème ---------- */
  App.applyTheme = function () {
    let theme = 'auto';
    try { theme = Store.ready ? Store.getSetting('theme') : (root.localStorage.getItem('atelier-theme') || 'auto'); } catch (e) { /* sans importance */ }
    const el = doc.documentElement;
    if (theme === 'clair' || theme === 'sombre') el.setAttribute('data-theme', theme); else el.removeAttribute('data-theme');
    try { if (Store.ready) root.localStorage.setItem('atelier-theme', theme); } catch (e) { /* sans importance */ }
    doc.body.classList.toggle('no-triage-pinyin', Store.ready && Store.getSetting('triagePinyin') === false);
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = root.getComputedStyle(el).getPropertyValue('--paper').trim();
      if (bg) meta.setAttribute('content', bg);
    }
  };

  /* ---------- Navigation ---------- */
  const routes = [
    [/^\/$/, 'home'],
    [/^\/lecons$/, 'lessons'],
    [/^\/nouvelle-lecon$/, 'lessonForm'],
    [/^\/lecon\/([^/]+)$/, 'lesson'],
    [/^\/lecon\/([^/]+)\/modifier$/, 'lessonForm'],
    [/^\/lecon\/([^/]+)\/ajout$/, 'add'],
    [/^\/lecon\/([^/]+)\/import$/, 'importWords'],
    [/^\/lecon\/([^/]+)\/triage$/, 'triage'],
    [/^\/lecon\/([^/]+)\/decouverte$/, 'discover'],
    [/^\/lecon\/([^/]+)\/dictee$/, 'dictation'],
    [/^\/lecon\/([^/]+)\/ecouter$/, 'player'],
    [/^\/lecon\/([^/]+)\/dictee-ecoute$/, 'audioDictation'],
    [/^\/lecon\/([^/]+)\/regles$/, 'rules'],
    [/^\/lecon\/([^/]+)\/combinaisons$/, 'combos'],
    [/^\/lecon\/([^/]+)\/paires$/, 'pairs'],
    [/^\/lecon\/([^/]+)\/fiche$/, 'fiche'],
    [/^\/lecon\/([^/]+)\/caracteres$/, 'chars'],
    [/^\/lecon\/([^/]+)\/memoire$/, 'memoire'],
    [/^\/caractere\/([^/]+)$/, 'charPage'],
    [/^\/atelier$/, 'atelier'],
    [/^\/atelier\/ecrire$/, 'writeSentence'],
    [/^\/atelier\/phrases$/, 'sentences'],
    [/^\/atelier\/erreurs$/, 'errors'],
    [/^\/ecouter$/, 'listen'],
    [/^\/rouges$/, 'red'],
    [/^\/redictee$/, 'redictee'],
    [/^\/redictee-ecoute$/, 'audioRedictee'],
    [/^\/reglages$/, 'settings']
  ];

  let currentPath = null, suppress = null;
  const cleanups = [];
  // Seul un hash du type #/lecons est une route ; tout autre hash (ancre, #abc…) ramène à l'accueil.
  const pathFromHash = () => { const hs = (root.location.hash || '').replace(/^#/, ''); return hs.charAt(0) === '/' ? hs : '/'; };

  function parse(path) {
    const q = path.indexOf('?');
    const query = {};
    if (q >= 0) new root.URLSearchParams(path.slice(q + 1)).forEach((v, k) => { query[k] = v; });
    return { pathname: q < 0 ? path : path.slice(0, q), query: query };
  }

  function closeOverlays() {
    ['sheet-root', 'dialog-root'].forEach(id => {
      const el = doc.getElementById(id);
      if (el) { el.classList.remove('open'); UI.clear(el); }
    });
  }

  function fail(view, e) {
    UI.clear(view);
    view.append(UI.empty('Une erreur est survenue', String((e && e.message) || e),
      h('button', { class: 'btn primary', onclick: () => App.go('/') }, 'Retour à l’accueil')));
  }

  function show(path, keepScroll) {
    const y = keepScroll ? root.scrollY : 0;
    cleanups.splice(0).forEach(fn => { try { fn(); } catch (e) { /* sans importance */ } });
    try { if (root.Speech) root.Speech.stop(); } catch (e) { /* sans importance */ }
    currentPath = path;
    const view = doc.getElementById('view');
    UI.clear(view);
    UI.setFocus(false);
    closeOverlays();
    const p = parse(path);
    const ctx = {
      root: view, query: p.query, go: App.go,
      refresh: () => show(currentPath, true), onLeave: fn => cleanups.push(fn)
    };
    let matched = false;
    for (let i = 0; i < routes.length; i++) {
      const m = p.pathname.match(routes[i][0]);
      if (!m) continue;
      matched = true;
      try { Views[routes[i][1]].apply(null, [ctx].concat(m.slice(1).map(decodeURIComponent))); }
      catch (e) { if (root.console) console.error(e); fail(view, e); }
      break;
    }
    if (!matched) Views.notFound(ctx);
    root.scrollTo(0, y);
    updateTabs(p.pathname);
  }

  App.go = function (path, opts) {
    if (path === currentPath) { show(path); return; }
    suppress = path;
    setTimeout(() => { if (suppress === path) suppress = null; }, 400);
    try { if (opts && opts.replace) root.location.replace('#' + path); else root.location.hash = path; } catch (e) { /* hors navigateur classique */ }
    show(path);
  };

  root.addEventListener('hashchange', () => {
    const hs = root.location.hash || '';
    if (hs.length > 1 && hs.charAt(1) !== '/') return;   // ancre qui n'est pas une route : on ignore
    const p = pathFromHash();
    if (p === suppress) { suppress = null; return; }
    if (p !== currentPath) show(p);
  });

  /* ---------- Barre d'onglets ---------- */
  const TABS = [
    { id: 'home', label: 'Accueil', icon: 'home', path: '/', match: p => p === '/' },
    { id: 'lessons', label: 'Leçons', icon: 'book', path: '/lecons', match: p => p === '/lecons' || p === '/nouvelle-lecon' || p.indexOf('/lecon/') === 0 },
    { id: 'listen', label: 'Écouter', icon: 'headphones', path: '/ecouter', match: p => p === '/ecouter' },
    { id: 'atelier', label: 'Atelier', icon: 'pen', path: '/atelier', match: p => p.indexOf('/atelier') === 0 || p.indexOf('/caractere/') === 0 },
    { id: 'red', label: 'Rouges', seal: true, path: '/rouges', match: p => p === '/rouges' || p === '/redictee' || p === '/redictee-ecoute' },
    { id: 'settings', label: 'Réglages', icon: 'sliders', path: '/reglages', match: p => p === '/reglages' }
  ];
  let tabEls = {};

  function buildTabs() {
    const box = doc.getElementById('tabs');
    UI.clear(box);
    tabEls = {};
    TABS.forEach(t => {
      const b = h('button', { class: 'tab', type: 'button', onclick: () => App.go(t.path) },
        t.seal ? h('span', { class: 'seal', 'aria-hidden': 'true' }, '红') : icon(t.icon),
        h('span', null, t.label));
      tabEls[t.id] = b;
      box.append(b);
    });
  }

  function updateTabs(pathname) {
    TABS.forEach(t => {
      const b = tabEls[t.id]; if (!b) return;
      if (t.match(pathname)) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const b = tabEls.red;
    if (!b) return;
    const old = b.querySelector('.badge'); if (old) old.remove();
    const n = Core.dueRed(Store.allWords(), UI.today()).filter(Core.hasPrompt).length;
    if (n > 0) b.append(h('span', { class: 'badge', 'aria-label': n + ' à redicter' }, String(n)));
  }

  /* ---------- Hors ligne ---------- */
  function registerSW() {
    try {
      if (!('serviceWorker' in root.navigator) || !/^https?:$/.test(root.location.protocol)) return;
      const hadController = !!root.navigator.serviceWorker.controller;
      root.navigator.serviceWorker.register('sw.js').catch(() => { /* aperçu sans service worker */ });
      root.navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) UI.toast('Nouvelle version installée : ferme et rouvre l’appli.');
      });
    } catch (e) { /* aperçu sans service worker */ }
  }

  /* ---------- Démarrage ---------- */
  async function boot() {
    App.applyTheme();
    try { await Store.init(); } catch (e) { if (root.console) console.error(e); }
    try { await Strokes.init(); } catch (e) { if (root.console) console.error(e); }
    Store.onError = () => UI.toast('La sauvegarde a échoué. Exporte tes données (Réglages).', 'warn');
    App.applyTheme();
    if (root.matchMedia) {
      const mq = root.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', App.applyTheme);
    }
    Store.requestPersistence();
    buildTabs();
    show(pathFromHash());
    registerSW();
  }

  root.addEventListener('error', e => { UI.toast('Erreur : ' + (e.message || 'inconnue'), 'warn'); });
  root.addEventListener('unhandledrejection', e => { UI.toast('Erreur : ' + ((e.reason && e.reason.message) || 'inconnue'), 'warn'); });
  boot();
})(typeof self !== 'undefined' ? self : this);
