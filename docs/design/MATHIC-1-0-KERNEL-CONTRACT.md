# MATHIC 1.0 — Contrat PHASE 1 : Math Kernel

**Référence** : `docs/design/MATHIC-1-0-BRIEF.md` §11, §22 · **Statut** : CONTRAT DE CONCEPTION (à valider avant implémentation) · **Date** : 2026-09-23.

Le présent document est le **contrat formel du noyau mathématique** de MATHIC 1.0. Il précède tout code (règle de cadrage : *aucun code avant design validé*). Il reprend et durcit les sémantiques déjà prouvées en lab (`lab/gameplay/lib/oprel.mjs`) en les étendant aux besoins du gameplay produit (formulæ, bornes, déterminisme de replay).

---

## 1. Périmètre & responsabilité

Le **Math Kernel** est la seule autorité arithmétique du jeu :
- Il définit les opérateurs, leur sémantique exacte, les invariants numériques.
- **Il ne connaît pas** : l'UI, les actions tactiles, le GameState, l'IA, la persistance (§15 BRIEF : MATHEMATICS ≠ GAMEPLAY ≠ UI).
- **Il ne prend jamais de décision de gameplay** (ne résout pas, ne valide pas un niveau, ne mesure pas la difficulté).
- Il est **pur, déterministe, dépendance zéro**.

Contrat de sortie PHASE 1 : l'arithmétique est formalisée + unimplemented-tests de contrat rédigés (le code est l'implémentation de CE document, pas l'inverse).

## 2. Domaine arithmétique

V1 = **entiers exacts**, bornés.

- Valeurs possibles (cases, résultats intermédiaires, cibles) : `Integer`, avec borne configurable par niveau :
  - `VALUE_MIN = -1024`, `VALUE_MAX = +4096` (défaut produit ; un niveau peut resserrer ces bornes SANS les élargir — interdiction d'élargir pour éviter 2048-inflation et overflow).
- **Aucun flottant** : pas de `IEEE-754`, pas de `0.1 + 0.2`, pas d'arrondi. La seule représentation autorisée est `Integer` natif (JS) ; toute construction de valeur passe par l'arithmétique entière exacte.
- Interdiction d'exporter un résultat hors bornes depuis le kernel (voir §5). Un état qui demanderait un résultat hors bornes est une **action invalide**, pas un calcul autorisé.

## 3. Opérateurs

Table des opérateurs V1 (fermée) :

```
+ : (a, b) → a + b                    [associatif-commutatif]
− : (a, b) → b ≠ a ? a − b : null     [non commutatif ; V1 : valeur strictement négative refusée → null]
× : (a, b) → a × b                    [associatif-commutatif]
÷ : (a, b) → (b ≠ 0 ∧ a mod b = 0) ? a ÷ b : null   [non commutatif ; division exacte exigée]
```

Sémantiques héritées du lab (`oprel.mjs`) **conservées à l'identique** (validées par mesure V5) : soustraction non signée (`a − b ≥ 0` sinon null), division nulle refusée, division entière exacte obligatoire. Aucun changement de sémantique sans re-certification.

## 4. Évaluation : formule, expression, transformation

Terminologie (partagée par tous les contrats suivants) :

- **TILE = valeur entière | opérateur | marqueur cible ?** (le contenu fini du plateau est du ressort PHASE 2 ; le kernel n'évalue que des paires).
- **EXPRESSION** = `a OP b` — deux opérandes entiers + un opérateur. Le kernel n'est PAS un parseur d'expressions arborescentes en V1 (pas de priorité d'opérateurs à gérer : le joueur construit des formules à deux opérandes).
- **TRANSFORMATION** = `apply(a, op, b) → r | null`. C'est L'unité arithmétique unique du kernel.
- **RÉSULTAT** `r` : entier dans les bornes (§2) ou `null` (opération interdite : `b=0`, division non exacte, résultat négatif, hors bornes).

Contrat de pureté : `apply` ne modifie aucun état d'entrée ; mêmes entrées → mêmes sorties (déterminisme total, y compris pour les cas `null`).

## 5. Invariants de sûreté (le kernel ne ment jamais)

1. `apply(a, op, b)` ne **jette jamais** : il retourne `r` ou `null`.
2. `null` signifie « opération non valide » — jamais « erreur interne », jamais `NaN`, jamais `undefined`, jamais `Infinity`.
3. Toute valeur émise par le kernel est un entier vérifiant `VALUE_MIN ≤ v ≤ VALUE_MAX`.
4. `÷ a b` avec `a mod b = 0` : quotient exact par construction (aucune perte).
5. Le kernel est **idempotent à l'évaluation** : évaluer deux fois le même couple fournit le même résultat (base du `replay`, §6).

## 6. Déterminisme & replay (base de tous les contrats runtime)

Le replay MATHIC 1.0 repose SUR le kernel :
- Toute séquence `[tileA, op, tileB]` jouée produit une **trace** `(id, a, op, b, r, seedÉtat)` immuable.
- Deux replays d'une même trace **doivent** produire deux états identiques bit à bit. Le kernel ne dépend d'aucun générateur aléatoire, d'aucun horodatage, d'aucune entrée utilisateur.
- Canonicalisation : `(a, op, b)` est canonique dans sa représentation de trace (ordre des opérandes figé par le calcul, pas par l'UI).

## 7. Bornes & messages d'échec (contrat de contrat)

Toute violation s'écrit en erreur explicite et précède l'exécution :
- `opérateur inconnu` : systématique au chargement d'une spec/contenu (§7 du BRIEF, fail-fast), jamais au runtime.
- `opérande non entier` · `diviseur nul` · `division non exacte` · `résultat négatif` · `résultat hors bornes (±)` : catégories d'invalidation fixes, réutilisées par le Solver (§12 BRIEF) pour expliquer pourquoi une route est morte.

## 7bis. Sérialisation & représentation canonique

Le kernel définit la représentation EXTERNE de toute valeur/trace qu'il émet (les contrats runtime l'utilisent telle quelle) :

- **VALEUR** : entier pur (décimal, pas d'exposant). Sérialisation JSON = nombre entier ; les bornes s'appliquent à la lecture (un `4097` ou un `3.14` en entrée = spec invalide, fail-fast).
- **ACTION (trace)** : triplet ordonné canonique `{"a": int, "op": "+|−|×|÷", "b": int}`. L'ordre `(a, b)` est celui du calcul — pour `+`/`×`, l'ordre positif-petit-d'abord est canonique au niveau SOLVER (A10) ; au niveau PLAYER, l'ordre joué est conservé tel quel (le joueur choisit).
- **RÉSULTAT** : `r` entier dans bornes, ou le littéral `null` (action invalide). Jamais d'objet d'erreur dans la sortie d'évaluation.
- Règle de vessie : toute valeur lue depuis une persistance ou un niveau passe par le kernel §5 avant usage (∞/NaN/flottant = corruption).

## 8. Contrats descendants (ce que PHASE 2+ consommera)

Le kernel expose la sémantique **définie**, pas des helpers d'état. Les contrats suivants consomment :
- `apply(a, op, b) → r | null` (PHASE 3 Transformation Engine).
- Les invariants §5 (PHASE 7 Objectives : une cible hors bornes est une spec invalide).
- Les bornes (PHASE 5 Combo / 6 Score : un dépassement de borne est un échec d'action, pas un malus).
- Le déterminisme (tous les contrats runtime, replay, certification §12).

Hors périmètre PHASE 1 (à cadrer par leurs propres contrats) : plateau/état, transformations successives, chaîne, combo, score, objectives, solver, simulation.

## 9. Plan de vérification (tests de contrat)

1. Table d'opérateurs : chaque paire `(a, op, b)` dans une table d'équivalence → résultat attendu (pulvérisation : positifs/négatifs/zéro, division exacte et non, zéro diviseur, bornes).
2. Déterminisme : 100 exécutions d'une trace → 100 états identiques.
3. Anti-règles : jamais de `NaN/Infinity/undefined` ; `apply` ne lève jamais ; aucune dépendance hors module.
4. Économie des bornes : résultats à exactement `VALUE_MIN`/`VALUE_MAX` acceptés, `±1` au-delà → `null`.
5. Cohérence sémantique vs lab : `eval2` du lab et `apply` identiques sur le domaine partagé (suite de la chaîne de preuves V5).

## 10. Anti-règles du kernel

- ✗ jamais de flottant, ✗ jamais de `Math.random`, ✗ jamais de mutation d'entrée, ✗ jamais d'I/O, ✗ jamais de connaissance d'un « niveau », d'un « objectif », d'un « joueur ».
- ✗ aucune règle dépendant de l'interface (tactile, animations) — §11 BRIEF.

---

*À valider par la revue architecte avant implémentation. Post-validation, l'implémentation se conforme à CE document ; toute divergence = bug de contrat, pas décision d'implémentation.*