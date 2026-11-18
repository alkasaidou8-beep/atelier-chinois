# Atelier de chinois — étape 2B (caractères : ordre des traits, composition, écrire de mémoire)

Application web statique : elle marche hors ligne, sans compte, sans serveur. Tes données restent dans le navigateur de ton téléphone. Rien n'est envoyé nulle part. Une seule exception, que tu déclenches toi-même : le téléchargement des tracés des caractères (voir « Caractères et ordre des traits »).

## Contenu du dossier

Tous les fichiers sont à la racine, sans sous-dossier :

- `index.html`, `style.css` : la page et son apparence
- `core.js` : la logique (calendrier J1/J3/J7, pinyin, import, règles du livre, erreurs, fiche de leçon)
- `store.js` : le stockage (IndexedDB, avec solutions de secours)
- `audio.js` : la voix (lecture à voix haute avec la synthèse vocale du téléphone)
- `ui.js`, `screens.js`, `session.js`, `app.js` : les écrans
- `listen.js` : l'onglet Écouter, le lecteur de leçon, les dictées à l'écoute, le test de la voix
- `rubriques.js` : les trois parcours du livre (règles d'emploi, combinaisons, paires)
- `atelier.js` : l'atelier de phrases, « Mes erreurs » et la fiche de leçon
- `strokes.js` : les tracés (téléchargement unique, stockage sur le téléphone, reconnaissance des traits)
- `ecriture.js` : la fiche d'un caractère, l'ordre des traits, « Écrire de mémoire »
- `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` : l'installation et le hors ligne

## Héberger gratuitement avec GitHub Pages

1. Crée un compte sur github.com (gratuit), puis un nouveau dépôt **public** nommé `atelier-chinois`.
2. Dans « Mes fichiers » (Samsung), décompresse le zip : tu obtiens un dossier avec les 19 fichiers.
3. Dans le dépôt GitHub, ouvre « Add file » puis « Upload files ». Si ce bouton n'apparaît pas, passe Chrome en « Version pour ordinateur » (menu ⋮). Sélectionne les fichiers (pas le dossier), puis « Commit changes ».
4. Va dans Settings, puis Pages. Source : « Deploy from a branch », branche `main`, dossier `/ (root)`, puis Save.
5. Après une minute environ, l'adresse `https://TON-PSEUDO.github.io/atelier-chinois/` s'affiche. Ouvre-la dans Chrome.
6. Menu ⋮ de Chrome, puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).
7. Ouvre l'application une première fois avec du réseau. Ensuite elle marche en mode avion.

## Mettre à jour (depuis l'étape 2A)

Envoie les 19 fichiers dans le dépôt (« Upload files » écrase les anciens et ajoute `strokes.js` et `ecriture.js`). Au lancement suivant, l'application affiche « Nouvelle version installée » : ferme-la et rouvre-la. Tes données ne sont pas touchées. Pour les mises à jour suivantes, change aussi `VERSION` au début de `sw.js` (par exemple `etape2b-v2`).

## Les trois parcours du livre (page d'une leçon, section Atelier)

Chaque ligne n'apparaît que si la leçon contient des fiches de cette rubrique. Rien du livre n'est montré avant que tu aies écrit ta version. L'application ne juge pas ton chinois : c'est toi qui compares avec le livre et qui choisis **Juste**, **Incomplète** ou **À revoir**. Une fiche « À revoir » revient en premier la fois suivante.

- **Règles d'emploi (词语例释)** : l'application montre deux exemples. Tu écris la règle avec tes mots (au moins une phrase), puis une phrase à toi avec le mot. Ensuite seulement tu vois l'explication du livre. Un « Indice » donne d'abord une piste générale, puis un troisième exemple s'il existe.
- **Combinaisons (词语搭配)** : tu proposes tes combinaisons (au moins deux) avant de voir celles du livre. Ensuite : ✓ pour celles que tu avais, « à retenir » pour les autres, et « hors livre » pour tes propositions qui n'y sont pas (à vérifier avec ton livre ou ton prof, elles peuvent être justes).
- **Paires à distinguer (词语辨析)** : tu expliques la différence (au moins une phrase), puis tu fais les phrases à trou en choisissant un des deux mots. Si la réponse est dans la fiche, l'application te dit juste ou faux ; sinon tu vérifies dans ton livre. À la fin, tu compares avec l'explication du livre. Les erreurs de trous peuvent aller dans « Mes erreurs » (case cochée par défaut).

## Atelier : écrire, se faire corriger, repérer ses erreurs

Onglet **Atelier** (ou la page d'une leçon).

- **Écrire une phrase** : un mot de la leçon s'affiche, tu écris ta phrase. Le sens est caché derrière « Rappel du sens ». Si ta phrase ne contient pas le mot, l'application te prévient une fois. Objectif de fin de leçon : **3 à 5 phrases** qui réunissent **au moins 5 mots** de la leçon (la barre de progression suit les deux).
- **Mes phrases** : la liste de tes phrases. Touche une phrase pour noter la correction reçue, la modifier ou la supprimer. « Copier pour Claude » met toutes tes phrases dans le presse-papiers, avec une consigne : indiquer où sont les erreurs et pourquoi, sans réécrire ta phrase à ta place. Les phrases déjà copiées sont marquées « copiée ».
- **Mes erreurs** : quand ton prof, un ami ou Claude corrige une phrase, tu notes ta version, la version corrigée, le type d'erreur et l'explication reçue. Les types de départ sont `-n/-ng`, `的/得/地`, `买/卖`, `完整/完成` ; tu peux en ajouter d'autres. Un type qui revient **deux fois** devient « récurrent » (rouge) et l'appli te le signale.
- **Fiche de la leçon** : une page avec tes phrases, tes règles, tes différences de paires, les combinaisons à retenir et tes erreurs. Boutons « Copier le texte » et « Imprimer » (Imprimer permet aussi d'enregistrer en PDF).

## Caractères et ordre des traits (page d'une leçon, section Atelier)

Deux lignes apparaissent dès que la leçon contient des mots : **Caractères et tracés** (les caractères de tous les mots de la leçon) et **Écrire de mémoire** (seulement les mots 生词, une fois leurs tracés téléchargés).

- **Télécharger les tracés (une seule fois).** Sur l'écran « Caractères », le bouton demande ton accord et dit ce qui part : l'application demande chaque caractère, un par un, à un serveur public (jsDelivr, avec deux miroirs de secours : unpkg et npmmirror). Rien d'autre n'est envoyé : ni tes mots, ni tes phrases, ni cookies. Ensuite les tracés restent sur ton téléphone et marchent hors ligne. Si le téléchargement échoue, la fenêtre indique pour chaque serveur ce qui s'est passé (réseau coupé, accès refusé…) et propose « Réessayer ». Dans Réglages, « Tracés des caractères » permet de télécharger ceux de toutes tes leçons ou de les supprimer (tes fiches et tes résultats restent).
- **Fiche d'un caractère** (touche un caractère de la liste) : trois modes.
  - **Regarder** : l'ordre des traits s'anime. « Lent » ralentit, « Numéros » montre le numéro de chaque trait.
  - **Tracer** : le caractère apparaît en filigrane et tu le traces avec le doigt ou le S Pen, trait par trait, dans l'ordre. Un trait juste reste en encre. Un trait faux est refusé avec un message simple (trop court, dans l'autre sens, pas le bon trait à ce moment) et tu recommences ce trait. Après deux erreurs sur le même trait, un bouton « Voir ce trait » apparaît : rien n'est montré tant que tu ne le demandes pas.
  - **De mémoire** : même chose, sans le filigrane.
- **Composition** : tu notes toi-même le composant qui donne le **sens**, celui qui donne le **son**, ou un autre composant, avec un caractère que tu connais qui le contient. L'application ne devine rien. Le bouton « Radical » ne se débloque qu'après ton premier composant noté. « Dans mes autres fiches » ne montre que les caractères dont **tu** as noté le même composant.
- **Dans mes mots / Dans mes phrases** : les mots et les phrases de ta saisie qui contiennent ce caractère.
- **Écrire de mémoire** : séances de 5 mots de la leçon, les moins écrits d'abord. L'application te donne le pinyin et le sens (jamais le mot en caractères) ; tu écris chaque caractère de mémoire. Le bouton « Pinyin » cache le pinyin si tu veux t'entraîner à l'écoute. Un mot sans pinyin, sans sens ni définition n'est pas proposé (rien n'est inventé pour combler). À la fin, le bilan dit pour chaque mot « sans erreur » ou le nombre d'erreurs. L'application garde, par mot, combien de fois tu l'as écrit et combien de fois sans erreur ni indice ; cela ne change pas la liste des mots rouges.
- Limite : la reconnaissance compare ton trait à la forme et au sens du trait attendu avec une marge de tolérance. Elle ne remplace pas ton prof : un trait accepté n'est pas forcément parfait, un trait refusé peut parfois être juste. Si elle te paraît trop sévère ou trop souple, dis-le : la tolérance se règle en une ligne.
- Données : les tracés viennent du projet libre Hanzi Writer (`hanzi-writer-data`), dérivé de Make Me a Hanzi et des polices Arphic. Ces données ont leur propre licence (Arphic Public License), distincte de celle du code de Hanzi Writer.

## Écouter : la voix du téléphone

L'application ne contient aucun fichier son : elle utilise la voix de synthèse installée sur ton téléphone. Elle marche donc hors ligne, mais seulement si une **voix chinoise** est installée.

- Onglet **Écouter**, puis « Tester la voix » : tu entends une phrase d'essai et tu réponds si tu as entendu du chinois. Le résultat est gardé.
- Pas de son ? Sur Samsung : Paramètres, cherche « synthèse vocale », choisis le moteur Google (ou Samsung), touche l'engrenage, « Installer les données vocales », puis le chinois (mandarin). Vérifie aussi le volume « Média ». Les noms des menus varient un peu selon la version d'Android.
- **Lecteur de leçon** (Écouter, ou la page d'une leçon) : le mot s'affiche en grand avec son pinyin, la voix lit le mot puis ses phrases. Vitesse Lent, Moyen ou Normal, répétitions, pause entre les mots, ordre mélangé, texte caché jusqu'au toucher : tout se règle avec le bouton réglages en haut. Touche un mot ou une phrase pour l'entendre seul.
- **Dictée à l'écoute** : la voix lit, tu écris sur le canevas (ou sur papier). Bouton « Écouter » pour relire, « Lent » pour ralentir. « Révéler » reste bloqué tant que tu n'as rien écrit. Un mot raté passe en rouge, comme dans la dictée par le sens.
- **Dictée de phrases** : la voix lit l'une de tes phrases (l'exemple du mot ou une phrase écrite en découverte). Si tu te trompes, tu peux choisir le mot de ta liste que tu as raté : lui seul passe en rouge.
- **Redictée à l'écoute** : depuis Mots rouges, pour redicter les mots rouges du jour à l'oreille. Elle marche même si le mot n'a pas de définition.
- Limites : la qualité de la voix dépend de ton téléphone. Un mot lu seul peut être mal prononcé s'il a plusieurs lectures possibles (多音字). Garde l'écran allumé pendant la lecture continue : l'application demande au téléphone de ne pas s'éteindre, mais certains navigateurs coupent la voix en veille.

## Tes données

- Elles sont stockées sur cet appareil, pour cette adresse. Vider les données du site dans Chrome efface tout.
- Sauvegarde : Réglages, puis « Exporter un fichier JSON ». Fais-le chaque semaine, et avant de changer de téléphone ou de navigateur. Le fichier contient aussi tes phrases, tes règles, tes combinaisons, « Mes erreurs », tes composants notés et tes compteurs d'écriture. Il ne contient pas les tracés téléchargés : ils sont propres à chaque téléphone et se téléchargent de nouveau.
- Restauration : Réglages, puis « Importer un fichier JSON ». Cela remplace tout le contenu actuel (sauf le choix de la voix, propre à chaque téléphone).
- Le téléphone et l'ordinateur ne partagent pas leurs données : pour passer de l'un à l'autre, exporte puis importe.

## Saisie rapide d'une leçon

Dans une leçon, « Coller une liste de mots » accepte une ligne par mot : `caractères ; pinyin ; sens en français ; définition chinoise ; phrase d'exemple`. Seul le premier champ est obligatoire. Les tons s'écrivent en chiffres (`ding4huo4` devient `dìnghuò`). Une ligne `# 生词`, `# 词语例释`, `# 词语搭配` ou `# 词语辨析` change de rubrique.

Une ligne qui commence par `+` complète le mot de la ligne au-dessus :

- sous un mot **生词** ou **例释** : un exemple en plus ;
- sous un mot **搭配** : une combinaison du livre ;
- sous une paire **辨析** : une phrase à trou, avec `___` pour le trou et la réponse après `=`. Sans `=`, la phrase est acceptée et tu vérifies dans ton livre.

Une paire s'écrit `A / B` dans la première colonne (le pinyin et le sens peuvent aussi s'écrire `A / B`). Pour une paire, la colonne « définition chinoise » reçoit l'explication du livre sur la différence.

```
# 词语例释
订货
+ 向厂家订货
+ 提前订货

# 词语搭配
提高
+ 提高质量
+ 提高水平

# 词语辨析
完整 / 完成 ; wan2zheng3 / wan2cheng2 ; complet / achever
+ 这份报告很___。 = 完整
+ 工作已经___了。 = 完成
```

Une fiche incomplète n'est pas perdue : elle reste dans la leçon, mais le parcours l'ignore tant qu'il lui manque l'essentiel (au moins un exemple pour 例释, une paire `A / B` pour 辨析).

## Photos de cours

Tu peux envoyer des photos de ton livre à Claude dans la conversation. Il recopie ce qui est imprimé dans le format ci-dessus, laisse vide ce qui manque ou ce qu'il ne lit pas bien, et signale ses doutes. Tu colles ensuite le bloc dans « Coller une liste de mots ». Le texte reste ce que dit ton livre : rien n'est complété ni inventé.

## Règles de l'application

- Découverte : la définition n'apparaît qu'après deux essais différents de ta part.
- Dictée (par le sens ou à l'écoute) : « Révéler » reste bloqué tant que tu n'as rien écrit.
- Règles, combinaisons, paires : le livre ne s'affiche qu'après ta production.
- Écrire de mémoire : le mot en caractères n'apparaît qu'au fil de ce que tu écris ; la solution d'un trait n'est montrée que si tu la demandes, après deux erreurs sur ce trait.
- Lecteur : le sens d'un mot ne s'affiche qu'après son triage « connu » ou sa découverte guidée.
- Mot raté : il devient rouge et revient le lendemain. Réussi, il revient 2 jours plus tard, puis 4 jours plus tard (jours 1, 3 et 7 après l'erreur). Après trois réussites de suite, il sort de la liste rouge. Un nouvel échec remet le compteur à zéro.
- Plafond de 50 nouveaux mots par jour : l'accueil t'alerte au-delà.
- Un champ que tu n'as pas rempli reste vide. L'application n'invente jamais de contenu.

## Outils de test

Dans Réglages, « Outils de test » avance la date de 1 ou 2 jours pour voir revenir les mots rouges sans attendre, et ajoute une leçon de démonstration de 8 mots (écrite pour l'essai, tu peux la supprimer). Remets la date à 0 avant de travailler pour de vrai : un bandeau jaune te le rappelle tant qu'elle est décalée.
