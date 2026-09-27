# Contrat « GAME-RULES » — migration V4 → V5 (Concept B « Grille croisée »)

**Statut** : FORMALISÉ (PHASE 6 · GATE 1 vert le 2026-09-23)
**Prérequis** :
- exploration : `MATHIC-V5-GAMEPLAY-EXPLORATION.md` §12.2
- décision GATE 1 : `lab/gameplay/reports/g0-report.md` (B score G0 = 8/8, A = 6/8 ; A-v2 = mode secondaire viable)
- audits : `MTH-001` (fallback génération moves:0), rapport `/tmp/audit/report-mathic-v4-audit.md`

Format exigé par la gouvernance §8 : `OLD → PROBLEM → NEW → MIGRATION → TESTS`.

---

## OLD (V4, baseline immuable — branche `kali/v4-engine` @ `6cd2cd3`)

- Opérateur **injecté par la roue** au moment de la fusion (geste glisser).
- Hasard opérateur non annoncé : **FOE** (facteur d'opacité), le joueur ne choisit pas l'opérateur.
- Fallback `generatePuzzle` → `moves: 0` (MTH-001) : niveaux dégénérés possibles hors certification.
- `branching` moyen 14,6/16 mais qualitativement faible (branches majoritairement équivalentes).

## PROBLEM

1. **Causalité opaque** (G0.1) : le résultat d'une fusion n'est pas fonction d'un choix explicite d'opérateur.
2. **Décision réelle absente** (G0.2, audit qualitatif) : la roue décide, pas le joueur.
3. **Génération non certifiée** (MTH-001) : niveaux triviaux/impossibles produits sans contrôle solver.
4. **Réutilisabilité outil** : aucun contrat formel « rules » isolé (session/command/rules) à réutiliser pour la suite ou le solver.

## NEW — `RULES-V2-B` (implémentée et mesurée : `lab/gameplay/lib/engine-b.mjs`, etc.)

État et géométrie :
- Grille **rectangulaire** : `rows = grid.length`, `cols = grid[0].length` ; case vide = `-1`.
- `reserve` = **multiset** `{valeur: nbDisponibles}`.
- Chaque ligne/colonne = `{ ops: [op…], target: int }` avec **N-1 opérateurs pour N valeurs**.

Coup :
- `PLACE v@(r,c)` : poser une valeur de la réserve (consommée) sur une case vide ; un `PLACE_BLOCKED` est un coup illégal (case occupée ou quantité épuisée).
- Victoire (`isSolved`) : grille pleine **et** chaque ligne ET colonne évalue exactement `target` (évaluation gauche→droite ; `−` exige résultat ≥ 0 ; `÷` exige divisibilité exacte).

Sûreté de recherche (design tools) :
- `sumFeasible` : prune valide pour toute ligne/colonne tout-`+` (somme partielle > target → état infaisable), **indépendante de l'ordre**).
- `quickReject` : refuse arithmétiquement une spec tout-`+` dont `sum(rows) !== sum(cols)` ou `sum(réserve) !== total` (la double partition doit totaliser pareil).
- `validateSpec` : **fail-fast structurel** (grille rectangle, alignement rows/cols, nb d'opérateurs, opérateurs connus, réserve entière positive) — interdit le `NaN` silencieux.

Déterminisme (non négociable) :
- Aucun `Math.random()` / `Date.now()` dans l'engine ni dans le solver.
- `canonical(s) = JSON([grid])` ; événements `PLACE` ré-jouables à l'identique (`replay(spec, events)`).

Progression / décision (preuves G0) :
- 9/10 niveaux résolvables (b-07 = cas impossible assumé, rejeté par `quickReject` → exercice de diagnostic, pas d'échec).
- `branching` moyen 9,34 ; décision 0,75 ; 7/9 à ≥ 2 solutions — cf. `reports/g0-report.md`.

## MIGRATION (pas encore exécutée — PHASE 8)

1. **Étape lab** (FAIT, hors produit) : spec-schema validé par solver, 10 niveaux-spec B seeds fixes, sonde anti-MTH-001 (100 specs → 87 % non résolvables en génération naïve : certification solver obligatoire, MTH-001 traité par design).
2. **Étape app** (PHASE 8, à GATE 2 vert) :
   - Nouveau module **isolé** `rule-engine-v5` (pur, sans UI, sans Momo) porté de `engine-b.mjs` + `validateSpec`.
   - Greffe **en parallèle** de la suite V4 (0 casse) : `npm test` reste vert, `src/` V4 n'est pas modifié par cette PR.
   - Architecture cible : `session → command → rules → board/operators/objectives → constraints → events` ; **moteur = autorité**, jamais l'UI ni Momo.
   - Événementiel : `PLACE` (au lieu de l'injection roue) ; undo/snapshot/replay/persistance V4 inchangés tant que les contrats correspondants ne bougent pas.
3. **Non-codés à cette étape** : UI, Android/Capacitor, intégration Momo, persistance, animations.

## TESTS

- **Lab (fait)** : `npm test` (racine) = 19 fichiers, 19/19, `tests/playtest-puzzle.mjs` ✅.
- **Lab** : `lab/gameplay`: `npm test` 17/17 — déterminisme, solvabilité B (b-07 seul impossible), `validateSpec` rejette les specs corrompues, `replay` = canonical.
- **Au basculement PHASE 8 (acceptation GATE 2)** : V4 = zéro régression (le `node --test` global inclut déjà le lab) ; nouveaux tests V5 = déterminisme ×2 instances, replay exact, `quickReject` sur b-07, aucun `Math.random` dans les chemins gameplay (grep).