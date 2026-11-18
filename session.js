/* session.js — les trois temps d'apprentissage : triage, découverte guidée, dictée par le sens.
   Principe : l'appli ne montre jamais la réponse avant une vraie tentative. */
(function (root) {
  'use strict';
  const h = UI.h, zh = UI.zh, icon = UI.icon;
  const today = UI.today;
  const Views = root.Views = root.Views || {};
  const U = Views.util;
  const plural = U.plural;

  const cellsOf = hanzi => h('div', { class: 'cells' }, Array.from(hanzi).map(c => h('span', { class: 'cell zh', lang: 'zh-Hans' }, c)));

  /* ------------------------------------------------------------------ */
  /* 1. Triage par le sens                                               */
  /* ------------------------------------------------------------------ */
  Views.triage = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const all = Store.wordsOf(lessonId).filter(Core.isVocab);
    if (!all.length) {
      ctx.root.append(UI.empty('Aucun mot à trier', 'Ajoute d’abord des mots dans la rubrique 生词.',
        h('button', { class: 'btn primary', onclick: () => ctx.go(U.stepPath(lessonId, 'add')) }, 'Ajouter des mots')));
      return;
    }
    UI.setFocus(true);
    let showAll = !all.some(w => !w.triage), dirty = false;
    const marks = new Map(all.map(w => [w.id, w.triage === 'inconnu']));
    const list = h('div', { class: 'tri-list' });
    const countEl = h('p', { class: 'muted', style: { textAlign: 'center' } });
    const modeBtn = h('button', { class: 'link-btn' });
    const finish = h('button', { class: 'btn primary block' }, 'Terminer le triage');

    const visible = () => all.filter(w => showAll || !w.triage);
    function updateCount() {
      const rows = visible(), n = rows.filter(w => marks.get(w.id)).length;
      countEl.textContent = n === 0 ? 'Aucun mot inconnu pour l’instant' : plural(n, 'mot inconnu', 'mots inconnus') + ' sur ' + rows.length;
    }
    function draw() {
      UI.clear(list);
      visible().forEach(w => {
        const b = h('button', { class: 'tri-row', 'aria-pressed': String(!!marks.get(w.id)) },
          h('div', { class: 'tri-main' }, h('span', { class: 'tri-hanzi zh', lang: 'zh-Hans' }, w.hanzi), h('span', { class: 'tri-py' }, w.pinyin || '')),
          h('span', { class: 'tri-mark', 'aria-hidden': 'true' }, '?'));
        b.addEventListener('click', () => {
          const v = !marks.get(w.id); marks.set(w.id, v); dirty = true;
          b.setAttribute('aria-pressed', String(v)); updateCount();
        });
        list.append(b);
      });
      const hasTriaged = all.some(w => w.triage);
      modeBtn.hidden = !hasTriaged || !all.some(w => !w.triage);
      modeBtn.textContent = showAll ? 'Voir seulement les mots à trier' : 'Voir aussi les mots déjà triés';
      updateCount();
    }
    modeBtn.addEventListener('click', () => { showAll = !showAll; draw(); });

    const quit = async () => {
      if (dirty && !(await UI.confirm('Quitter sans enregistrer le triage ?', { ok: 'Quitter' }))) return;
      ctx.go('/lecon/' + lessonId);
    };
    finish.addEventListener('click', async () => {
      finish.disabled = true;
      const updated = visible().map(w => Core.setTriage(w, !!marks.get(w.id)));
      await Store.putWords(updated);
      const n = all.filter(w => marks.get(w.id)).length;
      UI.toast('Triage enregistré : ' + plural(n, 'mot inconnu', 'mots inconnus'));
      ctx.go('/lecon/' + lessonId);
    });

    ctx.root.append(
      UI.focusTop({ title: 'Triage · ' + U.lessonName(lesson), onQuit: quit }),
      h('p', { class: 'intro', style: { marginTop: '8px' } }, 'Touche les mots dont tu ne connais pas le sens. Les autres passent directement à la dictée.'),
      list, modeBtn,
      h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-inner' }, countEl, finish)));
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 2. Découverte guidée                                                */
  /* ------------------------------------------------------------------ */
  Views.discover = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const rootEl = ctx.root;
    const queue = Core.discoveryQueue(Store.wordsOf(lessonId), Store.getSetting('groupSize'));
    if (!queue.length) {
      rootEl.append(UI.empty('Rien à découvrir', 'Tous les mots inconnus ont déjà été découverts, ou le triage n’est pas fait.',
        h('button', { class: 'btn primary', onclick: () => ctx.go('/lecon/' + lessonId) }, 'Retour à la leçon')));
      return;
    }
    UI.setFocus(true);
    const doneIds = [];
    let i = 0, stage = 'guess1', tries = [], warned = false;

    const quit = async () => {
      if ((i > 0 || stage !== 'guess1') && !(await UI.confirm('Quitter la découverte ?', { detail: 'Les mots déjà terminés sont gardés.', ok: 'Quitter' }))) return;
      ctx.go('/lecon/' + lessonId);
    };

    function frame(inner, action) {
      UI.clear(rootEl);
      rootEl.append(
        UI.focusTop({ title: 'Découverte · mot ' + (i + 1) + ' sur ' + queue.length, onQuit: quit }),
        h('div', { class: 'focus-bar' }, UI.bar(i / queue.length)),
        inner);
      if (action) rootEl.append(h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-inner' }, action)));
    }

    // Étapes 1 et 2 : deviner le sens depuis la phrase (deux essais avant la définition)
    function drawGuess() {
      const w = queue[i], n = stage === 'guess1' ? 1 : 2;
      const inContext = w.example && w.example.indexOf(w.hanzi) >= 0;
      const input = h('textarea', {
        class: 'inp', rows: '3', 'aria-label': 'Ta devinette', autocomplete: 'off',
        placeholder: n === 1 ? 'Ta devinette, en français' : 'Précise ou corrige ta devinette'
      });
      const btn = h('button', { class: 'btn primary block', disabled: true }, n === 1 ? 'Valider ma devinette' : 'Valider mon deuxième essai');
      input.addEventListener('input', () => { btn.disabled = input.value.trim().length < 2; });
      btn.addEventListener('click', () => {
        const v = input.value.trim();
        if (v.length < 2) return;
        if (n === 2 && v.toLowerCase() === tries[0].toLowerCase()) { UI.toast('Précise ou reformule : écris autre chose que l’essai 1.', 'warn'); return; }
        tries.push(v); stage = n === 1 ? 'guess2' : 'reveal'; draw();
      });
      frame(h('div', null,
        h('p', { class: 'step-title' }, n === 1 ? 'Que veut dire ce mot ?' : 'Essai 2 sur 2'),
        w.example
          ? h('p', { class: 'sentence zh', lang: 'zh-Hans' }, UI.highlight(w.example, w.hanzi))
          : h('p', { class: 'sentence zh alone', lang: 'zh-Hans' }, w.hanzi),
        w.example && !inContext ? h('p', { class: 'hint' }, 'Mot à deviner : ', zh(w.hanzi)) : null,
        n === 2 ? h('div', { class: 'tries' }, h('p', null, h('b', null, 'Essai 1'), tries[0])) : null,
        n === 2 && w.pinyin ? h('div', { class: 'hint-card' }, h('span', { class: 'hint' }, 'Indice : la prononciation'), h('span', { class: 'py' }, w.pinyin)) : null,
        input), btn);
      setTimeout(() => input.focus(), 60);
    }

    // Étape 3 : la réponse (définition chinoise puis sens français)
    function drawReveal() {
      const w = queue[i];
      frame(h('div', null,
        h('p', { class: 'step-title' }, 'Voilà le mot'),
        cellsOf(w.hanzi),
        pinyinRow(w, { marginTop: '4px' }),
        w.defZh ? h('div', { class: 'field', style: { marginTop: '12px' } }, h('span', { class: 'lbl' }, 'Définition'), h('p', { class: 'zh', lang: 'zh-Hans', style: { fontSize: '1.2rem', lineHeight: '1.5' } }, w.defZh)) : null,
        w.fr ? h('div', { class: 'field', style: { marginTop: '10px' } }, h('span', { class: 'lbl' }, 'Sens'), h('p', { class: 'answer-fr' }, w.fr)) : null,
        !w.defZh && !w.fr ? h('p', { class: 'muted', style: { marginTop: '10px' } }, 'Ni définition ni sens saisis pour ce mot : complète sa fiche plus tard.') : null,
        h('div', { class: 'tries', style: { marginTop: '14px' } }, tries.map((t, k) => h('p', null, h('b', null, 'Essai ' + (k + 1)), t)))),
        h('button', { class: 'btn primary block', onclick: () => { stage = 'sentence'; warned = false; draw(); } }, 'Écrire ma phrase'));
    }

    // Étape 4 : ma propre phrase
    function drawSentence() {
      const w = queue[i];
      const input = h('textarea', { class: 'inp zh', lang: 'zh-Hans', rows: '3', 'aria-label': 'Ma phrase', placeholder: '用这个词写一个句子', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      const warn = h('p', { class: 'hint warn', hidden: true });
      const btn = h('button', { class: 'btn primary block', disabled: true }, 'Enregistrer et continuer');
      input.addEventListener('input', () => { btn.disabled = input.value.trim().length < 2; warn.hidden = true; warned = false; btn.textContent = 'Enregistrer et continuer'; });
      btn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (text.length < 2) return;
        if (text.indexOf(w.hanzi) < 0 && !warned) {
          warned = true; warn.textContent = 'Ta phrase ne contient pas « ' + w.hanzi + ' » tel quel. Vérifie, ou valide quand même.';
          warn.hidden = false; btn.textContent = 'Valider quand même'; return;
        }
        btn.disabled = true;
        const date = today();
        await Store.putWord(Core.applyDiscovery(w, date, { tries: tries, sentence: text }));
        await Store.addReview(Core.makeReview(w, 'decouverte', null, date, ''));
        doneIds.push(w.id); i++; tries = []; stage = 'guess1'; warned = false;
        if (i < queue.length) draw(); else drawDone();
      });
      frame(h('div', null,
        h('p', { class: 'step-title' }, 'Écris ta propre phrase avec ce mot'),
        cellsOf(w.hanzi),
        w.fr ? h('p', { class: 'answer-fr', style: { marginTop: '8px' } }, w.fr) : null,
        h('div', { style: { marginTop: '12px' } }, input), warn), btn);
      setTimeout(() => input.focus(), 60);
    }

    function drawDone() {
      UI.setFocus(false);
      UI.clear(rootEl);
      const left = Core.lessonStats(Store.wordsOf(lessonId)).toDiscover;
      const limit = Store.getSetting('newLimit'), n = Core.newToday(Store.allWords(), today());
      rootEl.append(h('div', null,
        h('div', { class: 'recap' }, h('p', { class: 'kicker' }, 'Groupe terminé'), h('p', { class: 'recap-score' }, plural(doneIds.length, 'mot découvert', 'mots découverts'))),
        h('p', { class: 'muted' }, 'Étape suivante : écris-les de mémoire, à partir de leur définition seule.'),
        n > limit ? h('p', { class: 'alert', style: { marginTop: '12px' } }, 'Tu as dépassé ' + limit + ' nouveaux mots aujourd’hui : Anki sera saturé. Arrête les nouveaux mots.') : null,
        h('div', { class: 'stack', style: { marginTop: '20px' } },
          h('button', { class: 'btn primary block', onclick: () => ctx.go('/lecon/' + lessonId + '/dictee?ids=' + doneIds.join(',')) }, 'Dicter ces ' + doneIds.length + ' mots'),
          left ? h('button', { class: 'btn block', onclick: () => ctx.go('/lecon/' + lessonId + '/decouverte') }, 'Groupe suivant (' + plural(left, 'mot restant', 'mots restants') + ')') : null,
          h('button', { class: 'btn block ghost', onclick: () => ctx.go('/lecon/' + lessonId) }, 'Retour à la leçon'))));
    }

    function draw() {
      if (stage === 'guess1' || stage === 'guess2') drawGuess();
      else if (stage === 'reveal') drawReveal();
      else drawSentence();
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 3. Dictée par le sens, dictée à l'écoute, redictées                 */
  /*    cfg.mode = 'audio' : la voix lit, Saïd écrit (mot ou phrase)    */
  /* ------------------------------------------------------------------ */
  // Pinyin du mot (s'il est saisi) avec le bouton « écouter » à côté.
  const pinyinRow = (w, style) => h('div', { class: 'py-row', style: style || null },
    w.pinyin ? h('p', { class: 'answer-py' }, w.pinyin) : null, U.speakBtn(w.hanzi));

  function runDictation(ctx, cfg) {
    const rootEl = ctx.root, audio = cfg.mode === 'audio';
    const items = cfg.items.filter(it => {
      const w = Store.words.get(it.wordId);
      return !!w && (audio ? !!w.hanzi && (!it.text || Core.hasCJK(it.text)) : !!Core.promptFor(w));
    });
    if (!items.length) {
      rootEl.append(UI.empty('Rien à dicter', audio ? 'Aucun mot ni aucune phrase n’est prêt.' : 'Aucun mot avec une définition ou un sens n’est prêt.',
        h('button', { class: 'btn primary', onclick: () => ctx.go(cfg.back) }, 'Retour')));
      return;
    }
    UI.setFocus(true);
    let idx = 0, pad = null, revealed = false, saving = false;
    const results = [];    // un résultat par mot noté : alimente « Ce qui change »
    const outcomes = [];   // un résultat par carte (juste ou faux) : alimente le score
    ctx.onLeave(() => { if (pad) { pad.destroy(); pad = null; } if (audio) Speech.stop(); });

    const quit = async () => {
      if (outcomes.length && outcomes.length < items.length &&
        !(await UI.confirm('Quitter ?', { detail: audio ? 'Les cartes déjà notées sont gardées.' : 'Les mots déjà notés sont gardés.', ok: 'Quitter' }))) return;
      ctx.go(cfg.back);
    };

    function card() {
      if (pad) { pad.destroy(); pad = null; }
      if (audio) Speech.stop();
      UI.clear(rootEl);
      revealed = false; saving = false;
      const item = items[idx], word = Store.words.get(item.wordId);
      const sentence = audio && item.text ? item.text : null;
      const prompt = audio ? null : Core.promptFor(word);

      const modeSeg = UI.seg([{ value: 'ecran', label: 'Écran' }, { value: 'papier', label: 'Papier' }], Store.getSetting('writeMode'),
        v => { Store.setSetting('writeMode', v); drawZone(); });
      const zone = h('div', { class: 'zone' });
      const answer = h('section', { class: 'answer', hidden: true });
      const barInner = h('div', { class: 'actionbar-inner' });
      const revealBtn = h('button', { class: 'btn primary block' }, 'Révéler');
      barInner.append(revealBtn);

      // En-tête de la carte : définition à lire (par le sens) ou boutons d'écoute (à l'écoute)
      let listen = null, head;
      if (audio) {
        listen = listenBlock(word, sentence);
        head = listen.el;
      } else {
        head = h('section', { class: 'prompt' },
          h('p', { class: 'prompt-label' }, prompt.label),
          h('p', { class: 'prompt-text ' + (prompt.zh ? 'zh' : 'fr'), lang: prompt.zh ? 'zh-Hans' : 'fr' }, prompt.text),
          prompt.note ? h('p', { class: 'hint' }, prompt.note) : null);
      }

      rootEl.append(
        UI.focusTop({ title: audio ? (cfg.shortTitle || cfg.title) + ' · ' + (idx + 1) + '/' + items.length : cfg.title + ' · ' + (idx + 1) + ' sur ' + items.length, onQuit: quit, right: modeSeg }),
        h('div', { class: 'focus-bar' }, UI.bar(idx / items.length)),
        head, zone, answer,
        h('div', { class: 'actionbar' }, barInner));

      function drawZone() {
        if (pad) { pad.destroy(); pad = null; }
        UI.clear(zone);
        if (Store.getSetting('writeMode') === 'ecran') {
          const host = h('div', { class: 'pad' + (sentence ? ' pad-sentence' : '') });
          const undoBtn = h('button', { class: 'btn', type: 'button' }, icon('undo'), 'Annuler');
          const clearBtn = h('button', { class: 'btn', type: 'button' }, icon('trash'), 'Effacer');
          const penBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': String(!!Store.getSetting('penOnly')) }, icon('pen'), 'Stylet seul');
          zone.append(host, h('div', { class: 'pad-tools' }, undoBtn, clearBtn, h('span', { class: 'spacer' }), penBtn));
          pad = new UI.InkPad(host, { penOnly: !!Store.getSetting('penOnly'), onChange: has => { revealBtn.disabled = !has; } });
          undoBtn.addEventListener('click', () => pad && pad.undo());
          clearBtn.addEventListener('click', () => pad && pad.clear());
          penBtn.addEventListener('click', () => {
            const v = !Store.getSetting('penOnly');
            Store.setSetting('penOnly', v); if (pad) pad.setPenOnly(v); penBtn.setAttribute('aria-pressed', String(v));
          });
          revealBtn.disabled = true; revealBtn.textContent = 'Révéler';
        } else {
          zone.append(h('div', { class: 'paper-box' }, h('strong', null, sentence ? 'Écris la phrase sur ton papier' : 'Écris le mot sur ton papier'), h('span', null, 'Puis appuie sur le bouton pour te corriger.')));
          revealBtn.disabled = false; revealBtn.textContent = 'J’ai écrit : révéler';
        }
      }

      function showVerdict() {
        UI.clear(barInner); barInner.classList.add('two');
        barInner.append(
          h('button', { class: 'btn bad', onclick: sentence ? askMissedWords : askComponent }, 'Faux'),
          h('button', { class: 'btn ok', onclick: () => (sentence ? recordSentence(true, []) : record(true, '')) }, icon('check'), 'Juste'));
      }

      function askComponent() {
        UI.clear(barInner); barInner.classList.remove('two');
        const inp = h('input', { class: 'inp zh', lang: 'zh-Hans', type: 'text', placeholder: 'Composant raté (radical, trait…)', autocomplete: 'off', autocapitalize: 'none', enterkeyhint: 'done', 'aria-label': 'Composant raté' });
        const save = h('button', { class: 'btn primary block', disabled: true }, 'Noter et continuer');
        const quick = h('button', { class: 'chip', type: 'button' }, 'mot entier oublié');
        const submit = () => { if (inp.value.trim()) record(false, inp.value.trim()); };
        inp.addEventListener('input', () => { save.disabled = !inp.value.trim(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) submit(); });
        quick.addEventListener('click', () => { inp.value = 'mot entier oublié'; save.disabled = false; });
        save.addEventListener('click', submit);
        barInner.append(h('div', { class: 'quick' }, quick), inp, save);
        setTimeout(() => inp.focus(), 60);
      }

      // Phrase ratée : on choisit, parmi les mots de la liste présents dans la phrase, celui (ou ceux) qu'on a ratés. Facultatif.
      function askMissedWords() {
        UI.clear(barInner); barInner.classList.remove('two');
        const found = Store.allWords().filter(w => Core.isVocab(w) && w.hanzi && sentence.indexOf(w.hanzi) >= 0)
          .sort((a, b) => (b.id === word.id) - (a.id === word.id) || b.hanzi.length - a.hanzi.length).slice(0, 8);
        const chosen = new Set();
        const chips = h('div', { class: 'quick' }, found.map(w => {
          const b = h('button', { class: 'chip zh', lang: 'zh-Hans', type: 'button', 'aria-pressed': 'false' }, w.hanzi);
          b.addEventListener('click', () => {
            if (chosen.has(w.id)) chosen.delete(w.id); else chosen.add(w.id);
            b.setAttribute('aria-pressed', String(chosen.has(w.id)));
            save.textContent = chosen.size ? 'Noter ' + plural(chosen.size, 'mot rouge', 'mots rouges') + ' et continuer' : 'Noter et continuer';
          });
          return b;
        }));
        const save = h('button', { class: 'btn primary block' }, 'Noter et continuer');
        save.addEventListener('click', () => recordSentence(false, Array.from(chosen)));
        barInner.append(
          h('p', { class: 'hint' }, found.length ? 'Quel mot de ta liste as-tu raté ? Il passera en rouge. Facultatif.' : 'Aucun mot de ta liste dans cette phrase.'),
          found.length ? chips : null, save);
      }

      function advance() {
        idx++;
        if (idx < items.length) card(); else summary();
      }

      async function record(ok, comp) {
        if (saving) return;
        saving = true;
        const current = Store.words.get(item.wordId) || word;
        const res = Core.applyDictation(current, ok, today(), comp, item.kind, audio ? 'audio' : undefined);
        await Store.putWord(res.word);
        await Store.addReview(res.review);
        results.push({
          wordId: current.id, ok: ok, composant: comp, kind: item.kind, before: current.state, after: res.word.state,
          streak: res.word.red ? res.word.red.streak : 0, due: res.word.red ? res.word.red.due : null
        });
        outcomes.push(!!ok);
        advance();
      }

      // Dictée de phrase : une trace par phrase ; seuls les mots choisis comme ratés passent en rouge.
      async function recordSentence(ok, missedIds) {
        if (saving) return;
        saving = true;
        const d = today();
        await Store.addReview(Core.makeReview(word, 'phrase', ok, d, '', { mode: 'audio', texte: sentence }));
        for (const id of missedIds) {
          const cur = Store.words.get(id);
          if (!cur) continue;
          const kind = cur.state === 'rouge' ? 'red' : 'new';
          const res = Core.applyDictation(cur, false, d, '', kind, 'audio');
          await Store.putWord(res.word);
          await Store.addReview(res.review);
          results.push({ wordId: cur.id, ok: false, composant: '', kind: kind, before: cur.state, after: res.word.state, streak: 0, due: res.word.red ? res.word.red.due : null });
        }
        outcomes.push(!!ok);
        advance();
      }

      revealBtn.addEventListener('click', () => {
        if (revealed) return;
        if (Store.getSetting('writeMode') === 'ecran' && !(pad && pad.hasInk())) { UI.toast(sentence ? 'Écris d’abord la phrase sur le canevas.' : 'Écris d’abord le mot sur le canevas.', 'warn'); return; }
        revealed = true; modeSeg.hidden = true;
        if (listen) listen.stop();
        if (pad) pad.setReadOnly(true);
        if (sentence) {
          answer.append(
            h('p', { class: 'answer-sentence zh', lang: 'zh-Hans' }, UI.highlight(sentence, word.hanzi)),
            h('div', { class: 'py-row' }, U.speakBtn(sentence), h('span', { class: 'muted small' }, 'Écouter la phrase')),
            h('p', { class: 'muted small' }, 'Mot de ta liste : ' + word.hanzi + (word.pinyin ? ' (' + word.pinyin + ')' : '') + (word.fr ? ', ' + word.fr : '') + '.'),
            h('p', { class: 'muted small' }, 'Compare avec ce que tu as écrit, puis note le résultat.'));
        } else {
          answer.append(
            cellsOf(word.hanzi),
            pinyinRow(word),
            word.fr ? h('p', { class: 'answer-fr' }, word.fr) : null,
            word.example ? h('p', { class: 'answer-ex zh', lang: 'zh-Hans' }, UI.highlight(word.example, word.hanzi)) : null,
            h('p', { class: 'muted small' }, 'Compare avec ce que tu as écrit, puis note le résultat.'));
        }
        answer.hidden = false;
        showVerdict();
        if (answer.scrollIntoView) answer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      drawZone();
      // Dictée à l'écoute : la voix démarre toute seule (réglable), sinon on touche « Écouter ».
      if (listen && cfg.auto !== false && Speech.supported()) setTimeout(() => { if (!revealed && rootEl.isConnected && idx === items.indexOf(item)) listen.play(); }, 450);
    }

    // Bloc d'écoute : gros bouton « Écouter », vitesse, aide.
    function listenBlock(word, sentence) {
      const playBtn = h('button', { class: 'btn primary listen-play', type: 'button' }, icon('speaker'), h('span', null, 'Écouter'));
      const status = h('p', { class: 'hint', 'aria-live': 'polite', hidden: true });
      const say = (text, warn) => { status.textContent = text || ''; status.className = 'hint' + (warn ? ' warn' : ''); status.hidden = !text; };
      let token = 0;
      const speed = UI.seg(Speech.RATES.map(r => ({ value: r.id, label: r.label })), Speech.rateId(Store.getSetting('speechRate')),
        id => { Store.setSetting('speechRate', Speech.rateOf(id)); play(); });
      async function play() {
        if (!Speech.supported()) { say('Ce navigateur ne sait pas lire à voix haute.', true); return; }
        const mine = ++token;
        playBtn.classList.add('on');
        say('');
        await Speech.init();
        if (mine !== token) return;
        const res = await Speech.play(Core.dictationParts(word, sentence, { read: cfg.read, repeat: cfg.repeat, gap: cfg.gap }), U.voiceOpts());
        if (mine !== token || !playBtn.isConnected) return;
        playBtn.classList.remove('on');
        if (res.ok) playBtn.lastChild.textContent = 'Réécouter';
        else if (!res.cancelled) say(Speech.explain(res), true);
      }
      playBtn.addEventListener('click', play);
      return {
        play: play,
        stop: () => { token++; playBtn.classList.remove('on'); Speech.stop(); },
        el: h('section', { class: 'prompt listen-prompt' },
          h('div', { class: 'listen-head' },
            h('p', { class: 'prompt-label' }, sentence ? 'Écoute la phrase, puis écris-la.' : 'Écoute le mot, puis écris-le.'),
            h('button', { class: 'link-btn', type: 'button', onclick: () => U.voiceHelp() }, 'Pas de son ?')),
          playBtn, speed, status)
      };
    }

    function summaryLine(r) {
      const w = Store.words.get(r.wordId);
      let text;
      if (!r.ok) {
        text = r.kind === 'red' ? 'Raté : le compteur repart à zéro, redictée ' + Core.relLabel(r.due, today()).toLowerCase() + '.'
          : r.kind === 'filler' ? 'Mot connu raté : il repasse en rouge, redictée ' + Core.relLabel(r.due, today()).toLowerCase() + '.'
            : 'Passe en rouge : redictée ' + Core.relLabel(r.due, today()).toLowerCase() + '.';
      } else if (r.after === 'sorti') text = 'Trois réussites de suite : le mot sort de la liste rouge.';
      else text = 'Réussite ' + r.streak + ' sur 3, prochaine redictée : ' + Core.relLabel(r.due, today()).toLowerCase() + '.';
      return h('div', { class: 'row', style: { alignItems: 'flex-start', minHeight: '0' } },
        h('span', { class: 'red-hanzi zh', lang: 'zh-Hans', style: { fontSize: '1.7rem', minWidth: '3.2rem' } }, w ? w.hanzi : '?'),
        h('div', { class: 'row-main' }, h('span', { class: 'row-title', style: { fontSize: '.98rem' } }, text),
          r.composant ? h('span', { class: 'row-sub' }, 'Raté : ' + r.composant) : null));
    }

    function summary() {
      if (pad) { pad.destroy(); pad = null; }
      if (audio) Speech.stop();
      UI.setFocus(false);
      UI.clear(rootEl);
      const okN = outcomes.filter(Boolean).length;
      const lines = results.filter(r => !r.ok || r.kind === 'red');
      const more = cfg.more ? cfg.more() : null;
      rootEl.append(
        h('div', { class: 'recap' }, h('p', { class: 'kicker' }, cfg.title + ' terminée'),
          h('p', { class: 'recap-score' }, okN + ' juste' + (okN > 1 ? 's' : '') + ' sur ' + outcomes.length)),
        lines.length ? h('section', { class: 'block' }, h('h2', null, 'Ce qui change'), h('div', { class: 'rows' }, lines.map(summaryLine))) : h('p', { class: 'muted' }, 'Aucun mot ne passe en rouge.'),
        h('div', { class: 'stack', style: { marginTop: '20px' } },
          more ? h('button', { class: 'btn primary block', onclick: () => ctx.go(more.path) }, more.label) : null,
          h('button', { class: 'btn block' + (more ? '' : ' primary'), onclick: () => ctx.go(cfg.back) }, cfg.backLabel || 'Terminer')));
    }

    card();
  }
  U.runDictation = runDictation;

  function emptyDictation(ctx, lessonId, words) {
    const st = Core.lessonStats(words);
    let text, label, path;
    if (!st.total) { text = 'Cette leçon n’a pas encore de mots.'; label = 'Ajouter des mots'; path = U.stepPath(lessonId, 'add'); }
    else if (st.triaged < st.total) { text = 'Il reste ' + plural(st.total - st.triaged, 'mot', 'mots') + ' à trier avant la dictée.'; label = 'Faire le triage'; path = U.stepPath(lessonId, 'triage'); }
    else if (st.toDiscover > 0) { text = 'Découvre d’abord les ' + st.toDiscover + ' mots inconnus.'; label = 'Découvrir les mots'; path = U.stepPath(lessonId, 'discover'); }
    else if (st.noPrompt > 0) { text = plural(st.noPrompt, 'mot n’a', 'mots n’ont') + ' ni définition ni sens : complète les fiches.'; label = 'Voir la leçon'; path = '/lecon/' + lessonId; }
    else { text = 'Tous les mots de cette leçon ont déjà été dictés.'; label = 'Retour à la leçon'; path = '/lecon/' + lessonId; }
    ctx.root.append(UI.empty('Rien à dicter pour l’instant', text, h('button', { class: 'btn primary', onclick: () => ctx.go(path) }, label)));
  }

  Views.dictation = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const words = Store.wordsOf(lessonId);
    let list = [];
    if (ctx.query.ids) list = ctx.query.ids.split(',').map(id => Store.words.get(id)).filter(w => w && Core.isReady(w));
    if (!list.length) list = Core.dictationPool(words).slice(0, Store.getSetting('dictSize'));
    if (!list.length) return emptyDictation(ctx, lessonId, words);
    const items = Core.shuffle(list.map(w => ({ wordId: w.id, kind: 'new' })));
    runDictation(ctx, {
      items: items, title: 'Dictée', back: '/lecon/' + lessonId, backLabel: 'Retour à la leçon',
      more: () => {
        const left = Core.dictationPool(Store.wordsOf(lessonId)).length;
        return left ? { label: 'Dicter la suite (' + plural(left, 'mot prêt', 'mots prêts') + ')', path: '/lecon/' + lessonId + '/dictee' } : null;
      }
    });
  };

  Views.redictee = function (ctx) {
    const items = Core.buildRedictee(Store.allWords(), today());
    if (!items.length) {
      ctx.root.append(UI.empty('Rien à redicter', 'Aucun mot rouge n’est dû aujourd’hui.', h('button', { class: 'btn primary', onclick: () => ctx.go('/rouges') }, 'Voir les mots rouges')));
      return;
    }
    runDictation(ctx, {
      items: items, title: 'Redictée', back: '/rouges', backLabel: 'Voir les mots rouges',
      more: () => {
        const left = Core.dueRed(Store.allWords(), today()).filter(Core.hasPrompt).length;
        return left ? { label: 'Continuer la redictée (' + plural(left, 'mot dû', 'mots dus') + ')', path: '/redictee' } : null;
      }
    });
  };
})(typeof self !== 'undefined' ? self : this);
