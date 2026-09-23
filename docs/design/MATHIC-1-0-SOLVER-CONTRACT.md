# MATHIC 1.0 — Contrat A10 : Solver

**Référence** : BRIEF §12 (Solver = pièce industrielle), §13, §22 · **Dépend de** : A1 (sémantique), A3 (formula), A4 (mutation), A8 (objectifs) · **Usage** : A11, A12, Momo, authoring · **Statut** : DESIGN (à valider).

Le Solver est un **instrument industriel distinct du moteur de jeu** (§14 du mandat : « pas nécessairement le même système… mais même sémantique mathématique »). Il ne joue pas : il **prouve, mesure, certifie, éclaire**.

---

## 1. Contrat de réponses (chaotique – exigé par BRIEF §12)

Pour un niveau (A9) valide, le solver produità **toujours** (cache compris) :

```
solvable                   booléen
solutionCount              nb de chemins valides (≤ maxMoves) vers un état objectif
shortestSolution           actions-minimal (longueur minimale)
alternativeSolutions       familles de solutions distinctes (non redondantes par commutativité)
decisionPoints             actions où ≥ 2 branches conduisent à des états ≠
branchingFactor            moyenne du nb d'actions valides par état visité
deadEnds                   états sans action valide restante rencontrés dans la recherche
usefulChains               chaînes (A5) présentes dans au moins une solution
comboOpportunities         triggers math (A6 §1) réalisables, avec fenêtre estimée
scoreEnvelope              bornes { min, max } du score atteignable, et chemin optimal
```

Ces données sont : (a) la base de la certification A11 ; (b) la base des métriques de difficulté A12 ; (c) la source des explications de Momo A14 ; (d) le garde-fou de l'authoring (détection précoce des niveaux bâtés).

## 2. Sémantique partagée, systèmes distincts

- Le solver **importe le kernel (A1) et les règles formula (A3) — jamais une copie**. Tout écart entre moteur de jeu et solver = bug de contrat (principe « même sémantique mathématique »).
- Le solver modélise un **état** (board hash + moveCount + trace partielle) par un **nœud**, et génère les **actions candidats** : toutes les paires de tuiles `number` ⨯ tuiles `operator` ⨯ paires distinctes. Il réordonne `+`/`×` (A3 §6) pour la dé-duplication.

## 3. Algorithme de référence (BFS budgeté — extension V5)

Héritage direct du laboratoire (solver BFS/DFS budgeté, validé en G1/V5) :
- **BFS par profondeur** bornée par `maxMoves` (`branchingFactor`<espérance) ;
- **détection des sous-états visités** (hash) + **canonicalisation** pour éviter l'explosion combinatoire inutile ;
- **enveloppe** : meilleur score par état (DP par (state, depth, chainLen, combo) réduits) ;
- **bounding** : prune les branches au-delà du meilleur score enveloppe (A7).
- Budget CPU **par phase** : certification (infra) vs aide runtime (Momo) — budgets distincts, jamais bloquant.

## 4. Représentation de la partie pour le solver

- Vue solver = **séquence d'actions** `[a₀op₀b₀, a₁op₁b₁, …]` (A3 §7) + états intermédiaires de hashs court. Jointure par `(stateHash, depth)`.
- L'exhaustivité n'est **pas exigée universellement** : sur dimension de board W4×H4, 4 ops et 12 coups, l'espace est grand. Le solver garantit l'**exactitude sur les réponses demandées** (solvable/shortest) via BFS complet sous borne ; les **alternatives** et l'**enveloppe score** sont calculées par DP avec prune droite (approximations certifiées, jamais d'intuitions) — les métriques produites portent leur **niveau de certitude** (exact / lower-bound / upper-bound) dans le rapport A11.

## 5. Réponses sur cas limites (exigence de robustesse)

- **Niveau insolvable** → `solvable=false` + preuve minimale (contre-exemple court / invariant refusé) → gisement authoring.
- **Niveau à ordre de grandeur énorme** (board 6×6, 4 ops, 15 coups) → bornes supérieures par DP + décision « trop couteux pour certification exacte » → re-spec recommandée (A11 NO-GO pour temps, re-taille).
- **Issues defloat exactes** (pas de flottant, pas d'IEEE).

## 6. Enveloppe de score & versionnage

- `scoreEnvelope` : `{min, max, optimalPath, optimalLength, optimalChain, optimalCombo}` — calculé selon la policy de score du niveau (A7 §3). C'est la cible d'« efficacité » de A7 §2 (distance à l'optimum).
- Un niveau dont l'enveloppe max < seuil des étoiles 3 → **config corrigée** (A11 detect) — l'enveloppe révèle les objectifs impossibles.

## 7. Coût & déterminisme

- Cache produit des demandes (niveau identité `{id,version,ruleVersion}` + params) — replayable.
- Déterministe stricte : mêmes entrées → mêmes sorties/rapports (multi-exécution identique).

## 8. Contractuel avec Momo & télémétrie

- Momo (A14) **consomme les sorties du solver** (`shortestSolution`, `alternatives`, `deadEnds`, `scoreEnvelope`) pour étayer ses indices — il ne re-calcule jamais (sémantique unique).
- Un `hint_requested` lie la réponse à un objet solver produit → **chaque indice est explicable**.



D-S1 — le solver d'exécution (runtime) peut être une **version allégée** de la certification (budget court) MAIS même semantique et mêmes règles ; « allégé » = limite de budget/cache, jamais sémantique différente. D-S2 — enveloppe de score porte son niveau de certitude (exact/borné), jamais présenté « définitif » sans label. Opposables.