# MATHIC 1.0 — Contrat A5 : Chain

**Référence** : BRIEF §3 (Chaînes), §22 · **Dépend de** : A4 · **Consommé par** : A6, A7, A8, A10, A16 · **Statut** : DESIGN (à valider).

Une chaîne est une **propriété du gameplay** (relation entre transformations successives), pas une animation.

---

## 1. Définitions

- **CHAÎNE** = suite de **transformations valides consécutives** où le **résultat de la transformation N est utilisé comme opérande** (position 1 OU 2) d'une transformation **N+1** valide.
- **chainLength** = nombre de transformations consécutives satisfaisant cette dépendance. `chainLength ≥ 1` dès la première transformation valide (une suite sans dépendance est de longueur 1 : elle n'est pas une « chaîne » au sens de réutil, elle est un **enchaînement simple** — voir 3).
- **CHAÎNE ACTIVE** : maximise-value à l'instant d'observation (niveau = longueur courante, sans coupure).

## 2. Ce qui démarre / maintient / casse

| État | Événement | Effet |
|---|---|---|
| chainLength | première transformation valide | 1 |
| **maintient** | transformation valide dont le résultat prédédent est opérande | +1 (feed-forward du résultat) |
| **casse** | transformation valide qui n'utilise PAS le résultat précédent | redémarre à 1 (nouvelle chaîne) |
| casse | `undo` | chaîne recalculée depuis la trace sans la transformation annulée (déterministe) |
| casse | action rejetée (`formula_rejected`) | chaîne **courante intacte** (rejet ≠ coupure ; pas de consomation) — décision volontaire |
| termine | objectif atteint / niveau terminé | chaîne figée = valeur finale, enregistrée (A7 §4, A13 récompense étoile ✓ chaîne) |

- **Aucune fenêtre temporelle** : jeu au tour, déterministe (BRIEF §4 options/actions). Le temps ajouterait du RNG/perceptif : **EXP-7** (chrono) — réservé aux modes futurs, jamais par défaut 1.0.

## 3. Dépendance entre transformations (précision)

- La dépendance est vérifiée sur **valeur + identité de tuile** : `result_N` (la tuile posée en ancrage par A4 §2) doit être **sélectionnée comme opérande** de la transformation N+1. Deux transformations qui produisent la même valeur mais par deux tuiles ≠ ne **continuent PAS** la chaîne (pas de chaîne « fantôme »).
- Conséquence comptable : une chaîne est une suite **réfrye**, encodable comme `[(action₁, anchor₋reuse), (action₂, …)]`. → trace chaîne = sous-séquence de la trace de partie (A1 §7bis).

## 4. Longueur & bornes

- `chainLength` plafonné par les ressources du board (chaque maillon consomme 3 tuiles, produit 1) : `< boardN` excelsior. Le Solver (A10) calcule la **chaîne maximale atteignable** et la **chaîne optimale** (borne de certification, A11).
- Un niveau exprimant un objectif « chaîne ≥ k » (A8 experimental) doit avoir `k ≤ borneSolver` sinon **non certifiable** (A11 → NO-GO ou re-spec).

## 5. Relation avec score & objectifs

- **Score (A7)** : la chaîne alimente un **composant chain** (défini A7 §2). Plus longue → composant plus grand (coefficient configuré, expérimental).
- **Objectifs (A8)** : une **condition chaîne** (chaîne ≥ n lors de la victoire) est un objectif expérimental ; son évaluation lit la chaîne finale certifiée par A5, jamais un instantané décoratif.
- Télémétrie (A16) : `chain_started`, `chain_extended` (portée valeur longueur), événements purs.

## 6. Contractuel

- Note constitutive : **une chaîne ne change jamais l'état seul** — elle est un **dérivé observé** de la trace. On peut la recalculer de zéro depuis `(state_before, actions)` (pure fonction). C'est la propriété qui rend l'ensemble : board, formula, transformation, chain, combo rejouables à l'identique (A1 §6).
- Rappel STOP : chainLength expérimental (valeur seuils) → voir DESIGN-STATUS §23 + A8.

---

**D-C1 — rejet ≠ coupure** : une formule invalide n'interrompt pas une chaîne (le joueur qui tatonne en début de coup ne casse pas sa construction). Opposable. Le solver modélise « candidat valide » pour la recherche ; le rejet n'existe que dans la partie humaine.