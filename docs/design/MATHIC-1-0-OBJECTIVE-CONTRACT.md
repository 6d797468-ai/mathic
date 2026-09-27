# MATHIC 1.0 — Contrat A8 : Objectif

**Référence** : BRIEF §6 (niveau = équation de contraintes), §16, §22 · **Dépend de** : A4, A5 · **Consommé par** : A7, A9, A10, A11 · **Statut** : DESIGN (à valider).

Chaque objectif est classé **Validated / Experimental / Deferred**. La distinction n'est pas cosmétique : **seul un objectif Validated fait partie du cœur de gameplay et du slice initial** ; les autres passent par l'Experimental Zone avant inclusion.

---

## 1. Classification (décision structurante)

| Objectif | Statut | Justification |
|---|---|---|
| **atteindre la valeur cible `target`** (une tuile `number == target` sur le board) | ✅ **VALIDATED** | cœur du BRIEF §2–6 ; compréhensible au test décisif (§19) |
| **limite de coups `maxMoves`** | ✅ **VALIDATED** | contrainte de ressources fondamentale (conséquence des choix) |
| **opérateurs autorisés `allowedOperators`** | ✅ **VALIDATED** | pédagogie par monde (BRIEF §5), contrôle de complexité |
| **seuil de score `minScore`** | 🧪 **EXPERIMENTAL** | dépend d'A7 (coeffs pas encore calibrés) → hors slice jusqu'à calibration |
| **chaîne ≥ k `minChain`** | 🧪 **EXPERIMENTAL** | le plafond dépend du board (A5 §4) → à certifier (bornes, A11) |
| **combo ≥ k `minCombo`** | 🧪 **EXPERIMENTAL** | lié à A6 (coefficients) → après calibration |
| **multi-objectifs simultanés** | 🧪 **EXPERIMENTAL** | combinaison d'objectifs ci-dessus validés à la fois — mécanique prometteuse (BRIEF §6) à valider en sim |
| opérateurs spéciaux / règles (×=DOUBLE…) | ⏰ **DEFERRED** | règles avancées BRIEF §10 → extension, jamais V1 |
| objectifs « temps », « parfait (0 erreur) », « sans combo »… | ⏰ **DEFERRED** | variantes, hors 1.0 |

## 2. Sémantique Validated (cœur V1)

### 2.1 Objectif de cible `target`
- Évaluation : **après chaque transformation valide**, `∃ tuile number == target sur le board (state_after)` → condition `satisfied = true`.
- Le `target` peut être atteint **transitoirement** et consommé ensuite (chaîne) : seule importe l'existence à l'évaluation ; passer à coté et re-consommer = intentionnel (conséquence).
- `target` doit être **atteignable** depuis le board initial (certification A11). Hors bornes kernel, spec invalide (§2 A8 via A1).
- Un niveau **peut** viser à produire un target qui édait DÉJÀ sur le board **initially**? → **non** (anti-trivialité : niveau trivial détecté A11 §26 mandat).

### 2.2 Contrainte `maxMoves`
- `moveCount` incrémente par transformation **valide** (A2 §2.3). Si `moveCount > maxMoves` **à la fin d'une action** → **failed** (les actions rejetées ne comptent pas).
- Le solver **garantit** une solution ≤ `maxMoves` (A10 → A11). `maxMoves` comprend des coups « de création » (préparer 24 pour atteindre 48) : borne solver-naturelle.

### 2.3 `allowedOperators`
- Restreint `OPS` utilisables (A3 §1). Un `×` du board avec opérateur non autorisé → **ne peut pas être sélectionné** (tuile intouchable, visible). 
- Toute spec qui donne un opérateur non autorisé en tuile → spec invalide **fail-fast** (A1 §7).

## 3. Victoire & échec (prédicats purs)

- **VICTOIRE** = toutes les conditions de la liste `objective.conditions` sont `satisfied` au même instant d'évaluation (cyclicé après transformation). → `phase = solved`, événement `level_completed`.
- **ÉCHEC** = `moveCount > maxMoves` sans victoire. → `phase = failed`, `level_failed`.
- Pas d'échec « hors temps » : dans une partie **sans dead end [dead-end]**, l'absence de coup valide (board sans action valide restante) → **bloqué** : c'est un état terminal `blocked` (le jeu le signale comme « plus de coup valide », le solver l'avait prévu : dead ends A12 §3). `blocked ≠ failed` : le joueur peut `undo`/recommencer (A13). → décision DE1 à valider.

## 4. Interaction avec transformations

- Les objectifs lisent `state_after` et la **trace** (pour chaîne/combo), jamais un instantané d'UI.
- **Zéro effet de bord** : satisfaire un objectif ne modifie pas le board (pas de « auto-clear » de la tuile cible). C'est le joueur qui décide d'arrêter ou continuer pour scorer plus (arbitrage RAPIDITÉ vs SCORE, BRIEF §3).

## 5. Contractuel solver/certification

- A10 modélise un état but : états où `allConditions(state, trace) = true` + contrainte `moveCount ≤ maxMoves`.
- A11 certification : (a) solvable (∃ chemin valide ≤ maxMoves), (b) target atteignable, (c) pas trivial (§26 mandat), (d) pas de domination (§25).

## 6. Échec cognitif & anti-piège

- Le niveau qui rend l'objectif incompréhensible = **NO-GO** au test humain (G7). Le `target` est toujours affiché (gros chiffre), `maxMoves` toujours visible (compteur), `allowedOperators` toujours visible (ce qui est utilisable).
- Les **impératifs de Momo** (A14) peuvent appuyer la compréhension de l'objectif (L1 « regarde le 48 »), sans jamais le remplacer.

---

**D-O1 — blocked ≠ failed** : un état sans coup valide est `blocked` et rejouable (pas de punition). Opposable (variante : blocked = counted as failed). Impact certification : la solution est-elle toujours trouvable sans passage par un dead-end bloquant ? (c'est le pivot du test de faisabilité A11 §6).