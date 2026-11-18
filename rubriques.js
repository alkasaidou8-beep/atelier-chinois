/* rubriques.js — les trois parcours du livre : règles d'emploi (词语例释), combinaisons (词语搭配),
   paires à distinguer (词语辨析).
   Principe : rien du livre n'est montré avant que j'aie produit ma version (règle, propositions, explication). */
(function (root) {
  'use strict';
  const h = UI.h, zh = UI.zh, icon = UI.icon;
  const today = UI.today;
  const Views = root.Views = root.Views || {};
  const U = Views.util;
  const plural = U.plural;

  const cells = (hanzi, small) => h('div', { class: 'cells' + (small ? ' sm' : '') }, Array.from(hanzi).map(c => h('span', { class: 'cell zh', lang: 'zh-Hans' }, c)));
  const isEnter = e => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;
  const fresh = w => Store.words.get(w.id) || w;
  const wordHead = w => h('div', null, cells(w.hanzi), h('div', { class: 'py-row' }, w.pinyin ? h('p', { class: 'answer-py' }, w.pinyin) : null, w.hanzi ? U.speakBtn(w.hanzi) : null));

  /* ------------------------------------------------------------------ */
  /* Rangées de la page « leçon »                                        */
  /* ------------------------------------------------------------------ */
  U.rubriqueRows = function (ctx, id, words) {
    const defs = [
      { rub: '词语例释', title: 'Règles d’emploi', ic: 'eye', path: '/regles', none: 'Ajoute des fiches 例释 avec au moins un exemple.' },
      { rub: '词语搭配', title: 'Combinaisons', ic: 'repeat', path: '/combinaisons', none: 'Ajoute des fiches 搭配.' },
      { rub: '词语辨析', title: 'Paires à distinguer', ic: 'shuffle', path: '/paires', none: 'Ajoute des fiches 辨析 écrites « A / B ».' }
    ];
    return defs.filter(d => words.some(w => w.rubrique === d.rub)).map(d => {
      const info = Core.rubriqueInfo(words, d.rub);
      const sub = info.total
        ? (info.todo ? plural(info.todo, 'fiche à travailler', 'fiches à travailler') : 'Tout est fait : tu peux tout revoir') + (info.unusable ? ' · ' + plural(info.unusable, 'fiche incomplète', 'fiches incomplètes') : '')
        : info.unusable ? plural(info.unusable, 'fiche incomplète', 'fiches incomplètes') + ' (voir le format d’import).' : d.none;
      return h('button', { class: 'row' + (info.total ? '' : ' off'), disabled: !info.total, onclick: () => ctx.go('/lecon/' + id + d.path) },
        h('span', { class: 'num' }, icon(d.ic)),
        h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, d.title), h('span', { class: 'row-sub' }, sub)),
        h('span', { class: 'row-end' }, icon('chevR')));
    });
  };

  /* ------------------------------------------------------------------ */
  /* Moteur commun : une file de fiches, un cadre plein écran, une fin    */
  /* ------------------------------------------------------------------ */
  function flow(ctx, lessonId, cfg) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const rootEl = ctx.root;
    const queue = Core.rubriqueQueue(Store.wordsOf(lessonId), cfg.rubrique);
    if (!queue.length) {
      rootEl.append(UI.empty(cfg.emptyTitle, cfg.emptyText, h('button', { class: 'btn primary', onclick: () => ctx.go('/lecon/' + lessonId) }, 'Retour à la leçon')));
      return;
    }
    UI.setFocus(true);
    let i = 0, done = 0;
    const api = {
      dirty: false,
      frame: function (inner, action) {
        UI.clear(rootEl);
        rootEl.append(
          UI.focusTop({ title: cfg.title + ' · ' + (i + 1) + '/' + queue.length, onQuit: quit }),
          h('div', { class: 'focus-bar' }, UI.bar(i / queue.length)),
          inner);
        if (action) rootEl.append(h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-inner' }, action)));
        root.scrollTo(0, 0);
      },
      isLast: () => i === queue.length - 1,
      next: function () { done++; i++; api.dirty = false; if (i < queue.length) cfg.item(api, fresh(queue[i])); else finish(); }
    };
    async function quit() {
      if ((done > 0 || api.dirty) && !(await UI.confirm('Quitter ?', { detail: done ? 'Les fiches terminées sont gardées.' : 'Ce que tu as écrit sur cette fiche sera perdu.', ok: 'Quitter' }))) return;
      ctx.go('/lecon/' + lessonId);
    }
    function finish() {
      UI.setFocus(false);
      UI.clear(rootEl);
      rootEl.append(h('div', null,
        h('div', { class: 'recap' }, h('p', { class: 'kicker' }, cfg.doneKicker), h('p', { class: 'recap-score' }, plural(done, cfg.unit[0], cfg.unit[1]))),
        h('p', { class: 'muted' }, cfg.doneText),
        h('div', { class: 'stack', style: { marginTop: '20px' } },
          h('button', { class: 'btn primary block', onclick: () => ctx.go('/atelier/ecrire?lesson=' + encodeURIComponent(lessonId)) }, 'Écrire des phrases'),
          h('button', { class: 'btn block', onclick: () => ctx.go('/lecon/' + lessonId) }, 'Retour à la leçon'))));
    }
    cfg.item(api, fresh(queue[0]));
  }

  // Comparaison finale : « Juste / Incomplète / À revoir » (auto-évaluation) et, si besoin, ce qui manquait.
  function ratingBlock(st, onChange) {
    const missing = h('textarea', { class: 'inp', rows: '2', 'aria-label': 'Ce qui me manquait', placeholder: 'Ce qui me manquait (facultatif)', spellcheck: 'false' });
    missing.value = st.missing || '';
    missing.addEventListener('input', () => { st.missing = missing.value; });
    const wrap = h('div', { class: 'stack' });
    const seg = UI.seg([{ value: 'juste', label: 'Juste' }, { value: 'incomplete', label: 'Incomplète' }, { value: 'revoir', label: 'À revoir' }], st.rating, v => { st.rating = v; paint(); onChange(); });
    function paint() { missing.hidden = !st.rating || st.rating === 'juste'; }
    wrap.append(h('p', { class: 'lbl' }, 'Comparée au livre, ma version était :'), seg, missing);
    paint();
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* 1. Règles d'emploi (词语例释) : deux exemples → ma règle → ma phrase */
  /* ------------------------------------------------------------------ */
  function ruleItem(api, w) {
    const ex = Core.examplesOf(w);
    const st = { rule: '', sentence: '', rating: '', missing: '', warned: false };
    const exItem = (t, k) => h('div', { class: 'ex' }, h('span', { class: 'ex-n' }, 'Exemple ' + (k + 1)),
      h('div', { class: 'py-row' }, h('p', { class: 'sentence zh', lang: 'zh-Hans' }, UI.highlight(t, w.hanzi)), U.speakBtn(t)));

    function drawRule() {
      const exList = h('div', { class: 'ex-list' }, ex.slice(0, 2).map(exItem));
      const input = h('textarea', { class: 'inp', rows: '4', 'aria-label': 'Ma règle', placeholder: 'Quand emploie-t-on ce mot ? Qu’est-ce qui vient avant, après ?', autocomplete: 'off', spellcheck: 'false' });
      input.value = st.rule;
      const hint = h('p', { class: 'hint', hidden: true });
      const btn = h('button', { class: 'btn primary block', disabled: input.value.trim().length < 8 }, 'Valider ma règle');
      let level = 0;
      const hintBtn = h('button', { class: 'link-btn', type: 'button' }, 'Un indice');
      hintBtn.addEventListener('click', () => {
        level++;
        if (level === 1) hint.textContent = 'Compare les exemples : qu’y a-t-il juste avant le mot, et juste après ?';
        else {
          if (ex.length > 2) { exList.append(exItem(ex[2], 2)); hint.textContent = 'Voici un exemple de plus.'; }
          else hint.textContent = 'Dans quels types de phrases ce mot apparaît-il : affirmation, question, ordre, comparaison ?';
          hintBtn.hidden = true;
        }
        hint.hidden = false;
      });
      input.addEventListener('input', () => { api.dirty = true; st.rule = input.value; btn.disabled = input.value.trim().length < 8; });
      btn.addEventListener('click', () => { st.rule = input.value.trim(); drawSentence(); });
      api.frame(h('div', null,
        h('p', { class: 'step-title' }, 'Que remarques-tu sur l’emploi de ce mot ?'),
        wordHead(w), exList,
        ex.length < 2 ? h('p', { class: 'hint' }, 'Un seul exemple dans la fiche.') : null,
        h('div', { style: { marginTop: '12px' } }, UI.field('Ma règle, avec mes mots', input)), hintBtn, hint), btn);
      setTimeout(() => input.focus(), 60);
    }

    function drawSentence() {
      const input = h('textarea', { class: 'inp zh', lang: 'zh-Hans', rows: '3', 'aria-label': 'Ma phrase', placeholder: '用这个词写一个句子', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      input.value = st.sentence;
      const warn = h('p', { class: 'hint warn', hidden: true });
      const btn = h('button', { class: 'btn primary block', disabled: input.value.trim().length < 2 }, 'Enregistrer ma phrase');
      input.addEventListener('input', () => { st.sentence = input.value; btn.disabled = input.value.trim().length < 2; warn.hidden = true; st.warned = false; btn.textContent = 'Enregistrer ma phrase'; });
      btn.addEventListener('click', () => {
        const text = input.value.trim();
        if (text.length < 2) return;
        if (text.indexOf(w.hanzi) < 0 && !st.warned) {
          st.warned = true; warn.textContent = 'Ta phrase ne contient pas « ' + w.hanzi + ' » tel quel. Vérifie, ou valide quand même.';
          warn.hidden = false; btn.textContent = 'Valider quand même'; return;
        }
        st.sentence = text; drawCompare();
      });
      api.frame(h('div', null,
        h('p', { class: 'step-title' }, 'Écris une phrase avec ce mot'),
        h('div', { class: 'mine-card' }, h('p', { class: 'lbl' }, 'Ma règle'), h('p', null, st.rule)),
        h('details', { class: 'fold' }, h('summary', null, 'Revoir les exemples'), h('div', { class: 'ex-list' }, ex.map(exItem))),
        h('div', { style: { marginTop: '12px' } }, input), warn), btn);
      setTimeout(() => input.focus(), 60);
    }

    function drawCompare() {
      const btn = h('button', { class: 'btn primary block', disabled: !st.rating }, api.isLast() ? 'Terminer' : 'Fiche suivante');
      const rating = ratingBlock(st, () => { btn.disabled = !st.rating; });
      const book = [];
      if (w.defZh) book.push(h('p', { class: 'zh book-zh', lang: 'zh-Hans' }, w.defZh));
      if (w.fr) book.push(h('p', { class: 'answer-fr' }, w.fr));
      if (!book.length) book.push(h('p', { class: 'muted' }, 'Aucune explication saisie dans cette fiche : compare avec ton livre.'));
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const d = today(), cur = fresh(w), old = cur.work || {};
        const work = Object.assign({}, old, { rule: { text: st.rule, date: d, rating: st.rating, missing: (st.missing || '').trim() }, doneAt: d, todo: st.rating === 'revoir', rounds: (old.rounds || 0) + 1 });
        await Store.putWord(Object.assign({}, cur, { work: work, sentences: (cur.sentences || []).concat([{ text: st.sentence, date: d }]), updatedAt: Date.now() }));
        await Store.addReview(Core.makeReview(cur, 'regle', st.rating === 'juste' ? true : st.rating === 'revoir' ? false : null, d, ''));
        api.next();
      });
      api.frame(h('div', { class: 'stack' },
        h('p', { class: 'step-title' }, 'Compare avec le livre'),
        h('div', { class: 'mine-card' }, h('p', { class: 'lbl' }, 'Ma règle'), h('p', null, st.rule)),
        h('div', { class: 'book-card' }, h('p', { class: 'lbl' }, 'Dans le livre'), book,
          ex.length > 2 ? h('div', { class: 'ex-list' }, ex.slice(2).map((t, k) => exItem(t, k + 2))) : null),
        rating), btn);
    }
    drawRule();
  }

  Views.rules = function (ctx, lessonId) {
    flow(ctx, lessonId, {
      rubrique: '词语例释', title: 'Règle d’emploi', item: ruleItem,
      emptyTitle: 'Rien à travailler', emptyText: 'Aucune fiche 词语例释 avec au moins un exemple. Ajoute des fiches (une ligne « + » par exemple en plus).',
      doneKicker: 'Règles terminées', unit: ['règle formulée', 'règles formulées'],
      doneText: 'Tes phrases sont gardées. Tu peux en écrire d’autres dans l’atelier.'
    });
  };

  /* ------------------------------------------------------------------ */
  /* 2. Combinaisons (词语搭配) : mes propositions → celles du livre      */
  /* ------------------------------------------------------------------ */
  function comboItem(api, w) {
    const book = Core.collocationsOf(w);
    const st = { mine: [] };
    function drawPropose() {
      const input = h('input', { class: 'inp zh', lang: 'zh-Hans', type: 'text', 'aria-label': 'Une combinaison', placeholder: '写一个搭配', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'done' });
      const addBtn = h('button', { class: 'btn small-btn', type: 'button' }, icon('plus'), 'Ajouter');
      const chips = h('div', { class: 'chips' });
      const need = h('p', { class: 'hint' });
      const hint = h('p', { class: 'hint', hidden: true });
      const hintBtn = h('button', { class: 'link-btn', type: 'button', hidden: true }, 'Un indice');
      const go = h('button', { class: 'btn primary block', disabled: true }, book.length ? 'Voir celles du livre' : 'Terminer');
      function paint() {
        UI.clear(chips);
        st.mine.forEach((m, k) => chips.append(h('span', { class: 'chip chip-del zh', lang: 'zh-Hans' }, m,
          h('button', { class: 'chip-x', type: 'button', 'aria-label': 'Retirer ' + m, onclick: () => { st.mine.splice(k, 1); paint(); } }, icon('close')))));
        const left = 2 - st.mine.length;
        need.textContent = left > 0 ? 'Propose au moins ' + plural(left, 'combinaison', 'combinaisons') + ' de plus avant de voir le livre.' : 'Tu peux en ajouter d’autres, ou voir celles du livre.';
        go.disabled = left > 0;
        hintBtn.hidden = !(st.mine.length >= 1 && book.length) || !hint.hidden;
      }
      function add() {
        const v = input.value.trim();
        if (!v) return;
        api.dirty = true;
        if (st.mine.indexOf(v) < 0) st.mine.push(v);
        input.value = ''; paint(); input.focus();
      }
      addBtn.addEventListener('click', add);
      input.addEventListener('keydown', e => { if (isEnter(e)) { e.preventDefault(); add(); } });
      hintBtn.addEventListener('click', () => { hint.textContent = book.length === 1 ? 'Le livre n’en donne qu’une.' : 'Le livre en donne ' + book.length + '.'; hint.hidden = false; hintBtn.hidden = true; });
      go.addEventListener('click', () => { if (input.value.trim()) add(); drawReveal(); });
      api.frame(h('div', null,
        h('p', { class: 'step-title' }, 'Quelles combinaisons connais-tu avec ce mot ?'),
        wordHead(w),
        h('div', { class: 'row-input' }, input, addBtn), chips, need, hintBtn, hint), go);
      paint();
      setTimeout(() => input.focus(), 60);
    }

    function drawReveal() {
      const m = Core.matchCombos(st.mine, book);
      const btn = h('button', { class: 'btn primary block' }, api.isLast() ? 'Terminer' : 'Fiche suivante');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const d = today(), cur = fresh(w), old = cur.work || {};
        const combos = (old.combos || []).slice();
        st.mine.forEach(t => { if (!combos.some(c => c.text === t)) combos.push({ text: t, date: d }); });
        const missed = m.rows.filter(r => !r.found).map(r => r.text);
        const work = Object.assign({}, old, { combos: combos, missed: missed, doneAt: d, todo: m.total > 0 && m.found * 2 < m.total, rounds: (old.rounds || 0) + 1 });
        await Store.putWord(Object.assign({}, cur, { work: work, updatedAt: Date.now() }));
        await Store.addReview(Core.makeReview(cur, 'combi', m.total ? m.found * 2 >= m.total : null, d, '', { found: m.found, total: m.total }));
        api.next();
      });
      api.frame(h('div', { class: 'stack' },
        h('p', { class: 'step-title' }, m.total ? 'Tu en as trouvé ' + m.found + ' sur ' + m.total : 'Aucune combinaison dans la fiche'),
        h('div', { class: 'cells-line' }, h('span', { class: 'zh big-word', lang: 'zh-Hans' }, w.hanzi), w.pinyin ? h('span', { class: 'answer-py' }, w.pinyin) : null),
        m.total ? h('div', { class: 'rows' }, m.rows.map(r => h('div', { class: 'combo-row' + (r.found ? ' found' : ' missed') },
          h('span', { class: 'combo-mark', 'aria-hidden': 'true' }, r.found ? icon('check') : ''),
          h('span', { class: 'zh combo-text', lang: 'zh-Hans' }, r.text),
          r.found ? null : h('span', { class: 'tag' }, 'à retenir')))) : h('p', { class: 'muted' }, 'Ajoute les combinaisons du livre avec des lignes « + » sous le mot (voir le format d’import).'),
        m.extra.length ? h('div', { class: 'mine-card' }, h('p', { class: 'lbl' }, 'Tes propositions hors livre'),
          h('div', { class: 'chips' }, m.extra.map(t => h('span', { class: 'chip zh', lang: 'zh-Hans' }, t))),
          h('p', { class: 'hint' }, 'Elles peuvent être justes : vérifie avec ton livre ou ton professeur.')) : null), btn);
    }
    drawPropose();
  }

  Views.combos = function (ctx, lessonId) {
    flow(ctx, lessonId, {
      rubrique: '词语搭配', title: 'Combinaisons', item: comboItem,
      emptyTitle: 'Rien à travailler', emptyText: 'Aucune fiche 词语搭配 dans cette leçon.',
      doneKicker: 'Combinaisons terminées', unit: ['mot travaillé', 'mots travaillés'],
      doneText: 'Les combinaisons qui t’ont manqué sont gardées pour la fiche de leçon.'
    });
  };

  /* ------------------------------------------------------------------ */
  /* 3. Paires à distinguer (词语辨析) : ma différence → phrases à trou   */
  /* ------------------------------------------------------------------ */
  const SEP_RE = /\s*[\/／≠、]\s*/;

  function pairItem(api, w) {
    const pair = Core.pairOf(w), gaps = Core.gapsOf(w);
    const py = String(w.pinyin || '').split(SEP_RE), fr = String(w.fr || '').split(SEP_RE);
    const sidePy = k => (py.length === 2 ? py[k] : '');
    const sideFr = k => (fr.length === 2 ? fr[k] : '');
    const st = { text: '', rating: '', missing: '', gi: 0, res: [], noteErrors: true };
    const fill = (g, word) => g.before + word + g.after;
    const side = (p, k) => h('div', { class: 'pair-side' }, cells(p, true), h('div', { class: 'pair-info' },
      sidePy(k) ? h('span', { class: 'answer-py' }, sidePy(k)) : null, sideFr(k) ? h('span', { class: 'answer-fr' }, sideFr(k)) : null, U.speakBtn(p)));
    const head = () => h('div', { class: 'pair-head' },
      side(pair[0], 0), h('p', { class: 'pair-vs', 'aria-hidden': 'true' }, '≠'), side(pair[1], 1),
      py.length !== 2 && w.pinyin ? h('p', { class: 'answer-py' }, w.pinyin) : null,
      fr.length !== 2 && w.fr ? h('p', { class: 'answer-fr' }, w.fr) : null);

    function drawExplain() {
      const input = h('textarea', { class: 'inp', rows: '5', 'aria-label': 'Ma différence', placeholder: 'En quoi ces deux mots ne se remplacent-ils pas ?', autocomplete: 'off', spellcheck: 'false' });
      input.value = st.text;
      const btn = h('button', { class: 'btn primary block', disabled: input.value.trim().length < 10 }, 'Valider mon explication');
      const hint = h('p', { class: 'hint', hidden: true }), hintBtn = h('button', { class: 'link-btn', type: 'button' }, 'Un indice');
      hintBtn.addEventListener('click', () => { hint.textContent = 'Pense à ce que chaque mot décrit (une action, un résultat, un état), à ce qui l’accompagne, et à la nuance de sens.'; hint.hidden = false; hintBtn.hidden = true; });
      input.addEventListener('input', () => { api.dirty = true; st.text = input.value; btn.disabled = input.value.trim().length < 10; });
      btn.addEventListener('click', () => { st.text = input.value.trim(); if (gaps.length) drawGap(); else drawCompare(); });
      api.frame(h('div', null,
        h('p', { class: 'step-title' }, 'Explique d’abord la différence'),
        head(), h('div', { style: { marginTop: '12px' } }, UI.field('Ma différence, avec mes mots', input)), hintBtn, hint), btn);
      setTimeout(() => input.focus(), 60);
    }

    function drawGap() {
      const g = gaps[st.gi], res = st.res[st.gi];
      const known = !!g.answer && pair.indexOf(g.answer) >= 0;
      const blank = res ? h('span', { class: 'filled ' + (res.ok === false ? 'bad' : res.ok ? 'good' : '') }, res.choice) : h('span', { class: 'blank' }, '＿＿');
      const sentence = h('p', { class: 'sentence zh gap-sentence', lang: 'zh-Hans' }, g.before, blank, g.after);
      const title = h('p', { class: 'step-title' }, 'Phrase à trou ' + (st.gi + 1) + ' sur ' + gaps.length);
      let body, action = null;
      const nextBtn = h('button', { class: 'btn primary block' }, st.gi === gaps.length - 1 ? 'Comparer avec le livre' : 'Phrase suivante');
      nextBtn.addEventListener('click', () => { if (st.gi === gaps.length - 1) drawCompare(); else { st.gi++; drawGap(); } });
      if (!res) {
        body = h('div', { class: 'choices' }, pair.map(p => h('button', { class: 'btn block choice zh', lang: 'zh-Hans', type: 'button', onclick: () => {
          api.dirty = true;
          st.res[st.gi] = { gap: g, choice: p, answer: known ? g.answer : '', ok: known ? p === g.answer : null };
          drawGap();
        } }, p)));
      } else if (res.ok === null) {
        body = h('div', { class: 'stack' }, h('p', { class: 'hint' }, 'Cette phrase n’a pas de réponse dans la fiche. Vérifie dans ton livre : ton choix était-il juste ?'),
          h('div', { class: 'stack-h' },
            h('button', { class: 'btn bad', type: 'button', onclick: () => { res.ok = false; res.answer = pair.find(p => p !== res.choice); drawGap(); } }, 'Faux'),
            h('button', { class: 'btn ok', type: 'button', onclick: () => { res.ok = true; res.answer = res.choice; drawGap(); } }, icon('check'), 'Juste')));
      } else {
        body = h('div', { class: 'stack' },
          res.ok ? h('p', { class: 'verdict good' }, icon('check'), 'Juste.') : h('p', { class: 'verdict bad' }, h('span', null, 'Faux : c’était ', h('span', { class: 'zh', lang: 'zh-Hans' }, res.answer), '.')));
        action = nextBtn;
      }
      api.frame(h('div', null, title, sentence, body), action);
    }

    function drawCompare() {
      const wrong = st.res.filter(r => r && r.ok === false);
      const btn = h('button', { class: 'btn primary block', disabled: !st.rating }, api.isLast() ? 'Terminer' : 'Fiche suivante');
      const rating = ratingBlock(st, () => { btn.disabled = !st.rating; });
      const book = [];
      if (w.defZh) book.push(h('p', { class: 'zh book-zh', lang: 'zh-Hans' }, w.defZh));
      if (w.example) book.push(h('p', { class: 'zh', lang: 'zh-Hans' }, UI.highlight(w.example, pair[0])));
      if (!book.length) book.push(h('p', { class: 'muted' }, 'Aucune explication saisie dans cette fiche : compare avec ton livre.'));
      const noteBox = wrong.length ? h('label', { class: 'check-row' },
        h('input', { type: 'checkbox', checked: true, onchange: e => { st.noteErrors = e.target.checked; } }),
        h('span', null, 'Noter ' + plural(wrong.length, 'erreur de trou', 'erreurs de trous') + ' dans « Mes erreurs » (' + pair.join('/') + ')')) : null;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const d = today(), cur = fresh(w), old = cur.work || {};
        const gapsDone = st.res.filter(Boolean).map(r => ({ text: r.gap.text, choice: r.choice, answer: r.answer, ok: r.ok }));
        const work = Object.assign({}, old, { diff: { text: st.text, date: d, rating: st.rating, missing: (st.missing || '').trim() }, gaps: gapsDone, doneAt: d, todo: st.rating === 'revoir' || wrong.length > 0, rounds: (old.rounds || 0) + 1 });
        await Store.putWord(Object.assign({}, cur, { work: work, updatedAt: Date.now() }));
        await Store.addReview(Core.makeReview(cur, 'difference', st.rating === 'juste' ? true : st.rating === 'revoir' ? false : null, d, ''));
        if (gapsDone.length) await Store.addReview(Core.makeReview(cur, 'trous', wrong.length === 0, d, '', { correct: gapsDone.length - wrong.length, total: gapsDone.length }));
        if (wrong.length && st.noteErrors) {
          await Store.putErrors(wrong.map(r => Core.makeError({
            lessonId: cur.lessonId, wordId: cur.id, original: fill(r.gap, r.choice), corrected: fill(r.gap, r.answer), tags: [pair.join('/')]
          }, d)));
        }
        api.next();
      });
      api.frame(h('div', { class: 'stack' },
        h('p', { class: 'step-title' }, 'Compare avec le livre'),
        h('div', { class: 'mine-card' }, h('p', { class: 'lbl' }, 'Ma différence'), h('p', null, st.text)),
        gaps.length ? h('p', { class: 'muted' }, 'Phrases à trou : ' + (gaps.length - wrong.length) + ' juste' + (gaps.length - wrong.length > 1 ? 's' : '') + ' sur ' + gaps.length + '.') : null,
        h('div', { class: 'book-card' }, h('p', { class: 'lbl' }, 'Dans le livre'), book),
        noteBox, rating), btn);
    }
    drawExplain();
  }

  Views.pairs = function (ctx, lessonId) {
    flow(ctx, lessonId, {
      rubrique: '词语辨析', title: 'Paire', item: pairItem,
      emptyTitle: 'Rien à travailler', emptyText: 'Aucune fiche 词语辨析 écrite « A / B » dans cette leçon.',
      doneKicker: 'Paires terminées', unit: ['paire travaillée', 'paires travaillées'],
      doneText: 'Les erreurs de trous cochées sont dans « Mes erreurs ».'
    });
  };
})(typeof self !== 'undefined' ? self : this);
