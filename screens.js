/* screens.js — écrans : accueil, leçons, saisie, import, mots rouges, réglages. */
(function (root) {
  'use strict';
  const h = UI.h, zh = UI.zh, icon = UI.icon;
  const today = UI.today;
  const Views = root.Views = root.Views || {};
  const U = Views.util = {};

  /* ------------------------------------------------------------------ */
  /* Utilitaires partagés                                                */
  /* ------------------------------------------------------------------ */
  const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
  U.plural = plural;
  U.bookOf = l => Core.BOOKS.find(b => b.id === l.livre) || Core.BOOKS[Core.BOOKS.length - 1];
  U.lessonName = l => (l.numero ? l.numero + ' ' : '') + l.titre;
  U.nameEl = l => h('span', null, l.numero ? l.numero + ' ' : '', Core.hasCJK(l.titre) ? zh(l.titre) : l.titre);

  U.currentLesson = function () {
    const id = Store.getSetting('currentLessonId', null);
    if (id && Store.lessons.has(id)) return Store.lessons.get(id);
    const all = Store.allLessons();
    return all.length ? all[all.length - 1] : null;
  };

  U.stepPath = (id, key) => ({
    add: '/lecon/' + id + '/ajout', triage: '/lecon/' + id + '/triage',
    discover: '/lecon/' + id + '/decouverte', dictate: '/lecon/' + id + '/dictee'
  }[key] || '/lecon/' + id);

  U.stepLabel = function (step) {
    const gs = Store.getSetting('groupSize'), ds = Store.getSetting('dictSize');
    switch (step.key) {
      case 'add': return 'Ajouter des mots';
      case 'triage': return 'Trier ' + plural(step.count, 'mot', 'mots');
      case 'discover': return 'Découvrir ' + plural(Math.min(step.count, gs), 'mot', 'mots');
      case 'dictate': return 'Dicter ' + plural(Math.min(step.count, ds), 'mot', 'mots');
      case 'fill': return 'Compléter ' + plural(step.count, 'fiche', 'fiches');
      default: return 'Ouvrir la leçon';
    }
  };

  U.notFound = function (ctx) {
    ctx.root.append(UI.empty('Introuvable', 'Cette page n’existe plus (leçon supprimée ?).',
      h('button', { class: 'btn primary', onclick: () => ctx.go('/') }, 'Retour à l’accueil')));
  };
  Views.notFound = U.notFound;

  /* ------------------------------------------------------------------ */
  /* Formulaire d'un mot (saisie rapide et fiche)                        */
  /* ------------------------------------------------------------------ */
  function convertField(inp) {
    const v = inp.value, out = Core.numToTone(v);
    if (out === v) return;
    const pos = inp.selectionStart, delta = out.length - v.length;
    inp.value = out;
    try { inp.setSelectionRange(pos + delta, pos + delta); } catch (e) { /* sans importance */ }
  }

  U.wordForm = function (initial, opts) {
    opts = opts || {};
    const f = Object.assign({ rubrique: '生词', hanzi: '', pinyin: '', fr: '', defZh: '', example: '' }, initial || {});
    const base = { type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' };
    const hanzi = h('input', Object.assign({ class: 'inp zh', lang: 'zh-Hans', value: f.hanzi, placeholder: '螺丝', enterkeyhint: 'next' }, base));
    const pinyin = h('input', Object.assign({ class: 'inp', value: f.pinyin, placeholder: 'luo2si1', autocorrect: 'off', enterkeyhint: 'next' }, base));
    const fr = h('input', Object.assign({ class: 'inp', value: f.fr, placeholder: 'vis', enterkeyhint: 'next' }, base));
    const defZh = h('input', Object.assign({ class: 'inp zh', lang: 'zh-Hans', value: f.defZh, placeholder: '解释这个词，不写这个词', enterkeyhint: 'next' }, base));
    const example = h('input', Object.assign({ class: 'inp zh', lang: 'zh-Hans', value: f.example, placeholder: '一句包含这个词的句子', enterkeyhint: 'done' }, base));
    const inputs = [hanzi, pinyin, fr, defZh, example];
    const names = { hanzi: hanzi, pinyin: pinyin, fr: fr, defZh: defZh, example: example };

    pinyin.addEventListener('input', e => { if (!e.isComposing) convertField(pinyin); });
    pinyin.addEventListener('blur', () => convertField(pinyin));
    inputs.forEach((inp, i) => inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (i < inputs.length - 1) inputs[i + 1].focus(); else if (opts.onSubmit) opts.onSubmit();
    }));

    const state = { rubrique: f.rubrique };
    const rubHint = h('p', { class: 'hint' }, Core.RUBRIQUE_FR[state.rubrique]);
    const seg = UI.seg(Core.RUBRIQUES.map(r => ({ value: r, label: Core.RUBRIQUE_SHORT[r] })), state.rubrique, v => {
      state.rubrique = v; rubHint.textContent = Core.RUBRIQUE_FR[v];
    });
    const defHint = h('p', { class: 'hint warn', hidden: true }, 'Cette définition contient le mot : pendant la dictée, il sera remplacé par ～.');
    const checkDef = () => { defHint.hidden = !(hanzi.value.trim() && defZh.value.indexOf(hanzi.value.trim()) >= 0); };
    defZh.addEventListener('input', checkDef); hanzi.addEventListener('input', checkDef);

    const el = h('div', { class: 'form' },
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Rubrique'), seg, rubHint),
      UI.field('Caractères', hanzi),
      UI.field('Pinyin', pinyin, 'Écris les tons en chiffres : luo2si1 devient luósī.'),
      UI.field('Sens en français', fr),
      h('div', { class: 'field' }, UI.field('Définition en chinois simple', defZh), defHint),
      UI.field('Phrase d’exemple', example));
    checkDef();

    return {
      el: el,
      read: () => ({
        rubrique: state.rubrique, hanzi: hanzi.value.trim(), pinyin: Core.numToTone(pinyin.value.trim()),
        fr: fr.value.trim(), defZh: defZh.value.trim(), example: example.value.trim()
      }),
      focus: name => { const n = names[name]; if (n) n.focus(); },
      clear: () => { inputs.forEach(i => { i.value = ''; }); checkDef(); }
    };
  };

  /* Fiche d'un mot dans une fenêtre : modifier, remettre à zéro, supprimer. */
  U.openWordSheet = function (ctx, word, onDone) {
    onDone = onDone || (() => ctx.refresh());
    const form = U.wordForm(word, {});
    let sheet;
    const save = () => {
      const d = form.read();
      if (!d.hanzi || !Core.hasCJK(d.hanzi)) { UI.toast('Écris les caractères du mot.', 'warn'); form.focus('hanzi'); return; }
      if (Core.isDuplicate(Store.wordsOf(word.lessonId), d, word.id)) { UI.toast('Ce mot existe déjà dans cette rubrique.', 'warn'); return; }
      Store.putWord(Object.assign({}, word, d, { updatedAt: Date.now() }));
      sheet.close(); onDone(); UI.toast('Fiche enregistrée');
    };
    const stateText = { nouveau: 'pas encore dicté', ok: 'dicté juste', rouge: 'en rouge', sorti: 'sorti de la liste rouge' }[word.state];
    sheet = UI.sheet('Fiche du mot', h('div', { class: 'form' },
      h('div', { class: 'py-row' }, h('p', { class: 'muted small' }, 'État : ' + stateText + '.'), word.hanzi ? U.speakBtn(word.hanzi) : null),
      form.el,
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary block', onclick: save }, 'Enregistrer'),
        h('button', { class: 'btn block', onclick: async () => {
          if (!(await UI.confirm('Remettre ce mot à zéro ?', { detail: 'Triage, découverte et dictée de ce mot sont effacés. La fiche est gardée.', ok: 'Remettre à zéro' }))) return;
          Store.putWord(Core.resetProgress(word)); sheet.close(); onDone();
        } }, 'Remettre ce mot à zéro'),
        h('button', { class: 'btn block danger', onclick: async () => {
          if (!(await UI.confirm('Supprimer ce mot ?', { ok: 'Supprimer', danger: true }))) return;
          Store.deleteWord(word.id); sheet.close(); onDone(); UI.toast('Mot supprimé');
        } }, 'Supprimer ce mot'))));
  };

  /* ------------------------------------------------------------------ */
  /* Accueil                                                             */
  /* ------------------------------------------------------------------ */
  Views.home = function (ctx) {
    const rootEl = ctx.root, t = today();
    const words = Store.allWords();
    const offset = Store.getSetting('dayOffset', 0);

    rootEl.append(h('header', { class: 'home-head' },
      h('p', { class: 'kicker' }, Core.formatFr(t).replace(/^./, c => c.toUpperCase())),
      h('h1', null, 'Aujourd’hui')));
    if (offset) rootEl.append(h('p', { class: 'banner' }, 'Date simulée : ' + (offset > 0 ? '+' : '') + offset + ' j. Remets-la à 0 dans Réglages quand tes tests sont finis.'));
    if (Store.kind === 'memory') rootEl.append(h('p', { class: 'banner' }, 'Ce navigateur ne permet pas de garder les données : exporte une sauvegarde (Réglages) avant de fermer.'));

    if (words.length) {
      // 1. Redictée du jour
      const due = Core.dueRed(words, t).filter(Core.hasPrompt);
      const reds = words.filter(w => w.state === 'rouge' && w.red && w.red.due);
      const s1 = h('section', { class: 'block' }, h('h2', null, 'Redictée'));
      if (due.length) {
        s1.append(
          h('p', { class: 'lead' }, h('strong', null, String(due.length)), due.length > 1 ? ' mots rouges à écrire de nouveau.' : ' mot rouge à écrire de nouveau.'),
          h('button', { class: 'btn primary block', onclick: () => ctx.go('/redictee') }, 'Redicter maintenant'));
      } else if (reds.length) {
        const next = reds.map(w => w.red.due).sort()[0];
        const n = reds.filter(w => w.red.due === next).length;
        s1.append(h('p', { class: 'lead' }, 'Rien à redicter aujourd’hui.'),
          h('p', { class: 'muted' }, 'Prochaine redictée : ' + Core.relLabel(next, t).toLowerCase() + ' (' + plural(n, 'mot', 'mots') + ').'));
      } else s1.append(h('p', { class: 'muted' }, 'Aucun mot rouge pour le moment.'));
      rootEl.append(s1);

      // 2. Nouveaux mots du jour
      const limit = Store.getSetting('newLimit'), n = Core.newToday(words, t), over = n > limit;
      rootEl.append(h('section', { class: 'block' },
        h('h2', null, 'Nouveaux mots du jour'),
        h('p', { class: 'lead' }, h('strong', null, String(n)), ' / ' + limit + ' (plafond Anki)'),
        UI.bar(n / limit, over),
        over ? h('p', { class: 'alert' }, 'Plus de ' + limit + ' nouveaux mots aujourd’hui : Anki sera saturé. Arrête les nouveaux mots, le reste attend demain.') : null));
    }

    // 3. Leçon en cours
    const lesson = U.currentLesson();
    const s3 = h('section', { class: 'block' }, h('h2', null, 'Leçon en cours'));
    if (!lesson) {
      s3.append(h('p', { class: 'muted' }, 'Aucune leçon pour l’instant. Crée-en une, puis ajoute tes mots.'),
        h('button', { class: 'btn primary block', onclick: () => ctx.go('/nouvelle-lecon') }, icon('plus'), 'Créer ma première leçon'),
        h('button', { class: 'link-btn', onclick: () => U.loadDemo(ctx) }, 'Essayer avec une leçon de démonstration (8 mots)'));
    } else {
      const st = Core.lessonStats(Store.wordsOf(lesson.id)), next = Core.nextStep(st);
      s3.append(
        h('div', null, h('p', { class: 'lesson-name' }, U.nameEl(lesson)), h('p', { class: 'sub' }, U.bookOf(lesson).label)),
        h('dl', { class: 'stats' },
          h('div', null, h('dt', null, 'Triage'), h('dd', null, st.triaged + '/' + st.total)),
          h('div', null, h('dt', null, 'Découverte'), h('dd', null, st.discovered + '/' + st.unknown)),
          h('div', null, h('dt', null, 'Dictée'), h('dd', null, st.dictated + '/' + st.total))),
        next.key === 'done'
          ? h('p', { class: 'muted' }, 'Tous les mots de cette leçon sont passés par la dictée.')
          : h('button', { class: 'btn primary block', onclick: () => ctx.go(U.stepPath(lesson.id, next.key)) }, U.stepLabel(next)),
        h('div', { class: 'link-row' },
          h('button', { class: 'link-btn', onclick: () => ctx.go('/lecon/' + lesson.id) }, 'Voir la leçon'),
          h('button', { class: 'link-btn', onclick: () => ctx.go('/lecon/' + lesson.id + '/ecouter') }, icon('headphones'), 'Écouter la leçon'),
          h('button', { class: 'link-btn', onclick: () => ctx.go('/atelier?lesson=' + encodeURIComponent(lesson.id)) }, icon('pen'), 'Atelier')));
    }
    rootEl.append(s3);

    // 4. Régularité
    const reviews = Store.allReviews();
    if (reviews.length) {
      const info = Core.streakInfo(reviews.map(r => r.date), t);
      rootEl.append(h('section', { class: 'block' },
        h('h2', null, 'Régularité'),
        h('div', { class: 'week' }, info.last7.map(d => h('div', { class: 'day' + (d.active ? ' on' : '') + (d.date === t ? ' today' : '') },
          h('i'), h('b', null, new Date(d.date + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'narrow', timeZone: 'UTC' }))))),
        h('p', { class: 'muted' }, info.current ? 'Série en cours : ' + plural(info.current, 'jour', 'jours') + '.' : 'Pas de série en cours : une session aujourd’hui en lance une.')));
    }
  };

  /* ------------------------------------------------------------------ */
  /* Leçons                                                              */
  /* ------------------------------------------------------------------ */
  U.loadDemo = async function (ctx) {
    const D = Core.DEMO_LESSON;
    const lesson = Core.makeLesson({ livre: D.livre, numero: D.numero, titre: D.titre });
    const words = D.words.map((w, i) => Core.makeWord(lesson.id, { rubrique: '生词', hanzi: w[0], pinyin: w[1], fr: w[2], defZh: w[3], example: w[4] }, i + 1));
    await Store.putLesson(lesson);
    await Store.putWords(words);
    await Store.setSetting('currentLessonId', lesson.id);
    UI.toast('Leçon de démonstration ajoutée');
    ctx.go('/lecon/' + lesson.id);
  };

  Views.lessons = function (ctx) {
    const list = Store.allLessons(), cur = U.currentLesson();
    ctx.root.append(UI.pageHead({ title: 'Leçons', sub: list.length ? plural(list.length, 'leçon', 'leçons') : null }));
    if (!list.length) {
      ctx.root.append(UI.empty('Pas encore de leçon', 'Une leçon rassemble les mots d’un chapitre : tu les saisis, puis tu suis le cycle triage, découverte, dictée.', [
        h('button', { class: 'btn primary block', onclick: () => ctx.go('/nouvelle-lecon') }, icon('plus'), 'Créer une leçon'),
        h('button', { class: 'link-btn', onclick: () => U.loadDemo(ctx) }, 'Essayer avec une leçon de démonstration')]));
      return;
    }
    const rows = h('div', { class: 'rows' });
    let lastBook = null;
    list.forEach(l => {
      if (l.livre !== lastBook) { lastBook = l.livre; rows.append(h('h2', { class: 'book-h' }, U.bookOf(l).label)); }
      const st = Core.lessonStats(Store.wordsOf(l.id));
      const sub = st.total ? plural(st.total, 'mot', 'mots') + (st.red ? ', ' + st.red + ' en rouge' : '') : 'Aucun mot';
      rows.append(h('button', { class: 'row', onclick: () => ctx.go('/lecon/' + l.id) },
        h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, U.nameEl(l)), h('span', { class: 'row-sub' }, sub)),
        h('span', { class: 'row-end' }, cur && cur.id === l.id ? h('span', { class: 'tag' }, 'en cours') : null, icon('chevR'))));
    });
    ctx.root.append(rows,
      h('div', { class: 'stack', style: { marginTop: '18px' } },
        h('button', { class: 'btn primary block', onclick: () => ctx.go('/nouvelle-lecon') }, icon('plus'), 'Nouvelle leçon')));
  };

  Views.lessonForm = function (ctx, id) {
    const editing = id ? Store.lessons.get(id) : null;
    if (id && !editing) return U.notFound(ctx);
    const l = editing || { livre: Store.getSetting('lastBook', 'hsk5'), numero: '', titre: '' };
    const sel = h('select', { class: 'inp' }, Core.BOOKS.map(b => h('option', { value: b.id, selected: b.id === l.livre }, b.label)));
    const num = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', value: l.numero, placeholder: '09', autocomplete: 'off', maxlength: '6' });
    const titre = h('input', { class: 'inp zh', type: 'text', lang: 'zh-Hans', value: l.titre, placeholder: '别样鲁迅', autocomplete: 'off', autocapitalize: 'none' });
    const back = () => ctx.go(editing ? '/lecon/' + editing.id : '/lecons');
    const save = async () => {
      if (!titre.value.trim()) { UI.toast('Donne un titre à la leçon.', 'warn'); titre.focus(); return; }
      if (editing) {
        await Store.putLesson(Object.assign({}, editing, { livre: sel.value, numero: num.value.trim(), titre: titre.value.trim() }));
        ctx.go('/lecon/' + editing.id);
      } else {
        const lesson = Core.makeLesson({ livre: sel.value, numero: num.value, titre: titre.value });
        await Store.putLesson(lesson);
        await Store.setSetting('currentLessonId', lesson.id);
        await Store.setSetting('lastBook', sel.value);
        ctx.go('/lecon/' + lesson.id + '/ajout');
      }
    };
    ctx.root.append(
      UI.pageHead({ title: editing ? 'Modifier la leçon' : 'Nouvelle leçon', back: back }),
      h('div', { class: 'form' },
        UI.field('Livre', sel), UI.field('Numéro', num, 'Leçon ou unité (09, par exemple).'), UI.field('Titre', titre),
        h('button', { class: 'btn primary block', onclick: save }, editing ? 'Enregistrer' : 'Créer et ajouter des mots')));
    titre.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) save(); });
  };

  function lessonMenu(ctx, lesson) {
    let sheet;
    const cur = U.currentLesson();
    sheet = UI.sheet('Options de la leçon', h('div', { class: 'stack' },
      h('button', { class: 'btn block', onclick: () => { sheet.close(); ctx.go('/lecon/' + lesson.id + '/modifier'); } }, 'Modifier le titre, le livre, le numéro'),
      cur && cur.id === lesson.id ? null : h('button', { class: 'btn block', onclick: async () => { await Store.setSetting('currentLessonId', lesson.id); sheet.close(); UI.toast('Leçon en cours mise à jour'); ctx.refresh(); } }, 'Définir comme leçon en cours'),
      h('button', { class: 'btn block', onclick: async () => {
        if (!(await UI.confirm('Remettre toute la leçon à zéro ?', { detail: 'Triage, découverte, dictée et mots rouges de cette leçon sont effacés. Les fiches de mots sont gardées.', ok: 'Remettre à zéro' }))) return;
        Store.putWords(Store.wordsOf(lesson.id).map(Core.resetProgress)); sheet.close(); UI.toast('Progression remise à zéro'); ctx.refresh();
      } }, 'Remettre la progression à zéro'),
      h('button', { class: 'btn block danger', onclick: async () => {
        if (!(await UI.confirm('Supprimer cette leçon et ses mots ?', { detail: 'Cette action est définitive. Pense à exporter une sauvegarde.', ok: 'Supprimer', danger: true }))) return;
        await Store.deleteLesson(lesson.id); sheet.close(); ctx.go('/lecons');
      } }, 'Supprimer la leçon')));
  }

  Views.lesson = function (ctx, id) {
    const lesson = Store.lessons.get(id);
    if (!lesson) return U.notFound(ctx);
    const words = Store.wordsOf(id), st = Core.lessonStats(words), next = Core.nextStep(st);
    const cur = U.currentLesson();

    ctx.root.append(UI.pageHead({
      title: U.nameEl(lesson), sub: U.bookOf(lesson).label + (cur && cur.id === id ? ' (en cours)' : ''),
      back: () => ctx.go('/lecons'),
      actions: h('button', { class: 'icon-btn', 'aria-label': 'Options de la leçon', onclick: () => lessonMenu(ctx, lesson) }, icon('more'))
    }));

    if (next.key !== 'done') {
      ctx.root.append(h('button', { class: 'btn primary block', onclick: () => ctx.go(U.stepPath(id, next.key)) }, 'Continuer : ' + U.stepLabel(next)));
    }

    // Les trois étapes du cycle
    const step = (n, title, text, key, enabled, path) => h('button', {
      class: 'row' + (next.key === key ? ' next' : '') + (enabled ? '' : ' off'), disabled: !enabled, onclick: () => ctx.go(path)
    }, h('span', { class: 'num' }, String(n)),
      h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub' }, text)),
      h('span', { class: 'row-end' }, icon('chevR')));

    const triText = !st.total ? 'Ajoute d’abord des mots.' : st.triaged === st.total ? 'Terminé : ' + plural(st.unknown, 'mot inconnu', 'mots inconnus') + '.' : plural(st.total - st.triaged, 'mot à trier', 'mots à trier') + '.';
    const disText = st.triaged < st.total || !st.total ? 'Après le triage.' : !st.unknown ? 'Aucun mot inconnu.' : !st.toDiscover ? 'Terminée.' : plural(st.toDiscover, 'mot à découvrir', 'mots à découvrir') + '.';
    const dicText = st.toDictate ? plural(st.toDictate, 'mot prêt', 'mots prêts') + ', ' + st.dictated + ' déjà dicté' + (st.dictated > 1 ? 's' : '') + '.' : st.total && st.dictated === st.total ? 'Tous les mots sont dictés.' : st.noPrompt ? plural(st.noPrompt, 'fiche sans définition ni sens', 'fiches sans définition ni sens') + '.' : 'Aucun mot prêt pour l’instant.';
    ctx.root.append(h('div', { class: 'rows', style: { marginTop: '10px' } },
      step(1, 'Triage par le sens', triText, 'triage', st.total > 0, '/lecon/' + id + '/triage'),
      step(2, 'Découverte guidée', disText, 'discover', st.total > 0 && st.triaged === st.total && st.unknown > 0 && st.toDiscover > 0, '/lecon/' + id + '/decouverte'),
      step(3, 'Dictée par le sens', dicText, 'dictate', st.toDictate > 0, '/lecon/' + id + '/dictee'),
      st.red ? h('button', { class: 'row', onclick: () => ctx.go('/rouges') },
        h('span', { class: 'seal', 'aria-hidden': 'true' }, '红'),
        h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Mots rouges'), h('span', { class: 'row-sub' }, plural(st.red, 'mot en rouge', 'mots en rouge') + ' dans cette leçon.')),
        h('span', { class: 'row-end' }, icon('chevR'))) : null));

    // À l'oreille : le téléphone lit les mots et les phrases, dictées à l'écoute
    ctx.root.append(h('section', { class: 'block', style: { marginTop: '14px' } }, h('h2', null, 'À l’oreille'), h('div', { class: 'rows' }, U.listenRows(ctx, id))));

    // Atelier : règles d'emploi, combinaisons, paires du livre, phrases à écrire, fiche de la leçon
    ctx.root.append(h('section', { class: 'block', style: { marginTop: '14px' } }, h('h2', null, 'Atelier'),
      h('div', { class: 'rows' }, U.rubriqueRows(ctx, id, words), U.atelierRows(ctx, id, words), U.writingRows(ctx, id))));

    // Liste des mots (sans le sens : pas de réponse avant la tentative)
    const counts = {};
    Core.RUBRIQUES.forEach(r => { counts[r] = words.filter(w => w.rubrique === r).length; });
    let filter = '生词';
    const list = h('div', { class: 'rows' });
    const chips = h('div', { class: 'chips' });
    function draw() {
      UI.clear(list); UI.clear(chips);
      Core.RUBRIQUES.filter(r => counts[r] > 0 || r === '生词').forEach(r => chips.append(h('button', {
        class: 'chip', 'aria-pressed': String(r === filter), onclick: () => { filter = r; draw(); }
      }, h('span', { class: 'zh', lang: 'zh-Hans' }, Core.RUBRIQUE_SHORT[r]), ' ' + counts[r])));
      const shown = words.filter(w => w.rubrique === filter);
      if (!shown.length) list.append(h('p', { class: 'muted', style: { padding: '12px 0' } }, 'Aucun mot dans cette rubrique.'));
      shown.forEach(w => list.append(h('button', { class: 'row', style: { minHeight: '60px' }, onclick: () => U.openWordSheet(ctx, w) },
        h('span', { class: 'dot ' + (w.state === 'nouveau' ? '' : w.state), title: w.state }),
        h('div', { class: 'row-main' }, h('span', { class: 'row-title zh', lang: 'zh-Hans' }, w.hanzi), h('span', { class: 'row-sub' }, w.pinyin || ' ')),
        h('span', { class: 'row-end' }, !Core.hasPrompt(w) && filter === '生词' ? h('span', { class: 'tag red' }, 'fiche vide') : null, icon('chevR')))));
    }
    draw();

    ctx.root.append(
      h('section', { class: 'block', style: { marginTop: '18px' } }, h('h2', null, 'Mots de la leçon (' + words.length + ')'), chips, list),
      h('div', { class: 'stack-h' },
        h('button', { class: 'btn block', onclick: () => ctx.go('/lecon/' + id + '/ajout') }, icon('plus'), 'Ajouter'),
        h('button', { class: 'btn block', onclick: () => ctx.go('/lecon/' + id + '/import') }, 'Coller une liste')));
  };

  /* ------------------------------------------------------------------ */
  /* Saisie rapide et import en bloc                                     */
  /* ------------------------------------------------------------------ */
  const nextOrder = list => list.reduce((m, w) => Math.max(m, w.order || 0), 0) + 1;

  Views.add = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const recent = h('div', { class: 'recent' });
    const form = U.wordForm({ rubrique: Store.getSetting('lastRubrique', '生词') }, { onSubmit: submit });

    function redrawRecent() {
      UI.clear(recent);
      const all = Store.wordsOf(lessonId);
      const last = all.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
      recent.append(h('h2', { style: { padding: '18px 0 4px' } }, plural(all.length, 'mot dans la leçon', 'mots dans la leçon')));
      last.forEach(w => recent.append(h('button', { class: 'row', onclick: () => U.openWordSheet(ctx, w, redrawRecent) },
        h('div', { class: 'row-main' }, h('span', { class: 'row-title zh', lang: 'zh-Hans' }, w.hanzi), h('span', { class: 'row-sub' }, w.pinyin || ' ')),
        h('span', { class: 'row-end' }, icon('chevR')))));
    }

    function submit() {
      const d = form.read();
      if (!d.hanzi || !Core.hasCJK(d.hanzi)) { UI.toast('Écris les caractères du mot.', 'warn'); form.focus('hanzi'); return; }
      const existing = Store.wordsOf(lessonId);
      if (Core.isDuplicate(existing, d)) { UI.toast('Déjà dans cette leçon.', 'warn'); form.focus('hanzi'); return; }
      Store.putWord(Core.makeWord(lessonId, d, nextOrder(existing)));
      Store.setSetting('lastRubrique', d.rubrique);
      UI.toast('Ajouté : ' + d.hanzi);
      form.clear(); form.focus('hanzi'); redrawRecent();
    }

    ctx.root.append(
      UI.pageHead({ title: 'Ajouter des mots', sub: U.lessonName(lesson), back: () => ctx.go('/lecon/' + lessonId) }),
      form.el,
      h('div', { class: 'stack', style: { marginTop: '16px' } },
        h('button', { class: 'btn primary block', onclick: submit }, icon('plus'), 'Ajouter et passer au suivant'),
        h('button', { class: 'btn block', onclick: () => ctx.go('/lecon/' + lessonId + '/import') }, 'Coller une liste de mots'),
        h('button', { class: 'btn block ghost', onclick: () => ctx.go('/lecon/' + lessonId) }, 'Terminer')),
      recent);
    redrawRecent();
    setTimeout(() => form.focus('hanzi'), 80);
  };

  Views.importWords = function (ctx, lessonId) {
    const lesson = Store.lessons.get(lessonId);
    if (!lesson) return U.notFound(ctx);
    const ta = h('textarea', { class: 'inp zh', lang: 'zh-Hans', rows: '9', placeholder: '螺丝 ; luo2si1 ; vis ; 定义 ; 例句', spellcheck: 'false', autocapitalize: 'none', autocomplete: 'off', 'aria-label': 'Liste de mots' });
    const preview = h('div', { class: 'stack' });
    const btn = h('button', { class: 'btn primary block', disabled: true }, 'Importer');
    let fresh = [], timer = null;

    function update() {
      const p = Core.parseBulk(ta.value, Store.getSetting('lastRubrique', '生词'));
      const d = Core.dedupe(Store.wordsOf(lessonId), p.rows);
      fresh = d.fresh;
      UI.clear(preview);
      if (ta.value.trim()) {
        preview.append(h('p', { class: 'lead' }, h('strong', null, String(fresh.length)), fresh.length > 1 ? ' mots prêts à importer' : ' mot prêt à importer'));
        if (d.dups.length) preview.append(h('p', { class: 'muted' }, plural(d.dups.length, 'doublon ignoré', 'doublons ignorés') + ' (déjà dans la leçon ou répété).'));
        if (p.errors.length) preview.append(h('div', { class: 'err-list' }, p.errors.slice(0, 6).map(e => h('p', null, 'Ligne ' + e.line + ' ignorée : ' + e.reason + '.')), p.errors.length > 6 ? h('p', null, '… et ' + (p.errors.length - 6) + ' autres.') : null));
      }
      btn.disabled = !fresh.length;
      btn.textContent = fresh.length ? 'Importer ' + plural(fresh.length, 'mot', 'mots') : 'Importer';
    }
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 180); });
    ctx.onLeave(() => clearTimeout(timer));

    btn.addEventListener('click', async () => {
      if (!fresh.length) return;
      let order = nextOrder(Store.wordsOf(lessonId));
      const made = fresh.map(r => Core.makeWord(lessonId, r, order++));
      await Store.putWords(made);
      UI.toast(plural(made.length, 'mot ajouté', 'mots ajoutés'));
      ctx.go('/lecon/' + lessonId);
    });

    ctx.root.append(
      UI.pageHead({ title: 'Coller une liste', sub: U.lessonName(lesson), back: () => ctx.go('/lecon/' + lessonId) }),
      h('div', { class: 'form' },
        h('p', null, 'Un mot par ligne, colonnes séparées par un point-virgule, une barre | ou une tabulation.'),
        h('details', null, h('summary', null, 'Voir le format'),
          h('div', { class: 'stack', style: { paddingTop: '8px' } },
            h('p', { class: 'mono-note' }, 'Colonnes : caractères ; pinyin ; sens en français ; définition chinoise ; phrase d’exemple. Seul le premier champ est obligatoire, les autres peuvent rester vides. Une ligne « # 生词 » (ou 例释, 搭配, 辨析) change de rubrique. Le pinyin peut être écrit avec des chiffres.'),
            h('p', { class: 'mono-note' }, 'Une ligne qui commence par + complète le mot au-dessus : un exemple (生词, 例释), une combinaison (搭配), ou une phrase à trou pour une paire 辨析, avec la réponse après = . Une paire s’écrit « A / B » dans la première colonne ; le pinyin et le sens peuvent aussi être « A / B ».'),
            h('pre', { class: 'format-ex' }, '# 生词\n螺丝 ; luo2si1 ; vis ; 定义 ; 例句\n水泥 ; shui3ni2 ; ciment\n钢筋\n\n# 词语例释\n订货\n+ 向厂家订货\n+ 提前订货\n\n# 词语搭配\n提高\n+ 提高质量\n+ 提高水平\n\n# 词语辨析\n完整 / 完成 ; wan2zheng3 / wan2cheng2 ; complet / achever\n+ 这份报告很___。 = 完整\n+ 工作已经___了。 = 完成'))),
        ta, preview, btn));
    setTimeout(() => ta.focus(), 80);
  };

  /* ------------------------------------------------------------------ */
  /* Mots rouges                                                         */
  /* ------------------------------------------------------------------ */
  function redSheet(ctx, w) {
    const inp = h('input', { class: 'inp zh', lang: 'zh-Hans', type: 'text', value: w.red.composant || '', placeholder: 'ex. le radical de gauche', autocomplete: 'off', autocapitalize: 'none', enterkeyhint: 'done' });
    let sheet;
    const save = () => {
      const cur = Store.words.get(w.id) || w;
      Store.putWord(Object.assign({}, cur, { red: Object.assign({}, cur.red, { composant: inp.value.trim() }), updatedAt: Date.now() }));
      sheet.close(); ctx.refresh(); UI.toast('Composant noté');
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) save(); });
    const hist = (w.red.history || []).slice().reverse();
    sheet = UI.sheet('Mot rouge', h('div', { class: 'form' },
      h('div', { class: 'cells' }, Array.from(w.hanzi).map(c => h('span', { class: 'cell zh', lang: 'zh-Hans' }, c))),
      h('p', { class: 'answer-py' }, w.pinyin), w.fr ? h('p', { class: 'answer-fr' }, w.fr) : null,
      UI.field('Composant raté', inp, 'Note ce qui te fait échouer : un radical, un trait, un composant.'),
      h('button', { class: 'btn primary block', onclick: save }, 'Enregistrer'),
      hist.length ? h('div', null, h('h2', { style: { marginBottom: '6px' } }, 'Historique'), hist.map(x => h('p', { class: 'muted small' },
        Core.formatFr(x.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' : ' + (x.ok ? 'juste' : 'faux' + (x.composant ? ' (' + x.composant + ')' : ''))))) : null,
      h('button', { class: 'btn block', onclick: () => { sheet.close(); U.openWordSheet(ctx, w); } }, 'Modifier la fiche')));
    setTimeout(() => inp.focus(), 120);
  }

  Views.red = function (ctx) {
    const t = today(), words = Store.allWords();
    const reds = words.filter(w => w.state === 'rouge' && w.red && w.red.due)
      .sort((a, b) => (a.red.due < b.red.due ? -1 : a.red.due > b.red.due ? 1 : (a.order || 0) - (b.order || 0)));
    const due = Core.dueRed(words, t).filter(Core.hasPrompt);
    const sorti = words.filter(w => w.state === 'sorti');

    ctx.root.append(UI.pageHead({ title: 'Mots rouges', sub: 'Redictée aux jours 1, 3 et 7. Trois réussites de suite : le mot sort de la liste.' }));

    if (!reds.length) {
      ctx.root.append(UI.empty('Aucun mot rouge', 'Les mots ratés à la dictée arrivent ici avec leur calendrier de redictée.'));
    } else {
      const dueAll = Core.dueRed(words, t);
      ctx.root.append(due.length
        ? h('button', { class: 'btn primary block', onclick: () => ctx.go('/redictee') }, 'Redicter ' + plural(due.length, 'mot', 'mots') + ' maintenant')
        : h('p', { class: 'lead' }, 'Rien à redicter aujourd’hui.'),
        dueAll.length && Speech.supported()
          ? h('button', { class: 'btn block', style: { marginTop: '10px' }, onclick: () => ctx.go('/redictee-ecoute') }, icon('headphones'), 'Redicter à l’écoute (' + plural(dueAll.length, 'mot', 'mots') + ')')
          : null);

      const groups = new Map();
      reds.forEach(w => { const k = w.red.due <= t ? t : w.red.due; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); });
      Array.from(groups.keys()).sort().forEach(date => {
        const list = groups.get(date);
        const title = date === t ? 'À redicter aujourd’hui' : Core.relLabel(date, t) + ', ' + Core.formatFr(date, { weekday: 'short', day: 'numeric', month: 'short' });
        ctx.root.append(h('section', { class: 'red-day' },
          h('h2', null, title, h('span', { class: 'n' }, String(list.length))),
          list.map(w => {
            const streak = w.red.streak || 0, late = w.red.due < t ? diffLate(w.red.due, t) : '';
            return h('button', { class: 'red-row', onclick: () => redSheet(ctx, w) },
              h('div', { class: 'red-hanzi zh', lang: 'zh-Hans' }, w.hanzi),
              h('div', { class: 'red-info' },
                h('span', { class: 'py' }, w.pinyin || ' '),
                h('span', { class: 'red-comp' + (w.red.composant ? '' : ' none') }, w.red.composant ? 'Raté : ' + w.red.composant : 'Composant raté non noté'),
                h('div', { class: 'pips' },
                  Core.RED_DAYS.map((d, k) => h('span', { class: 'pip' + (k < streak ? ' done' : k === streak ? ' next' : '') }, 'J' + d)),
                  late ? h('span', { class: 'pip next' }, late) : null)));
          })));
      });
    }
    if (sorti.length) {
      ctx.root.append(h('details', { style: { marginTop: '22px' } },
        h('summary', null, plural(sorti.length, 'mot sorti', 'mots sortis') + ' de la liste rouge'),
        h('div', { class: 'chips', style: { paddingTop: '8px' } }, sorti.map(w => h('span', { class: 'tag zh', lang: 'zh-Hans', style: { fontSize: '1rem' } }, w.hanzi)))));
    }
  };
  const diffLate = (due, t) => 'retard ' + Core.diffDays(due, t) + ' j';

  /* ------------------------------------------------------------------ */
  /* Réglages                                                            */
  /* ------------------------------------------------------------------ */
  function downloadBackup() {
    const data = JSON.stringify(Store.exportAll());
    try {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'atelier-chinois-' + Core.isoLocal(new Date()) + '.json' });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      UI.toast('Sauvegarde téléchargée');
    } catch (e) { UI.toast('Téléchargement impossible ici : utilise « Copier ».', 'warn'); }
  }

  async function copyBackup() {
    try { await navigator.clipboard.writeText(JSON.stringify(Store.exportAll())); UI.toast('Sauvegarde copiée'); }
    catch (e) { UI.toast('Copie impossible ici : utilise le téléchargement.', 'warn'); }
  }

  async function restoreFrom(ctx, text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { UI.toast('Ce texte n’est pas une sauvegarde valide.', 'warn'); return false; }
    const v = Core.validateBackup(obj);
    if (!v.ok) { UI.toast(v.error, 'warn'); return false; }
    const ok = await UI.confirm('Remplacer toutes tes données ?', {
      detail: 'La sauvegarde contient ' + plural(v.counts.lessons, 'leçon', 'leçons') + ' et ' + plural(v.counts.words, 'mot', 'mots') + '. Les données actuelles seront effacées.', ok: 'Remplacer', danger: true });
    if (!ok) return false;
    await Store.importAll(obj);
    root.App.applyTheme();
    UI.toast('Sauvegarde restaurée');
    ctx.go('/');
    return true;
  }

  Views.settings = function (ctx) {
    const set = (k, v) => Store.setSetting(k, v);
    const fileInp = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files && fileInp.files[0]; if (!f) return;
      try { await restoreFrom(ctx, await f.text()); } catch (e) { UI.toast('Lecture du fichier impossible.', 'warn'); }
      fileInp.value = '';
    });

    const offset = Store.getSetting('dayOffset', 0);
    const simText = h('p', { class: 'muted' }, 'Aujourd’hui pour l’appli : ' + Core.formatFr(today()) + (offset ? ' (' + (offset > 0 ? '+' : '') + offset + ' j)' : '') + '.');
    const shift = n => async () => { await set('dayOffset', n === 0 ? 0 : Store.getSetting('dayOffset', 0) + n); ctx.refresh(); };

    const newLimit = h('input', { class: 'inp', type: 'number', inputmode: 'numeric', min: '1', max: '500', value: String(Store.getSetting('newLimit')) });
    newLimit.addEventListener('change', () => {
      const v = Math.max(1, Math.min(500, parseInt(newLimit.value, 10) || 50)); newLimit.value = String(v); set('newLimit', v);
    });

    const storageText = { idb: 'IndexedDB : données gardées sur cet appareil.', local: 'localStorage (mode de secours) : données gardées sur cet appareil.', memory: 'Mémoire seulement : rien n’est gardé. Exporte avant de fermer.' }[Store.kind];

    ctx.root.append(
      UI.pageHead({ title: 'Réglages' }),

      h('section', { class: 'settings-group' }, h('h2', null, 'Apparence'),
        UI.seg([{ value: 'auto', label: 'Auto' }, { value: 'clair', label: 'Clair' }, { value: 'sombre', label: 'Sombre' }], Store.getSetting('theme'), v => { set('theme', v); root.App.applyTheme(); })),

      h('section', { class: 'settings-group' }, h('h2', null, 'Écriture'),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Dictée par défaut'),
          UI.seg([{ value: 'ecran', label: 'Sur l’écran' }, { value: 'papier', label: 'Sur papier' }], Store.getSetting('writeMode'), v => set('writeMode', v))),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Canevas'),
          UI.seg([{ value: false, label: 'Stylet et doigt' }, { value: true, label: 'Stylet seulement' }], Store.getSetting('penOnly'), v => set('penOnly', v)),
          h('p', { class: 'hint' }, '« Stylet seulement » ignore la paume de la main pendant que tu écris.'))),

      h('section', { class: 'settings-group' }, h('h2', null, 'Apprentissage'),
        UI.field('Plafond de nouveaux mots par jour', newLimit, 'Anki : 50 nouvelles cartes au maximum. L’accueil t’alerte au-delà.'),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Mots par groupe de découverte'),
          UI.seg([5, 6, 7, 8].map(n => ({ value: n, label: String(n) })), Store.getSetting('groupSize'), v => set('groupSize', v))),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Mots par dictée'),
          UI.seg([5, 7, 10].map(n => ({ value: n, label: String(n) })), Store.getSetting('dictSize'), v => set('dictSize', v))),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Pinyin pendant le triage'),
          UI.seg([{ value: true, label: 'Affiché' }, { value: false, label: 'Caché' }], Store.getSetting('triagePinyin'), v => { set('triagePinyin', v); root.App.applyTheme(); }))),

      ...U.voiceSettings(ctx),

      ...U.strokeSettings(ctx),

      h('section', { class: 'settings-group' }, h('h2', null, 'Sauvegarde'),
        h('p', { class: 'mono-note' }, storageText + (Store.persisted ? ' Stockage protégé par le navigateur.' : '')),
        h('div', { class: 'stack' },
          h('button', { class: 'btn block', onclick: downloadBackup }, 'Exporter un fichier JSON'),
          h('button', { class: 'btn block', onclick: copyBackup }, 'Copier la sauvegarde'),
          h('button', { class: 'btn block', onclick: () => fileInp.click() }, 'Importer un fichier JSON'),
          h('button', { class: 'btn block', onclick: () => {
            const ta = h('textarea', { class: 'inp', rows: '6', placeholder: 'Colle ici la sauvegarde copiée', spellcheck: 'false', autocapitalize: 'none' });
            const sh = UI.sheet('Importer en collant', h('div', { class: 'form' }, ta, h('button', { class: 'btn primary block', onclick: async () => { if (await restoreFrom(ctx, ta.value)) sh.close(); } }, 'Restaurer')));
          } }, 'Importer en collant le texte')),
        fileInp),

      h('section', { class: 'settings-group' }, h('h2', null, 'Outils de test'),
        simText,
        h('div', { class: 'stack-h' },
          h('button', { class: 'btn block', onclick: shift(1) }, '+1 jour'),
          h('button', { class: 'btn block', onclick: shift(2) }, '+2 jours'),
          h('button', { class: 'btn block', onclick: shift(0) }, 'Remettre à 0')),
        h('p', { class: 'hint' }, 'Avance la date pour vérifier que les mots rouges reviennent aux jours 1, 3 et 7, sans attendre. Remets 0 ensuite.'),
        h('button', { class: 'btn block', onclick: () => U.loadDemo(ctx) }, 'Ajouter la leçon de démonstration (8 mots)')),

      h('section', { class: 'settings-group' }, h('h2', null, 'Zone sensible'),
        h('button', { class: 'btn block danger', onclick: async () => {
          if (!(await UI.confirm('Effacer toutes les données ?', { detail: 'Leçons, mots, progression et réglages sont supprimés de cet appareil. Exporte une sauvegarde avant si tu hésites.', ok: 'Tout effacer', danger: true }))) return;
          await Store.wipe(); root.App.applyTheme(); UI.toast('Données effacées'); ctx.go('/');
        } }, 'Tout effacer')),

      h('p', { class: 'mono-note', style: { paddingTop: '8px' } }, 'Atelier de chinois, étape 1. Aucune donnée ne quitte cet appareil.'));
  };
})(typeof self !== 'undefined' ? self : this);
