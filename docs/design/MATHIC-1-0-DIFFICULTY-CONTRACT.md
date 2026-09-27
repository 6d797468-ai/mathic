# MATHIC 1.0 — Contrat A12 : Difficulté

**Référence** : BRIEF §13 (difficulté multidimensionnelle), §14 · **Dépend de** : A10 (solver), A13 (monde) · **Statut** : DESIGN (à valider).

La difficulté n'est **jamais la valeur numérique d'une tuile** — elle est la propriété de l'ESPACE DE DÉCISION d'un niveau (mandat §16). Elle doit être **mesurable et reproductible** (certification → rapport chiffré).

---

## 1. Dimensions mesurables (D1–D8 du BRIEF, formalisées)

| Dimension | Définition mesurable (issue du solver A10) |
|---|---|
| **branching** | `branchingFactor` moyen : actions valides par état visité |
| **decision density** | `decisionPoints / solutionLength` : densité de vraies bifurcations |
| **solution depth** | `shortestSolution` (coups) et profondeur de la solution optimale en score |
| **constraint density** | nb de contraintes actives (maxMoves/ops cibles, conditions) sur le premier plan |
| **operation diversity** | nb d'opérateurs réellement utilisés dans les solutions comptées vs disponibles |
| **dead ends** | nb d'états sans action valide rencontrés par le solver (pièges) |
| **alternative solutions** | nb de familles de solutions (modulo commutativité) |
| **optimization difficulty** | écart **enveloppe score** : `(scoreMax − score du 1er chemin trouvé)` — coût de l'optimisation |

## 2. Mesure et reproductibilité

- Toutes les dimensions sont **calculées par le solver** à partir du niveau {id,version,ruleVersion} (A10 §7 déterministe) → mêmes entrées, mêmes métriques.
- Aucune dimension n'est une opinion ; chaque métrique est accompagnée de son **niveau de certitude** (exact / borné) (A10 §4).
- Les métriques sont stockées dans `A9.difficulty.metrics` à la certification — **ce sont les seules données de difficulté acceptées en content** (pas de « ce niveau a l'air dur »).

## 3. Pièges à détecter (vs « artificiellement dur »)

Règle : détecter **la difficulté par piège**, qui est de la **mauvaise difficulté** :
- `deadEnds` élevés non compensés (le joueur tombe dans le vide sans comprendre → frustration, G0.1) ;
- `alternative solutions` = 1 (niveau « couloir », pas de choix réel — trivialité structurelle §26) ;
- `branching` élevé mais `decisionPoints` faible (beaucoup de coups valides, aucune significatif : bruit) ;
- opération utilisée dans **0** solution (opérateur décoratif → violation §17 BRIEF) ;
- solution « optimale » qui n'est qu'**arithmétique brute** (aucune profondeur stratégique, `optimizationDifficulty ≈ 0`).

## 4. Composé de difficulté (score composite — EXPÉRIMENTAL, coefficient data)

```
difficultyScore = Σ w_i · dimension_i   (w_i configurables, données)
```
- La **pondération est un hyperparamètre d'équilibrage** (par dataset calibré : playtests + judgments) — jamais un juste sorti d'intuition (§10 mandate).
- Les classes Easy→Normal→Advanced→Expert→Master (BRIEF §13) sont **des plages mesurées** du `difficultyScore`, étalonnées sur une **courbe de calibration** (échantillon de niveaux + résultats humains G7) — reproductible, révisable en phase de contenu.

## 5. Contrat avec les mondes (progression)

- Chaque monde (A13 W1–W10) définit une **plage cible** de `difficultyScore` (ex. W1 ∈ [0, 25[, W2 ∈ [25, 45[ …) → la certification A11 §2 refuse un niveau hors plage de son monde (progression pédagogique BRIEF §5).
- Un niveau « simple numériquement » mais profond (beaucoup de décisions) obtient une classe Advanced **par mesure**, pas par estimation.

## 6. Test de domination (mandat §25) traduit en analyse

- Le solver mesure, pour chaque opérateur/discipline : part des solutions optimales qui l'utilisent, sur les niveaux du dataset.
- Si `×` fait partie de l'optimum dans ≥ 90 % des niveaux certifiés d'une plage → **détection de domination** → rebalance opérateur (coefficients A7 ou composition des boards, jamais « forcer » un opérateur dans la solution).
- Même logique pour combos : `comboOpportunities` (A6) ne doit pas rendre un enchaînement de `REUSE` trivialement farmable (A11 QUALITY).

## 7. Consommation

- **A11** : `difficulty.class` doit être **dans la plage du monde** (sinon NO-GO).
- **A13** : progression débloque un monde quand la maîtrise (MomoDash) des mondes précédents est ≥ seuil — basé sur les classes mesures.
- **UI (A-ui)**: le « niveau suivant » est ordonné par classe, pas par numéro d'astro de naissance.



D-D1 — difficulté = propriété **mesurée** de l'espace de décision, jamais estimée par les valeurs de tuiles. D-D2 — coefficients de pondération = data calibrée (jamais définitive). D-D3 — « artificiellement dur » = pièges (dead ends injustes, couloirs, bruit) → les certifs le détectent avant human. Opposables.