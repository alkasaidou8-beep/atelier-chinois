/* strokes.js — tracés des caractères (ordre des traits), au format de Hanzi Writer.
   Contient :
   - la lecture et le contrôle des données d'un caractère ;
   - la géométrie qui décide si le trait que tu dessines est le bon (forme, sens, extrémités) ;
   - le téléchargement UNIQUE des tracés depuis un CDN public (seul le caractère demandé apparaît dans la requête) ;
   - le cache hors ligne, dans une base IndexedDB séparée de tes données : jamais exportée, toujours re-téléchargeable.
   Aucun accès au DOM : ce fichier sert aussi sous Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.Strokes = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const SPACE = 1024;       // les tracés vivent dans un carré de 1024 unités
  const BASE = 900;         // ligne de base : y_écran = 900 - y_tracé (les données ont l'axe y vers le haut)
  const GLYPH_TRANSFORM = 'scale(1,-1) translate(0,-' + BASE + ')';

  /* ------------------------------------------------------------------ */
  /* Sources de téléchargement (essayées dans cet ordre)                  */
  /* ------------------------------------------------------------------ */
  const PKG = 'hanzi-writer-data@2.0';
  const SOURCES = [
    { id: 'jsdelivr', label: 'jsDelivr', url: c => 'https://cdn.jsdelivr.net/npm/' + PKG + '/' + encodeURIComponent(c) + '.json' },
    { id: 'jsdelivr-fastly', label: 'jsDelivr (Fastly)', url: c => 'https://fastly.jsdelivr.net/npm/' + PKG + '/' + encodeURIComponent(c) + '.json' },
    { id: 'jsdelivr-gcore', label: 'jsDelivr (Gcore)', url: c => 'https://gcore.jsdelivr.net/npm/' + PKG + '/' + encodeURIComponent(c) + '.json' },
    { id: 'unpkg', label: 'unpkg', url: c => 'https://unpkg.com/' + PKG + '/' + encodeURIComponent(c) + '.json' },
    { id: 'npmmirror', label: 'npmmirror', url: c => 'https://registry.npmmirror.com/hanzi-writer-data/2.0.1/files/' + encodeURIComponent(c) + '.json' }
  ];

  /* ------------------------------------------------------------------ */
  /* Lecture et contrôle d'un fichier de caractère                         */
  /* ------------------------------------------------------------------ */
  // Renvoie { strokes: [chemin SVG], medians: [[[x,y],…]], radStrokes: [indices] } ou null si les données sont inutilisables.
  function parse(raw) {
    let d = raw;
    if (typeof raw === 'string') { try { d = JSON.parse(raw); } catch (e) { return null; } }
    if (!d || typeof d !== 'object' || !Array.isArray(d.strokes) || !Array.isArray(d.medians)) return null;
    if (!d.strokes.length || d.strokes.length !== d.medians.length) return null;
    const strokes = d.strokes.map(s => String(s).trim());
    if (strokes.some(s => !/^[Mm]/.test(s))) return null;
    const medians = [];
    for (let i = 0; i < d.medians.length; i++) {
      const m = Array.isArray(d.medians[i]) ? d.medians[i] : [];
      const pts = m.map(p => [Number(p && p[0]), Number(p && p[1])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
      if (pts.length < 2) return null;
      medians.push(pts);
    }
    const rad = Array.isArray(d.radStrokes)
      ? d.radStrokes.filter(i => Number.isInteger(i) && i >= 0 && i < strokes.length) : [];
    return { strokes: strokes, medians: medians, radStrokes: rad };
  }

  /* ------------------------------------------------------------------ */
  /* Géométrie                                                            */
  /* ------------------------------------------------------------------ */
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    return L;
  }

  // n points régulièrement espacés le long de la ligne brisée.
  function resample(pts, n) {
    if (!pts.length) return [];
    const total = pathLength(pts);
    if (pts.length === 1 || total === 0) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
    const out = [[pts[0][0], pts[0][1]]];
    const step = total / (n - 1);
    let seg = 1, cur = pts[0];
    for (let k = 1; k < n - 1; k++) {
      let want = step, placed = false;
      while (seg < pts.length) {
        const nxt = pts[seg], d = dist(cur, nxt);
        if (d >= want && d > 0) {
          const t = want / d;
          cur = [cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t];
          out.push(cur); placed = true;
          break;
        }
        want -= d; cur = nxt; seg++;
      }
      if (!placed) out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    }
    out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    return out;
  }

  const avgGap = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += dist(a[i], b[i]); return s / a.length; };

  /* Le trait dessiné ressemble-t-il au trait attendu ?
     user, median : listes de points [x, y] dans le MÊME repère (celui des données : axe y vers le haut).
     Critères : forme (distance moyenne), extrémités, sens de tracé, longueur.
     Renvoie { ok, why, avg, start, end, cos, ratio } ; why ∈ '', 'court', 'forme', 'extrémités', 'sens', 'longueur'. */
  function matchStroke(user, median, opts) {
    opts = opts || {};
    const tol = 135 * (opts.leniency || 1);   // écart moyen toléré, en unités (1024 = largeur du carré)
    const medLen = pathLength(median), usrLen = pathLength(user);
    const res = { ok: false, why: '', avg: Infinity, start: Infinity, end: Infinity, cos: 0, ratio: 0 };
    if (!user.length || !median.length) { res.why = 'court'; return res; }

    // Un point (trait très court) : on accepte un simple appui au bon endroit.
    if (medLen < 150 && usrLen < 30) {
      const mid = resample(median, 3)[1];
      const c = user.reduce((a, p) => [a[0] + p[0] / user.length, a[1] + p[1] / user.length], [0, 0]);
      res.avg = res.start = res.end = dist(c, mid); res.cos = 1; res.ratio = 1;
      if (res.avg <= tol) res.ok = true; else res.why = 'forme';
      return res;
    }
    if (user.length < 2 || usrLen < Math.min(70, medLen * 0.4)) { res.why = 'court'; return res; }

    const N = 24;
    const u = resample(user, N), m = resample(median, N);
    res.avg = avgGap(u, m);
    res.start = dist(u[0], m[0]);
    res.end = dist(u[N - 1], m[N - 1]);
    res.ratio = usrLen / (medLen || 1);
    if (medLen >= 120) {
      const vu = [u[N - 1][0] - u[0][0], u[N - 1][1] - u[0][1]], vm = [m[N - 1][0] - m[0][0], m[N - 1][1] - m[0][1]];
      const nu = Math.hypot(vu[0], vu[1]), nm = Math.hypot(vm[0], vm[1]);
      res.cos = nu && nm ? (vu[0] * vm[0] + vu[1] * vm[1]) / (nu * nm) : 1;
    } else res.cos = 1;

    if (res.avg > tol) {
      // même forme mais tracée à l'envers ?
      if (avgGap(u.slice().reverse(), m) <= tol) res.why = 'sens'; else res.why = 'forme';
    } else if (res.start > tol * 1.7 || res.end > tol * 1.7) res.why = 'extrémités';
    else if (res.cos < 0.35) res.why = 'sens';
    else if (res.ratio < 0.45 || res.ratio > 2.2) res.why = 'longueur';
    else res.ok = true;
    return res;
  }

  // Un trait de la liste « medians » (autre que `skip`) colle-t-il au dessin ? Sert à dire « bon trait, mais pas maintenant ».
  function findOther(user, medians, doneSet, skip, opts) {
    for (let j = 0; j < medians.length; j++) {
      if (j === skip || (doneSet && doneSet.has(j))) continue;
      if (matchStroke(user, medians[j], opts).ok) return j;
    }
    return -1;
  }

  const toGlyph = (x, y) => [x, BASE - y];      // repère écran (0–1024) → repère des données
  const toScreen = (x, y) => [x, BASE - y];     // la transformation est son propre inverse
  const medianD = pts => pts.map((p, i) => (i ? 'L' : 'M') + Math.round(p[0] * 10) / 10 + ' ' + Math.round(p[1] * 10) / 10).join(' ');

  /* ------------------------------------------------------------------ */
  /* Cache hors ligne (IndexedDB séparée : « atelier-chinois-media »)      */
  /* ------------------------------------------------------------------ */
  const DB_NAME = 'atelier-chinois-media', DB_VERSION = 1;
  const mem = new Map();       // caractère -> { ch, data } ou { ch, missing: true }
  let db = null, persistent = false, ready = false;

  const withTimeout = (p, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai dépassé')), ms);
    p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB indisponible'));
      let req;
      try { req = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('strokes')) d.createObjectStore('strokes', { keyPath: 'ch' });
        if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });   // réservé à l'audio du livre
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Ouverture impossible'));
      req.onblocked = () => reject(new Error('Ouverture bloquée'));
    });
  }

  async function init() {
    if (ready) return api;
    try {
      db = await withTimeout(openDb(), 4000);
      const rows = await withTimeout(new Promise((res, rej) => {
        const rq = db.transaction('strokes', 'readonly').objectStore('strokes').getAll();
        rq.onsuccess = () => res(rq.result || []);
        rq.onerror = () => rej(rq.error);
      }), 4000);
      rows.forEach(r => { if (r && r.ch) mem.set(r.ch, r.data ? { ch: r.ch, data: parse(r.data) } : { ch: r.ch, missing: true }); });
      Array.from(mem.keys()).forEach(k => { const r = mem.get(k); if (!r.missing && !r.data) mem.delete(k); });
      persistent = true;
    } catch (e) { db = null; persistent = false; }
    ready = true;
    return api;
  }

  function dbWrite(fn) {
    if (!db) return Promise.resolve();
    return new Promise(res => {
      try {
        const tx = db.transaction('strokes', 'readwrite');
        fn(tx.objectStore('strokes'));
        tx.oncomplete = () => res();
        tx.onerror = tx.onabort = () => { persistent = false; res(); };
      } catch (e) { persistent = false; res(); }
    });
  }

  const get = ch => { const r = mem.get(ch); return r && r.data ? r.data : null; };
  const status = ch => { const r = mem.get(ch); return !r ? 'none' : r.data ? 'ready' : 'missing'; };
  const count = () => { let n = 0; mem.forEach(r => { if (r.data) n++; }); return n; };

  function put(ch, data) {
    mem.set(ch, { ch: ch, data: data });
    return dbWrite(os => os.put({ ch: ch, data: data, at: Date.now() }));
  }
  function putMissing(ch) {
    mem.set(ch, { ch: ch, missing: true });
    return dbWrite(os => os.put({ ch: ch, missing: true, at: Date.now() }));
  }
  async function clear() {
    mem.clear();
    await dbWrite(os => os.clear());
  }
  // Pour les tests : vide la mémoire seulement.
  function _reset() { mem.clear(); }

  /* ------------------------------------------------------------------ */
  /* Téléchargement                                                       */
  /* ------------------------------------------------------------------ */
  let fetchFn = typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
  const setFetch = fn => { fetchFn = fn; };
  const TIMEOUT_MS = 8000;

  async function fetchFrom(src, ch) {
    if (!fetchFn) throw new Error('réseau indisponible');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      // Aucun cookie, aucune adresse de page transmise : seulement le nom du fichier du caractère.
      const res = await fetchFn(src.url(ch), { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined });
      if (res.status === 404) return { notFound: true };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = parse(await res.text());
      if (!data) throw new Error('données illisibles');
      return { data: data };
    } finally { if (timer) clearTimeout(timer); }
  }

  // Essaie les sources dans l'ordre (en sautant celles qui échouent à répétition pendant ce téléchargement).
  async function fetchOne(ch, health, errors, order) {
    let answered = 0, notFound = 0;
    for (let i = 0; i < order.length; i++) {
      const src = order[i], hs = health[src.id];
      if (hs.bad >= 2 && hs.ok === 0) continue;
      try {
        const r = await fetchFrom(src, ch);
        answered++;
        if (r.notFound) { notFound++; continue; }
        hs.ok++;
        if (i > 0) { order.splice(i, 1); order.unshift(src); }   // la source qui répond passe en tête
        return { data: r.data, src: src.id };
      } catch (e) {
        hs.bad++;
        errors[src.id] = String((e && e.name === 'AbortError') ? 'trop lent' : (e && e.message) || e);
      }
    }
    if (answered > 0 && notFound === answered) return { missing: true };
    return { failed: true };
  }

  /* Télécharge les caractères absents du cache.
     opts : { onProgress(fait, total, ch), signal, concurrency, retryMissing }.
     Renvoie { total, ok[], missing[], failed[], errors{}, stopped }. */
  async function download(chars, opts) {
    opts = opts || {};
    const list = Array.from(new Set(chars)).filter(c => status(c) === 'none' || (opts.retryMissing && status(c) === 'missing'));
    const out = { total: list.length, ok: [], missing: [], failed: [], errors: {}, stopped: false };
    const health = {}; SOURCES.forEach(s => { health[s.id] = { ok: 0, bad: 0 }; });
    const order = SOURCES.slice();
    let next = 0, done = 0;
    const worker = async () => {
      while (!out.stopped && next < list.length) {
        if (opts.signal && opts.signal.aborted) { out.stopped = true; return; }
        const ch = list[next++];
        const r = await fetchOne(ch, health, out.errors, order);
        if (r.data) { await put(ch, r.data); out.ok.push(ch); }
        else if (r.missing) { await putMissing(ch); out.missing.push(ch); }
        else out.failed.push(ch);
        done++;
        if (opts.onProgress) opts.onProgress(done, list.length, ch);
        // Les trois premiers caractères échouent partout : le réseau est coupé ou bloqué, inutile d'insister.
        if (!out.ok.length && !out.missing.length && out.failed.length >= 3) out.stopped = true;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency || 4, list.length)) }, worker));
    return out;
  }

  const api = {
    SPACE, BASE, GLYPH_TRANSFORM, SOURCES,
    parse, dist, pathLength, resample, matchStroke, findOther, toGlyph, toScreen, medianD,
    init, get, status, count, put, putMissing, clear, download, setFetch, _reset,
    isPersistent: () => persistent
  };
  return api;
});
