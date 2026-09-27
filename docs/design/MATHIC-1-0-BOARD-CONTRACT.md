# MATHIC 1.0 — Contrat A2 : Board

**Référence** : BRIEF §2, §22 · **Dépend de** : A1 (kernel) · **Consommé par** : A3, A4 · **Statut** : DESIGN (à valider).

Ce contrat décrit le **plateau** nécessaire à MATHIC 1.0. Décision de conception assumée : **le plateau est le support des carreaux-nombres ET des carreaux-opérateurs** (lecture littérale du BRIEF §2 : « des nombres … et des opérateurs »). Rien n'est hérité du placement du laboratoire B (interdiction §1 du mandat). Les variantes (palette d'opérateurs illimitée, réserve, next) sont en **Experimental Zone** (§23).

---

## 1. Définitions

- **BOARD** : grille rectangulaire `W × H` (W, H entiers ≥ 1, fixés par le niveau), indices `(row, col)`.
- **CELLULE** : `EMPTY` ou un **TILE**.
- **TILE** : `{kind, value}` :
  - `kind = "number"` : `value` entier dans bornes kernel (§2 A1).
  - `kind = "operator"` : `value ∈ {"+","−","×","÷"}`.
- **STATE (board state)** : matrice des cellules + **compteur d'actions** (moveCount) + **phase** (`playing | solved | failed | idle`).

## 2. Invariants structurels (vérifiés par validation, fail-fast)

1. Grille strictement rectangulaire ; aucune cellule manquante.
2. Types de tuiles fermés : `number` | `operator` | absent.
3. `moveCount ≥ 0`, incrémenté d'exactement 1 par **action valide** (§4 A4). Une action rejetée n'incrémente RIEN.
4. Aucune valeur hors bornes kernel dans le board (contrôle à la construction de chaque tile).
5. Pas de tuile « fantôme » : toute tuile a une cellule unique ; une cellule a au plus une tuile.
6. Prime : aucun état illégal — le board ne se met jamais dans un état non constructible par validations+règles.

## 3. Opérations sur le board (primitives atomiques)

Fixture V1 (fixées, synchrones, sans animation — l'UI n'est pas partie prenante) :

- `cell(r, c) → tile | null`
- `placeNumber(r, c, v)` : pose une tuile `number` dans une cellule `EMPTY` (utilisée par la **construction de niveau** et le **placement du résultat** A4).
- `focusTile(r, c) → selectionState` : met à jour la **SÉLECTION** (3.5).
- `markSolved(r, c)` (serveur d'affichage ; phase → `solved`).

**Explicite NON-gérées V1** (hors board contract, à trancher dans l'Experimental Zone) : **déplacement** de tuiles (ex. swap/glisse), **suppression** volontaire par le joueur (hors résolution), **génération** de nouvelles tuiles en cours de partie (la disappearance des tuiles consumées est la seule option ; sinon le board remonte : chaînes limitées par les ressources → ce qui crée la semi-déplétion DOIT être certifiée par le solver, pas compensée par du remplissage RNG).
- `EMPTY` de tuiles : V1 sans regénération RNG → un niveau dont le solver certifie l'insuffisance de ressources devient `failed`/mort-né à la certification. (Régle de déterminisme : jamais d'aléatoire dans le board en cours de partie.)

## 4. Contenu du board (qui fournit les tuiles)

- À la construction, le board contient : les **numbers** fournis par la spec de niveau + les **operators** de `availableOperations` (en nombre suffisant pour la solution certifiée + slack). Le contenu exact est défini par le **Level Contract (A9)** et **garanti par le Solver (A10)/certification (A11)**.
- **Aucune règle du board ne dépend de l'UI** (BRIEF §11). Le board n'a pas d'état visuel (pas d'animation, pas de highlight).

## 5. Sélection

- La **SELECTION** est une fonction du temps de partie : `sel = { numberA: cell?, operator: cell?, numberB: cell? }`. Elle n'a PAS de sémantique sur le board — elle est un vocabulaire d'intention que l'UI/la boucle de jeu remplit.
- Règles de sélection V1 :
  - on sélectionne jusqu'à **deux tuiles number** et **une tuile operator** ;
  - les cellules sont **distinctes** (une tuile ne peut pas être sélectionnée deux fois) ;
  - sélection d'une tuile vide → interdite ; sélection d'une tuile déjà sélectionnée → la désélectionne (toggle) ;
  - sélectionner VOIR opérateur valide → ect.

- **Sélection seule ne modifie JAMAIS le board** (pas de consume au survol). La consommation n'a lieu qu'au `submit`.

## 6. Voisinage

- Aucune contrainte d'adjacence en V1 : deux tuiles peuvent être combinées où qu'elles soient (éclaté de décisions, pas de placement). La « voisinage » (placement, voisinage contraint) est **expérimentale** et ne contraint pas la mécanique.

## 7. Occupation & épuisement

- Le board voit son occupation **décroître** à chaque transformation valide (`3 tuiles → 1 résultat`).
- **ESSAI D'ACTION ILLÉGALE** (A3/A4) : rejet, aucune tuile consommée, `moveCount` inchangé, événement `formula_rejected` (A16).
- Niveau terminal : si `moveCount ≥ moveLimit` avant victoire → **failed** (évalué par A8, exécuté par game-state).

## 8. Contractuel avec le reste

- **→ Formula (A3)** : le board fournit les 3 tuiles sélectionnées sous forme de tokens ; A3 les évalue uniquement (aucun mutation).
- **→ Transformation (A4)** : A4 consomme/dépose à partir de l'état board décrit ici (`state_before + action = state_after`).
- **→ Game State** : le board EST la moitié de l'état de jeu (l'autre étant enveloppe score/obj/selection). Hilbert (v) — voir EXP-1.

---

**Décisions de design affichées (tout en bas, à confirmer ou s'y opposer à la validation architecturale) :**
- **D1** : operators = tuiles sur le board (pas de palette illimitée). Conforme BRIEF §2. Conséquence : rareté → « conséquences différentes ». Variante palette → EXP-2.
- **D2** : pas de regénération RNG en cours de partie → déterminisme strict, certification par le solver.
- **D3** : pas de contrainte de voisinage en V1.
- **D4** : sélection ≠ modification d'état ; seul `submit` d'une formule valide consomme.