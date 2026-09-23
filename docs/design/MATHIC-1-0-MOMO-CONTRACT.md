# MATHIC 1.0 — Contrat A14 : Momo

**Référence** : BRIEF §9 (Momo = coach, jamais le cerveau), §22 · **Dépend de** : A1, A10 (solver = autorité), A12 (difficulté), A13 (maîtrise) · **Statut** : DESIGN (à valider).

**Raison d'être** : rendre le joueur meilleur en mathématiques, jamais en « cliquant vite ». Momo est un **coach local, déterministe, hors ligne, explicable** — distinct du moteur de jeu, second au Solver.

---

## 1. Architecture (flux d'autorité — posé de façon stricte)

```
GAME ENGINE (état autoritaire)      ← seul maître de state_after (A4)
    ↓  (état + trace)
SOLVER / RULE SYSTEM (A1+A10)       ← seule autorité mathématique (apply, shortest, alternatives, deadEnds, scoreEnvelope)
    ↓  (faits prouvés)
MOMO                                 ← consomme les faits, ne calcule JAMAIS différemment
    ↓  (politique L1..L5 + maîtrise joueur A13)
EXPLANATION / HINT (UI-agnostique)
```

**Règles non négociables** :
- Momo **ne produit aucune affirmation mathématique qui ne soit dérivable des sorties solver** (chaque indice = `traceable : solverFactId`).
- Momo n'écrit **jamais** dans le GameState (ni board, ni moveCount, ni résultat). Il observe, il explique.
- Momo n'est pas nécessaire pour jouer (la boucle §1 BRIEF tourne sans IA — l'IA ne fait que l'améliorer).

## 2. Ce que Momo peut faire (capacités)

| Action | Source (fact) | Interdit |
|---|---|---|
| contextualiser | position/monde/invariants | — |
| expliquer le résultat | `apply` (A1) | inventer une opération non légale |
| donner un indice | `shortestSolution` / première étape valide | divulguer la solution complète d'emblée (politique L) |
| guider pas à pas | segment de `shortestSolution` masqué progressivement | sauter le raisonnement |
| expliquer une erreur | catégorie d'invalidation A1 §7 (ex. division non exacte) | juger « mauvaise idée » sans raison mathématique |
| proposer une stratégie | `alternatives`, `deadEnds`, `scoreEnvelope` | froisser la multi-solutions (ne jamais imposer « LA solution ») |

## 3. Politique d'aide L1–L5 (mesurée, jamais « la solution » d'emblée)

| Niveau | Indice | Réduction d'aide selon maîtrise |
|---|---|---|
| **L1 léger** | « regarde les deux nombres près du 4 » | maîtrise addition ≥ 80 % → saute L2 |
| **L2 stratégique** | « tu peux obtenir 24 de deux façons » (alternatives ≥ 2) | — |
| **L3 mathématique** | « 6 × 4 produit 24 » (autorité solver) | — |
| **L4 guidée** | « place le 6 avec × puis le 4 » (exécutable) | — |
| **L5 explicative** | « cette solution donne moins de points car pas de chaîne » (enveloppe/score) | — |

- La politique = **fonction pure** `(profil maîtrise A13, difficulté A12, nb erreurs, nb indices déjà donnés, temps) → niveau L`.
- Chaque indice produit l'événement `hint_requested` puis `hint_consumed` (A16) → **mesure de reliance** : la cible asymptotique est le déclin de recours à l'aide (sinon Momo est un GPS, pas un coach).

## 4. Anti-fausse explication (mandat §18)

- **Vérifiabilité** : chaque explication référence un `solverFactId` (résultat `apply`, chemin `shortest`, `alternatives`, `deadEnds`, `scoreEnvelope`). **Aucune phrase n'est émise sans être adossée à un fait solver.**
- **Sécurité descendante** : si une règle avancée entre (expérimental), Momo ne la commente que si le Solver la modélise (A1 §4). Jamais « c'est comme ça » sur une règle que le moteur ne connaît pas.

## 5. Fonctionnement hors ligne

- Momo est **embarqué, local, offline** (BRIEF §9, §20 : pas de backend obligatoire, pas d'IA distante). L'entièreté des capacités (L1–L5) tourne sur la partie déterministe du solver.
- Les modèles d'IA lourds (GGUF etc., hors périmètre) **ne sont PAS requis** pour programmer 1.0 — voir DESIGN-STATUS (offline). Opposable : si un LLM local devait s'ajouter, ce sera une **expérimentation**, jamais chaîne de criticité.

## 6. Contractuel

- **A10** : Momo consomme (`shortestSolution`, `alternatives`, `deadEnds`, `scoreEnvelope`, `apply`) — même sémantique, zéro recalcul.
- **A13** : profil maîtrise → réglage de la politique d'aide.
- **A16** : `hint_requested/consumed` — la télémétrie délivre les stats de reliance (le « GPS vs coach »).
- **A15** : les préférences (fréquence d'indices auto) sont persistées, pas l'historique d'aide en masse.

---

**D-M1** — Momo = coach non indispensable, offline, déterministe, second au solver. **D-M2** — pas de LLM en 1.0 (neutre ; expérimental sinon). **D-M3** — toute explication = fait solver vérifiable. Opposables.