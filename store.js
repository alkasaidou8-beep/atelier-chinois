/* store.js — stockage local : IndexedDB (principal), localStorage (secours), mémoire (dernier recours).
   Tout vit sur l'appareil : aucun envoi vers un serveur. */
(function (root, factory) {
  const core = (typeof Core !== 'undefined') ? Core : (typeof require === 'function' ? require('./core.js') : null);
  if (typeof module === 'object' && module.exports) module.exports = factory(root, core);
  else root.Store = factory(root, core);
})(typeof self !== 'undefined' ? self : this, function (root, Core) {
  'use strict';

  const DB_NAME = 'atelier-chinois';
  const DB_VERSION = 1;
  const KEYED = { lessons: 'id', words: 'id', reviews: 'id', settings: 'key' };
  // Réglages propres au téléphone (voix installée, voix choisie) : jamais exportés, jamais écrasés par une restauration.
  const DEVICE_ONLY = new Set(['voiceURI', 'voiceCheck']);
  const STORE_NAMES = Object.keys(KEYED);

  const withTimeout = (p, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai dépassé')), ms);
    p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });

  /* ---------- IndexedDB ---------- */
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB indisponible'));
      let req;
      try { req = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        STORE_NAMES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: KEYED[name] });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Ouverture impossible'));
      req.onblocked = () => reject(new Error('Ouverture bloquée'));
    });
  }

  class IdbBackend {
    constructor(db) { this.db = db; this.kind = 'idb'; }
    loadAll() {
      return Promise.all(STORE_NAMES.map(name => new Promise((res, rej) => {
        const rq = this.db.transaction(name, 'readonly').objectStore(name).getAll();
        rq.onsuccess = () => res([name, rq.result]);
        rq.onerror = () => rej(rq.error);
      }))).then(entries => { const o = {}; entries.forEach(e => { o[e[0]] = e[1]; }); return o; });
    }
    write(ops) {
      return new Promise((res, rej) => {
        const names = Array.from(new Set(ops.map(o => o.store)));
        const tx = this.db.transaction(names, 'readwrite');
        ops.forEach(o => {
          const os = tx.objectStore(o.store);
          if (o.clear) os.clear(); else if (o.del !== undefined) os.delete(o.del); else os.put(o.put);
        });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('Écriture annulée'));
      });
    }
  }

  /* ---------- localStorage (secours) ---------- */
  class LocalBackend {
    constructor() { this.kind = 'local'; this.cache = null; this.dirty = new Set(); this.timer = null; this.failed = null; }
    loadAll() {
      const o = {};
      STORE_NAMES.forEach(n => {
        try { o[n] = JSON.parse(root.localStorage.getItem('atelier:' + n) || '[]'); } catch (e) { o[n] = []; }
      });
      this.cache = o;
      return Promise.resolve(o);
    }
    write(ops) {
      ops.forEach(o => {
        const key = KEYED[o.store];
        let arr = this.cache[o.store];
        if (o.clear) arr = [];
        else if (o.del !== undefined) arr = arr.filter(x => x[key] !== o.del);
        else {
          const i = arr.findIndex(x => x[key] === o.put[key]);
          if (i >= 0) arr[i] = o.put; else arr.push(o.put);
        }
        this.cache[o.store] = arr;
        this.dirty.add(o.store);
      });
      if (!this.timer) this.timer = setTimeout(() => this.flush(), 250);
      return Promise.resolve();
    }
    flush() {
      this.timer = null;
      this.dirty.forEach(n => {
        try { root.localStorage.setItem('atelier:' + n, JSON.stringify(this.cache[n])); } catch (e) { this.failed = e; }
      });
      this.dirty.clear();
    }
  }

  /* ---------- Mémoire (dernier recours) ---------- */
  class MemoryBackend {
    constructor() { this.kind = 'memory'; }
    loadAll() { return Promise.resolve({ lessons: [], words: [], reviews: [], settings: [] }); }
    write() { return Promise.resolve(); }
  }

  /* ---------- Magasin ---------- */
  const Store = {
    kind: 'memory',
    persisted: null,
    ready: false,
    lessons: new Map(),
    words: new Map(),
    reviews: new Map(),
    settings: new Map(),
    onError: null,
    _backend: null,
    _queue: Promise.resolve(),

    async init(opts) {
      opts = opts || {};
      let backend = null, data = null;
      if (opts.backend !== 'memory' && opts.backend !== 'local') {
        try {
          const db = await withTimeout(idbOpen(), 4000);
          backend = new IdbBackend(db);
          data = await withTimeout(backend.loadAll(), 4000);
        } catch (e) { backend = null; }
      }
      if (!backend && opts.backend !== 'memory') {
        try {
          root.localStorage.setItem('atelier:test', '1');
          root.localStorage.removeItem('atelier:test');
          backend = new LocalBackend();
          data = await backend.loadAll();
        } catch (e) { backend = null; }
      }
      if (!backend) { backend = new MemoryBackend(); data = await backend.loadAll(); }
      this._backend = backend;
      this.kind = backend.kind;
      this._fill(data);
      this.ready = true;
      return this;
    },

    _fill(data) {
      this.lessons = new Map((data.lessons || []).map(l => [l.id, l]));
      this.words = new Map((data.words || []).map(w => [w.id, Core.normalizeWord(w)]));
      this.reviews = new Map((data.reviews || []).map(r => [r.id, r]));
      this.settings = new Map((data.settings || []).map(s => [s.key, s.value]));
    },

    _write(ops) {
      if (!ops.length) return this._queue;
      this._queue = this._queue
        .then(() => this._backend.write(ops))
        .catch(err => { if (root.console) console.error('Écriture échouée', err); if (this.onError) this.onError(err); });
      return this._queue;
    },

    /* --- leçons --- */
    allLessons() { return Core.sortLessons(Array.from(this.lessons.values())); },
    putLesson(l) {
      l.updatedAt = Date.now();
      this.lessons.set(l.id, l);
      return this._write([{ store: 'lessons', put: l }]);
    },
    deleteLesson(id) {
      const ops = [{ store: 'lessons', del: id }];
      this.lessons.delete(id);
      Array.from(this.words.values()).forEach(w => {
        if (w.lessonId === id) { this.words.delete(w.id); ops.push({ store: 'words', del: w.id }); }
      });
      Array.from(this.reviews.values()).forEach(r => {
        if (r.lessonId === id) { this.reviews.delete(r.id); ops.push({ store: 'reviews', del: r.id }); }
      });
      if (this.getSetting('currentLessonId', null) === id) ops.push(this._setting('currentLessonId', null));
      return this._write(ops);
    },

    /* --- mots --- */
    allWords() { return Array.from(this.words.values()); },
    wordsOf(lessonId) {
      return Array.from(this.words.values()).filter(w => w.lessonId === lessonId)
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    },
    putWord(w) { this.words.set(w.id, w); return this._write([{ store: 'words', put: w }]); },
    putWords(list) {
      list.forEach(w => this.words.set(w.id, w));
      return this._write(list.map(w => ({ store: 'words', put: w })));
    },
    deleteWord(id) {
      this.words.delete(id);
      return this._write([{ store: 'words', del: id }]);
    },

    /* --- journal d'activité --- */
    allReviews() { return Array.from(this.reviews.values()); },
    addReview(r) { this.reviews.set(r.id, r); return this._write([{ store: 'reviews', put: r }]); },

    /* --- réglages --- */
    getSetting(key, def) {
      if (this.settings.has(key)) return this.settings.get(key);
      return def !== undefined ? def : Core.DEFAULTS[key];
    },
    _setting(key, value) {
      if (value === null || value === undefined) { this.settings.delete(key); return { store: 'settings', del: key }; }
      this.settings.set(key, value);
      return { store: 'settings', put: { key: key, value: value } };
    },
    setSetting(key, value) { return this._write([this._setting(key, value)]); },

    /* --- mes erreurs (corrections reçues) ---
       Gardées dans les réglages (clé « errors ») : elles voyagent donc avec la sauvegarde JSON
       sans changer la structure de la base. */
    allErrors() { const v = this.settings.get('errors'); return Array.isArray(v) ? v : []; },
    putErrors(list) {
      const cur = this.allErrors().slice();
      list.forEach(e => { const i = cur.findIndex(x => x.id === e.id); if (i >= 0) cur[i] = e; else cur.push(e); });
      return this.setSetting('errors', cur);
    },
    putError(e) { return this.putErrors([e]); },
    deleteError(id) { return this.setSetting('errors', this.allErrors().filter(x => x.id !== id)); },

    /* --- sauvegarde / restauration / effacement --- */
    exportAll() {
      const settings = {};
      this.settings.forEach((v, k) => { if (!DEVICE_ONLY.has(k)) settings[k] = v; });
      return Core.makeBackup({
        lessons: Array.from(this.lessons.values()),
        words: Array.from(this.words.values()),
        reviews: Array.from(this.reviews.values()),
        settings: settings
      });
    },

    async importAll(obj) {
      const v = Core.validateBackup(obj);
      if (!v.ok) throw new Error(v.error);
      const ops = STORE_NAMES.map(s => ({ store: s, clear: true }));
      this.lessons = new Map(v.lessons.map(l => [l.id, l]));
      this.words = new Map(v.words.map(w => [w.id, w]));
      this.reviews = new Map(v.reviews.map(r => [r.id, r]));
      const keep = new Map();
      DEVICE_ONLY.forEach(k => { if (this.settings.has(k)) keep.set(k, this.settings.get(k)); });
      this.settings = new Map(Object.keys(v.settings).filter(k => !DEVICE_ONLY.has(k)).map(k => [k, v.settings[k]]));
      keep.forEach((val, k) => this.settings.set(k, val));
      v.lessons.forEach(l => ops.push({ store: 'lessons', put: l }));
      v.words.forEach(w => ops.push({ store: 'words', put: w }));
      v.reviews.forEach(r => ops.push({ store: 'reviews', put: r }));
      this.settings.forEach((val, k) => ops.push({ store: 'settings', put: { key: k, value: val } }));
      await this._write(ops);
      return v.counts;
    },

    async wipe() {
      this.lessons.clear(); this.words.clear(); this.reviews.clear(); this.settings.clear();
      await this._write(STORE_NAMES.map(s => ({ store: s, clear: true })));
    },

    /* Demande au navigateur de ne pas effacer les données quand l'espace manque. */
    async requestPersistence() {
      try {
        if (root.navigator && root.navigator.storage && root.navigator.storage.persist) {
          this.persisted = await root.navigator.storage.persist();
        }
      } catch (e) { this.persisted = null; }
      return this.persisted;
    }
  };

  return Store;
});
