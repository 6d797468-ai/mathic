# ROADMAP — MATHIC 4.0

> Développement en **sens inverse** : on commence par la phase la plus profonde et on remonte.
> Chaque phase est **verrouillée** (tests certifiés + build OK) avant de passer à la suivante.
> Le code et les messages sont en **français** (apostrophes typographiques, zéro apostrophe droite dans les chaînes JS).

---

## Phase 5 — « PWA & Finalisation Mobile » ✅ LIVRÉE
En faire une véritable application mobile autonome : installable sur l'écran
d'accueil, 100 % hors-ligne via service worker, expérience tactile sécurisée.

### À faire
- [x] Manifeste PWA complet (`public/manifest.json` : name, short_name, display standalone, orientation portrait, theme_color/background_color #12141c, icônes 192/512 any + maskable, `id`).
- [x] Métas head : `manifest` lié, `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-title`, status bar black-translucent.
- [x] Viewport sécurisé : `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
- [x] Icônes générées (`scripts/gen-icons.mjs`, sans dépendance) : `icon-192.png` / `icon-512.png`.
- [x] Service worker `public/sw.js` (v2) : app shell **cache-first** (navigation hors-ligne totale) + gros binaires (GGUF 88 Mo, wllama.wasm) mis en cache **progressivement par plages** (Range) — le modèle reste disponible hors-ligne une fois téléchargé, sinon fallback texte de Momo.
- [x] Installation native pilotée depuis `main.js` : `beforeinstallprompt` intercepté/stocké → bouton « 📲 Installer MATHIC » affiché dynamiquement → `.prompt()` au clic ; masqué après install/choix. (Logique déplacée hors du script inline.)
- [x] Build certifié : artefacts PWA régénérés dans `dist/` (manifest.json, sw.js, icônes, favicon).

### Livré
- `public/manifest.json` : manifeste PWA complet (standalone, portrait, couleurs du design, icônes `any` + `maskable`).
- `public/sw.js` (v2 — `mathic-v2`) : `addAll` de l'app shell (/, index.html, manifest.json, favicon, icônes) + `skipWaiting`/`claim` ; cache-first pour les assets ; **cache par plages** (Range 206) pour le GGUF et le wasm (stocks par `url::start-end`) — objectif : départ instantané en mode avion.
- `src/main.js` : cycle de vie d'installation complet (`beforeinstallprompt` → stockage → `prompt()` au clic → `appinstalled`), enregistrement du service worker en production.
- `index.html` : head PWA complet (theme-color, manifest, apple-touch-icon, apple-mobile-web-app-title, status bar) + viewport anti-zoom accidentel (`maximum-scale=1, user-scalable=no, viewport-fit=cover`).
- Tests : **54/54** (logique) · **19/19** (diff) · **32/32** (Calvados) · Playtest **50/50** · Build ✓ · artefacts PWA présents dans `dist/`.

---

## Phase 4 — « Mathic 4.0 » ✅ LIVRÉE
Édition plein-écran + différentiel de tuiles (historique « Calvados », v2.0 d’Archived Mind Archive).
L’objectif : ne jamais perdre une ligne d’historique en descendant dans le terrier.

### À faire
- [x] Différentiel de tuiles entre deux états (avant/après) — `diffBoards` (tuiles glissées, fusionnées, créées).
- [x] Édition plein-écran (grille agrandie, navigation fluide).
- [x] Historique « Calvados » complet + restauration.
- [x] Tests unitaires dédiés + playtest.
- [x] Build Vite régénéré.

### Livré
- `src/diff.js` : `diffBoards` pur et déterministe (unchanged / slides / merges / created / removed) + `diffSummary` + `validateDiff` (couverture + conservation). Indice `spawned` = spawns connus (exact) ; les explosions sont reconstructibles sans indice (unique retrait possible dans Mathic). Ambiguïté informationnelle deux-états documentée.
- `tests/diff.test.mjs` : **19 vérifications** unitaires + test de propriété (300 transitions réelles `slideBoard`, zéro incohérence, avec et sans indice).
- `src/history.js` : **Historique « Calvados »** — pile d'états immuables (capacité 50, LIFO). Chaque coup pousse UNE entrée : `before`/`after` (copies défensives), faits exacts du moteur (`moves`/`mergedCells`/`spawned`/`exploded`), et le diff vectoriel. `reversePlan` traduit l'entrée en plan graphique exact (dé-fusions, glissements remontés, spawns retirés) — jamais d'inférence ambiguë. `calvadosContext` livre au coach les faits chiffrés de l'Undo.
- `src/ui.js` : ids de tuiles DOM **stables** (`data-tile-id`) + `rewind(plan)` — le retour anime les MÊMES éléments (transition CSS `left/top` en sens inverse), dé-fait les fusions en retirant le survivant et en recréant les opérandes (pop), retire les spawns ; `sync` reste l'autorité finale.
- `src/main.js` : l'Undo (bouton ↶ + touche U) **dépile** la dernière entrée et restaure l'état COMPLET du snapshot (plateau, score, jauge « Coups restants », cible, chaîne, compteur) ; il dégrise aussi l'écran de fin (game over comme victoire). Entrées enregistrées en mode classique comme puzzle.
- `src/ai.js` : la réplique Undo de Momo est **contextualisée** (fusions dé-faites, glissements remontés, coups restants, cible).
- `tests/history.test.mjs` : **32 vérifications** : construction d'entrée (diff exact), `reversePlan` au pixel (dé-fusions / glissements / spawns), pile LIFO à capacité/éviction, contexte de narration + test de propriété (300 transitions réelles, zéro incohérence).
- **Édition plein-écran** : le plateau devient **fluide** — `--board-max` calculé sur la vue (`max(300px, min(92vw, calc(100svh − 200px), 680px))`) : portrait ≤ 460px comme avant, desktop/paysage la grille **s'agrandit** avec la hauteur au lieu d'un plafond fixe ; tuiles et points flottants proportionnels. **Mode immersif** (`body.fullscreen`) : bouton ⛶ + touche F, synchronisé sur le Fullscreen API natif (`fullscreenchange`, fallback CSS pur si l'API manque) — HUD compact flottant, coach/actions masqués, grille à `min(94vw, calc(100svh − 140px), 980px)`, sans scroll ni débordement vertical.

---

## Phase 3 — « Coup Parfait » ✅ LIVRÉE
Rétro-générateur de grilles **honnêtes** avec cible explicite + validation BFS.

### Livré
- `generatePuzzle({target, moves})` avec pool de cibles explicites (42, 48).
- Garantie d’honnêteté : jamais de grille qui ment sur la profondeur (fallback en profondeur réelle, certificat BFS toujours `=== moves`).
- Niveaux cycliques : Découverte (3 coups), 42 en 4, 48 en 5.
- Jauge « Coups restants » + **Undo** (bouton + touche U, bug clavier corrigé).
- Coach IA certifiant (intro, indice, insonvable → propose Undo, victoire).
- Tests : **54/54** · Playtest : **50/50** · Build ✓ · `dist/` régénéré.

---

## Phase 2 — « Coach Momo » ✅ LIVRÉE
IA locale on-device (wllama + GGUF) qui aide le joueur.

### Livré
- Coach IA « Momo » (Hype-Man) : intro, indice, félicitations, réactions.
- Fallback hors-ligne complet quand le modèle n’est pas chargé.
- Chargement du GGUF depuis `public/models/`.

---

## Phase 1 — « Mathic » ✅ LIVRÉE
Le socle : jeu de fusion 2048 étendu avec 4 opérateurs.

### Livré
- Logique de fusion `+ − × ÷` (sub/div orientées, spawn 1..5 séparé, chaînes, cibles).
- Barre d’opérateurs (mobile) + sélection clavier 1-4.
- Raccourcis clavier, profil local (`localStorage`), PWA (icônes, manifest, service worker).
- Serveur HTTPS local (certificats auto-signés, jamais commités).
- Build Vite → `dist/`.

---

## Déploiement
- **URL publique** : `https://6d797468-ai.github.io/mathic/`
- CI : `.github/workflows/pages.yml` — build Vite sur Node 22 puis `deploy-pages` à chaque push sur `main`.
- L'app est **relative** (`vite.config.mjs` → `base: './'`, manifest/`sw.js` résolus par scope) : elle vit aussi bien sous `/mathic/` (Pages) qu'à la racine (Netlify/Vercel).
- Propos du service worker : le cache est **cache-first** — après chaque montée de version (`mathic-vN` invalide le cache de l'app au `activate`), rechargez l'onglet une fois pour prendre le nouveau shell.

## V2 — Feuille de route « Game Feel » (Play Store)
- **Phase 1** ✅ Édition « Juiciness » : moteur audio 100 % synthèse (Web Audio, zéro asset), résonance harmonique des combos (pitch +1 demi-ton / fusion d'affilée), squash & stretch des tuiles, confettis aux couleurs de l'opérateur, textes flottants des opérations, bouton 🔊/🔇 persistant.
- **Phase 2** ✅ (absorbée en Phase 1 : bruitages de synthèse + mute).
- **Phase 3** ✅ FTUE : tutoriel in-game scripté (niveau 3+3→6, overlay à trous de lumière clip-path, main fantôme 👆, LLM court-circuité pendant l'initiation, `mathic_tutorial_done`).
- **Phase 4** ✅ Encapsulation native : wrapper **Capacitor 8** (`@capacitor/core|cli|android`, `com.mathic.game`), plein écran immersif natif (`MainActivity.java` masque les barres système en continu), orientation **verrouillée portrait** (`screenOrientation`), icônes adaptatives + splash Jetpack générés depuis `icon-512.png` (`scripts/generate-android-icons.mjs`), modèle GGUF embarqué dans `assets/public` → IA **offline** dans l'APK.
  - **Compiler l'APK** (sur une machine avec SDK Android + JDK 17+) : `npm run build:android` puis ouvrir `android/` dans Android Studio → Build › Build App Bundle/APK ; ou `cd android && ./gradlew assembleDebug`.
- **Phase 5** ⬜ Publication Play Store (compte dev, formulaire de déclaration, AAB signé).

---

## Consigne d’archivage
- `node_modules`, `dist`, `certs/` ne sont **jamais** commités.
- Le GGUF (88 Mo) et wllama.wasm sont dans `public/` — attention à la limite GitHub de 100 Mo/fichier.
- Chaque phase se termine par : tests + playtest + build + un commit dédié.
