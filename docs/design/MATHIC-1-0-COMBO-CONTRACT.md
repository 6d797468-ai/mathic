# MATHIC 1.0 — Contrat A6 : Combo

**Référence** : BRIEF §3 (cause mathématique uniquement), §4 (arbitrage), §22 · **Dépend de** : A5 (chaîne), A8 (objectifs) · **Consommé par** : A7, A10, A16 · **Statut** : DESIGN (à valider).

Un combo n'est **jamais décoratif**. Il est déclenché exclusivement par des **événements mathématiques** ; ses coefficients restent **configurables** jusqu'à l'équilibrage (simulation + test humain) — aucun chiffre ici n'est définitif.

---

## 1. Événements déclencheurs (cause mathématique)

| Trigger | Condition (événement mathématique) | Exemple concret |
|---|---|---|
| **REUSE** | le résultat d'une transformation est réutilisé comme opérande (chaîne, A5 §3) | `6×4=24` puis `24−8=16` |
| **TARGET** | le résultat produit **exactement** la valeur objectif | `48` produit → objectif touché |
| **EFFICIENCY** | le résultat atteint la cible en profondeur ≤ optimum solver (enveloppe A10 §6) | `12×4=48` en 1 action alors que c'était 1 |
| **DIVERSITY** | combiner un opérateur **non encore utilisé** dans la partie | première utilisation de `÷` |
| **CLOSURE** | **toutes** les tuiles utilisées dans une chaîne parvenant à l'objectif (toutes consommées, résolution nette) | chaîne qui refond intégralement un underboard |

Chaque trigger est **libellé** en termes purs : `combo = {events[]}`. Validez TOUJOURS la règle : « ce combo peut-il être expliqué sans mots flous ? ». Si la réponse est non → pas de combo.

## 2. Déclenchement

- Évaluation **après transformation valide** (A4), sur `state_after` ; jamais pendant une animation (bien que l'événement puisse être affiché en surimpression — l'affichage est un effet, pas un constituant).
- **Multi-déclenchements possibles en une action** (ex. REUSE + TARGET) : chaque trigger s'empile dans le combo courant (pas de collision).
- **SEULE RÈGLE D'INTERRUPTION** : la fin du niveau (solved/failed) ou `undo` (recalcul déterministe de la trace). Une action qui n'engendre aucun trigger **n'interrompt pas** le combo courant (il retombe à sa valeur de maintien, voir 4).

## 3. Multiplicatif & borne

- `comboMultiplier` = produit des `coef[trigger]` de la **séquence en cours**, plafonné `maxComboMultiplier` (par niveau, défaut 4×, configurable).
- `coef[REUSE]=1.1, coef[TARGET]=1.25, coef[EFFICIENCY]=1.5, coef[DIVERSITY]=1.1, coef[CLOSURE]=2.0` — valeurs **proposées** testables en simulation, PAS définitives (obligation §10 du mandate : « Ne pas prétendre qu'une valeur numérique est définitive sans simulation et test humain »).

## 4. Interaction chain / combo

- **CHAÎNE alimente le combo** : c'est le moteur d'accumulation (REUSE) + les trucs DE chaîne. **Combo ≠ chaîne** :
  - chaîne = propriété structurelle (dépendance de résultats, A5) ;
  - combo = propriété de récompense (multiplicateur, événements math PATAT).
- Aucun « COMBO ×4 » sans que 4 événements justifiés se soient produits.

## 5. Interaction avec le score

- Le multiplicateur `comboMultiplier` **applique** une mise à l'échelle au score de la transformation courante (DÉRIVé §7). Le score total d'une partie = Σ(score_n × comboMultiplier_n) (si policy additive) — la **policy exacte relève d'A7** (additive vs multiplicative sont expérimentales).
- Le combo n'introduit **aucun nouvel état de jeu** : il est un **dérivé recalulable** de la trace (même principe que A5 §6).

## 6. Limites & équilibrage

- Plafond `maxComboMultiplier` — pour empêcher l'inflation/farm (un seul trigger n'est pas « le combo »).
- Test de domination (mandat §25) appliqué au combo : si une stratégie produit un REUSE en boucle infinie sans autre sens → le déclencheur est re-examiné (la boucle `8−5=3, 3+5=8, 8−5=3` : legal ops mais chaîne `8-5=3` nuit à la rareté → Verified par A11, pas de combo sur cycle trivial : exclusion explicite `CYCLE`).
- `TARGET`/`EFFICIENCY` uniquement sur les niveaux avec objectif de valeur.

## 7. Contractuel

- **→ A10** : le solver modélise les comboOpportunities d'un niveau (« combien de triggers math réalisables » → section scoreEnvelope). 
- **→ A16** : `combo_started` (evénement + newMultiplier), combos recalculables depuis la trace.
- **Config** : un **objet comboConfig** par niveau (A9 `scoreConfiguration`), éditable sans recompile → équilibrage pur data.

---

**D-CO1 — PLUSB de cause mathématique** : pas de time-based combo streaks en 1.0 (EXP-7 déjà cité). Opposable.
**Anti-gaming** : les **cycles triviaux** (`a b a` rentréeturn) sont détectés par A11 (stratégie dominante §25) et exclus des combos — un par niveau certifié.