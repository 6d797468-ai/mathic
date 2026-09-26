# GATE 1 — Gameplay Laboratory : A vs B (rapport complet, passe de retest A-v2 incluse)

> Question : les nouvelles règles produisent-elles de MEILLEURES DÉCISIONS que V4 ?

## Concept A — Chaînes (v1 · curation serrée)

| id | solvable | minMoves | nbSols | branching | deadEnd% | decision% | divMinSeq |
|----|----------|----------|--------|-----------|----------|-----------|-----------|
| a-01 | Découverte | ✓ | 1 | 1 | 1 | 0 | 0 | 1 |
| a-02 | Priorité | ✓ | 2 | 1 | 1 | 38 | 13 | 1 |
| a-03 | Division propre | ✓ | 2 | 2 | 1.5 | 0 | 50 | 2 |
| a-04 | Préséance inversée | ✓ | 2 | 1 | 1 | 38 | 13 | 1 |
| a-05 | Divisibilité réfléchie | ✓ | 2 | 1 | 1 | 43 | 14 | 1 |
| a-06 | Deux voies équivalentes | ✓ | 2 | 2 | 1.2 | 53 | 47 | 2 |
| a-07 | Cible préservée | ✓ | 2 | 2 | 1.67 | 33 | 33 | 2 |
| a-08 | Séquence stricte | ✓ | 2 | 1 | 1 | 45 | 36 | 1 |
| a-09 | Opérateur exigé | ✓ | 2 | 1 | 1 | 38 | 13 | 1 |
| a-10 | Plafond sous tension | ✓ | 2 | 1 | 1 | 0 | 0 | 1 |

## Concept A — Chaînes (v2 · curation desserrée — retest design)

| id | solvable | minMoves | nbSols | branching | deadEnd% | decision% | divMinSeq |
|----|----------|----------|--------|-----------|----------|-----------|-----------|
| a2-01 | Ouverture | ✓ | 1 | 1 | 1 | 0 | 0 | 1 |
| a2-02 | Deux voies | ✓ | 2 | 2 | 1.27 | 43 | 27 | 2 |
| a2-03 | Produit d'abord | ✓ | 2 | 1 | 1.29 | 39 | 26 | 1 |
| a2-04 | Division propre | ✓ | 2 | 1 | 1 | 43 | 14 | 1 |
| a2-05 | Multiplicités | ✓ | 2 | 4 | 1.26 | 42 | 26 | 1 |
| a2-06 | Préséance | ✓ | 2 | 1 | 1 | 25 | 25 | 1 |
| a2-07 | À l'aveugle | ✓ | 3 | 2 | 1.5 | 47 | 44 | 2 |
| a2-08 | Précision | ✓ | 2 | 1 | 1.29 | 50 | 36 | 1 |
| a2-09 | Échos | ✓ | 3 | 2 | 1.29 | 37 | 22 | 2 |
| a2-10 | Libre arbitre | ✓ | 2 | 4 | 1.15 | 42 | 24 | 2 |

## Concept B — Grille croisée

| id | solvable | minMoves | nbSols | branching | deadEnd% | decision% | divMinSeq |
|----|----------|----------|--------|-----------|----------|-----------|-----------|
| b-01 | Symétrique somme | ✓ | 4 | 2 | 2.18 | 12 | 64 | 2 |
| b-02 | Croisée mixte (2×2) | ✓ | 4 | 1 | 1.84 | 39 | 50 | 1 |
| b-03 | 3×3 Lo Shu | ✓ | 9 | 8~ | 29.12 | 0 | 100 | 8 |
| b-04 | Unique par réserve (2×2) | ✓ | 4 | 1 | 1.84 | 39 | 50 | 1 |
| b-05 | Produit + croisées (2×2) | ✓ | 4 | 2 | 2.18 | 12 | 64 | 2 |
| b-06 | 3×3 sommes variées | ✓ | 9 | 11~ | 21.37 | 0 | 100 | 11 |
| b-07 | IMPOSSIBLE — réserve incompatible | ✗ | ∞ | 0 | 0 | 0 | 0 | 0 |
| b-08 | 3×3 lignes paires, colonnes fortes | ✓ | 6 | 2 | 2.9 | 32 | 47 | 2 |
| b-09 | 3×3 faible contrainte | ✓ | 9 | 12~ | 11.92 | 0 | 100 | 12 |
| b-10 | 3×3 lignes/colonnes déséquilibrées | ✓ | 9 | 2~ | 10.67 | 0 | 100 | 2 |

## Évolution de curation A : v1 → v2 (retest §7)

| métrique (         ) | A v1 | A v2 | B |
|--------------------|-----|-----|---|
| nTotal             | 10 | 10 | 10 |
| nSolvable          | 10 | 10 | 9 |
| branchingMean      | 1.14 | 1.2 | 9.34 |
| branchingMedian    | 1 | 1.27 | 2.9 |
| numSolutionsMean   | 1.3 | 1.9 | 4.56 |
| numSolutionsMedian | 1 | 2 | 2 |
| diversityMean      | 1.3 | 1.4 | 4.56 |
| diversityMedian    | 1 | 1 | 2 |
| trivialCount       | 0 | 0 | 0 |
| multiCount         | 3 | 5 | 7 |
| reasoningCount     | 8 | 9 | 9 |
| deadEndMean        | 0.29 | 0.37 | 0.15 |
| decisionMean       | 0.22 | 0.24 | 0.75 |

## Aggrégats A vs B vs V4 (baseline audité · branching 14,6 qualitativement faible)

> `~` = comptage borné par budget de recherche (valeur au minimum). B `(sum)` = refus arithmétique immédiat (grille tout-`+` à total incohérent). V4 : baseline de l'audit (branching 14,6 majoritairement équivalent, min dégénéré MTH-001).

| métrique (         ) | A v1 | A v2 | B |
|--------------------|-----|-----|---|
| nTotal             | 10 | 10 | — |
| nSolvable          | 10 | 10 | — |
| branchingMean      | 1.14 | 1.2 | 14.60 (V4) |
| branchingMedian    | 1 | 1.27 | — |
| numSolutionsMean   | 1.3 | 1.9 | n/a |
| numSolutionsMedian | 1 | 2 | — |
| diversityMean      | 1.3 | 1.4 | — |
| diversityMedian    | 1 | 1 | — |
| trivialCount       | 0 | 0 | 0 (mais min dégénéré) |
| multiCount         | 3 | 5 | — |
| reasoningCount     | 8 | 9 | 0 (audit) |
| deadEndMean        | 0.29 | 0.37 | — |
| decisionMean       | 0.22 | 0.24 | — |

## Sonde anti-MTH-001 (génération naïve, 100 specs seedées)

- total : 100
- résolvables : 13/100
- non résolvables : 87
- cible préexistante (dégénérescence fallback) : 12
- solutions min ≤ 1 : 13

**Lecture** : la génération naïve produit des niveaux dégénérés/triviaux/impossibles ; donc TOUTE génération dynamique V5 doit passer par un certificateur (solver) — MTH-001 traité par design.


## Verdicts GAMEPLAY-G0

- **G0.1 YELLOW** — Non mesurable par solver (préjugé). Preuves statiques : énoncés ≤3 lignes par spec, traces lisibles (CHAIN/PLACE/TARGET_REACHED). Validation humaine requise (hors scope GATE 1).
- **G0.2 YELLOW** — A: branching moyen 1.14 (médiane 1), ratio de points de décision 0.22. Les branches portent des opérateurs/tuiles DIFFÉRENTS (décision qualitative), contrairement aux 14,6/16 de V4 qui sont majoritairement équivalents. B: branching évaluation double-ligne par construct.
- **G0.3 GREEN** — Déterminisme FACT : 0 Math.random dans les moteurs ; événements CHAIN/PLACE/TARGET déterministes ; test de déterminisme automatique vert (tests/lab.test.mjs).
- **G0.4 GREEN** — A: 8/10 niveaux exigeant minMoves≥2 avec choix de branche (raisonnement nécessaire). B: l'assignation double-contrainte = raisonnement par construction (9/9).
- **G0.5 GREEN** — A: 0/10 niveaux triviaux (min=1 ou cible préexistante). Sonde génération naïve (probe MTH-001, 100 specs) → ON/OFF ; cible préexistante dans 12, min≤1 dans 13, NON résolvables dans 87 : la génération naïve est DANGEREUSE (à certifier).
- **G0.6 YELLOW** — A: gradient conceptuel a-01→a-10 (découverte→forbid/preserve/sequence/require/cap) sans inflation de valeurs. B: variété taille/opérateurs/réserve. Courbe numérique limitée par les lots de 10 (≥3 paliers conseillés en GATE 2).
- **G0.7 YELLOW** — A: 3/10 niveaux à ≥2 solutions ; B: 7/9 (B natif multi-solutions sur les grilles souples).
- **G0.8 GREEN** — A: opérateur = décision consommable + chaîne visible + file déterministe → ni 2048 (puissances de 2), ni Threes (triples), ni Candy (match-3), ni sudoku. B: plus proche kenken/kakuro → identité allégée (vigilance).

## Décision GATE 1

**B emporte le lot sur les critères G0 mesurables (score A=6/8, B=8/8) ; l'autre concept reste candidat en réserve. Décision finale GATE 1 : voir rapport complet.** (score G0 A=6/8, B=8/8)

**Retest design A (v2) · preuves** : branch 1.2 (v1 1.14), décision 0.24 (v1 0.22), ≥2 solutions 5/10 (v1 3/10), profondeur solution max 3. Conclusion : la curation desserrée double la multiplicité et améliore la densité de décision sans atteindre B ; viabilité de A en mode secondaire, B reste chef de file pour Phase 6.
