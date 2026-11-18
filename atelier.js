/* atelier.js — atelier de phrases, corrections reçues (« Mes erreurs »), erreurs récurrentes, fiche de leçon.
   L'appli ne corrige rien : tu écris, tu fais corriger (prof, Claude, ami), puis tu notes la correction ici. */
(function (root) {
  'use strict';
  const h = UI.h, zh = UI.zh, icon = UI.icon;
  const today = UI.today;
  const doc = root.document;
  const Views = root.Views = root.Views || {};
  const U = Views.util;
  const plural = U.plural;

  const fresh = w => Store.words.get(w.id) || w;
  const isEnter = e => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;
  const maybeZh = t => (Core.hasCJK(t) ? zh(t) : t);
  const enc = encodeURIComponent;
  const atelierUrl = id => '/atelier' + (id ? '?lesson=' + enc(id) : '');
  const writeUrl = id => '/atelier/ecrire?lesson=' + enc(id);
  const sentencesUrl = id => '/atelier/phrases?lesson=' + enc(id);
  const RATING = { juste: 'juste', incomplete: 'incomplète', revoir: 'à revoir' };

  // Leçon visée : celle de l'adresse (?lesson=…), sinon la leçon en cours.
  function lessonOf(ctx) {
    const id = ctx.query && ctx.query.lesson;
    if (id && Store.lessons.has(id)) return Store.lessons.get(id);
    return U.currentLesson();
  }

  /* ------------------------------------------------------------------ */
  /* Copier du texte (presse-papiers, avec secours si l'appareil refuse)  */
  /* ------------------------------------------------------------------ */
  U.copyText = async function (text, title) {
    let ok = false;
    try {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { await root.navigator.clipboard.writeText(text); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        const tmp = h('textarea', { 'aria-hidden': 'true', readonly: true, style: { position: 'fixed', top: '0', left: '0', opacity: '0' } });
        tmp.value = text; doc.body.appendChild(tmp); tmp.focus(); tmp.select();
        ok = !!doc.execCommand('copy');
        doc.body.removeChild(tmp);
      } catch (e) { ok = false; }
    }
    if (ok) { UI.toast('Copié.'); return true; }
    const ta = h('textarea', { class: 'inp', rows: '10', readonly: true, 'aria-label': title || 'Texte à copier' });
    ta.value = text;
    UI.sheet(title || 'Texte à copier', h('div', { class: 'form' },
      h('p', { class: 'hint' }, 'La copie automatique est bloquée ici. Appuie longuement dans le texte, choisis « Tout sélectionner », puis « Copier ».'), ta));
    setTimeout(() => { try { ta.focus(); ta.select(); } catch (e) { /* sans importance */ } }, 80);
    return false;
  };

  /* ------------------------------------------------------------------ */
  /* Progression de l'objectif de leçon : 3 à 5 phrases, au moins 5 mots  */
  /* ------------------------------------------------------------------ */
  const writingRatio = wr => (Math.min(wr.sentences, 3) / 3 + Math.min(wr.words, 5) / 5) / 2;

  function progressEl(wr) {
    return h('div', { class: 'stack' },
      h('dl', { class: 'stats two' },
        h('div', null, h('dt', null, 'Phrases (3 à 5)'), h('dd', null, String(wr.sentences))),
        h('div', null, h('dt', null, 'Mots utilisés (5 min.)'), h('dd', null, wr.words + ' / 5'))),
      UI.bar(writingRatio(wr)));
  }

  /* ------------------------------------------------------------------ */
  /* Rangées de la page « leçon »                                         */
  /* ------------------------------------------------------------------ */
  U.atelierRows = function (ctx, id, words) {
    const wr = Core.lessonWriting(words), vocab = words.filter(w => w.rubrique === '生词' && w.hanzi).length;
    const sub = !vocab ? 'Ajoute d’abord des mots 生词.'
      : wr.ok ? 'Objectif atteint : ' + plural(wr.sentences, 'phrase', 'phrases') + ', ' + plural(wr.words, 'mot', 'mots') + '.'
        : plural(wr.sentences, 'phrase écrite', 'phrases écrites') + ', ' + wr.words + ' mot' + (wr.words > 1 ? 's' : '') + ' sur 5.';
    const row = (ic, title, text, enabled, path) => h('button', { class: 'row' + (enabled ? '' : ' off'), disabled: !enabled, onclick: () => ctx.go(path) },
      h('span', { class: 'num' }, icon(ic)),
      h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub' }, text)),
      h('span', { class: 'row-end' }, icon('chevR')));
    return [
      row('pen', 'Écrire des phrases', sub, vocab > 0, writeUrl(id)),
      row('paper', 'Fiche de la leçon', 'Mes phrases, mes règles, mes paires et mes erreurs sur une page.', true, '/lecon/' + id + '/fiche')
    ];
  };

  /* ------------------------------------------------------------------ */
  /* Fiche « Noter une correction reçue » (création et modification)      */
  /* ------------------------------------------------------------------ */
  U.openErrorSheet = function (ctx, init, onDone) {
    init = init || {};
    const editing = !!init.id;
    const st = { tags: (init.tags || []).slice(), source: init.source || '' };
    const area = (cls, rows, label, ph) => h('textarea', { class: 'inp ' + cls, lang: cls === 'zh' ? 'zh-Hans' : null, rows: String(rows), 'aria-label': label, placeholder: ph, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const original = area('zh', 2, 'Ma version', '我写的句子');
    const corrected = area('zh', 2, 'Version corrigée', '改正后的句子');
    const note = area('', 2, 'Explication reçue', 'Pourquoi c’était faux (facultatif)');
    original.value = init.original || ''; corrected.value = init.corrected || ''; note.value = init.note || '';

    const tagBox = h('div', { class: 'chips' });
    const custom = h('input', { class: 'inp', type: 'text', 'aria-label': 'Autre étiquette', placeholder: 'Autre étiquette', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'done' });
    function knownTags() {
      const all = Core.ERROR_TAGS.slice();
      Core.errorTagStats(Store.allErrors()).forEach(s => { if (s.tag && all.indexOf(s.tag) < 0) all.push(s.tag); });
      st.tags.forEach(t => { if (all.indexOf(t) < 0) all.push(t); });
      return all;
    }
    function drawTags() {
      UI.clear(tagBox);
      knownTags().forEach(t => tagBox.append(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(st.tags.indexOf(t) >= 0),
        onclick: () => { const i = st.tags.indexOf(t); if (i >= 0) st.tags.splice(i, 1); else st.tags.push(t); drawTags(); }
      }, maybeZh(t))));
    }
    function addCustom() {
      const v = custom.value.trim().replace(/\s+/g, ' ');
      if (!v) return;
      if (st.tags.indexOf(v) < 0) st.tags.push(v);
      custom.value = ''; drawTags();
    }
    custom.addEventListener('keydown', e => { if (isEnter(e)) { e.preventDefault(); addCustom(); } });
    drawTags();

    const source = UI.seg([{ value: '', label: 'Non précisé' }].concat(Core.ERROR_SOURCES.map(s => ({ value: s.value, label: s.label }))), st.source, v => { st.source = v; });

    let sheet = null;
    const save = h('button', { class: 'btn primary block' }, editing ? 'Enregistrer' : 'Noter cette erreur');
    save.addEventListener('click', async () => {
      if (custom.value.trim()) addCustom();
      const o = original.value.trim(), c = corrected.value.trim();
      if (!o && !c) { UI.toast('Écris ta version ou la version corrigée.', 'warn'); original.focus(); return; }
      save.disabled = true;
      const wid = init.wordId || null, w = wid ? Store.words.get(wid) : null;
      const e = Core.makeError({
        id: init.id, date: init.date, wordId: wid, lessonId: init.lessonId || (w ? w.lessonId : null),
        original: o, corrected: c, note: note.value, tags: st.tags, source: st.source
      }, today());
      if (editing && init.ts) e.ts = init.ts;
      await Store.putError(e);
      sheet.close();
      UI.toast(editing ? 'Erreur modifiée' : 'Erreur notée');
      if (onDone) onDone(e);
    });

    const del = editing ? h('button', { class: 'btn block danger', type: 'button' }, 'Supprimer cette erreur') : null;
    if (del) del.addEventListener('click', async () => {
      if (!(await UI.confirm('Supprimer cette erreur ?', { ok: 'Supprimer', danger: true }))) return;
      await Store.deleteError(init.id);
      sheet.close(); UI.toast('Erreur supprimée');
      if (onDone) onDone(null);
    });

    sheet = UI.sheet(editing ? 'Modifier l’erreur' : 'Correction reçue', h('div', { class: 'form' },
      UI.field('Ma version', original), UI.field('Version corrigée', corrected),
      h('div', { class: 'field' }, h('p', { class: 'lbl' }, 'Type d’erreur'), tagBox,
        h('div', { class: 'row-input' }, custom, h('button', { class: 'btn small-btn', type: 'button', onclick: addCustom }, icon('plus'), 'Ajouter'))),
      UI.field('Explication reçue', note),
      h('div', { class: 'field' }, h('p', { class: 'lbl' }, 'Corrigée par'), source),
      save, del));
    setTimeout(() => (init.original && !init.corrected ? corrected : original).focus(), 140);
  };

  /* ------------------------------------------------------------------ */
  /* Bloc « Mes erreurs » (atelier) : pièges habituels et compteur        */
  /* ------------------------------------------------------------------ */
  function errorsBlock(ctx, lesson) {
    const errors = Store.allErrors(), stats = Core.errorTagStats(errors);
    const count = new Map(stats.map(s => [s.tag, s.count]));
    const watch = Core.ERROR_TAGS.slice();
    stats.forEach(s => { if (s.tag && s.recurrent && watch.indexOf(s.tag) < 0) watch.push(s.tag); });
    return h('section', { class: 'block' },
      h('h2', null, 'Mes erreurs'),
      h('p', { class: 'muted' }, errors.length ? plural(errors.length, 'correction notée', 'corrections notées') + '. Touche un piège pour voir ses occurrences.' : 'Aucune correction notée pour l’instant. Note celles que tu reçois : les erreurs qui reviennent apparaîtront ici.'),
      h('div', { class: 'chips' }, watch.map(t => {
        const n = count.get(t) || 0;
        return h('button', { class: 'chip trap' + (n >= 2 ? ' hot' : ''), type: 'button', onclick: () => ctx.go('/atelier/erreurs?tag=' + enc(t)) }, maybeZh(t), h('span', { class: 'chip-n' }, '×' + n));
      })),
      h('button', { class: 'btn block', onclick: () => U.openErrorSheet(ctx, { lessonId: lesson ? lesson.id : null }, () => ctx.refresh()) }, icon('plus'), 'Noter une correction reçue'),
      errors.length ? h('div', { class: 'link-row' }, h('button', { class: 'link-btn', onclick: () => ctx.go('/atelier/erreurs') }, 'Toutes mes erreurs (' + errors.length + ')')) : null);
  }

  /* ------------------------------------------------------------------ */
  /* Écran « Atelier »                                                   */
  /* ------------------------------------------------------------------ */
  Views.atelier = function (ctx) {
    const rootEl = ctx.root;
    rootEl.append(h('header', { class: 'home-head' }, h('p', { class: 'kicker' }, 'Phrases et erreurs'), h('h1', null, 'Atelier')));
    const lesson = lessonOf(ctx), lessons = Store.allLessons();
    if (!lesson) {
      rootEl.append(UI.empty('Pas encore de leçon', 'Crée une leçon et ajoute des mots : l’atelier te fait ensuite écrire des phrases avec eux.',
        h('button', { class: 'btn primary', onclick: () => ctx.go('/nouvelle-lecon') }, 'Créer une leçon')), errorsBlock(ctx, null));
      return;
    }
    if (lessons.length > 1) {
      const sel = h('select', { class: 'inp', 'aria-label': 'Leçon' }, lessons.map(l => h('option', { value: l.id }, U.lessonName(l))));
      sel.value = lesson.id;
      sel.addEventListener('change', () => ctx.go(atelierUrl(sel.value)));
      rootEl.append(h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', { class: 'lbl', for: 'atelier-lesson' }, 'Leçon'), sel));
      sel.id = 'atelier-lesson';
    } else rootEl.append(h('p', { class: 'sub', style: { marginTop: '6px' } }, U.lessonName(lesson)));

    const words = Store.wordsOf(lesson.id), vocab = words.filter(w => w.rubrique === '生词' && w.hanzi);
    const wr = Core.lessonWriting(words);
    const s = h('section', { class: 'block' }, h('h2', null, 'Phrases de la leçon'));
    if (!vocab.length) {
      s.append(h('p', { class: 'muted' }, 'Cette leçon n’a pas encore de mots 生词. Ajoute-en pour écrire des phrases avec eux.'),
        h('button', { class: 'btn block', onclick: () => ctx.go('/lecon/' + lesson.id + '/ajout') }, 'Ajouter des mots'));
    } else {
      s.append(progressEl(wr),
        h('p', { class: 'muted' }, wr.ok ? 'Objectif atteint. Tu peux continuer à écrire.' : 'Fin de leçon : 3 à 5 phrases qui réunissent au moins 5 mots de la leçon.'),
        h('button', { class: 'btn primary block', onclick: () => ctx.go(writeUrl(lesson.id)) }, icon('pen'), 'Écrire une phrase'),
        h('div', { class: 'link-row' },
          h('button', { class: 'link-btn', onclick: () => ctx.go(sentencesUrl(lesson.id)) }, 'Mes phrases (' + wr.sentences + ')'),
          h('button', { class: 'link-btn', onclick: () => ctx.go('/lecon/' + lesson.id + '/fiche') }, 'Fiche de la leçon')));
    }
    rootEl.append(s, U.writingBlock ? U.writingBlock(ctx, lesson) : null, errorsBlock(ctx, lesson));
  };

  /* ------------------------------------------------------------------ */
  /* Écrire une phrase : un mot, ma phrase, enregistrée                   */
  /* ------------------------------------------------------------------ */
  Views.writeSentence = function (ctx) {
    const lesson = lessonOf(ctx);
    if (!lesson) return U.notFound(ctx);
    const rootEl = ctx.root, lid = lesson.id;
    const queue = Core.writeQueue(Store.wordsOf(lid));
    if (!queue.length) {
      rootEl.append(UI.empty('Aucun mot à écrire', 'L’atelier fait écrire des phrases avec les mots 生词 de la leçon. Cette leçon n’en a pas encore.', [
        h('button', { class: 'btn primary', onclick: () => ctx.go('/lecon/' + lid + '/ajout') }, 'Ajouter des mots'),
        h('button', { class: 'btn', onclick: () => ctx.go(atelierUrl(lid)) }, 'Retour à l’atelier')]));
      return;
    }
    UI.setFocus(true);
    let i = 0, saved = 0, typed = '', wasOk = Core.lessonWriting(Store.wordsOf(lid)).ok;
    const back = () => ctx.go(atelierUrl(lid));
    const quit = async () => {
      if (typed.trim() && !(await UI.confirm('Quitter ?', { detail: 'La phrase en cours ne sera pas gardée.', ok: 'Quitter' }))) return;
      back();
    };

    function frame(inner, actions) {
      const wr = Core.lessonWriting(Store.wordsOf(lid));
      UI.clear(rootEl);
      rootEl.append(
        UI.focusTop({ title: 'Écrire des phrases', onQuit: quit }),
        h('div', { class: 'focus-bar' }, UI.bar(writingRatio(wr))),
        h('p', { class: 'muted small write-count' }, plural(wr.sentences, 'phrase', 'phrases') + ' au total, ' + wr.words + ' / 5 mots de la leçon utilisés'),
        inner);
      if (actions && actions.length) rootEl.append(h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-inner' }, actions)));
      root.scrollTo(0, 0);
    }

    function nextWord() { typed = ''; i++; if (i < queue.length) drawWrite(); else finish(); }

    function drawWrite() {
      const w = fresh(queue[i]);
      typed = '';
      const mine = (w.sentences || []).filter(s => s && s.text).slice(-2);
      const input = h('textarea', { class: 'inp zh', lang: 'zh-Hans', rows: '3', 'aria-label': 'Ma phrase', placeholder: '用这个词写一个句子', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      const warn = h('p', { class: 'hint warn', hidden: true });
      const btn = h('button', { class: 'btn primary block', disabled: true }, 'Enregistrer ma phrase');
      let warned = false;
      input.addEventListener('input', () => {
        typed = input.value; btn.disabled = input.value.trim().length < 2;
        warned = false; warn.hidden = true; btn.textContent = 'Enregistrer ma phrase';
      });
      btn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (text.length < 2) return;
        if (text.indexOf(w.hanzi) < 0 && !warned) {
          warned = true; warn.textContent = 'Ta phrase ne contient pas « ' + w.hanzi + ' » tel quel. Vérifie, ou valide quand même.';
          warn.hidden = false; btn.textContent = 'Valider quand même'; return;
        }
        btn.disabled = true;
        const d = today(), cur = fresh(w);
        await Store.putWord(Object.assign({}, cur, { sentences: (cur.sentences || []).concat([{ text: text, date: d }]), updatedAt: Date.now() }));
        await Store.addReview(Core.makeReview(cur, 'ecrite', null, d, ''));
        saved++; typed = '';
        drawSaved(text, w);
      });

      const sense = h('div', { class: 'sense' });
      const senseBtn = h('button', { class: 'link-btn', type: 'button' }, 'Rappel du sens');
      senseBtn.addEventListener('click', () => {
        UI.clear(sense);
        const have = [w.fr, w.defZh].filter(Boolean);
        if (!have.length) sense.append(h('p', { class: 'muted' }, 'Aucun sens saisi pour ce mot.'));
        else have.forEach((t, k) => sense.append(h('p', { class: k ? 'zh' : 'answer-fr', lang: k ? 'zh-Hans' : null }, t)));
      });
      sense.append(senseBtn);

      frame(h('div', null,
        h('p', { class: 'step-title' }, 'Écris une phrase avec ce mot'),
        h('div', null, h('div', { class: 'cells' }, Array.from(w.hanzi).map(c => h('span', { class: 'cell zh', lang: 'zh-Hans' }, c))),
          h('div', { class: 'py-row' }, w.pinyin ? h('p', { class: 'answer-py' }, w.pinyin) : null, U.speakBtn(w.hanzi))),
        sense,
        mine.length ? h('div', { class: 'mine-card' }, h('p', { class: 'lbl' }, 'Déjà écrit avec ce mot'), mine.map(s => h('p', { class: 'zh', lang: 'zh-Hans' }, s.text))) : null,
        h('div', { style: { marginTop: '12px' } }, input), warn,
        h('button', { class: 'link-btn', type: 'button', onclick: nextWord }, i < queue.length - 1 ? 'Passer ce mot' : 'Terminer sans écrire')), [btn]);
      setTimeout(() => input.focus(), 60);
    }

    function drawSaved(text, w) {
      const words = Store.wordsOf(lid), wr = Core.lessonWriting(words), used = Core.vocabIn(words, text);
      const reached = wr.ok && !wasOk; wasOk = wr.ok;
      const last = i >= queue.length - 1;
      frame(h('div', { class: 'stack' },
        h('p', { class: 'step-title' }, 'Phrase enregistrée'),
        h('div', { class: 'mine-card' },
          h('p', { class: 'sentence zh', lang: 'zh-Hans' }, UI.highlight(text, w.hanzi)),
          used.length ? h('div', { class: 'chips' }, used.map(u => h('span', { class: 'tag zh', lang: 'zh-Hans' }, u.hanzi))) : null),
        reached ? h('p', { class: 'note-good' }, 'Objectif de la leçon atteint : ' + plural(wr.sentences, 'phrase', 'phrases') + ', ' + plural(wr.words, 'mot', 'mots') + '.') : null,
        h('button', { class: 'link-btn', type: 'button', onclick: () => U.openErrorSheet(ctx, { original: text, wordId: w.id, lessonId: lid }, () => { /* la fiche confirme déjà */ }) }, 'J’ai reçu une correction pour cette phrase')),
      [h('button', { class: 'btn primary block', onclick: nextWord }, last ? 'Terminer' : 'Mot suivant'),
        h('button', { class: 'btn block', onclick: drawWrite }, 'Une autre phrase avec ce mot')]);
    }

    function finish() {
      UI.setFocus(false);
      const wr = Core.lessonWriting(Store.wordsOf(lid));
      UI.clear(rootEl);
      rootEl.append(h('div', { class: 'stack' },
        h('div', { class: 'recap' }, h('p', { class: 'kicker' }, 'Atelier terminé'), h('p', { class: 'recap-score' }, saved ? plural(saved, 'phrase écrite', 'phrases écrites') : 'Aucune nouvelle phrase')),
        progressEl(wr),
        h('p', { class: 'muted' }, wr.ok ? 'Objectif de la leçon atteint.' : 'Fin de leçon : 3 à 5 phrases qui réunissent au moins 5 mots de la leçon.'),
        h('button', { class: 'btn primary block', onclick: () => ctx.go(sentencesUrl(lid)) }, 'Voir mes phrases'),
        h('button', { class: 'btn block', onclick: () => ctx.go('/lecon/' + lid + '/fiche') }, 'Fiche de la leçon'),
        h('button', { class: 'btn block ghost', onclick: back }, 'Retour à l’atelier')));
      root.scrollTo(0, 0);
    }
    drawWrite();
  };

  /* ------------------------------------------------------------------ */
  /* Mes phrases : liste, copie pour Claude, correction, modification     */
  /* ------------------------------------------------------------------ */
  function patchSentences(wordId, fn) {
    const cur = Store.words.get(wordId);
    if (!cur) return Promise.resolve();
    return Store.putWord(Object.assign({}, cur, { sentences: fn((cur.sentences || []).slice()), updatedAt: Date.now() }));
  }

  function editSentence(ctx, s) {
    const input = h('textarea', { class: 'inp zh', lang: 'zh-Hans', rows: '3', 'aria-label': 'Ma phrase', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    input.value = s.text;
    let sheet = null;
    const btn = h('button', { class: 'btn primary block' }, 'Enregistrer');
    btn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (text.length < 2) { UI.toast('Écris ta phrase.', 'warn'); return; }
      btn.disabled = true;
      await patchSentences(s.wordId, list => { if (list[s.idx]) list[s.idx] = Object.assign({}, list[s.idx], { text: text, sent: '' }); return list; });
      sheet.close(); UI.toast('Phrase modifiée'); ctx.refresh();
    });
    sheet = UI.sheet('Modifier ma phrase', h('div', { class: 'form' }, input, btn));
    setTimeout(() => input.focus(), 120);
  }

  function sentenceSheet(ctx, s) {
    const w = Store.words.get(s.wordId);
    let sheet = null;
    const close = () => { if (sheet) sheet.close(); };
    sheet = UI.sheet('Ma phrase', h('div', { class: 'stack' },
      h('p', { class: 'sentence zh', lang: 'zh-Hans' }, UI.highlight(s.text, s.hanzi)),
      h('button', { class: 'btn primary block', onclick: () => { close(); U.openErrorSheet(ctx, { original: s.text, wordId: s.wordId, lessonId: w ? w.lessonId : null }, () => ctx.refresh()); } }, 'Noter la correction reçue'),
      h('button', { class: 'btn block', onclick: () => { close(); editSentence(ctx, s); } }, 'Modifier ma phrase'),
      h('button', { class: 'btn block danger', onclick: async () => {
        close();
        if (!(await UI.confirm('Supprimer cette phrase ?', { ok: 'Supprimer', danger: true }))) return;
        await patchSentences(s.wordId, list => list.filter((x, k) => k !== s.idx));
        UI.toast('Phrase supprimée'); ctx.refresh();
      } }, 'Supprimer')));
  }

  Views.sentences = function (ctx) {
    const lesson = lessonOf(ctx);
    if (!lesson) return U.notFound(ctx);
    const rootEl = ctx.root, lid = lesson.id;
    const words = Store.wordsOf(lid);
    const list = Core.mySentences(words).reverse().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    rootEl.append(UI.pageHead({ title: 'Mes phrases', sub: U.lessonName(lesson), back: () => ctx.go(atelierUrl(lid)) }));
    if (!list.length) {
      rootEl.append(UI.empty('Aucune phrase pour l’instant', 'Écris une phrase avec un mot de la leçon : elle apparaîtra ici.',
        h('button', { class: 'btn primary', onclick: () => ctx.go(writeUrl(lid)) }, 'Écrire une phrase')));
      return;
    }
    const pending = list.filter(s => !s.sent);
    const copy = async (set) => {
      const text = Core.claudeText(set, Core.errorTagStats(Store.allErrors()), U.lessonName(lesson));
      const ok = await U.copyText(text, 'Mes phrases pour Claude');
      if (!ok) return;
      const d = today(), byWord = new Map();
      set.forEach(s => { if (!byWord.has(s.wordId)) byWord.set(s.wordId, []); byWord.get(s.wordId).push(s.idx); });
      for (const [wid, idxs] of byWord) await patchSentences(wid, arr => { idxs.forEach(k => { if (arr[k]) arr[k] = Object.assign({}, arr[k], { sent: d }); }); return arr; });
      ctx.refresh();
    };
    rootEl.append(h('div', { class: 'stack' },
      h('button', { class: 'btn primary block', onclick: () => copy(pending.length ? pending : list) },
        pending.length === list.length ? 'Copier ' + plural(list.length, 'phrase', 'phrases') + ' pour Claude' : pending.length ? 'Copier ' + plural(pending.length, 'nouvelle phrase', 'nouvelles phrases') + ' pour Claude' : 'Copier toutes mes phrases pour Claude'),
      h('p', { class: 'hint' }, 'Colle le texte dans Claude : il te dit où sont les erreurs sans réécrire ta phrase. Ensuite, note la correction reçue ici.'),
      pending.length && pending.length < list.length ? h('button', { class: 'link-btn', onclick: () => copy(list) }, 'Tout copier (' + list.length + ')') : null));
    rootEl.append(h('div', { class: 'sent-cards' }, list.map(s => h('div', { class: 'sent-card' },
      h('button', { class: 'sent-open', type: 'button', onclick: () => sentenceSheet(ctx, s) },
        h('span', { class: 'sent-main zh', lang: 'zh-Hans' }, UI.highlight(s.text, s.hanzi)),
        h('span', { class: 'sent-meta' },
          s.used.map(u => h('span', { class: 'tag zh', lang: 'zh-Hans' }, u)),
          s.sent ? h('span', { class: 'tag soft' }, 'copiée') : null)),
      U.speakBtn(s.text)))));
  };

  /* ------------------------------------------------------------------ */
  /* Mes erreurs : liste, filtre par type, erreurs récurrentes            */
  /* ------------------------------------------------------------------ */
  function errorCard(ctx, e, onChange) {
    const src = Core.ERROR_SOURCES.find(x => x.value === e.source);
    return h('button', { class: 'err-card', type: 'button', onclick: () => U.openErrorSheet(ctx, e, onChange) },
      e.original ? h('p', { class: 'err-orig zh', lang: 'zh-Hans' }, e.original) : null,
      e.corrected ? h('p', { class: 'err-fix zh', lang: 'zh-Hans' }, e.corrected) : null,
      e.note ? h('p', { class: 'err-note' }, e.note) : null,
      h('div', { class: 'err-meta' },
        h('span', { class: 'muted small' }, Core.formatFr(e.date, { day: 'numeric', month: 'short' }) + (src ? ', ' + src.label : '')),
        e.tags.map(t => h('span', { class: 'tag' }, maybeZh(t)))));
  }

  Views.errors = function (ctx) {
    const rootEl = ctx.root;
    let filter = ctx.query.tag || '';
    const chips = h('div', { class: 'chips' }), info = h('div', { class: 'stack' }), list = h('div', { class: 'stack' });
    const add = () => U.openErrorSheet(ctx, { tags: filter ? [filter] : [] }, draw);

    rootEl.append(UI.pageHead({ title: 'Mes erreurs', back: () => ctx.go('/atelier') }),
      h('div', { class: 'stack' }, h('button', { class: 'btn block', onclick: add }, icon('plus'), 'Noter une correction reçue'), chips, info, list));

    function draw() {
      const errors = Core.sortErrors(Store.allErrors()), stats = Core.errorTagStats(errors).filter(s => s.tag);
      UI.clear(chips); UI.clear(info); UI.clear(list);
      const tags = stats.slice();
      if (filter && !tags.some(s => s.tag === filter)) tags.push({ tag: filter, count: 0, recurrent: false });
      if (errors.length) {
        chips.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!filter), onclick: () => { filter = ''; draw(); } }, 'Toutes ' + errors.length));
        tags.forEach(s => chips.append(h('button', { class: 'chip' + (s.recurrent ? ' hot' : ''), type: 'button', 'aria-pressed': String(filter === s.tag), onclick: () => { filter = s.tag; draw(); } }, maybeZh(s.tag), h('span', { class: 'chip-n' }, '×' + s.count))));
      }
      const shown = errors.filter(e => !filter || e.tags.indexOf(filter) >= 0);
      const cur = tags.find(s => s.tag === filter);
      if (filter && cur && cur.recurrent) info.append(h('p', { class: 'note-warn' }, 'Cette erreur est déjà revenue ' + cur.count + ' fois. Écris trois phrases justes avec ce piège, sans regarder les corrections.'));
      if (!errors.length) {
        list.append(UI.empty('Aucune erreur notée', 'Quand ton prof, un ami ou Claude corrige une de tes phrases, note la correction ici. Au bout de deux erreurs du même type, l’appli te signale que c’est un piège récurrent.'));
      } else if (!shown.length) {
        list.append(h('p', { class: 'muted' }, 'Aucune erreur notée avec ce type pour l’instant.'));
      } else shown.forEach(e => list.append(errorCard(ctx, e, draw)));
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* Fiche de leçon : une page à relire, copier ou imprimer              */
  /* ------------------------------------------------------------------ */
  Views.fiche = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const words = Store.wordsOf(lessonId), d = Core.ficheData(words, Store.allErrors()), label = U.lessonName(lesson);
    const sec = (title, kids) => (kids.length ? h('section', { class: 'fiche-sec' }, h('h2', null, title), h('div', { class: 'stack' }, kids)) : null);
    const rated = (head, text, rating, missing) => h('div', { class: 'fiche-item' },
      h('p', { class: 'fiche-head' }, zh(head), rating ? h('span', { class: 'tag' + (rating === 'revoir' ? ' red' : ''), style: { marginLeft: '8px' } }, RATING[rating] || '') : null),
      h('p', null, text),
      missing ? h('p', { class: 'muted small' }, 'Il me manquait : ' + missing) : null);
    const empty = !d.sentences.length && !d.rules.length && !d.pairs.length && !d.combos.length && !d.errors.length;

    ctx.root.append(UI.pageHead({ title: 'Fiche de leçon', sub: label, back: () => ctx.go('/lecon/' + lessonId) }));
    if (empty) {
      ctx.root.append(UI.empty('La fiche est vide', 'Elle se remplit avec tes phrases, tes règles d’emploi, tes paires à distinguer et tes erreurs.',
        h('button', { class: 'btn primary', onclick: () => ctx.go('/lecon/' + lessonId) }, 'Retour à la leçon')));
      return;
    }
    ctx.root.append(
      h('div', { class: 'fiche-top' }, h('p', { class: 'muted' }, plural(d.writing.sentences, 'phrase', 'phrases') + ', ' + plural(d.writing.words, 'mot', 'mots') + ' de la leçon utilisés' + (d.writing.ok ? '. Objectif atteint.' : ' (objectif : 3 à 5 phrases, 5 mots).'))),
      sec('Mes phrases', d.sentences.map(s => h('p', { class: 'fiche-sentence zh', lang: 'zh-Hans' }, s.text))),
      sec('Règles d’emploi', d.rules.map(r => rated(r.hanzi, r.text, r.rating, r.missing))),
      sec('Paires à distinguer', d.pairs.map(r => rated(r.hanzi, r.text, r.rating, r.missing))),
      sec('Combinaisons à retenir', d.combos.map(c => h('div', { class: 'fiche-item' }, h('p', { class: 'fiche-head' }, zh(c.hanzi)), h('p', { class: 'zh', lang: 'zh-Hans' }, c.missed.join('  ·  '))))),
      sec('Mes erreurs', d.errors.map(e => h('div', { class: 'fiche-item' },
        e.original ? h('p', { class: 'err-orig zh', lang: 'zh-Hans' }, e.original) : null,
        e.corrected ? h('p', { class: 'err-fix zh', lang: 'zh-Hans' }, e.corrected) : null,
        e.note ? h('p', { class: 'muted small' }, e.note) : null,
        e.tags.length ? h('div', { class: 'chips' }, e.tags.map(t => h('span', { class: 'tag' }, maybeZh(t)))) : null))),
      h('div', { class: 'stack no-print', style: { marginTop: '18px' } },
        h('button', { class: 'btn primary block', onclick: () => U.copyText(Core.ficheText(label, d), 'Fiche de leçon') }, 'Copier le texte'),
        h('button', { class: 'btn block', onclick: () => { try { root.print(); } catch (e) { UI.toast('L’impression n’est pas disponible ici.', 'warn'); } } }, 'Imprimer')));
  };
})(typeof self !== 'undefined' ? self : this);
