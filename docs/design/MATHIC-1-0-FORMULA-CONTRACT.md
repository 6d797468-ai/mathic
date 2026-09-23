# MATHIC 1.0 — Contrat A3 : Formula

**Référence** : BRIEF §0, §2, §11, §22 · **Dépend de** : A1, A2 (tuiles) · **Consommé par** : A4, A10, A16 · **Statut** : DESIGN (à valider).

Ce contrat définit **l'expression** que le joueur construit, son évaluation et sa représentation. Le moteur est **déterministe** (exigence §3).

---

## 1. Tokens

Trois tokens, issus de la sélection (A2 §5) :

```
numberA : { kind: "number", value: Integer }   → a
operator: { kind: "operator", value: "+"|"−"|"×"|"÷" } → op
numberB : { kind: "number", value: Integer }   → b
```

Contraintes d'entrée imposées par le board/fixture, re-vérifiées par le formula (fail-fast) :
- `a`, `b` entiers dans bornes kernel ;
- `op ∈ OPS` (A1 §3) ;
- cellules distinctes (vérifiée ici par la référence des 3 tokens, indépendamment de l'UI).

Aucune autre syntaxe V1. **Pas d'expressions arborescentes, pas de parenthèses** : le jeu demande des formules à deux opérandes (décision D-F1, voir fin).

## 2. Expression

- **EXPRESSION** = `a OP b` (triplet ordonné). L'ordre est **celui du joueur** (significatif pour `−`/`÷`, indifférent mais conservé pour `+`/`×`).
- Longueur : **2 opérandes + 1 opérateur, fixe**. La « longueur maximale > 2 » (ex. `(a op b) op c`, parenthèses) est **hors V1** (EXP-3) : simplicité cognitive W1→W10 (BRIEF §5) et contrôle du branching du solver.

## 3. Validation & erreurs

- `validate(expr)` : retourne la liste des violations, vide si valide. Violations (catégories A1 §7) :
  - opérande mal typé / hors bornes · opérateur inconnu · opérandes non distincts ·
  - **évaluation interdite** : `b=0` (÷), `a mod b ≠ 0` (÷), `a − b < 0` (résultat négatif) → voir 4.
- Ce qui est INTERDIT n'est pas « calculé puis ignoré » : c'est un **rejet** (l'expression n'est pas valide), signalé par `validate` → événement `formula_rejected` (A16) → la sélection est annulée, le board intact (A2 §7).
- **POSITION DÉCISIONNELLE** : « rejet » ≠ « échec gameplay ». Le solver modélise les deux : un noeud sans action valide est un **dead end** (A12), pas un crash (A1 §5).

## 4. Évaluation

- `Result = eval(a, op, b)` délègue **exclusivement** au kernel `apply(a, op, b) → r | null` (A1 §4, §5). Aucune autre arithmétique n'existe dans MATHIC.
- `r` : entier dans bornes ; **bornes à l'issue de l'éval** : une expression dont le résultat sortirait des bornes est invalide (`r == null`, catégorie `résultat hors bornes`).

## 5. Coût (coût de l'action)

- Jouer une **formule valide** coûte **1 action** (`moveCount += 1`, A2 §2.3). Le « coût » en ressources est déjà porté par la consommation des tuiles (A4 §3) : **ressources + actions sont les deux factures de la formule**, le score l'enrichit (A7).

## 6. Canonique & égalité

- **Égalité sémantique** (pour le solver) : deux expressions sont « même mathématique » si elles produisent même résultat sur même opérateur et opérandes, modulo l'ordre pour `+`/`×`.
- **Dédup solver de transitions (clé CELLULAIRE, pas valeur)** : pour `+`/`×`, deux actions NE sont dédupliquables que si la **paire non ordonnée de cellules** est identique — le résultat est ancré sur la cellule de l'opérande 1 (A4 §2), donc `(6@c0, ×, 4@c1)` et `(4@c1, ×, 6@c0)` produisent le même état final (paire de cellules {c0,c1}), mais `(4@c0, ×, 6@c1)` — même valeur en _, cellules différentes → **état final différent**, à ne PAS dédupliquer. Le réordonnancement par valeur est réservé à l'ÉGALITÉ de résultat, jamais à la dédup de transitions (conséquence transversale pull — équivaut A4 + A10).
- **Représentation de replay** : triplet ordonné immuable `[a, op, b]` (A1 §7bis) + **positions `(rA,cA),(rB,cB),(rO,cO)`** enregistrées — sans elles, l'ancrage (A4 §2) n'est pas rejouable à l'identique.
- **Représentation pour le solver** (A10) : nœud = état hash `h(state)` + action candidat `[a, op, b]` ; les cellules participent au hash d'état et à la clé de dédup (ci-dessus).

## 7. Déterminisme

- Évaluation pure : pas d'état, pas d'horloge, pas de RNG, pas d'ordre d'itération dépendant du runtime. Deux exécutions du même triplet → même résultat bit à bit (A1 §6, base du replay de tous les contrats).

## 8. Contrat avec les autres modules

- **→ A4** : A4 reçoit une formule **validée + évaluée** (`r` non nul) ; il ne re-valide pas l'arithmétique (responsabilité d'A3), il applique la mutation du board.
- **→ A10** : le solver utilise `validate`+`eval` de l'A3 — la même sémantique, jamais une copie (§14 du mandat : même sémantique mathématique).
- **→ A16** : les événements `formula_created` / `formula_rejected` portent la formule canonique.

---

**D-F1** — Longueur fixe `a op b` (pas d'arbres/parenthèses en V1). Raison : mécanique « plusieurs chemins → conséquences » opère sur les CHOIX de formules, pas sur l'algèbre ; le branching reste geéré par le board. Extension parenthèses = EXP-3. Opposable en validation. **Risque assumé** : la richesse combinatoire repose sur le board (multiples résultats possibles depuis plusieurs paires), pas sur l'expression multi-opérande.