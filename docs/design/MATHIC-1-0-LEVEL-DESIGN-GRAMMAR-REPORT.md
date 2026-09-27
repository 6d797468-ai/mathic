# MATHIC-1-0-LEVEL-DESIGN-GRAMMAR — Rapport de mandat

Verdict précédent : CONTINUE (brique BRAND-GAMEPLAY-PRINCIPLES, `691d894`).
Ce mandat transcrit les principes Number Magic en **grammaire de Level Design vérifiable** : couche indépendante + documentation + classification N1–N36 + tests.

## PRESERVE
`engine.mjs`, `solver.mjs`, `replay.mjs`, `levels.mjs`, `save.mjs`, score B2, invariants (`INVALID → STATE_BEFORE == STATE_AFTER`), certification N1–N36, progression, tests existants, architecture Mathematics ≠ Gameplay ≠ UI ≠ AI ≠ Persistence ≠ Telemetry. Aucune réécriture du noyau, aucun déplacement de fichier.

## ADD
- `src/b1/level-design.mjs` — couche de conception indépendante (au-dessus du Kernel, importe Engine/Solver/Levels, jamais l'inverse) : `analyzeAll/analyzeLevel/classifyLevel/curriculumStage` + `nmFacts/nmStage` (base de la brique précédente, inchangée), vocabulaire à 9 tokens, 8 stages avec plafonds par monde, intentions déclarées, protocole d'ambiguïté.
- `docs/design/MATHIC-1-0-LEVEL-DESIGN-GRAMMAR.md` — grammaire documentée (vocabulaire, stages, métriques, MULTI-PATH vs MEANINGFUL CHOICE, intentions vs faits, anti-patterns).
- `tests/b1/level-design.test.mjs` — 9 tests de la couche.
- `src/b1/design.mjs` — devient un shim de ré-export (`nmFacts/nmStage/NM_DESIGN_BUDGET` depuis level-design.mjs) : les EVIDENCES de la brique BRAND restent vertes sans duplication de vérité.

## CHANGE
`design.mjs` : déplacé de module complet → shim (même API exportée). Aucun changement de comportement (test `nm-principles` vert).

## DO NOT DO
Modifier Kernel/Solver/Score, ajouter des mécaniques, refaire N1–N36, imposer 5 solutions, introduire Momo/économie/backend/télémétrie, métrique NM affichée au joueur, animations « magiques ».

## EVIDENCE (démontré automatiquement)
- `npm test` : **138/138 ✔** (129 hérités + 9 level-design), aucune régression.
- **Analyse dérivée à 100 % du Kernel** : ré-audit — `engine/solver/replay/levels/save` ne contiennent ni `level-design`, ni `analyzeLevel`, ni `classifyLevel` (aucune inversion, aucune mutation).
- **Solver=Engine=Replay** : routes minimales des 4 flagships rejouées → victoires, score dans `scoreRange`, `chainDepth` == somme max rejouée.
- **N1–N36 invariant** : chaque niveau solvable, `routeCount ≥ 1`, `minMoves ≤ maxMoves`, `stage ∈ [1, cap ≤ 8]`, métriques complètes, aucun nombre arbitrairement énorme.
- Distribution figée (table ci-dessous) : 28 multi-path · 19 avec conséquence observable · 10 routes équivalentes · 1 solution strictement unique · 8 SINGLE-PATH · 27 CHAIN · 7 COMBINATION.
- **Reproductibilité** : deux analyses identiques sur N22 et N34.

## Classification N1–N36 (budget Solver 40 000, anneau documenté)

Métriques : `min` = minMoves · `rc` = routeCount · `runs` · `scores` = scoreRange · `cd` = chainDepth · `eq` = routes équivalentes · `st` = stage.

| Niveau | Monde | min | rc | runs | scores | cd | route | eq | st | Propriétés (faits) | Déclaré |
|---|---|---|---|---|---|---|---|---|---|---|---|
| N1 | W1 | 1 | 2 | 2 | 10-10 | 0 | multi | EQUIV | 2 POSSIBILITY | DISCOVERY, MULTI-PATH | DISCOVERY, MULTI-PATH |
| N2 | W1 | 1 | 4 | 4 | 10-10 | 0 | multi | – | 3 CHOICE | MULTI-PATH, CHOICE, CONSEQUENCE | DISCOVERY, MULTI-PATH |
| N3 | W1 | 1 | 4 | 4 | 12-12 | 0 | multi | – | 3 CHOICE | MULTI-PATH, CHOICE, CONSEQUENCE | POSSIBILITY, MULTI-PATH |
| N4 | W2 | 2 | 2 | 4 | 19-19 | 2 | multi | EQUIV | 4 CONSEQUENCE | MULTI-PATH, CHAIN | – |
| N5 | W3 | 2 | 2 | 4 | 16-16 | 2 | multi | EQUIV | 5 CHAIN | MULTI-PATH, CHAIN | – |
| N6 | W5 | 1 | 2 | 6 | 14-14 | 0 | multi | EQUIV | 2 POSSIBILITY | MULTI-PATH | – |
| N7 | W2 | 2 | 7 | 14 | 15-20 | 2 | multi | – | 4 CONSEQUENCE | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N8 | W3 | 2 | 4 | 8 | 15-15 | 2 | multi | – | 5 CHAIN | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN | – |
| N9 | W4 | 2 | 1 | 2 | 15-15 | 2 | single | – | 5 CHAIN | SINGLE-PATH, CHAIN | – |
| N10 | W5 | 2 | 4 | 6 | 15-19 | 2 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N11 | W5 | 1 | 2 | 12 | 16-16 | 0 | multi | EQUIV | 2 POSSIBILITY | MULTI-PATH | – |
| N12 | W2 | 1 | 2 | 29 | 13-13 | 0 | multi | EQUIV | 2 POSSIBILITY | MULTI-PATH | – |
| N13 | W3 | 3 | 2 | 11 | 28-40 | 6 | multi | – | 5 CHAIN | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION | – |
| N14 | W4 | 3 | 1 | 8 | 23-27 | 6 | single | – | 6 OPTIMIZATION | SINGLE-PATH, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION | – |
| N15 | W6 | 1 | 1 | 1 | 11-11 | 0 | UNIQUE | – | 1 (convention) | SINGLE-PATH | SINGLE-PATH |
| N16 | W6 | 2 | 3 | 42 | 19-55 | 2 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N17 | W1 | 1 | 4 | 4 | 11-11 | 0 | multi | – | 3 CHOICE | MULTI-PATH, CHOICE, CONSEQUENCE | MULTI-PATH |
| N18 | W1 | 2 | 2 | 4 | 18-18 | 2 | multi | EQUIV | 3 CHOICE | MULTI-PATH, CHAIN | – |
| N19 | W2 | 2 | 2 | 4 | 14-14 | 2 | multi | EQUIV | 4 CONSEQUENCE | MULTI-PATH, CHAIN | – |
| N20 | W2 | 3 | 1 | 4 | 20-20 | 6 | single | – | 4 CONSEQUENCE | SINGLE-PATH, CHAIN, COMBINATION | – |
| N21 | W2 | 2 | 4 | 8 | 17-20 | 2 | multi | – | 4 CONSEQUENCE | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N22 | W3 | 2 | 3 | 10 | 19-27 | 2 | multi | – | 5 CHAIN | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | CHOICE, CONSEQUENCE |
| N23 | W3 | 3 | 1 | 2 | 24-24 | 6 | single | – | 5 CHAIN | SINGLE-PATH, CHAIN, COMBINATION | – |
| N24 | W3 | 3 | 4 | 15 | 24-29 | 6 | multi | – | 5 CHAIN | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION | – |
| N25 | W4 | 2 | 2 | 4 | 16-16 | 2 | multi | EQUIV | 5 CHAIN | MULTI-PATH, CHAIN | – |
| N26 | W4 | 3 | 2 | 8 | 19-22 | 6 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N27 | W4 | 2 | 5 | 8 | 18-66 | 2 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N28 | W5 | 2 | 3 | 32 | 21-24 | 2 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N29 | W5 | 3 | 6 | 12 | 17-22 | 6 | multi | – | 7 COMBINATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION | – |
| N30 | W5 | 1 | 2 | 47 | 22-22 | 0 | multi | EQUIV | 2 POSSIBILITY | MULTI-PATH | – |
| N31 | W6 | 2 | 1 | 25 | 29-29 | 2 | single | – | 5 CHAIN | SINGLE-PATH, CHAIN | – |
| N32 | W6 | 2 | 6 | 30 | 24-96 | 2 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N33 | W6 | 3 | 1 | 4 | 32-32 | 6 | single | – | 7 COMBINATION | SINGLE-PATH, CHAIN, COMBINATION | – |
| N34 | W6 | 2 | 4 | 44 | 26-27 | 2 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N35 | W6 | 2 | 4 | 23 | 30-43 | 2 | multi | – | 6 OPTIMIZATION | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION | – |
| N36 | W6 | 2 | 1 | 74 | 49-49 | 2 | single | – | 8 MASTERY | SINGLE-PATH, CHAIN | MASTERY, COMBINATION |

## Preuves utilisées
`routeCount/runs` = groupes de premiers coups du Solver (`solve`), `scoreRange/chainDepth/distinctFinalStates` = rejeux Engine+Replay (au plus 8 routes minimales échantillonnées), `finalValues/legalFirstActs` = `evaluate` sur toutes les actions de premier coup. Budget 40 000 documenté ; résultats déterministes (même budget → mêmes valeurs).

## Tests
`tests/b1/level-design.test.mjs` : invariants structurels, métriques sans donnée inventée, concordance Solver=Engine=Replay (flagships), MULTI-PATH vs MEANINGFUL CHOICE (N1 vs N22), flagships N15/N17/N36, distribution N1–N36 figée, reproductibilité, audit (noyau non muté/non inversé), MATHIC-008 (pas de nombres énormes). Suite complète **138/138 vert**.

## Ambiguïtés signalées (décisions de design humain, non masquées)
1. **N2, N3, N8, N17** : `consequenceEvidence` par **état résiduel** seulement (ni score ni chaîne ne divergent) — conséquence « faible » d'un premier coup. La pertinence stratégique est à valider humainement ; les intentions onboarding restent DISCOVERY/POSSIBILITY pour N2/N3.
2. **10 niveaux en routes équivalentes** (N1, N4, N5, N6, N11, N12, N18, N19, N25, N30) : multi-chemin mais matières résiduelles identiques → classés `MULTI-PATH`, pas `CHOICE` (exigence §7 tenue).
3. **N15** : solution strictement unique, directe, en W6 → stage curriculum « conventionnel » (1) ; la propriété dominante est SINGLE-PATH (précision), la position W6 est une porte de précision volontaire (décision design).
4. **N31** : W6 à évidence modeste (unique + chaîne, stage 5) — niveau de synthèse placé par curriculum, pas par preuve de combinaison. À confirmer ou relever par intention.
5. **N36** : preuve = route unique profonde (74 runs, chaîne) ; MASTERY/COMBINATION sont **déclarés** (faits ne les démontrent pas seuls) — c'est le cas limite assumé du pyramid moderne.
6. **Score sample vs exhaustif** : `scoreRange/runs` portent sur les routes minimales trouvées sous budget ; l'exhaustivité totale n'est pas garantie (documenté, reproductible).

## Impact architectural
Aucun impact runtime : la couche est purement analytique (design/CI). `design.mjs` devient un shim. Le noyau, la progression, le score et l'UI sont intacts. La grammaire alimente la certification et la future brique Gameplay/Momo (politique pédagogique par profil de niveau).

## Prochaine brique recommandée
**MOMO (politique pédagogique par profil)** : Momo observe l'état, lit la grammaire du niveau (`stage`, `SINGLE-PATH`, `CHOICE`, `CONSEQUENCE`, `COMBINATION`), et adapte son aide (découverte → conséquence → aide explicite) — sans jamais modifier le Kernel, en réutilisant `level-design.mjs` comme entrée. La brique Momo est le premier consommateur utile de cette grammaire.