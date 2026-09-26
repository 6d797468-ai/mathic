# MATHIC 1.0 — LEVEL DESIGN GRAMMAR

Grammaire de conception des niveaux fondée sur **Number Magic** (`docs/design/MATHIC-BRAND-GAMEPLAY-PRINCIPLES.md`). La couche de référence est `src/b1/level-design.mjs` — **déscriptive et vérifiable**, elle ne modifie JAMAIS le moteur.

> Mathic — Les nombres sont magiques.

## 1. Principe

Un niveau n'est pas seulement `TARGET + SOLVABLE`. Il est caractérisé par quatre dimensions **indépendantes** :

```
SOLVABLE  +  CHOICE  +  CONSEQUENCE  +  DISCOVERY
```

`CHOICE` et `CONSEQUENCE` sont mesurés à partir de la seule vérité mathématique (Solver + Engine + Replay), jamais d'une seconde source. **Imposer artificiellement 5 solutions par niveau est un anti-pattern** : une solution unique est valide quand elle enseigne contrainte, précision ou découverte.

## 2. Vocabulaire (NUMBER MAGIC)

Neuf propriétés internes de design (jamais affichées au joueur) :

| Token | Définition | Signal automatique |
|---|---|---|
| DISCOVERY | Apprendre l'action (nombres, opérateurs, formule, transformation) | monde W1 + faible diversité (convention onboarding) |
| SINGLE-PATH | Une seule route optimale (précision, contrainte) | `routeCount == 1` |
| MULTI-PATH | Plusieurs routes optimales existent | `routeCount >= 2` |
| CHOICE | Les routes disponibles produisent des conséquences différentes | `multiPath && consequenceEvidence` |
| CONSEQUENCE | Le choix modifie significativement (état, score, chaîne, futur) | `scoreDiverse || chainDiverse || stateDiverse` |
| CHAIN | Le résultat d'une transformation devient une ressource du coup suivant | `chainDepth >= 1` |
| OPTIMIZATION | Plusieurs routes marchent, leurs performances diffèrent | `scoreDiverse` (scores distincts) |
| COMBINATION | Plusieurs mécaniques sont mobilisées ensemble dans un chemin | `>= 3 opérateurs distincts dans un chemin && chainDepth >= 1` |
| MASTERY | Compréhension combinée exigée | W6 + évidence profonde ; sinon **intention déclarée** |

## 3. Les 8 stages du curriculum

Progression pédagogique par syllabe, exposée `stage 1..8` avec un **plafond par monde** (convention de design) :

| Stage | Nom | Objectif du joueur |
|---|---|---|
| 1 | DISCOVERY | Comprendre l'action |
| 2 | POSSIBILITY | Révéler qu'un objectif admet plusieurs chemins |
| 3 | CHOICE | Voir surgir la décision stratégique |
| 4 | CONSEQUENCE | Le choix modifie l'état / le score / la chaîne / les coups |
| 5 | CHAIN | Penser en séquence (le résultat devient ressource) |
| 6 | OPTIMIZATION | Choisir plutôt que simplement réussir |
| 7 | COMBINATION | Synthétiser plusieurs mécaniques |
| 8 | MASTERY | Maîtrise combinée du système (pas de difficulté numérique) |

Plafonds `WORLD_STAGE_CAPS = { W1:3, W2:4, W3:5, W4:6, W5:7, W6:8 }`. Le stage d'un niveau = le plus haut stade **démontré** par ses preuves, coupé au plafond de son monde, et relevé par **intention déclarée** pour les flagships (N36 → MASTERY).

## 4. Métriques automatiques (toutes issues du Kernel)

`analyzeLevel(level)` produit, pour chaque niveau :

```
minMoves, routeCount, runs, distinctFinalStates, scoreRange,
operatorDiversity, chainDepth, uniqueSolution, multiPath,
consequenceEvidence, finalValues, legalFirstActs, bestScore, maxDistinctOpsInPath
```

Définitions :
- `routeCount` — premiers coups distincts parmi les victoires de profondeur minimale (groupe `routes` du Solver).
- `runs` — victoires minimales trouvées sous budget (déterministe, budget `NM_DESIGN_BUDGET = 40000` documenté).
- `distinctFinalStates` — états finaux de plateau distincts (snapshot à motif, placement inclus).
- `scoreRange` — intervalle `[min,max]` des scores des routes minimales échantillonnées.
- `uniqueSolution` — `routeCount == 1 && runs == 1` (une SEULE solution optimale, ex. N15).
- `multiPath` — `routeCount >= 2`.
- `consequenceEvidence` — `scoreDiverse || chainDiverse || stateDiverse` (diversité de score, de chaîne, ou d'état résiduel en valeurs).

**Aucune donnée inventée** : chaque métrique se rejoue (Replay) et se revérifie.

## 5. MULTI-PATH ≠ MEANINGFUL CHOICE

Règle de qualité (exigence §7) :

- Deux solutions qui mènent au même score, à la même chaîne et à la même matière résiduelle = **routes équivalentes** → `MULTI-PATH` uniquement, PAS `CHOICE`.
- Une vraie conséquence doit être observable : score différent, chaîne différente, ou état résiduel différent.
- La preuve vivante : **N1** (2 routes, scores identiques, états équivalents) = `MULTI-PATH` seulement ; **N22** (3 routes, scores 19 vs 27) = `CHOICE + CONSEQUENCE`.

## 6. Intentions déclarées vs faits mesurés

`DECLARED_INTENT` distingue l'**intention pédagogique** (design humain, flagships + onboarding) des **faits mesurés** par le Solver. Les deux cohabitent dans la sortie (`properties` = faits ; `declared` = intention). Une intention peut relever le stage (`N36 → MASTERY`), jamais contredire un fait.

Flagships de référence :
- **N15** — `SINGLE-PATH` (précision) : solution strictement unique vérifiée.
- **N17** — `MULTI-PATH` : les quatre chemins (leaves différence d'état résiduel).
- **N22** — `CHOICE + CONSEQUENCE` : routes à scores différents.
- **N36** — `MASTERY + COMBINATION` (déclaré) : niveau de synthèse W6.

## 7. Protocole d'ambiguïté

Les incertitudes sont **signalees, jamais masquées** : le champ `ambiguity` liste les cas où l'analyse ne tranche pas (routes équivalentes, conséquence d'état résiduel sans divergence de score/chaîne, route unique directe en fin de curriculum…). Décision = design humain, explicitée dans le rapport.

## 8. Utilisation (flux de travail)

1. Un niveau est ajouté à `LADDER` (données pures).
2. `analyzeLevel` / `analyzeAll` en dérivent les faits automatiquement.
3. La classification est vérifiée par `tests/b1/level-design.test.mjs` (invariants + distribution figée).
4. Un écart voulu est documenté soit en intention déclarée, soit en ambiguïté ouverte.
5. Aucune modification du Kernel, du Solver, du Replay, du score, de la progression.

## 9. Anti-patterns

- `CHOICE` décerné parce que « plusieurs solutions existent » (il faut une conséquence observable).
- 5 solutions forcées par niveau.
- Score utilisateur à partir de `nmFacts` / la grammaire.
- Animations « pour montrer la magie ».
- Difficulté numérique (nombres énormes).
- Classification reposant sur des valeurs inventées (la preuve doit se rejouer).