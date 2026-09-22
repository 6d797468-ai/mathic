# ROADMAP — MATHIC 4.0

> Développement en **sens inverse** : on commence par la phase la plus profonde et on remonte.
> Chaque phase est **verrouillée** (tests certifiés + build OK) avant de passer à la suivante.
> Le code et les messages sont en **français** (apostrophes typographiques, zéro apostrophe droite dans les chaînes JS).

---

## Phase 5 — ⬜ NON COMMENCÉE (à définir)
**Objectif** : pas encore spécifié dans les tickets.
État : aucune édition — lancera suite à la Phase 4.

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

## Consigne d’archivage
- `node_modules`, `dist`, `certs/` ne sont **jamais** commités.
- Le GGUF (88 Mo) et wllama.wasm sont dans `public/` — attention à la limite GitHub de 100 Mo/fichier.
- Chaque phase se termine par : tests + playtest + build + un commit dédié.
