# MATHIC 1.0 — COMPLETE GAMEPLAY + PROGRESSION (CG) — Rapport

Status : **LIVRÉ** · Verdict précédent au rapport CG : CONTINUE (B2 → CG)
Branche : `kali/v5-gameplay-lab` · Date : 2026-09-24

## 1. Mandat

Étendre le jeu de B1 (16 niveaux) à un **LADDER complet de 36 niveaux (N1–N36)** répartis en
**6 mondes**, avec navigation par mondes + verrouillage progressif dans l'UI, progression
persistable offline-first, score lisible (bases + chaînes + objectif), certification Solver de
tous les niveaux, playthrough autonome étendu, build web + APK.

Conformité doctrine : **agent = technique ; humain = APK complète installable**. Aucune
correction du libellé cosmétique « B1.5 ». Aucun changement Kernel / Engine / Solver / Replay.

## 2. LADDER : 36 niveaux, 6 mondes

| Monde | id | Nom | Niveaux | Concept de la courbe |
|---|---|---|---|---|
| W1 | La Formule | onboarding + premiers mondes | N1–N3, N17, N18 | touches de base, préparation, 4 chemins |
| W2 | La Préparation | prep | N4–N6, N19, N20 | coups sacrifiés, double préparation |
| W3 | La Chaîne | chaînes depth 1 | N7–N9, N21, N22 | chaînes à deux voies, fuite en avant |
| W4 | La Division | division | N10–N12, N23, N24 | chaîne longue depth 2 (world) |
| W5 | Le Budget | budget | N13–N15, N25, N26 | partage, entrée obligée, budget juste |
| W6 | La Synthèse | synthèse depth 3 | N16, N27–N36 | tours depth 3 (N31, N34, N36), maître |

Structure : `src/b1/levels.mjs` → `LADDER` (36), `WORLDS` (6), helpers `worldOf / levelsInWorld /
nextLevel / prevLevel / firstLevelOf / lastLevelOf`. Aide pédagogique `idea` + HUD minimal par
niveau (`hud`).

## 3. Certification Solver — 36/36 VALIDES

Banc `tests/b1/cg-levels.test.mjs` (budget 40 000) + banc de recherche `/tmp/opencode/cg-verify.mjs` :

- **R20 niveaux nouveaux (N17–N36)** : tous « réellement nouveaux » — chaque chemin rejoué par
  le Solver est **optimal** (`minMoves` signés) ; aucun niveau dégénère (toujours ≥ 2 finals réels,
  jamais de triche par zéro).
- Flagships joués réellement en UI, scores signés :
  - N20 `10−8=2 → 2×2=4 → 4+36=40`, final 20 (+10 objectif + chaînes)
  - N33 (double préparation) — previews purs hors committé
  - N36 `18−3=15 → 15×24=360`, final 49
- Contraintes de conception confirmées :
  - les tours **depth 3** doivent rester en **W6** (N31, N34, N36) : à budget plein, une chaîne
    depth 3 + tout-chaîné + petit plateau faisait échouer le Solver
  - N24 reste un monde de chaînes depth 2 (pas de depth 3)

## 4. Progression persistable offline-first

Nouveau `src/b1/save.mjs` (logique pure, adaptateurs injectables) :

- `SAVE_KEY = "mathic.save.v1"` ; `pickStorage()` = localStorage sinon mémoire
- `blankSave { version:1, unlocked:[N1], completed:{}, current:N1 }`
- `loadSave` tolérant : JSON corrompu / version inconnue / ids inconnus → **vierge, jamais de crash**
- `markCompleted` (record `{wins, bestScore, bestMovesLeft}`, déblocage **linéaire**, current)
- `unlockTo / setCurrent / isUnlocked / replayable / hasWon / bestScore / completedCount`
- `worldProgress` : comptes par monde (total / ouverts / réussis)

## 5. UI — Navigation mondes + verrouillage + score lisible

`src/b1/web/b1-web.js` + `index.html` + `b1-web.css` :

- barre **mondes** (`#worlds`, pills `W1..W6` avec compteur `réussis/total`)
- navigateur de niveaux groupé **par monde** (`#levels` → `.world-block` / `.level-row`)
- **verrouillage** : tuile fermée → `locked` (pointillés), clic bloqué « Niveau verrouillé »
- **persistance** à la victoire (commit gagnant → `markCompleted + saveNow`)
- **reprise** : restaure `save.current` si débloqué
- **score lisible** dans l'overlay : `Score N = bases + chaînes + 10 d'objectif · coups restants`
- bouton **« Niveau suivant »** inter-mondes (ou uniquement si débloqué)

## 6. Qualité

- `npm test` : **123/123 ✔** (inclut certification CG, progression CG, playthrough 36 niveaux, + tous les hérités B1/B2/K*) — **aucune régression**.
- Playthrough autonome UI : **les 36 niveaux joués en live** (TAP→PREVIEW→TRANSFORMER), chaque
  victoire vérifie `overlay`, score moteur == score UI.
- Tests CG dédiés : structure LADDER/WORLDS, signatures certifiées des 20 niveaux, flagships,
  monde/progression/save (corruption, garde-fous, worldProgress).

## 7. Artifact + Preuve

- **Web** : `npm run build:b1` → `dist-b1/` (index.html 2,14 kB ; b1-web.css 5,43 kB ; b1-web.js 26,31 kB gzip 7,89 kB)
- **Android** : `npx cap copy android` → `./gradlew assembleDebug` (arm64) OK
- **APK** : `artifacts/cg/MATHIC-CG-1.0-debug.apk` (4 490 804 o)
  SHA-256 `9c216f100eb0d496973317e3283f164880bae7c63bc1e8ea704078c07ce36172`
  (vérif `unzip -l` : `assets/public/b1-web.js` contient le marqueur N36)

## 8. Git

Commit sur `kali/v5-gameplay-lab` (remote `git@github.com:6d797468-ai/mathic.git`) couvrant :
levels.mjs (LADDER 36 + WORLDS + helpers), save.mjs, b1-web.js/index.html/css, tests
(cg-levels, cg-progression, smoke/grammar mis à jour), rapport, APK.