# MATHIC 1.0 — Intelligence Contract : Coach

**Référence** : Feuille de route MATHIC 1.0 §5.E, §9 (Gate G3), §24 · **Consomme** : PlayerProfile, état courant, évidence récente, history · **Consommé par** : UI joueur · **Statut** : CONTRAT (socle Brique 1, opposable).

Le Coach **accompagne sans jouer à la place**. Il arrive après Profile + Progression, jamais avant.

---

## 1. Interface du contrat

```text
Coach
 ├─ explain     (question, contexte) -> Explanation
 ├─ hint        (contexte, niveau d'aide) -> Indice
 ├─ encourage   (contexte) -> Encouragement
 ├─ summarize   (partie/état) -> Résumé
 └─ recommend   (contexte) -> Recommandation
```

Le Coach V1 (Brique 7) implémente ces cinq contrats **sans personnalité IA lourde**.

## 2. Ce que le Coach peut lire

```text
currentLevel     // métadonnées du niveau courant
currentState     // AFFICHAGE de l'état (lecture seule)
recentActions    // évidence d'action
playerProfile    // profil courant
history          // parcours passé
```

## 3. Ce que le Coach ne possède pas

- ❌ **GameState authority** : aucune méthode `apply` / `mutate` / `commit` / `setState`. Le contrat `validateCoach` le garantit.
- ❌ Le pouvoir de changer le score.
- ❌ Le pouvoir de résoudre le niveau à la place du joueur.

## 4. Règle pédagogique

```text
Coach helps thinking.
Coach does not replace thinking.
```

Réponses attendues (Brique 7) :

- « pourquoi cette action n'est pas valide ? » → `explain` fonde l'explication sur les **règles du kernel** (opérateurs, INVOLUTION, divisions exactes), sans trancher la solution.
- « quelles familles de solutions existent ? » → `recommend`/`explain` expose des familles certifiées par le Solver (single-path, multi-path, choix, conséquences), sans jouer le coup gagnant.
- Aides progressives : `hint` monte la dose seulement si demandé (HINT_REQUESTED → HINT_USED).
- `encourage` s'appuie sur l'évidence (échec ≠ jugement) — jamais de mensonge.

## 5. Le Coach est une optimisation, pas une dépendance

```text
AI = optional
Coach = operational
```

- Coach déterministe fonctionnel **sans aucun modèle** (Gate G3).
- Provider IA optionnel = **une** source possible d'explications, via le **Model Adapter** (Brique 8), jamais une condition de fonctionnement.

## 6. Mesures (avec Profile + Evidence, jamais seules)

Tu recul sur le Coach :

- `HINT_REQUESTED` vs `HINT_USED` (adoption réelle) ;
- influence sur `hintDependency` (profil) ;
- état de plateau inchangé (le Coach ne touche pas au board).

---

**D-CO1** — le Coach ne possède jamais le GameState. **D-CO2** — le Coach aide la pensée, il ne la remplace pas. **D-CO3** — Coach opérationnel sans IA ; l'IA reste optionnelle. Opposables.