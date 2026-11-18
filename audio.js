/* audio.js — lecture à voix haute avec la synthèse vocale du navigateur.
   Aucun fichier son, aucun serveur : la voix vient du téléphone (hors ligne si la voix est installée). */
(function (root) {
  'use strict';
  const Speech = {};
  const synth = () => root.speechSynthesis || null;
  const Utter = () => root.SpeechSynthesisUtterance || null;

  Speech.supported = () => !!(synth() && Utter());

  // Vitesses proposées (1 = vitesse normale de la voix).
  Speech.RATES = [
    { id: 'lent', label: 'Lent', rate: 0.6 },
    { id: 'moyen', label: 'Moyen', rate: 0.8 },
    { id: 'normal', label: 'Normal', rate: 1 }
  ];
  Speech.rateId = r => Speech.RATES.reduce((best, x) => (Math.abs(x.rate - r) < Math.abs(best.rate - r) ? x : best), Speech.RATES[1]).id;
  Speech.rateOf = id => (Speech.RATES.find(x => x.id === id) || Speech.RATES[1]).rate;

  /* ---------- Langues et voix ---------- */
  const normLang = l => String(l || '').replace(/_/g, '-').toLowerCase();
  const CJK = /[㐀-䶿一-鿿豈-﫿]/;
  Speech.langOf = text => (CJK.test(text || '') ? 'zh-CN' : 'fr-FR');

  // 0 = mandarin de Chine, 9 = pas du mandarin (cantonais), 99 = pas du chinois
  function zhRank(v) {
    const l = normLang(v.lang);
    if (/^(yue|zh-hk|zh-yue)/.test(l)) return 9;
    if (/^(zh-cn|cmn-cn|zh-hans|cmn-hans|zh-sg)/.test(l)) return 0;
    if (l === 'zh' || l === 'cmn') return 1;
    if (/^(zh-tw|cmn-tw|zh-hant|cmn-hant)/.test(l)) return 2;
    return /^(zh|cmn)/.test(l) ? 3 : 99;
  }
  function frRank(v) {
    const l = normLang(v.lang);
    if (l === 'fr-fr') return 0;
    if (l === 'fr') return 1;
    return /^fr/.test(l) ? 2 : 99;
  }
  const byQuality = rank => (a, b) => rank(a) - rank(b) || (b.localService ? 1 : 0) - (a.localService ? 1 : 0) ||
    (b.default ? 1 : 0) - (a.default ? 1 : 0) || String(a.name).localeCompare(String(b.name));

  let voices = [], initPromise = null;

  function readVoices() {
    const S = synth();
    try { voices = S && S.getVoices ? Array.prototype.slice.call(S.getVoices()) : []; } catch (e) { voices = []; }
    return voices.length;
  }

  // Les voix arrivent parfois après le chargement (événement voiceschanged) : on attend jusqu'à 3 s.
  Speech.init = function () {
    if (initPromise) return initPromise;
    initPromise = new Promise(resolve => {
      const S = synth();
      if (!S) { resolve([]); return; }
      if (readVoices()) { resolve(voices); return; }
      let tries = 0, iv = null;
      const finish = () => {
        clearInterval(iv);
        if (S.removeEventListener) S.removeEventListener('voiceschanged', onChange);
        resolve(voices);
      };
      const onChange = () => { if (readVoices()) finish(); };
      if (S.addEventListener) S.addEventListener('voiceschanged', onChange);
      iv = setInterval(() => { if (readVoices() || ++tries >= 12) finish(); }, 250);
    });
    return initPromise;
  };
  // Relit la liste des voix (utile après l'installation d'une voix dans les réglages du téléphone).
  Speech.refresh = function () { initPromise = null; return Speech.init(); };
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden && initPromise) Speech.refresh(); });
  }

  Speech.voices = () => voices.slice();
  Speech.zhVoices = () => voices.filter(v => zhRank(v) < 9).sort(byQuality(zhRank));
  Speech.frVoices = () => voices.filter(v => frRank(v) < 99).sort(byQuality(frRank));
  Speech.label = v => v.name + ' (' + normLang(v.lang) + (v.localService === false ? ', en ligne' : '') + ')';

  // Voix à utiliser pour une langue : celle choisie dans les réglages si elle convient, sinon la meilleure.
  Speech.pickVoice = function (lang, uri) {
    const zh = /^zh/i.test(lang);
    const pool = zh ? Speech.zhVoices() : Speech.frVoices();
    if (uri) {
      const chosen = pool.find(v => v.voiceURI === uri);
      if (chosen) return chosen;
    }
    return pool[0] || null;
  };

  Speech.status = function (uri) {
    const zh = Speech.zhVoices();
    return { supported: Speech.supported(), total: voices.length, zh: zh, hasZh: zh.length > 0, chosen: Speech.pickVoice('zh-CN', uri) };
  };

  /* ---------- Lecture ---------- */
  let token = 0;
  const active = new Set();   // lectures en cours (pour pouvoir les interrompre)
  const waiters = new Set();  // pauses en cours

  function cancelSynth() { try { if (synth()) synth().cancel(); } catch (e) { /* sans importance */ } }

  // Interrompt tout ce qui est en cours et ouvre une nouvelle lecture.
  function begin() {
    const my = ++token;
    Array.from(active).forEach(f => f({ ok: false, cancelled: true }));
    active.clear();
    Array.from(waiters).forEach(f => f());
    waiters.clear();
    cancelSynth();
    return my;
  }

  function wait(ms, my) {
    return new Promise(resolve => {
      if (my !== token) { resolve(); return; }
      const t = setTimeout(done, ms);
      function done() { clearTimeout(t); waiters.delete(done); resolve(); }
      waiters.add(done);
    });
  }

  function speakOnce(text, o) {
    return new Promise(resolve => {
      const S = synth(), U = Utter();
      if (!S || !U) { resolve({ ok: false, reason: 'unsupported' }); return; }
      let u;
      try { u = new U(text); } catch (e) { resolve({ ok: false, reason: 'error' }); return; }
      const lang = o.lang || Speech.langOf(text);
      u.lang = lang;
      const v = Speech.pickVoice(lang, o.voiceURI);
      if (v) { u.voice = v; if (v.lang) u.lang = v.lang; }
      u.rate = Math.min(2, Math.max(0.3, o.rate || 0.8));
      u.pitch = 1;
      u.volume = 1;
      let done = false, started = false, tEnd = null, tStart = null;
      const finish = res => {
        if (done) return;
        done = true;
        clearTimeout(tEnd); clearTimeout(tStart);
        active.delete(finish);
        resolve(res);
      };
      active.add(finish);
      u.onstart = () => { started = true; clearTimeout(tStart); if (o.onstart) { try { o.onstart(); } catch (e) { /* sans importance */ } } };
      u.onend = () => finish({ ok: true });
      u.onerror = e => {
        const err = e && e.error;
        if (err === 'canceled' || err === 'interrupted') finish({ ok: false, cancelled: true });
        else finish({ ok: false, reason: err || 'error' });
      };
      // Garde-fous : certains moteurs n'envoient jamais onend, ou ne démarrent jamais (voix absente).
      tEnd = setTimeout(() => { cancelSynth(); finish({ ok: true, watchdog: true }); }, 7000 + (String(text).length * 500) / u.rate);
      tStart = setTimeout(() => { if (!started && !done) { cancelSynth(); finish({ ok: false, reason: 'no-start' }); } }, o.startTimeout || 6000);
      try { S.speak(u); } catch (e) { finish({ ok: false, reason: 'speak-failed' }); }
    });
  }

  // Joue une suite de morceaux : { text, lang?, rate? } ou { pause: secondes }.
  // Renvoie { ok } ou { ok:false, cancelled } ou { ok:false, reason }.
  Speech.play = async function (parts, opts) {
    opts = opts || {};
    const my = begin();
    await wait(70, my);   // laisse le moteur se remettre (Android)
    for (let i = 0; i < parts.length; i++) {
      if (my !== token) return { ok: false, cancelled: true };
      const p = parts[i];
      if (p.pause) { await wait(p.pause * 1000, my); continue; }
      if (!p.text) continue;
      if (opts.onPart) { try { opts.onPart(i, p); } catch (e) { /* sans importance */ } }
      const r = await speakOnce(p.text, { lang: p.lang, rate: p.rate || opts.rate, voiceURI: opts.voiceURI, startTimeout: opts.startTimeout });
      if (my !== token) return { ok: false, cancelled: true };
      if (!r.ok) return r;
    }
    return { ok: true };
  };

  Speech.say = (text, opts) => Speech.play([{ text: text }], opts);
  Speech.stop = function () { begin(); };
  Speech.busy = () => active.size > 0;

  // Phrase d'essai du test de voix : « Bonjour, nous commençons la dictée. »
  Speech.SAMPLE = '你好，我们开始听写。';

  // Message clair pour une erreur de lecture.
  Speech.explain = function (res) {
    if (!res || res.ok || res.cancelled) return '';
    if (res.reason === 'unsupported') return 'Ce navigateur ne sait pas lire à voix haute.';
    if (res.reason === 'no-start') return 'Aucun son n’a démarré : la voix chinoise n’est peut-être pas installée (voir Réglages, Voix).';
    if (res.reason === 'not-allowed') return 'Le navigateur a bloqué le son : touche un bouton de lecture pour l’autoriser.';
    if (res.reason === 'language-unavailable' || res.reason === 'voice-unavailable') return 'La voix chinoise n’est pas disponible sur ce téléphone (voir Réglages, Voix).';
    return 'La voix a échoué (' + res.reason + ').';
  };

  root.Speech = Speech;
})(typeof self !== 'undefined' ? self : this);
