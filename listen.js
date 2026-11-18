/* listen.js — écouter : lecteur de leçon, dictées à l'écoute, test et réglages de la voix.
   La voix vient du téléphone (synthèse vocale du navigateur) : voir audio.js. */
(function (root) {
  'use strict';
  const h = UI.h, icon = UI.icon;
  const today = UI.today;
  const Views = root.Views = root.Views || {};
  const U = Views.util;
  const plural = U.plural;

  /* ------------------------------------------------------------------ */
  /* Outils partagés                                                     */
  /* ------------------------------------------------------------------ */
  // Réglages de voix à passer à Speech.play / Speech.say.
  U.voiceOpts = over => Object.assign({ rate: Store.getSetting('speechRate'), voiceURI: Store.getSetting('voiceURI') || '' }, over || {});

  // Lit un texte ; si la voix échoue, un message dit pourquoi.
  U.speakText = async function (text, over) {
    if (!Speech.supported()) { UI.toast('Ce navigateur ne sait pas lire à voix haute.', 'warn'); return { ok: false, reason: 'unsupported' }; }
    await Speech.init();
    const res = await Speech.say(text, U.voiceOpts(over));
    if (!res.ok && !res.cancelled) UI.toast(Speech.explain(res), 'warn');
    return res;
  };

  // Petit bouton haut-parleur (absent si le navigateur ne sait pas lire).
  U.speakBtn = function (text, opts) {
    if (!Speech.supported()) return null;
    opts = opts || {};
    const btn = h('button', { class: 'icon-btn speak', type: 'button', 'aria-label': opts.label || 'Écouter' }, icon('speaker'));
    let n = 0;
    btn.addEventListener('click', async () => {
      const mine = ++n;
      btn.classList.add('on');
      await U.speakText(text);
      if (mine === n) btn.classList.remove('on');
    });
    return btn;
  };

  const SAMPLE_FR = 'Bonjour, nous commençons la dictée.';

  // Étapes pour installer la voix chinoise (Samsung / Android).
  function helpBody() {
    return h('div', { class: 'form' },
      h('p', null, 'Le téléphone lit avec la voix installée dans Android. Sans voix chinoise, il reste muet ou lit très mal.'),
      h('ol', { class: 'steps' },
        h('li', null, 'Ouvre ', h('b', null, 'Paramètres'), ', puis cherche « synthèse vocale » dans la barre de recherche (ou : Gestion globale, Synthèse vocale).'),
        h('li', null, 'Moteur préféré : choisis ', h('b', null, 'Google'), ' (le plus complet) ou Samsung.'),
        h('li', null, 'Touche l’engrenage à côté du moteur, puis ', h('b', null, 'Installer les données vocales'), ' et choisis le chinois (mandarin, Chine : ', UI.zh('中文'), ').'),
        h('li', null, 'Reviens ici et refais le test de la voix.')),
      h('p', { class: 'hint' }, 'Vérifie aussi le volume « Média » (pas seulement la sonnerie). Une fois la voix installée, la lecture marche sans connexion. Les noms des menus changent un peu selon la version d’Android.'));
  }

  U.voiceHelp = function (onDone) {
    const sheet = UI.sheet('Installer la voix chinoise', h('div', { class: 'form' }, helpBody(),
      Speech.supported() ? h('button', { class: 'btn primary block', onclick: () => { sheet.close(); U.voiceTest(onDone); } }, 'Tester la voix') : null));
    return sheet;
  };

  // Test de la voix : une phrase d'essai, puis « as-tu entendu ? ». Le résultat est gardé (voiceCheck).
  U.voiceTest = async function (onDone) {
    if (!Speech.supported()) { UI.toast('Ce navigateur ne sait pas lire à voix haute.', 'warn'); return; }
    Speech.refresh();   // relit les voix en arrière-plan (une voix vient peut-être d'être installée)
    const box = h('div', { class: 'form' });
    let sheet = null;
    const finish = verdict => { Store.setSetting('voiceCheck', verdict); if (onDone) onDone(verdict); };

    function stepHelp(message) {
      UI.clear(box);
      box.append(
        message ? h('p', { class: 'alert' }, message) : null,
        helpBody(),
        h('button', { class: 'btn primary block', onclick: stepPlay }, 'Refaire le test'),
        h('button', { class: 'btn block', onclick: () => sheet.close() }, 'Fermer'));
    }

    function stepAsk() {
      UI.clear(box);
      box.append(
        h('p', { class: 'step-title' }, 'As-tu entendu la phrase en chinois ?'),
        h('div', { class: 'stack' },
          h('button', { class: 'btn primary block', onclick: () => { finish('ok'); sheet.close(); UI.toast('Voix validée'); } }, icon('check'), 'Oui, j’ai entendu'),
          h('button', { class: 'btn block', onclick: () => { finish('ko'); stepHelp('Pas de son, ou une voix qui ne parle pas chinois : la voix chinoise n’est sans doute pas installée.'); } }, 'Non, rien ou autre chose'),
          h('button', { class: 'btn block ghost', onclick: stepPlay }, icon('repeat'), 'Réécouter')));
    }

    function stepPlay() {
      UI.clear(box);
      const st = Speech.status(Store.getSetting('voiceURI'));
      const status = h('p', { class: 'muted', 'aria-live': 'polite' }, 'Monte le volume média du téléphone, puis touche le bouton.');
      const go = h('button', { class: 'btn primary block' }, icon('speaker'), 'Écouter la phrase d’essai');
      go.addEventListener('click', async () => {
        go.disabled = true; status.textContent = 'Lecture en cours…';
        const res = await Speech.say(Speech.SAMPLE, U.voiceOpts());
        if (!go.isConnected) return;
        go.disabled = false;
        if (res.cancelled) { status.textContent = 'Lecture interrompue.'; return; }
        if (!res.ok) { finish('ko'); stepHelp(Speech.explain(res)); return; }
        stepAsk();
      });
      box.append(
        h('p', { class: 'sample zh', lang: 'zh-Hans' }, Speech.SAMPLE),
        h('p', { class: 'muted small' }, SAMPLE_FR),
        st.hasZh ? h('p', { class: 'hint' }, 'Voix : ' + (st.chosen ? Speech.label(st.chosen) : 'automatique') + '.') : h('p', { class: 'hint warn' }, 'Aucune voix chinoise n’est signalée par ce navigateur : le test dira si le son marche quand même.'),
        status, go);
    }

    sheet = UI.sheet('Tester la voix', box);
    stepPlay();
  };

  /* ------------------------------------------------------------------ */
  /* Réglages : voix et dictée à l'écoute                                */
  /* ------------------------------------------------------------------ */
  U.voiceSettings = function (ctx) {
    const set = (k, v) => Store.setSetting(k, v);
    const status = h('p', { class: 'muted' }, 'Recherche des voix…');
    const pickBox = h('div', { class: 'field' });
    const result = h('p', { class: 'hint' });

    function paint() {
      const check = Store.getSetting('voiceCheck');
      result.textContent = check === 'ok' ? 'Dernier test : réussi.' : check === 'ko' ? 'Dernier test : pas de son. Voir « Installer la voix chinoise ».' : 'Test pas encore fait.';
      UI.clear(pickBox);
      if (!Speech.supported()) { status.textContent = 'Ce navigateur ne sait pas lire à voix haute.'; return; }
      const st = Speech.status(Store.getSetting('voiceURI'));
      status.textContent = st.hasZh ? 'Voix chinoise détectée : ' + Speech.label(st.chosen || st.zh[0]) + '.' : 'Aucune voix chinoise détectée par le navigateur.';
      if (st.zh.length > 1) {
        const sel = h('select', { class: 'inp', 'aria-label': 'Voix chinoise' },
          h('option', { value: '' }, 'Automatique (recommandé)'),
          st.zh.map(v => h('option', { value: v.voiceURI }, Speech.label(v))));
        sel.value = Store.getSetting('voiceURI') || '';
        sel.addEventListener('change', () => { set('voiceURI', sel.value || null); set('voiceCheck', null); paint(); });
        pickBox.append(h('label', { class: 'lbl' }, 'Voix'), sel);
      }
    }
    Speech.init().then(() => { if (status.isConnected) paint(); });
    paint();

    const voice = h('section', { class: 'settings-group' }, h('h2', null, 'Voix'),
      status, pickBox, result,
      Speech.supported() ? h('button', { class: 'btn block', onclick: () => U.voiceTest(paint) }, icon('speaker'), 'Tester la voix') : null,
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Vitesse de lecture'),
        UI.seg(Speech.RATES.map(r => ({ value: r.id, label: r.label })), Speech.rateId(Store.getSetting('speechRate')), id => set('speechRate', Speech.rateOf(id)))),
      h('button', { class: 'link-btn', onclick: () => U.voiceHelp(paint) }, 'Installer la voix chinoise (pas de son ?)'));

    const dict = h('section', { class: 'settings-group' }, h('h2', null, 'Dictée à l’écoute'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Ce que la voix lit (mots)'),
        UI.seg([{ value: 'mot', label: 'Le mot' }, { value: 'mot-phrase', label: 'Mot, phrase, mot' }], Store.getSetting('audioDictRead'), v => set('audioDictRead', v))),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Lectures de chaque mot ou phrase'),
        UI.seg([1, 2, 3].map(n => ({ value: n, label: String(n) })), Store.getSetting('audioDictRepeat'), v => set('audioDictRepeat', v))),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Pause entre deux lectures'),
        UI.seg([1, 2, 3, 5].map(n => ({ value: n, label: n + ' s' })), Store.getSetting('audioDictGap'), v => set('audioDictGap', v))),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Lecture automatique à chaque carte'),
        UI.seg([{ value: true, label: 'Oui' }, { value: false, label: 'Non' }], Store.getSetting('audioDictAuto') !== false, v => set('audioDictAuto', v))));
    return [voice, dict];
  };

  /* ------------------------------------------------------------------ */
  /* Lignes « À l'oreille » (page leçon, onglet Écouter)                 */
  /* ------------------------------------------------------------------ */
  U.listenRows = function (ctx, id) {
    const words = Store.wordsOf(id), can = Speech.supported();
    const nWords = words.filter(w => w.hanzi).length;
    const nSent = words.reduce((n, w) => n + Core.sentencesOf(w).length, 0);
    const nAudio = Core.audioPool(words).length, nSentReady = Core.sentencePool(words).length;
    const row = (ic, title, sub, path, enabled) => h('button', { class: 'row' + (enabled ? '' : ' off'), disabled: !enabled, onclick: () => ctx.go(path) },
      h('span', { class: 'num' }, icon(ic)),
      h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub' }, sub)),
      h('span', { class: 'row-end' }, icon('chevR')));
    const noVoice = 'Ce navigateur ne lit pas à voix haute.';
    return [
      row('headphones', 'Écouter la leçon', nWords ? plural(nWords, 'mot', 'mots') + ', ' + plural(nSent, 'phrase', 'phrases') + '.' : 'Ajoute d’abord des mots.', '/lecon/' + id + '/ecouter', nWords > 0),
      row('speaker', 'Dictée à l’écoute : mots', !can ? noVoice : nAudio ? plural(nAudio, 'mot prêt', 'mots prêts') + '.' : 'Après le triage (et la découverte des mots inconnus).', '/lecon/' + id + '/dictee-ecoute', can && nAudio > 0),
      row('pen', 'Dictée à l’écoute : phrases', !can ? noVoice : nSentReady ? plural(nSentReady, 'phrase prête', 'phrases prêtes') + '.' : 'Ajoute un exemple à un mot, ou écris tes phrases en découverte.', '/lecon/' + id + '/dictee-ecoute?type=phrases', can && nSentReady > 0)
    ];
  };

  /* ------------------------------------------------------------------ */
  /* Onglet Écouter                                                      */
  /* ------------------------------------------------------------------ */
  function voiceCard(ctx) {
    const line = h('p', { class: 'lead-sm' }, 'Recherche de la voix chinoise…');
    const actions = h('div', { class: 'stack' });
    const box = h('section', { class: 'block' }, h('h2', null, 'Voix chinoise'), line, actions);
    function paint() {
      UI.clear(actions);
      if (!Speech.supported()) { line.textContent = 'Ce navigateur ne sait pas lire à voix haute. Les écrans de lecture restent utilisables, sans le son.'; return; }
      const st = Speech.status(Store.getSetting('voiceURI')), check = Store.getSetting('voiceCheck');
      if (check === 'ok') {
        line.textContent = 'Voix prête' + (st.chosen ? ' : ' + st.chosen.name : '') + '.';
        actions.append(h('button', { class: 'link-btn', onclick: () => ctx.go('/reglages') }, 'Réglages de la voix'));
      } else if (check === 'ko') {
        line.textContent = 'Le dernier test n’a pas réussi : la voix chinoise doit sans doute être installée.';
        actions.append(
          h('button', { class: 'btn primary block', onclick: () => U.voiceHelp(paint) }, 'Voir comment l’installer'),
          h('button', { class: 'btn block', onclick: () => U.voiceTest(paint) }, 'Tester de nouveau'));
      } else {
        line.textContent = st.hasZh ? 'Une voix chinoise est détectée. Fais un test de 20 secondes pour être sûr de l’entendre.' : 'Aucune voix chinoise n’est signalée pour l’instant. Le test dira si le son marche.';
        actions.append(h('button', { class: 'btn primary block', onclick: () => U.voiceTest(paint) }, icon('speaker'), 'Tester la voix'));
      }
    }
    Speech.init().then(() => { if (box.isConnected) paint(); });
    return box;
  }

  Views.listen = function (ctx) {
    const t = today(), lessons = Store.allLessons(), cur = U.currentLesson();
    ctx.root.append(UI.pageHead({ title: 'Écouter', sub: 'Le téléphone lit à voix haute : tu lis, tu écoutes, tu écris.' }), voiceCard(ctx));

    if (!lessons.length) {
      ctx.root.append(h('section', { class: 'block' }, h('h2', null, 'Leçons'),
        h('p', { class: 'muted' }, 'Crée une leçon et ajoute tes mots : ils pourront être lus ici.'),
        h('button', { class: 'btn primary block', onclick: () => ctx.go('/nouvelle-lecon') }, icon('plus'), 'Créer une leçon')));
      return;
    }

    ctx.root.append(h('section', { class: 'block' }, h('h2', null, 'Leçon en cours'),
      h('p', { class: 'lesson-name' }, U.nameEl(cur)),
      h('div', { class: 'rows' }, U.listenRows(ctx, cur.id))));

    const others = lessons.filter(l => l.id !== cur.id);
    if (others.length) {
      ctx.root.append(h('section', { class: 'block' }, h('h2', null, 'Autres leçons'),
        h('div', { class: 'rows' }, others.map(l => {
          const n = Store.wordsOf(l.id).filter(w => w.hanzi).length;
          return h('button', { class: 'row', onclick: () => UI.sheet('Écouter : ' + U.lessonName(l), h('div', { class: 'rows' }, U.listenRows(ctx, l.id))) },
            h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, U.nameEl(l)), h('span', { class: 'row-sub' }, n ? plural(n, 'mot', 'mots') : 'Aucun mot')),
            h('span', { class: 'row-end' }, icon('chevR')));
        }))));
    }

    const dueN = Core.dueRed(Store.allWords(), t).length;
    ctx.root.append(h('section', { class: 'block' }, h('h2', null, 'Mots rouges'),
      dueN && Speech.supported()
        ? [h('p', { class: 'muted' }, plural(dueN, 'mot rouge à redicter', 'mots rouges à redicter') + ' aujourd’hui.'),
          h('button', { class: 'btn primary block', onclick: () => ctx.go('/redictee-ecoute') }, icon('headphones'), 'Redicter à l’écoute')]
        : h('p', { class: 'muted' }, dueN ? 'Ce navigateur ne lit pas à voix haute.' : 'Rien à redicter aujourd’hui.')));
  };

  /* ------------------------------------------------------------------ */
  /* Lecteur de leçon : lire les mots et les phrases, avec la voix       */
  /* ------------------------------------------------------------------ */
  Views.player = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const words = Store.wordsOf(lessonId);
    const settings = () => ({
      scope: Store.getSetting('listenScope'), repeat: Store.getSetting('listenRepeat'), gap: Store.getSetting('listenGap'),
      shuffle: !!Store.getSetting('listenShuffle'), pinyin: Store.getSetting('listenPinyin') !== false, hide: !!Store.getSetting('listenHideHanzi')
    });
    const back = '/lecon/' + lessonId;

    if (!words.some(w => w.hanzi)) {
      ctx.root.append(UI.empty('Rien à écouter', 'Cette leçon n’a pas encore de mots.',
        h('button', { class: 'btn primary', onclick: () => ctx.go(U.stepPath(lessonId, 'add')) }, 'Ajouter des mots')));
      return;
    }

    let deck = [], i = 0, playing = false, finished = false, run = 0, alive = true, shown = false, meaning = false, lock = null;
    const supported = Speech.supported();

    UI.setFocus(true);
    const titleEl = h('span', null, '');
    const barFill = UI.bar(0);
    const cardEl = h('div', { class: 'listen-wrap' });
    const noteEl = h('div', { class: 'listen-note', hidden: true, 'aria-live': 'polite' });
    const prevBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'Précédent' }, icon('prev'));
    const nextBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'Suivant' }, icon('next'));
    const playBtn = h('button', { class: 'btn primary play-main', type: 'button' });
    const speed = UI.seg(Speech.RATES.map(r => ({ value: r.id, label: r.label })), Speech.rateId(Store.getSetting('speechRate')),
      id => { Store.setSetting('speechRate', Speech.rateOf(id)); if (playing) playFrom(i); });

    const top = UI.focusTop({
      title: 'Écouter', onQuit: () => ctx.go(back),
      right: h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Réglages de lecture', onclick: openSettings }, icon('sliders'))
    });
    top.querySelector('.focus-title').replaceChildren(titleEl);

    ctx.root.append(top, h('div', { class: 'focus-bar' }, barFill), noteEl, cardEl,
      h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-inner' }, speed, h('div', { class: 'player-ctl' }, prevBtn, playBtn, nextBtn))));

    ctx.onLeave(() => { alive = false; run++; Speech.stop(); releaseLock(); });

    /* --- état --- */
    function buildDeck() {
      const c = settings();
      deck = Core.listenDeck(words, c.scope, { shuffle: c.shuffle });
      i = 0; finished = false; shown = false; meaning = false;
    }

    function syncControls() {
      UI.clear(playBtn);
      playBtn.append(icon(playing ? 'pause' : 'play'), h('span', null, playing ? 'Pause' : finished ? 'Relire' : 'Lire'));
      playBtn.setAttribute('aria-label', playing ? 'Pause' : finished ? 'Relire depuis le début' : 'Lire');
      playBtn.disabled = !supported || !deck.length;
      prevBtn.disabled = !deck.length || i <= 0;
      nextBtn.disabled = !deck.length || i >= deck.length - 1;
    }

    function mark(seg) {
      Array.from(cardEl.querySelectorAll('.is-playing')).forEach(el => el.classList.remove('is-playing'));
      if (!seg) return;
      const el = cardEl.querySelector('[data-seg="' + seg + '"]');
      if (el) el.classList.add('is-playing');
    }

    function note(text, withHelp) {
      UI.clear(noteEl);
      if (!text) { noteEl.hidden = true; return; }
      noteEl.append(h('p', null, text), withHelp ? h('button', { class: 'link-btn', type: 'button', onclick: () => U.voiceHelp() }, 'Installer la voix chinoise') : null);
      noteEl.hidden = false;
    }

    function problem(res) { note(Speech.explain(res), true); }

    async function acquireLock() {
      try {
        if (!lock && root.navigator && root.navigator.wakeLock) {
          lock = await root.navigator.wakeLock.request('screen');
          lock.addEventListener('release', () => { lock = null; });
        }
      } catch (e) { lock = null; }
    }
    function releaseLock() { try { if (lock) lock.release(); } catch (e) { /* sans importance */ } lock = null; }

    /* --- affichage de la carte --- */
    function meaningBlock(w) {
      if (!Core.hasPrompt(w)) return null;
      if (!Core.meaningUnlocked(w)) return h('p', { class: 'hint' }, 'Le sens de ce mot s’ouvre après son triage ou sa découverte guidée.');
      if (!meaning) return h('button', { class: 'link-btn', type: 'button', onclick: () => { meaning = true; drawCard(); } }, 'Voir le sens');
      return h('div', { class: 'meaning' },
        w.fr ? h('p', { class: 'answer-fr' }, w.fr) : null,
        w.defZh ? h('p', { class: 'zh', lang: 'zh-Hans' }, w.defZh) : null);
    }

    function drawCard() {
      UI.clear(cardEl);
      syncControls();
      if (!deck.length) {
        titleEl.textContent = 'Écouter';
        barFill.firstChild.style.width = '0%';
        cardEl.append(UI.empty('Aucune phrase dans cette leçon', 'Ajoute un exemple à tes mots, ou écris tes phrases pendant la découverte. Tu peux aussi lire les mots seuls.',
          h('button', { class: 'btn primary', onclick: () => { Store.setSetting('listenScope', 'both'); buildDeck(); drawCard(); } }, 'Lire aussi les mots')));
        return;
      }
      const w = deck[i], c = settings();
      titleEl.textContent = 'Écouter · ' + (i + 1) + ' sur ' + deck.length;
      barFill.firstChild.style.width = ((i + (finished ? 1 : 0)) / deck.length * 100) + '%';
      if (finished) { drawEnd(); return; }
      const hidden = c.hide && !shown;
      const chars = Array.from(w.hanzi).length;
      const px = Math.max(34, Math.min(80, Math.floor((Math.min(root.innerWidth || 360, 640) - 48) / Math.max(chars, 1))));
      const sentences = c.scope === 'mots' ? [] : Core.sentencesOf(w);
      cardEl.append(h('div', { class: 'listen-card' + (hidden ? ' veil' : '') },
        h('button', { class: 'hanzi-big zh hide-able', type: 'button', lang: 'zh-Hans', 'data-seg': 'mot', style: { fontSize: px + 'px' }, 'aria-label': 'Écouter le mot', onclick: () => playOne(w.hanzi, 'mot') }, w.hanzi),
        c.pinyin && w.pinyin ? h('p', { class: 'listen-py hide-able' }, w.pinyin) : null,
        c.scope !== 'mots' ? (sentences.length
          ? h('div', { class: 'sent-list' }, sentences.map((s, k) => h('button', { class: 'sent-row hide-able', type: 'button', lang: 'zh-Hans', 'data-seg': 'p' + k, onclick: () => playOne(s.text, 'p' + k) },
            h('span', { class: 'zh sent-text' }, UI.highlight(s.text, w.hanzi)),
            s.source === 'mienne' ? h('span', { class: 'src' }, 'ma phrase') : null,
            icon('speaker'))))
          : h('p', { class: 'muted small' }, 'Pas de phrase pour ce mot.')) : null,
        hidden ? h('button', { class: 'btn', type: 'button', onclick: () => { shown = true; drawCard(); } }, icon('eye'), 'Montrer le texte') : null,
        meaningBlock(w)));
    }

    function drawEnd() {
      cardEl.append(h('div', { class: 'listen-end' },
        h('div', { class: 'recap' }, h('p', { class: 'kicker' }, 'Lecture terminée'), h('p', { class: 'recap-score' }, plural(deck.length, 'mot lu', 'mots lus'))),
        h('div', { class: 'stack' },
          supported && Core.audioPool(words).length ? h('button', { class: 'btn primary block', onclick: () => ctx.go(back + '/dictee-ecoute') }, icon('speaker'), 'Dictée à l’écoute : mots') : null,
          h('button', { class: 'btn block', onclick: () => ctx.go(back) }, 'Retour à la leçon'))));
    }

    /* --- lecture --- */
    async function playFrom(k) {
      const my = ++run;
      Speech.stop();
      i = Math.max(0, Math.min(deck.length - 1, k)); finished = false; playing = true; shown = false; meaning = false;
      note('');
      drawCard();
      await Speech.init();
      if (my !== run) return;
      acquireLock();
      while (my === run && i < deck.length) {
        const c = settings(), w = deck[i];
        const res = await Speech.play(Core.playParts(Core.speakPlan(w, c.scope), c.repeat, 0.8),
          Object.assign(U.voiceOpts(), { onPart: (n, p) => { if (my === run) mark(p.seg); } }));
        if (my !== run) return;
        mark(null);
        if (!res.ok) { playing = false; releaseLock(); syncControls(); problem(res); return; }
        if (i >= deck.length - 1) break;
        await Speech.play([{ pause: c.gap }]);
        if (my !== run) return;
        i++; shown = false; meaning = false;
        drawCard();
      }
      if (my === run) { playing = false; finished = true; releaseLock(); drawCard(); }
    }

    function pause() { run++; playing = false; Speech.stop(); mark(null); releaseLock(); syncControls(); }

    async function playOne(text, seg) {
      run++; playing = false; releaseLock(); Speech.stop(); syncControls();
      if (!supported) { note('Ce navigateur ne sait pas lire à voix haute.'); return; }
      note('');
      mark(seg);
      await Speech.init();
      const res = await Speech.say(text, U.voiceOpts());
      if (!alive || res.cancelled) return;
      mark(null);
      if (!res.ok) problem(res);
    }

    playBtn.addEventListener('click', () => {
      if (playing) { pause(); return; }
      if (finished) { buildDeck(); playFrom(0); return; }
      playFrom(i);
    });
    prevBtn.addEventListener('click', () => { if (i > 0) { if (supported) playFrom(i - 1); else { i--; shown = false; meaning = false; drawCard(); } } });
    nextBtn.addEventListener('click', () => { if (i < deck.length - 1) { if (supported) playFrom(i + 1); else { i++; shown = false; meaning = false; drawCard(); } } });

    /* --- réglages de lecture --- */
    function openSettings() {
      pause();
      const c = settings();
      const set = (k, v) => Store.setSetting(k, v);
      const field = (label, control) => h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), control);
      const sheet = UI.sheet('Réglages de lecture', h('div', { class: 'form' },
        field('Que lire ?', UI.seg([{ value: 'mots', label: 'Mots' }, { value: 'phrases', label: 'Phrases' }, { value: 'both', label: 'Les deux' }], c.scope, v => set('listenScope', v))),
        field('Lectures de chaque élément', UI.seg([1, 2, 3].map(n => ({ value: n, label: String(n) })), c.repeat, v => set('listenRepeat', v))),
        field('Pause entre deux mots', UI.seg([1, 2, 3, 5].map(n => ({ value: n, label: n + ' s' })), c.gap, v => set('listenGap', v))),
        field('Ordre', UI.seg([{ value: false, label: 'Celui de la leçon' }, { value: true, label: 'Mélangé' }], c.shuffle, v => set('listenShuffle', v))),
        field('Pinyin', UI.seg([{ value: true, label: 'Affiché' }, { value: false, label: 'Caché' }], c.pinyin, v => set('listenPinyin', v))),
        field('Texte', UI.seg([{ value: false, label: 'Visible' }, { value: true, label: 'Caché jusqu’au toucher' }], c.hide, v => set('listenHideHanzi', v))),
        h('button', { class: 'btn primary block', onclick: () => sheet.close() }, 'Appliquer')),
      { onClose: () => { if (!alive) return; buildDeck(); drawCard(); } });
    }

    /* --- démarrage --- */
    buildDeck();
    drawCard();
    Speech.init().then(() => {
      if (!alive) return;
      if (!supported) note('Ce navigateur ne sait pas lire à voix haute : tu peux lire les mots à l’écran, sans le son.');
      else if (!Speech.status(Store.getSetting('voiceURI')).hasZh && Store.getSetting('voiceCheck') !== 'ok') note('Aucune voix chinoise détectée pour l’instant. Touche Lire : si tu n’entends rien, installe la voix.', true);
    });
  };

  /* ------------------------------------------------------------------ */
  /* Dictées à l'écoute                                                  */
  /* ------------------------------------------------------------------ */
  function noSpeechView(ctx, back) {
    ctx.root.append(UI.empty('Lecture à voix haute impossible', 'Ce navigateur ne sait pas lire à voix haute. Ouvre l’appli dans Chrome ou Samsung Internet sur ton téléphone.',
      h('button', { class: 'btn primary', onclick: () => ctx.go(back) }, 'Retour')));
  }

  function emptyAudio(ctx, lessonId, words, type) {
    const st = Core.lessonStats(words);
    let text, label, path;
    if (!st.total) { text = 'Cette leçon n’a pas encore de mots.'; label = 'Ajouter des mots'; path = U.stepPath(lessonId, 'add'); }
    else if (type === 'phrases') { text = 'Aucune phrase prête : ajoute un exemple à tes mots (ou écris tes phrases pendant la découverte), après le triage.'; label = 'Voir la leçon'; path = '/lecon/' + lessonId; }
    else if (st.triaged < st.total) { text = 'Il reste ' + plural(st.total - st.triaged, 'mot', 'mots') + ' à trier avant la dictée.'; label = 'Faire le triage'; path = U.stepPath(lessonId, 'triage'); }
    else if (st.toDiscover > 0) { text = 'Découvre d’abord les ' + st.toDiscover + ' mots inconnus.'; label = 'Découvrir les mots'; path = U.stepPath(lessonId, 'discover'); }
    else { text = 'Tous les mots de la leçon sont en rouge : ils ont leur propre redictée.'; label = 'Voir les mots rouges'; path = '/rouges'; }
    ctx.root.append(UI.empty('Rien à dicter pour l’instant', text, h('button', { class: 'btn primary', onclick: () => ctx.go(path) }, label)));
  }

  const audioCfg = () => ({
    mode: 'audio', read: Store.getSetting('audioDictRead'), repeat: Store.getSetting('audioDictRepeat'),
    gap: Store.getSetting('audioDictGap'), auto: Store.getSetting('audioDictAuto') !== false
  });

  Views.audioDictation = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const back = '/lecon/' + lessonId;
    if (!Speech.supported()) return noSpeechView(ctx, back);
    const type = ctx.query.type === 'phrases' ? 'phrases' : 'mots';
    const words = Store.wordsOf(lessonId), n = Store.getSetting('dictSize');
    const items = type === 'phrases'
      ? Core.sentencePool(words).slice(0, n).map(x => ({ wordId: x.wordId, kind: 'new', text: x.text }))
      : Core.audioPool(words).slice(0, n).map(w => ({ wordId: w.id, kind: 'new' }));
    if (!items.length) return emptyAudio(ctx, lessonId, words, type);
    U.runDictation(ctx, Object.assign(audioCfg(), {
      items: items, title: type === 'phrases' ? 'Dictée de phrases' : 'Dictée à l’écoute', shortTitle: type === 'phrases' ? 'Phrases' : 'À l’écoute', back: back, backLabel: 'Retour à la leçon',
      more: () => ({ label: type === 'phrases' ? 'Une autre dictée de phrases' : 'Une autre dictée de mots', path: back + '/dictee-ecoute' + (type === 'phrases' ? '?type=phrases' : '') })
    }));
  };

  Views.audioRedictee = function (ctx) {
    if (!Speech.supported()) return noSpeechView(ctx, '/rouges');
    const items = Core.buildRedictee(Store.allWords(), today(), null, { audio: true });
    if (!items.length) {
      ctx.root.append(UI.empty('Rien à redicter', 'Aucun mot rouge n’est dû aujourd’hui.', h('button', { class: 'btn primary', onclick: () => ctx.go('/rouges') }, 'Voir les mots rouges')));
      return;
    }
    U.runDictation(ctx, Object.assign(audioCfg(), {
      items: items, title: 'Redictée à l’écoute', shortTitle: 'Redictée', back: '/rouges', backLabel: 'Voir les mots rouges',
      more: () => {
        const left = Core.dueRed(Store.allWords(), today()).length;
        return left ? { label: 'Continuer la redictée (' + plural(left, 'mot dû', 'mots dus') + ')', path: '/redictee-ecoute' } : null;
      }
    }));
  };
})(typeof self !== 'undefined' ? self : this);
