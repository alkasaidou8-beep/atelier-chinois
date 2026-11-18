/* core.js — logique pure de l'Atelier de chinois (aucun accès au DOM ni au stockage).
   Sert dans le navigateur (window.Core) et sous Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constantes                                                          */
  /* ------------------------------------------------------------------ */
  const RUBRIQUES = ['生词', '词语例释', '词语搭配', '词语辨析'];
  const RUBRIQUE_SHORT = { '生词': '生词', '词语例释': '例释', '词语搭配': '搭配', '词语辨析': '辨析' };
  const RUBRIQUE_FR = {
    '生词': 'Vocabulaire',
    '词语例释': 'Règles d’emploi',
    '词语搭配': 'Combinaisons',
    '词语辨析': 'Paires à distinguer'
  };

  // Livres suivis (les totaux et échéances servent au suivi de l'étape 3).
  const BOOKS = [
    { id: 'hsk5', label: 'HSK Standard Course 5', total: 36, deadline: '2027-01-10', unit: 'leçon' },
    { id: 'vocab5', label: '新HSK词汇精讲精练（五级）', total: 81, deadline: '2027-01-07', unit: 'unité' },
    { id: 'jingmao', label: '经贸汉语阅读教程', total: null, deadline: null, unit: 'texte' },
    { id: 'autre', label: 'Autre', total: null, deadline: null, unit: 'leçon' }
  ];

  // Redictée : jours 1, 3 et 7 après l'erreur (J0 = jour de l'erreur).
  const RED_DAYS = [1, 3, 7];
  const RED_SESSION_MAX = 15;

  const DEFAULTS = {
    newLimit: 50,        // plafond de nouvelles cartes Anki par jour
    groupSize: 6,        // mots par groupe de découverte (5 à 8)
    dictSize: 7,         // mots par dictée
    triagePinyin: true,  // afficher le pinyin pendant le triage
    writeMode: 'ecran',  // 'ecran' (canevas) ou 'papier'
    penOnly: false,      // canevas : ignorer le doigt (rejet de la paume)
    theme: 'auto',       // 'auto' | 'clair' | 'sombre'
    dayOffset: 0,        // décalage de date pour tester J1/J3/J7
    // Voix et lecture à voix haute
    voiceURI: '',        // voix choisie ('' = automatique)
    speechRate: 0.8,     // 0.6 lent, 0.8 moyen, 1 normal
    voiceCheck: null,    // null | 'ok' | 'ko' : résultat du test de la voix
    listenScope: 'both', // lecteur : 'mots' | 'phrases' | 'both'
    listenRepeat: 1,     // lectures de chaque élément (1 à 3)
    listenGap: 2,        // pause entre deux mots, en secondes
    listenShuffle: false,
    listenPinyin: true,
    listenHideHanzi: false,
    audioDictScope: 'mots',  // dictée à l'écoute : 'mots' | 'phrases'
    audioDictRead: 'mot',    // 'mot' | 'mot-phrase'
    audioDictRepeat: 2,      // lectures de chaque mot ou phrase
    audioDictGap: 2,         // pause entre deux lectures, en secondes
    audioDictAuto: true      // lire automatiquement dès que la carte s'affiche
  };

  /* ------------------------------------------------------------------ */
  /* Dates (chaînes AAAA-MM-JJ, heure locale)                            */
  /* ------------------------------------------------------------------ */
  const pad2 = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const utcMs = iso => { const p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
  const addDays = (iso, n) => {
    const d = new Date(utcMs(iso) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  };
  const diffDays = (a, b) => Math.round((utcMs(b) - utcMs(a)) / 86400000); // b - a
  const formatFr = (iso, opts) => new Date(utcMs(iso)).toLocaleDateString('fr-FR',
    Object.assign({ weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }, opts || {}));
  const relLabel = (iso, today) => {
    const n = diffDays(today, iso);
    if (n === 0) return 'Aujourd’hui';
    if (n === 1) return 'Demain';
    if (n === -1) return 'Hier';
    if (n < 0) return 'En retard de ' + (-n) + ' j';
    return 'Dans ' + n + ' j';
  };

  let seq = 0;
  const uid = () => Date.now().toString(36) + (seq++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);

  const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  const hasCJK = s => CJK_RE.test(s || '');

  /* ------------------------------------------------------------------ */
  /* Pinyin : chiffres de ton → voyelles à tons (ma3 → mǎ)               */
  /* ------------------------------------------------------------------ */
  const TONE_MARKS = {
    a: '\u0101\u00e1\u01ce\u00e0', e: '\u0113\u00e9\u011b\u00e8', i: '\u012b\u00ed\u01d0\u00ec',
    o: '\u014d\u00f3\u01d2\u00f2', u: '\u016b\u00fa\u01d4\u00f9', '\u00fc': '\u01d6\u01d8\u01da\u01dc',
    A: '\u0100\u00c1\u01cd\u00c0', E: '\u0112\u00c9\u011a\u00c8', I: '\u012a\u00cd\u01cf\u00cc',
    O: '\u014c\u00d3\u01d1\u00d2', U: '\u016a\u00da\u01d3\u00d9', '\u00dc': '\u01d5\u01d7\u01d9\u01db'
  };

  function placeTone(syl, tone) {
    const low = syl.toLowerCase();
    let i = low.indexOf('a');
    if (i < 0) i = low.indexOf('e');
    if (i < 0 && low.indexOf('ou') >= 0) i = low.indexOf('ou');
    if (i < 0) {
      for (let k = low.length - 1; k >= 0; k--) {
        if ('aeiou\u00fc'.indexOf(low[k]) >= 0) { i = k; break; }
      }
    }
    if (i < 0) return null;
    const marks = TONE_MARKS[syl[i]];
    if (!marks) return null;
    return syl.slice(0, i) + marks[tone - 1] + syl.slice(i + 1);
  }

  function numToTone(str) {
    if (!str) return str || '';
    return String(str).replace(/([A-Za-z\u00fc\u00dc:'\u2019]+)([0-5])/g, function (m, letters, d) {
      const syl = letters.replace(/u:/g, '\u00fc').replace(/U:/g, '\u00dc').replace(/v/g, '\u00fc').replace(/V/g, '\u00dc');
      if (syl.indexOf(':') >= 0) return m;
      const tone = +d;
      if (tone === 0 || tone === 5) return /[aeiou\u00fc]/i.test(syl) ? syl : m;
      const out = placeTone(syl, tone);
      return out === null ? m : out;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Textes                                                              */
  /* ------------------------------------------------------------------ */
  // Remplace le mot par ～ (utilisé pour que la définition ne donne pas la réponse).
  function maskWord(text, hanzi, mask) {
    if (!text) return '';
    if (!hanzi) return text;
    return text.split(hanzi).join(mask || '\uff5e');
  }

  // Découpe un texte autour d'un mot pour le surligner.
  function splitHighlight(text, needle) {
    text = text || '';
    if (!needle || text.indexOf(needle) < 0) return [{ t: text, hit: false }];
    const parts = [];
    let i = 0, j;
    while ((j = text.indexOf(needle, i)) >= 0) {
      if (j > i) parts.push({ t: text.slice(i, j), hit: false });
      parts.push({ t: needle, hit: true });
      i = j + needle.length;
    }
    if (i < text.length) parts.push({ t: text.slice(i), hit: false });
    return parts;
  }

  /* ------------------------------------------------------------------ */
  /* Mots et leçons                                                      */
  /* ------------------------------------------------------------------ */
  function makeLesson(data) {
    const now = Date.now();
    return {
      id: uid(),
      livre: data.livre || 'autre',
      numero: String(data.numero == null ? '' : data.numero).trim(),
      titre: String(data.titre || '').trim(),
      createdAt: now,
      updatedAt: now,
      doneAt: null
    };
  }

  function makeWord(lessonId, data, order) {
    const now = Date.now();
    return {
      id: uid(),
      lessonId: lessonId,
      rubrique: RUBRIQUES.indexOf(data.rubrique) >= 0 ? data.rubrique : '生词',
      hanzi: String(data.hanzi || '').trim(),
      pinyin: numToTone(String(data.pinyin || '').trim()),
      fr: String(data.fr || '').trim(),
      defZh: String(data.defZh || '').trim(),
      example: String(data.example || '').trim(),
      order: order || 0,
      createdAt: now,
      updatedAt: now,
      triage: null,          // null | 'connu' | 'inconnu'
      discoveredAt: null,    // date de fin de la découverte guidée
      firstSeen: null,       // premier jour de travail réel sur le mot
      state: 'nouveau',      // 'nouveau' | 'ok' | 'rouge' | 'sorti'
      red: null,             // { since, streak, due, composant, history[] }
      sentences: [],         // mes phrases : [{ text, date }]
      guesses: [],           // mes devinettes : [{ date, tries[] }]
      dictCount: 0,
      lastDict: null,
      audioCount: 0,         // dictées à l'écoute faites sur ce mot
      lastAudio: null,
      items: cleanItems(data.items), // lignes « + » du livre : exemples (例释), combinaisons (搭配), phrases à trou (辨析)
      work: {}               // ce que j'ai produit sur 例释 / 搭配 / 辨析 : règle, propositions, différence, trous
    };
  }

  function cleanItems(list) {
    const out = [], seen = new Set();
    (Array.isArray(list) ? list : []).forEach(x => {
      const t = String(x == null ? '' : x).trim();
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    });
    return out;
  }

  // Compatibilité : complète les champs manquants d'un mot importé.
  function normalizeWord(w) {
    const base = makeWord(w.lessonId, w, w.order);
    return Object.assign(base, w, {
      sentences: Array.isArray(w.sentences) ? w.sentences : [],
      guesses: Array.isArray(w.guesses) ? w.guesses : [],
      items: cleanItems(w.items),
      work: w.work && typeof w.work === 'object' && !Array.isArray(w.work) ? w.work : {}
    });
  }

  const isVocab = w => w.rubrique === '生词';
  const hasPrompt = w => !!(w.defZh || w.fr);
  const isReady = w => isVocab(w) && w.state === 'nouveau' && hasPrompt(w) &&
    (w.triage === 'connu' || (w.triage === 'inconnu' && !!w.discoveredAt));

  function promptFor(w) {
    if (w.defZh) return { text: maskWord(w.defZh, w.hanzi), zh: true, label: 'Définition', note: '' };
    if (w.fr) return { text: w.fr, zh: false, label: 'Sens en français', note: 'Aucune définition chinoise saisie pour ce mot.' };
    return null;
  }

  function isDuplicate(existing, data, ignoreId) {
    return existing.some(w => w.id !== ignoreId && w.rubrique === data.rubrique && w.hanzi === data.hanzi);
  }

  function sortLessons(lessons) {
    const bookIdx = id => { const i = BOOKS.findIndex(b => b.id === id); return i < 0 ? BOOKS.length : i; };
    const num = l => { const n = parseInt(l.numero, 10); return isNaN(n) ? Infinity : n; };
    return lessons.slice().sort((a, b) =>
      bookIdx(a.livre) - bookIdx(b.livre) || num(a) - num(b) || a.createdAt - b.createdAt);
  }

  /* ------------------------------------------------------------------ */
  /* Import en bloc                                                      */
  /* ------------------------------------------------------------------ */
  function rubriqueFromHeader(text) {
    const t = text.replace(/^[#\uff03\s]+/, '').trim();
    for (let i = 0; i < RUBRIQUES.length; i++) if (t.indexOf(RUBRIQUES[i]) >= 0) return RUBRIQUES[i];
    if (t.indexOf('例释') >= 0) return '词语例释';
    if (t.indexOf('搭配') >= 0) return '词语搭配';
    if (t.indexOf('辨析') >= 0) return '词语辨析';
    return null;
  }

  function splitFields(line) {
    let parts;
    if (line.indexOf('\t') >= 0) parts = line.split('\t');
    else if (line.indexOf('|') >= 0) parts = line.split('|');
    else if (line.indexOf(';') >= 0) parts = line.split(';');
    else parts = [line];
    return parts.map(s => s.trim());
  }

  // Une ligne = un mot : 汉字 ; pinyin ; français ; définition ; phrase
  // Une ligne « # 生词 » (ou 例释, 搭配, 辨析) change de rubrique.
  // Une ligne « + texte » s'ajoute au mot qui la précède : un exemple (例释), une combinaison (搭配)
  // ou une phrase à trou « 句子___。 = 答案 » (辨析).
  function parseBulk(text, defaultRubrique) {
    const rows = [], errors = [];
    let rub = defaultRubrique || '生词', last = null;
    String(text || '').split(/\r?\n/).forEach(function (raw, idx) {
      const line = raw.trim();
      if (!line) return;
      const ln = idx + 1;
      if (/^[#＃]/.test(line)) {
        const r = rubriqueFromHeader(line);
        if (r) { rub = r; last = null; }
        else errors.push({ line: ln, text: line, reason: 'Rubrique inconnue (attendu : 生词, 词语例释, 词语搭配 ou 词语辨析)' });
        return;
      }
      if (/^[+＋]/.test(line)) {
        const extra = line.replace(/^[+＋]\s*/, '').trim();
        if (!last) errors.push({ line: ln, text: line, reason: 'Une ligne « + » doit suivre un mot' });
        else if (extra) last.items.push(extra);
        return;
      }
      const f = splitFields(line);
      const hanzi = f[0] || '';
      if (!hasCJK(hanzi)) {
        errors.push({ line: ln, text: line, reason: 'Pas de caractères chinois dans la première colonne' });
        last = null;
        return;
      }
      last = {
        hanzi: hanzi, pinyin: numToTone(f[1] || ''), fr: f[2] || '', defZh: f[3] || '',
        example: f[4] || '', rubrique: rub, line: ln, items: []
      };
      rows.push(last);
    });
    return { rows: rows, errors: errors };
  }

  /* ------------------------------------------------------------------ */
  /* 词语例释 / 词语搭配 / 词语辨析 : lecture des données du livre       */
  /* ------------------------------------------------------------------ */
  // Paire à distinguer : « 完整 / 完成 » (séparateurs : / ／ ≠ 、 « vs »). Renvoie [A, B] ou null.
  function pairOf(w) {
    const parts = String(w && w.hanzi || '').split(/\s*(?:[\/／≠、]|\bvs\.?\b)\s*/i).map(s => s.trim()).filter(Boolean);
    return parts.length === 2 && hasCJK(parts[0]) && hasCJK(parts[1]) ? parts : null;
  }

  const BLANK_RE = /[_＿]{2,}|\(\s*\)|（\s*）/;

  // Phrase à trou « 工作已经___了。 = 完成 » : { text, before, after, answer } ou null si la ligne n'a pas de trou.
  function gapOf(item) {
    const s = String(item || '').trim();
    let body = s, answer = '';
    const m = s.match(/^(.*?)\s*[=＝]\s*([^=＝]+)$/);
    if (m) { body = m[1].trim(); answer = m[2].trim(); }
    const b = body.match(BLANK_RE);
    if (!b) return null;
    return { text: body, before: body.slice(0, b.index), after: body.slice(b.index + b[0].length), answer: answer };
  }

  // Exemples d'une règle d'emploi : la colonne « phrase » puis les lignes « + ».
  const examplesOf = w => cleanItems([w.example].concat(w.items || []));
  // Combinaisons du livre pour un mot.
  const collocationsOf = w => cleanItems(w.items || []);
  // Phrases à trou d'une paire (sans les lignes qui n'ont pas de trou).
  const gapsOf = w => (w.items || []).map(gapOf).filter(Boolean);

  // Mise en forme pour comparer sans tenir compte des espaces ni de la ponctuation.
  const squash = s => String(s || '').replace(/[\s　.,;:!?'"()\[\]{}。，、；：！？“”‘’（）《》…·_]/g, '');

  // Compare mes propositions de combinaisons à celles du livre.
  function matchCombos(mine, book) {
    const mineKeys = new Set((mine || []).map(squash).filter(Boolean));
    const rows = (book || []).map(b => ({ text: b, found: mineKeys.has(squash(b)) }));
    const bookKeys = new Set((book || []).map(squash));
    const extra = (mine || []).filter(m => squash(m) && !bookKeys.has(squash(m)));
    return { rows: rows, found: rows.filter(r => r.found).length, total: rows.length, extra: extra };
  }

  const byOrderW = (a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt;

  // File de travail d'une rubrique : d'abord ce qui n'a jamais été fait ou est à revoir, puis le plus ancien.
  function rubriqueQueue(words, rubrique) {
    const usable = {
      '词语例释': w => examplesOf(w).length > 0,
      '词语搭配': () => true,
      '词语辨析': w => !!pairOf(w)
    }[rubrique];
    const list = words.filter(w => w.rubrique === rubrique && w.hanzi && usable && usable(w));
    const rank = w => { const k = w.work || {}; return !k.doneAt ? 0 : k.todo ? 1 : 2; };
    return list.sort((a, b) => rank(a) - rank(b) || String((a.work || {}).doneAt || '').localeCompare(String((b.work || {}).doneAt || '')) || byOrderW(a, b));
  }

  // Résumé d'une rubrique pour une leçon : total utilisable, à faire (jamais fait ou à revoir), fiches inutilisables.
  function rubriqueInfo(words, rubrique) {
    const q = rubriqueQueue(words, rubrique);
    const todo = q.filter(w => !(w.work || {}).doneAt || (w.work || {}).todo).length;
    const all = words.filter(w => w.rubrique === rubrique).length;
    return { total: q.length, todo: todo, unusable: all - q.length };
  }

  /* ------------------------------------------------------------------ */
  /* Mes erreurs : corrections reçues, étiquettes, erreurs récurrentes    */
  /* ------------------------------------------------------------------ */
  // Étiquettes proposées d'office : celles que tu as citées dans ton cahier des charges.
  const ERROR_TAGS = ['-n/-ng', '的/得/地', '买/卖', '完整/完成'];
  const ERROR_SOURCES = [
    { value: 'prof', label: 'Prof' }, { value: 'claude', label: 'Claude' },
    { value: 'ami', label: 'Ami' }, { value: 'autre', label: 'Autre' }
  ];

  const cleanTags = list => cleanItems((Array.isArray(list) ? list : []).map(t => String(t == null ? '' : t).trim().replace(/\s+/g, ' ')));

  function makeError(data, today) {
    return {
      id: data.id || uid(), date: data.date || today, ts: Date.now(),
      wordId: data.wordId || null, lessonId: data.lessonId || null,
      original: String(data.original || '').trim(), corrected: String(data.corrected || '').trim(),
      note: String(data.note || '').trim(), tags: cleanTags(data.tags),
      source: ERROR_SOURCES.some(s => s.value === data.source) ? data.source : ''
    };
  }

  // Statistiques par étiquette : { tag, count, last, recurrent }, les plus fréquentes d'abord.
  function errorTagStats(errors) {
    const m = new Map();
    (errors || []).forEach(e => {
      const tags = e.tags && e.tags.length ? e.tags : [''];
      tags.forEach(t => {
        const cur = m.get(t) || { tag: t, count: 0, last: '' };
        cur.count++; if (e.date > cur.last) cur.last = e.date;
        m.set(t, cur);
      });
    });
    return Array.from(m.values()).map(s => Object.assign(s, { recurrent: s.count >= 2 }))
      .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || a.tag.localeCompare(b.tag));
  }

  const sortErrors = list => (list || []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts));

  /* ------------------------------------------------------------------ */
  /* Atelier de phrases : mes phrases, mots utilisés                      */
  /* ------------------------------------------------------------------ */
  // Mots de la liste (生词) retrouvés dans un texte.
  const vocabIn = (words, text) => words.filter(w => isVocab(w) && w.hanzi && String(text || '').indexOf(w.hanzi) >= 0);

  // Toutes mes phrases d'une leçon : { wordId, hanzi, text, date, used[] }.
  function mySentences(words) {
    const vocab = words.filter(w => isVocab(w) && w.hanzi);
    const out = [];
    words.forEach(w => (w.sentences || []).forEach((s, idx) => {
      if (!s || !s.text) return;
      out.push({ wordId: w.id, hanzi: w.hanzi, text: s.text, date: s.date || '', idx: idx, sent: s.sent || '', used: vocabIn(vocab, s.text).map(x => x.hanzi) });
    }));
    return out;
  }

  // Objectif de fin de leçon : 3 à 5 phrases qui réunissent au moins cinq mots de la leçon.
  function lessonWriting(words) {
    const list = mySentences(words), used = new Set();
    list.forEach(s => s.used.forEach(u => used.add(u)));
    return { sentences: list.length, words: used.size, ok: list.length >= 3 && used.size >= 5, list: list };
  }

  // Mots à faire écrire en premier : ceux qui ont le moins de phrases de moi (vocabulaire seulement).
  function writeQueue(words) {
    return words.filter(w => isVocab(w) && w.hanzi)
      .sort((a, b) => (a.sentences || []).length - (b.sentences || []).length || byOrderW(a, b));
  }

  // Fiche de leçon (une page) : mes phrases, mes règles, mes paires, les combinaisons à retenir, mes erreurs.
  function ficheData(words, errors) {
    const ids = new Set(words.map(w => w.id)), lessonIds = new Set(words.map(w => w.lessonId));
    const of = (rub, key) => words.filter(w => w.rubrique === rub && w.work && w.work[key]);
    return {
      writing: lessonWriting(words),
      sentences: mySentences(words),
      rules: of('词语例释', 'rule').map(w => ({ hanzi: w.hanzi, text: w.work.rule.text, rating: w.work.rule.rating, missing: w.work.rule.missing || '' })),
      pairs: of('词语辨析', 'diff').map(w => ({ hanzi: w.hanzi, text: w.work.diff.text, rating: w.work.diff.rating, missing: w.work.diff.missing || '' })),
      combos: words.filter(w => w.rubrique === '词语搭配' && w.work && (w.work.missed || []).length).map(w => ({ hanzi: w.hanzi, missed: w.work.missed })),
      errors: sortErrors((errors || []).filter(e => (e.wordId && ids.has(e.wordId)) || (e.lessonId && lessonIds.has(e.lessonId))))
    };
  }

  function ficheText(label, d) {
    const L = [];
    L.push('FICHE DE LEÇON' + (label ? ' : ' + label : ''));
    L.push('Phrases écrites : ' + d.writing.sentences + ' · mots de la leçon utilisés : ' + d.writing.words + (d.writing.ok ? ' (objectif atteint)' : ' (objectif : 3 à 5 phrases, au moins 5 mots)'));
    const sec = (title, lines) => { if (lines.length) { L.push('', title); lines.forEach(x => L.push(x)); } };
    sec('Mes phrases', d.sentences.map(s => '- ' + s.text));
    sec('Règles d’emploi (mes règles)', d.rules.map(r => '- ' + r.hanzi + ' : ' + r.text));
    sec('Paires à distinguer (mes différences)', d.pairs.map(r => '- ' + r.hanzi + ' : ' + r.text));
    sec('Combinaisons à retenir', d.combos.map(c => '- ' + c.hanzi + ' : ' + c.missed.join(', ')));
    sec('Mes erreurs', d.errors.map(e => '- ' + (e.original ? e.original + ' → ' : '') + (e.corrected || '') + (e.tags.length ? '  [' + e.tags.join(', ') + ']' : '') + (e.note ? ' — ' + e.note : '')));
    return L.join('\n');
  }

  // Texte à copier pour faire corriger mes phrases (l'appli ne corrige rien elle-même).
  function claudeText(sentences, tagStats, lessonLabel) {
    const lines = [];
    lines.push('Corrige mes phrases en chinois (niveau HSK5). Je les ai écrites seul. Pour chaque phrase : dis-moi où est l’erreur et pourquoi, sans réécrire toute la phrase à ma place. Je la corrigerai moi-même ensuite.');
    if (lessonLabel) lines.push('', 'Leçon : ' + lessonLabel);
    lines.push('');
    sentences.forEach((s, i) => lines.push((i + 1) + '. ' + s.text + (s.hanzi ? '   (mot : ' + s.hanzi + ')' : '')));
    const rec = (tagStats || []).filter(t => t.tag && t.recurrent).slice(0, 6);
    if (rec.length) lines.push('', 'Mes erreurs qui reviennent : ' + rec.map(t => t.tag + ' (×' + t.count + ')').join(', ') + '.');
    return lines.join('\n');
  }

  function dedupe(existing, rows) {
    const seen = new Set(existing.map(w => w.rubrique + '|' + w.hanzi));
    const fresh = [], dups = [];
    rows.forEach(r => {
      const k = r.rubrique + '|' + r.hanzi;
      if (seen.has(k)) dups.push(r); else { seen.add(k); fresh.push(r); }
    });
    return { fresh: fresh, dups: dups };
  }

  /* ------------------------------------------------------------------ */
  /* Statistiques et files d'attente                                     */
  /* ------------------------------------------------------------------ */
  function lessonStats(words) {
    const v = words.filter(isVocab);
    const s = {
      total: v.length, other: words.length - v.length, triaged: 0, unknown: 0, discovered: 0,
      toDiscover: 0, dictated: 0, toDictate: 0, red: 0, ok: 0, sorti: 0, noPrompt: 0
    };
    v.forEach(w => {
      if (w.triage) s.triaged++;
      if (w.triage === 'inconnu') { if (w.discoveredAt) s.discovered++; else s.toDiscover++; }
      if (w.triage === 'inconnu') s.unknown++;
      if (w.state !== 'nouveau') s.dictated++;
      if (w.state === 'rouge') s.red++; else if (w.state === 'ok') s.ok++; else if (w.state === 'sorti') s.sorti++;
      if (!hasPrompt(w)) s.noPrompt++;
      if (isReady(w)) s.toDictate++;
    });
    return s;
  }

  function nextStep(st) {
    if (!st.total) return { key: 'add', label: 'Ajouter des mots', count: 0 };
    if (st.triaged < st.total) return { key: 'triage', label: 'Triage', count: st.total - st.triaged };
    if (st.toDiscover > 0) return { key: 'discover', label: 'Découverte', count: st.toDiscover };
    if (st.toDictate > 0) return { key: 'dictate', label: 'Dictée', count: st.toDictate };
    if (st.noPrompt > 0) return { key: 'fill', label: 'Compléter les fiches', count: st.noPrompt };
    return { key: 'done', label: 'Leçon à jour', count: 0 };
  }

  const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt;

  function discoveryQueue(words, size) {
    return words.filter(w => isVocab(w) && w.triage === 'inconnu' && !w.discoveredAt)
      .sort(byOrder).slice(0, size || DEFAULTS.groupSize);
  }

  // Mots prêts pour la dictée : d'abord ceux qui viennent d'être découverts.
  function dictationPool(words) {
    return words.filter(isReady).sort((a, b) => {
      const da = a.discoveredAt ? 0 : 1, db = b.discoveredAt ? 0 : 1;
      if (da !== db) return da - db;
      if (a.discoveredAt && b.discoveredAt && a.discoveredAt !== b.discoveredAt) return a.discoveredAt < b.discoveredAt ? -1 : 1;
      return byOrder(a, b);
    });
  }

  function dueRed(words, today) {
    return words.filter(w => w.state === 'rouge' && w.red && w.red.due && w.red.due <= today)
      .sort((a, b) => (a.red.due < b.red.due ? -1 : a.red.due > b.red.due ? 1 : 0));
  }

  const knownWords = words => words.filter(w => (w.state === 'ok' || w.state === 'sorti') && hasPrompt(w));

  function shuffle(a, rng) {
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Redictée : mots rouges dus (15 max) mêlés à 2 ou 3 mots connus.
  function buildRedictee(words, today, rng, opts) {
    rng = rng || Math.random;
    const audio = !!(opts && opts.audio);
    const due = dueRed(words, today).filter(w => audio || hasPrompt(w)).slice(0, RED_SESSION_MAX);
    if (!due.length) return [];
    const ids = new Set(due.map(w => w.id));
    const nFill = 2 + Math.floor(rng() * 2);
    const known = audio ? words.filter(w => isVocab(w) && w.hanzi && (w.state === 'ok' || w.state === 'sorti')) : knownWords(words);
    const pool = shuffle(known.filter(w => !ids.has(w.id)), rng).slice(0, nFill);
    const items = due.map(w => ({ wordId: w.id, kind: 'red' }))
      .concat(pool.map(w => ({ wordId: w.id, kind: 'filler' })));
    return shuffle(items, rng);
  }

  /* ------------------------------------------------------------------ */
  /* Lecture à voix haute et dictées à l'écoute                          */
  /* ------------------------------------------------------------------ */
  // Phrases d'un mot : l'exemple saisi, puis les phrases écrites en découverte (sans doublon, avec des caractères).
  function sentencesOf(w) {
    const out = [], seen = new Set();
    const add = (text, source) => {
      const t = String(text || '').trim();
      if (!t || !hasCJK(t) || seen.has(t)) return;
      seen.add(t); out.push({ text: t, source: source });
    };
    add(w.example, 'exemple');
    if (w.rubrique === '生词' || w.rubrique === '词语例释') (w.items || []).forEach(x => add(x, 'exemple'));
    (w.sentences || []).forEach(x => add(x && x.text, 'mienne'));
    return out;
  }

  // Mots du lecteur : tous les mots de la leçon, dans l'ordre (ou mélangés).
  // La portée « phrases » ne garde que les mots qui ont au moins une phrase.
  function listenDeck(words, scope, opts) {
    opts = opts || {};
    let list = words.filter(w => w.hanzi).slice().sort(byOrder);
    if (scope === 'phrases') list = list.filter(w => sentencesOf(w).length > 0);
    return opts.shuffle ? shuffle(list, opts.rng) : list;
  }

  // Ce que le lecteur dit pour un mot : le mot, ses phrases, ou les deux.
  function speakPlan(w, scope) {
    const out = [];
    if (scope !== 'phrases') out.push({ id: 'mot', text: w.hanzi });
    if (scope !== 'mots') sentencesOf(w).forEach((s, i) => out.push({ id: 'p' + i, text: s.text, source: s.source }));
    return out;
  }

  // Plan -> morceaux pour la voix : chaque élément est lu `repeat` fois, avec une courte pause entre les lectures.
  function playParts(plan, repeat, pause) {
    const n = Math.max(1, Math.min(3, repeat || 1)), gap = pause == null ? 0.8 : pause;
    const parts = [];
    plan.forEach(seg => {
      for (let r = 0; r < n; r++) {
        if (parts.length) parts.push({ pause: gap });
        parts.push({ text: seg.text, seg: seg.id });
      }
    });
    return parts;
  }

  // Lecture d'une dictée à l'écoute, comme un professeur : le mot lu plusieurs fois, avec des pauses.
  // cfg : { read: 'mot' | 'mot-phrase', repeat, gap }. Pour une phrase, on passe son texte en 2e argument.
  function dictationParts(word, sentence, cfg) {
    cfg = cfg || {};
    const repeat = Math.max(1, Math.min(3, cfg.repeat || 1)), gap = Math.max(0.5, Math.min(6, cfg.gap == null ? 2 : cfg.gap));
    const parts = [];
    const push = (text, seg) => { if (parts.length) parts.push({ pause: gap }); parts.push({ text: text, seg: seg }); };
    if (sentence) { for (let r = 0; r < repeat; r++) push(sentence, 'phrase'); return parts; }
    if (cfg.read === 'mot-phrase') {
      const ex = sentencesOf(word)[0];
      push(word.hanzi, 'mot');
      if (ex) push(ex.text, 'phrase');
      push(word.hanzi, 'mot');
      return parts;
    }
    for (let r = 0; r < repeat; r++) push(word.hanzi, 'mot');
    return parts;
  }

  // Le sens d'un mot n'est montré dans le lecteur qu'après son triage « connu » ou sa découverte :
  // sinon le lecteur donnerait la réponse avant la tentative. Les autres rubriques n'ont pas de triage.
  const meaningUnlocked = w => !isVocab(w) || w.triage === 'connu' || !!w.discoveredAt || w.state !== 'nouveau';

  // Mot utilisable en dictée à l'écoute : passé par le triage (et la découverte s'il était inconnu), pas en rouge.
  // Pas besoin de définition : c'est l'oreille qui sert d'énoncé.
  const isAudioReady = w => isVocab(w) && !!w.hanzi && w.state !== 'rouge' &&
    (w.state !== 'nouveau' || w.triage === 'connu' || (w.triage === 'inconnu' && !!w.discoveredAt));

  // Les mots les moins pratiqués à l'écoute d'abord, au hasard à égalité.
  function audioPool(words, rng) {
    const groups = new Map();
    words.filter(isAudioReady).forEach(w => {
      const k = w.audioCount || 0;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(w);
    });
    return Array.from(groups.keys()).sort((a, b) => a - b).reduce((acc, k) => acc.concat(shuffle(groups.get(k), rng)), []);
  }

  // Une phrase au hasard par mot prêt (pour varier), puis on mélange.
  function sentencePool(words, rng) {
    rng = rng || Math.random;
    const items = [];
    words.filter(isAudioReady).forEach(w => {
      const list = sentencesOf(w);
      if (!list.length) return;
      const s = list[Math.floor(rng() * list.length)];
      items.push({ wordId: w.id, text: s.text, source: s.source });
    });
    return shuffle(items, rng);
  }

  /* ------------------------------------------------------------------ */
  /* Mises à jour d'un mot (fonctions pures : renvoient une copie)       */
  /* ------------------------------------------------------------------ */
  function setTriage(word, unknown) {
    return Object.assign({}, word, { triage: unknown ? 'inconnu' : 'connu', updatedAt: Date.now() });
  }

  function applyDiscovery(word, today, data) {
    const w = Object.assign({}, word, {
      sentences: (word.sentences || []).slice(),
      guesses: (word.guesses || []).slice(),
      discoveredAt: today,
      firstSeen: word.firstSeen || today,
      updatedAt: Date.now()
    });
    if (data && data.sentence) w.sentences.push({ text: data.sentence, date: today });
    if (data && data.tries && data.tries.length) w.guesses.push({ date: today, tries: data.tries.slice() });
    return w;
  }

  function makeReview(word, kind, ok, date, composant, extra) {
    const r = {
      id: uid(), wordId: word.id, lessonId: word.lessonId, date: date, ts: Date.now(),
      kind: kind, ok: ok === null ? null : !!ok, composant: composant || ''
    };
    if (extra) Object.keys(extra).forEach(k => { r[k] = extra[k]; });
    return r;
  }

  // Résultat d'une dictée (nouvelle, redictée d'un mot rouge, ou mot connu mélangé).
  // mode : 'sens' (par défaut) ou 'audio' (dictée à l'écoute). Les deux suivent le même calendrier de mots rouges.
  function applyDictation(word, ok, today, composant, kind, mode) {
    const comp = String(composant || '').trim();
    const w = Object.assign({}, word, { dictCount: (word.dictCount || 0) + 1, lastDict: today, updatedAt: Date.now() });
    if (mode === 'audio') { w.audioCount = (word.audioCount || 0) + 1; w.lastAudio = today; }
    if (!w.firstSeen) w.firstSeen = today;
    let reviewKind = kind === 'red' ? 'redictee' : kind === 'filler' ? 'rappel' : 'dictee';

    if (w.state === 'rouge' && w.red) {
      const red = Object.assign({}, w.red, { history: (w.red.history || []).slice() });
      red.history.push({ date: today, ok: !!ok, composant: comp });
      if (ok) {
        red.streak = (red.streak || 0) + 1;
        if (red.streak >= RED_DAYS.length) { w.state = 'sorti'; red.exitedAt = today; red.due = null; }
        else red.due = addDays(today, RED_DAYS[red.streak] - RED_DAYS[red.streak - 1]);
      } else {
        red.streak = 0;
        red.due = addDays(today, RED_DAYS[0]);
        if (comp) red.composant = comp;
      }
      w.red = red;
    } else if (!ok) {
      const prev = word.red && word.red.cycles ? word.red.cycles : 0;
      w.state = 'rouge';
      w.red = {
        since: today, streak: 0, due: addDays(today, RED_DAYS[0]), composant: comp,
        cycles: prev + 1, history: [{ date: today, ok: false, composant: comp }]
      };
    } else {
      w.state = (word.state === 'sorti') ? 'sorti' : 'ok';
    }
    return { word: w, review: makeReview(word, reviewKind, ok, today, comp, mode === 'audio' ? { mode: 'audio' } : null) };
  }

  function resetProgress(word) {
    return Object.assign({}, word, {
      triage: null, discoveredAt: null, firstSeen: null, state: 'nouveau', red: null,
      dictCount: 0, lastDict: null, audioCount: 0, lastAudio: null, updatedAt: Date.now()
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tableau de bord                                                     */
  /* ------------------------------------------------------------------ */
  const newToday = (words, today) => words.filter(w => w.firstSeen === today).length;

  function streakInfo(dates, today) {
    const set = new Set(dates);
    const last7 = [];
    for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); last7.push({ date: d, active: set.has(d) }); }
    let cur = 0;
    let d = set.has(today) ? today : addDays(today, -1);
    while (set.has(d)) { cur++; d = addDays(d, -1); }
    return { current: cur, last7: last7, todayActive: set.has(today) };
  }

  /* ------------------------------------------------------------------ */
  /* Caractères : mes composants, ma famille, écrire de mémoire          */
  /* Rien n'est deviné : les composants, leurs sens et leurs sons sont    */
  /* ceux que je saisis ; la « famille » vient de mes autres fiches.      */
  /* ------------------------------------------------------------------ */
  const HAN_RE = (function () {
    try { return new RegExp('^\\p{Script=Han}$', 'u'); } catch (e) { return /^[㐀-䶿一-鿿豈-﫿]$/; }
  })();
  const isHan = ch => typeof ch === 'string' && HAN_RE.test(ch);

  // Caractères chinois distincts d'un texte, dans l'ordre d'apparition.
  function charsOf(text) {
    const out = [], seen = new Set();
    Array.from(String(text || '')).forEach(c => { if (isHan(c) && !seen.has(c)) { seen.add(c); out.push(c); } });
    return out;
  }

  // Caractères des mots d'une leçon (toutes rubriques) : [{ ch, count, words: [hanzi…] }], dans l'ordre d'apparition.
  function lessonChars(words) {
    const map = new Map();
    words.forEach(w => charsOf(w.hanzi).forEach(ch => {
      if (!map.has(ch)) map.set(ch, { ch: ch, count: 0, words: [] });
      const e = map.get(ch);
      if (e.words.indexOf(w.hanzi) < 0) { e.words.push(w.hanzi); e.count = e.words.length; }
    }));
    return Array.from(map.values());
  }

  const COMP_ROLES = [{ id: 'sens', label: 'Sens' }, { id: 'son', label: 'Son' }, { id: 'autre', label: 'Autre' }];

  function cleanComp(c) {
    if (!c || typeof c !== 'object') return null;
    const comp = String(c.c == null ? '' : c.c).trim().slice(0, 6);
    if (!comp) return null;
    return {
      c: comp,
      role: COMP_ROLES.some(r => r.id === c.role) ? c.role : 'autre',
      note: String(c.note || '').trim(),
      ex: String(c.ex || '').trim()
    };
  }

  // Fiche d'un caractère (valeurs sûres même si la table est vide ou ancienne).
  function charEntry(map, ch) {
    const e = (map && typeof map === 'object' && map[ch]) || {};
    const w = e.w && typeof e.w === 'object' ? e.w : {};
    return {
      comps: (Array.isArray(e.comps) ? e.comps : []).map(cleanComp).filter(Boolean),
      note: String(e.note || '').trim(),
      w: { n: Number(w.n) || 0, ok: Number(w.ok) || 0, last: w.last || null }
    };
  }

  // Nouvelle table avec la fiche de `ch` remplacée (la table reçue n'est pas modifiée) ; une fiche vide disparaît.
  function withChar(map, ch, entry) {
    const out = Object.assign({}, map && typeof map === 'object' ? map : {});
    const e = charEntry({ [ch]: entry }, ch);
    if (!e.comps.length && !e.note && !e.w.n) delete out[ch]; else out[ch] = e;
    return out;
  }

  // Autres caractères dont MA fiche contient le même composant (famille de caractères).
  function familyOf(map, comp, exceptCh) {
    const out = [];
    Object.keys(map && typeof map === 'object' ? map : {}).forEach(x => {
      if (x !== exceptCh && charEntry(map, x).comps.some(c => c.c === comp)) out.push(x);
    });
    return out.sort();
  }

  // Mots enregistrés qui contiennent le caractère (une ligne par mot, toutes rubriques), tels que je les ai saisis.
  function wordsWithChar(words, ch) {
    const seen = new Set(), out = [];
    words.forEach(w => {
      if (!w.hanzi || w.hanzi.indexOf(ch) < 0 || seen.has(w.hanzi)) return;
      seen.add(w.hanzi);
      out.push({ id: w.id, hanzi: w.hanzi, pinyin: w.pinyin || '', fr: w.fr || '', lessonId: w.lessonId, rubrique: w.rubrique });
    });
    return out;
  }

  // Mes phrases qui contiennent le caractère, les plus récentes d'abord.
  function sentencesWithChar(words, ch, max) {
    const out = [], seen = new Set();
    words.forEach(w => (w.sentences || []).forEach(s => {
      if (!s || !s.text || s.text.indexOf(ch) < 0 || seen.has(s.text)) return;
      seen.add(s.text);
      out.push({ text: s.text, date: s.date || '', hanzi: w.hanzi });
    }));
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return max ? out.slice(0, max) : out;
  }

  // Résultat d'un caractère écrit de mémoire (compteurs de la fiche).
  function bumpCharWrite(map, ch, clean, today) {
    const e = charEntry(map, ch);
    e.w = { n: e.w.n + 1, ok: e.w.ok + (clean ? 1 : 0), last: today };
    return withChar(map, ch, e);
  }

  // Indice montré pour écrire un mot de mémoire : pinyin, sens français, définition chinoise (mot masqué).
  function writeCue(w, opts) {
    opts = opts || {};
    const cue = { pinyin: w.pinyin || '', fr: w.fr || '', defZh: maskWord(w.defZh || '', w.hanzi) };
    if (!cue.pinyin && !cue.fr && !cue.defZh) return null;
    if (opts.pinyin === false && (cue.fr || cue.defZh)) cue.pinyin = '';
    return cue;
  }

  const handOf = w => {
    const x = w.work && w.work.hand;
    return { n: (x && x.n) || 0, ok: (x && x.ok) || 0, last: (x && x.last) || '' };
  };

  // Mots à écrire de mémoire : vocabulaire avec un indice et des tracés pour chacun de ses caractères ; les moins travaillés d'abord.
  function memoireQueue(words, hasStrokes) {
    const has = typeof hasStrokes === 'function' ? hasStrokes : () => false;
    return words.filter(w => isVocab(w) && charsOf(w.hanzi).length && writeCue(w) && charsOf(w.hanzi).every(has))
      .sort((a, b) => { const x = handOf(a), y = handOf(b); return x.n - y.n || String(x.last).localeCompare(String(y.last)) || byOrderW(a, b); });
  }

  function memoireInfo(words, hasStrokes) {
    const has = typeof hasStrokes === 'function' ? hasStrokes : () => false;
    const vocab = words.filter(w => isVocab(w) && charsOf(w.hanzi).length);
    const noCue = vocab.filter(w => !writeCue(w)).length;
    const noStrokes = vocab.filter(w => writeCue(w) && !charsOf(w.hanzi).every(has)).length;
    const ready = vocab.length - noCue - noStrokes;
    return {
      total: vocab.length, ready: ready, noCue: noCue, noStrokes: noStrokes,
      written: vocab.filter(w => handOf(w).n > 0).length, clean: vocab.filter(w => handOf(w).ok > 0).length
    };
  }

  // Mot écrit de mémoire : compteurs du mot + entrée de journal. res = { misses, hints }.
  function applyHand(word, res, today) {
    const x = handOf(word), misses = (res && res.misses) || 0, hints = (res && res.hints) || 0, clean = !misses && !hints;
    const w = Object.assign({}, word, {
      work: Object.assign({}, word.work, { hand: { n: x.n + 1, ok: x.ok + (clean ? 1 : 0), last: today } }),
      updatedAt: Date.now()
    });
    return { word: w, review: makeReview(word, 'memoire', clean, today, '', { misses: misses, hints: hints }) };
  }

  /* ------------------------------------------------------------------ */
  /* Sauvegarde JSON                                                     */
  /* ------------------------------------------------------------------ */
  const BACKUP_VERSION = 1;

  function makeBackup(data) {
    return {
      app: 'atelier-chinois', version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
      lessons: data.lessons, words: data.words, reviews: data.reviews, settings: data.settings
    };
  }

  function validateBackup(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'Fichier vide ou illisible.' };
    if (obj.app !== 'atelier-chinois') return { ok: false, error: 'Ce fichier ne vient pas de l’Atelier de chinois.' };
    if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
      return { ok: false, error: 'Cette sauvegarde vient d’une version plus récente de l’appli.' };
    }
    if (!Array.isArray(obj.lessons) || !Array.isArray(obj.words)) {
      return { ok: false, error: 'Sauvegarde incomplète : leçons ou mots manquants.' };
    }
    const lessons = obj.lessons.filter(l => l && l.id && typeof l.titre === 'string');
    const ids = new Set(lessons.map(l => l.id));
    const words = obj.words.filter(w => w && w.id && w.hanzi && ids.has(w.lessonId)).map(normalizeWord);
    const reviews = (Array.isArray(obj.reviews) ? obj.reviews : []).filter(r => r && r.id && r.date);
    const settings = obj.settings && typeof obj.settings === 'object' ? obj.settings : {};
    return {
      ok: true, lessons: lessons, words: words, reviews: reviews, settings: settings,
      counts: { lessons: lessons.length, words: words.length, reviews: reviews.length }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Leçon de démonstration (domaine de la quincaillerie, pinyin en      */
  /* chiffres de ton : converti en tons à la création)                   */
  /* ------------------------------------------------------------------ */
  const DEMO_LESSON = {
    livre: 'autre',
    numero: '',
    titre: 'Démo quincaillerie',
    words: [
      ['螺丝', 'luo2si1', 'vis', '一种小金属东西，转进墙或木头里，把东西连在一起。', '这批螺丝的尺寸不对，我们要退货。'],
      ['水泥', 'shui3ni2', 'ciment', '盖房子、修路时用的灰色粉末，加水以后会变硬。', '非洲的客户想订两百吨水泥。'],
      ['钢筋', 'gang1jin1', 'barre d’armature (fer à béton)', '放在墙或楼板里面的细长钢条，让建筑更结实。', '这批钢筋的价格比上个月贵了。'],
      ['库存', 'ku4cun2', 'stock', '仓库里现有的货。', '这种钉子的库存不多了，请尽快补货。'],
      ['订货', 'ding4huo4', 'commander (des marchandises)', '先向工厂或商店说好要买的货。', '我们打算下个月向厂家订货。'],
      ['运费', 'yun4fei4', 'frais de transport', '运送货物要付的钱。', '海运的运费比空运便宜得多。'],
      ['报价', 'bao4jia4', 'offre de prix, devis', '卖的人告诉买的人一件东西多少钱。', '请您今天下午之前给我们报价。'],
      ['质量', 'zhi4liang4', 'qualité', '东西好不好，有没有问题。', '这家工厂的产品质量很好。']
    ]
  };

  return {
    RUBRIQUES, RUBRIQUE_SHORT, RUBRIQUE_FR, BOOKS, RED_DAYS, RED_SESSION_MAX, DEFAULTS, DEMO_LESSON,
    pad2, isoLocal, addDays, diffDays, formatFr, relLabel, uid, hasCJK,
    numToTone, maskWord, splitHighlight,
    makeLesson, makeWord, normalizeWord, isVocab, hasPrompt, isReady, promptFor, isDuplicate, sortLessons,
    parseBulk, dedupe, cleanItems,
    pairOf, gapOf, examplesOf, collocationsOf, gapsOf, matchCombos, rubriqueQueue, rubriqueInfo,
    ERROR_TAGS, ERROR_SOURCES, makeError, errorTagStats, sortErrors,
    vocabIn, mySentences, lessonWriting, writeQueue, claudeText, ficheData, ficheText,
    lessonStats, nextStep, discoveryQueue, dictationPool, dueRed, knownWords, shuffle, buildRedictee,
    sentencesOf, listenDeck, speakPlan, playParts, dictationParts, isAudioReady, meaningUnlocked, audioPool, sentencePool,
    setTriage, applyDiscovery, applyDictation, makeReview, resetProgress,
    newToday, streakInfo, makeBackup, validateBackup, BACKUP_VERSION,
    isHan, charsOf, lessonChars, COMP_ROLES, cleanComp, charEntry, withChar, familyOf, wordsWithChar, sentencesWithChar,
    bumpCharWrite, writeCue, memoireQueue, memoireInfo, applyHand
  };
});
