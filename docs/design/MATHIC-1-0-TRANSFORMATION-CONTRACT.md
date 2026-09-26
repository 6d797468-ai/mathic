# MATHIC 1.0 — Contrat A4 : Transformation

**Référence** : BRIEF §2, §3, §22 · **Dépend de** : A1, A2, A3 · **Consommé par** : A5, A6, A8, A10 · **Statut** : DESIGN (à valider).

Ce contrat définit la seule mutation d'état du jeu et son **invariant reproductible** :

```
state_before + action = state_after
```

---

## 1. Chaîne de définition (le flux exact)

```
Input State (A2 §1)
    ↓
Player Action   = sélection complète {numberA-cell, operator-cell, numberB-cell} (A2 §5)
    ↓
Formula         = a OP b (A3 §1–2), validée + évaluée → r (ou null)
    ↓
Evaluation      = apply(a, op, b) → r | null  (A1 §4)  [délégation exclusive au kernel]
    ↓
Transformation  = mutation du board définie en §2 (uniquement si r ≠ null)
    ↓
New State       = board + moveCount+1 + phase (A2)
```

- Si `r == null` (formule invalide) : **pas de transformation**. La flèche s'arrête. `state_after ≡ state_before` ; événement `formula_rejected` (A16) ; `moveCount` inchangé.
- Si `r` valide : transformation appliquée, puis **évaluation objective** (A8) et **évaluation score** (A7) en dépendances amont.

## 2. Règles de mutation (uniques et complètes)

Soit `A` la cellule du 1er opérande, `O` la cellule de l'opérateur, `B` la cellule du 2e opérande.

1. `A` reçoit une tuile `{kind:"number", value: r}` — **ancrage** : le résultat prend la place du 1er opérande (pas de « spawn » aléatoire, pas de cellule libre requise).
2. `O` devient `EMPTY` (consommation de l'opérateur).
3. `B` devient `EMPTY` (consommation du 2e opérande).
4. Aucune autre cellule ne change ; l'ordre des étapes 1→3 est sans effet observable sur `state_after` (le résultat final est unique → reproductible) ; l'**évaluation objective** (A8) se joue après l'étape 3 (l'état vérifié est `state_after` complet).

Pertinence (décisions) :
- **D-T1 — ancrage sur l'opérande 1** : choix délibéré pour la prévisibilité visuelle et le determinisme du replay (le « où » du résultat n'est jamais ambigu). Variante « placement libre » → EXP-4.
- **D-T2 — trois tuiles consumées → une résultat** : le board décroît de 2 ; la profondeur de chaîne (A5) est bornée par les ressources et certifiée (A10/A11). C'est la matérialisation comptable de « conséquences différentes par choix ».

## 3. Consommation (facture en ressources)

La transformation consomme : **2 nombres + 1 opérateur** (contenu du niveau A9). Le résultat **réinjecte 1 nombre**. Effets composés (à mesurer §17) :
- choix court `12 × 4 = 48` : consomme 12,4,× → émet 48. La tuile 48 peut servir une chaîne ou être l'objectif.
- choix long `96 ÷ 2 = 48` : consomme 96,2,÷ → émet 48 (densité de décision et rareté opérateur différentes).
→ L'inégalité des conséquences repose sur : payer des opérateurs rares, brûler des nombres utiles, produire un nombre exploitacle.

## 4. Invariants (reproductibilité)

1. `applyTransformation(action, state) → state'` est une **fonction pure** : mêmes inputs → même état, bit à bit.
2. `state_after` vérifie les invariants du board (A2 §2) : rectangle, tuiles typées, bornes, bijection cellule↔tuile.
3. Chaque transformation correspond à **1 action** comptée (`moveCount = moveCount_before + 1`).
4. Le **replay** (A1 §6) d'une trace `[action₁…actionₙ]` reproduit exactement les états successifs — c'est la PRÉCONDITION du rembobiner en temps différé de la télémétrie (A16) et du debug de certificacion.
5. **Atomicité** : soit la transformation complète a lieu, soit rien (jamais d'état « moitié »). Rejet = nothing (pas de consommation partielle). → reflet de `formula_rejected`.

## 5. Catégories d'action de même type dans le solver

Le solver (A10) n'utilise PAS cette mutation (qui est du domaine exécution) : il utilise les règles du kernel (A1) appliquées modélisément au hash d'état pour la recherche (§11 A10). Distinction propre (§14 du mandat) : **même sémantique mathématique, systèmes distincts**.

## 6. Ce qui N'EST PAS une transformation

- `undo`/`redo` : hors transformation — opération méta portée par game-state/runtime (A15 pour persistance de reprise). Annulé/rejoué → chaîne recalculée (A5 §5).
- Le déclenchement d'un combo/score/étoile N'est pas une transformation (dérivés observés, jamais déclencheurs).

---

**D-T1 / D-T2** : ancrages à valider en revue (opposables). Conséquences chiffrées prévues au A11/A12 (branchement du solver dessus).