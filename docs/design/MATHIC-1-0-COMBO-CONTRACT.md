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

**ATENTION — taxonomie ≠ seuil** : ces **5 types** de trigger constituent la **taxonomie initiale d'étude**, réductible après mesure (un trigger jamais utilisé ou systématique sera supprimé/redéfini). Le **seuil du combo** (`comboThreshold §2`) est une décision NUMÉRIQUE indépendante, expérimentale.

## 2. Déclenchement & seuil configurable

- Évaluation **après transformation valide** (A4), sur `state_after` ; jamais pendant une animation (bien que l'événement puisse être affiché en surimpression — l'affichage est un effet, pas un constituant).
- **Multi-déclenchements possibles en une action** (ex. REUSE + TARGET) : chaque trigger s'empile dans le combo courant (pas de collision).
- **`comboThreshold = N`** : nombre de trigger-events cumulés requis pour que le multiplicateur passe au **palier supérieur**. N est **configurable par niveau** (`constraints.comboThreshold`) ; **la valeur initiale 5 est EXPÉRIMENTALE — jamais un invariant**. Les paliers {3,4,5,6} seront comparés en simulation + playtest (fréquence, compréhension, inflation de score, intérêt, longueur de chaîne, impact progression — mandat §8) avant toute fixation.
- **Accumulation monotone (règle précisée)** : le multiplicateur ne **retombe jamais** au sein d'un niveau — il reste constant si aucune action n'engendre de trigger, il croît à chaque palier franchi au-delà de `comboThreshold`. Les seuls resets : **fin de niveau**, **`undo`** (recalcul déterministe de la trace), **recommencer**. (La phrase « il retombe à sa valeur de maintien » est annulée : ambiguë, remplacée par cette règle.)

## 3. Multiplicatif & borne

- `comboMultiplier` = fonction **monotone non décroissante** de `eventsCumul` (cumul de trigger-events depuis le début du niveau), selon le modèle à paliers : `comboMultiplier = min(maxComboMultiplier, stepMultiplier^⌊eventsCumul / comboThreshold⌋)`. Paramètres : `comboThreshold` (initial 5 — EXP), `stepMultiplier` (initial 1.1 — EXP), `maxComboMultiplier` (défaut 4×, configurable). Tout paramètre est éditable sans recompile (A9 `scoreConfiguration`).
- `stepMultiplier`, `comboThreshold`, `maxComboMultiplier` et la forme de la fonction — valeurs **proposées** testables en simulation, PAS définitives (obligation §10 du mandate : « Ne pas prétendre qu'une valeur numérique est définitive sans simulation et test humain »). La **forme exacte de `comboMultiplier`** peut être révisée par le même process (palier, produit, autre) si les mesures l'imposent.

## 4. Interaction chain / combo

- **CHAÎNE alimente le combo** : c'est le moteur d'accumulation (REUSE) + les trucs DE chaîne. **Combo ≠ chaîne** :
  - chaîne = propriété structurelle (dépendance de résultats, A5) ;
  - combo = propriété de récompense (multiplicateur, événements math PATAT).
- Aucun « COMBO ×4 » sans **4 paliers déclenchés** selon `comboThreshold` — le multiplicateur n'est jamais un chiffre affiché sans événements math comptés (mandat §3 BRIEF).

## 5. Interaction avec le score

- Le multiplicateur `comboMultiplier` **applique** une mise à l'échelle au score de la transformation courante (DÉRIVé §7). Le score total d'une partie = Σ(score_n × comboMultiplier_n) (si policy additive) — la **policy exacte relève d'A7** (additive vs multiplicative sont expérimentales).
- Le combo n'introduit **aucun nouvel état de jeu** : il est un **dérivé recalulable** de la trace (même principe que A5 §6).

## 6. Limites & équilibrage

- Plafond `maxComboMultiplier` + seuil `comboThreshold` — pour empêcher l'inflation/farm (un seul trigger isolé ne monte aucun palier tant que le cumul < `comboThreshold`).
- Test de domination (mandat §25) appliqué au combo : si une stratégie produit un REUSE en boucle infinie sans autre sens → le déclencheur est re-examiné (la boucle `8−5=3, 3+5=8, 8−5=3` : legal ops mais chaîne `8-5=3` nuit à la rareté → Verified par A11, pas de combo sur cycle trivial : exclusion explicite `CYCLE`).
- `TARGET`/`EFFICIENCY` uniquement sur les niveaux avec objectif de valeur.

## 7. Contractuel

- **→ A10** : le solver modélise les comboOpportunities d'un niveau (« combien de triggers math réalisables » → section scoreEnvelope). 
- **→ A16** : `combo_started` (evénement + newMultiplier), combos recalculables depuis la trace.
- **Config** : un **objet comboConfig** par niveau (A9 `scoreConfiguration`), éditable sans recompile → équilibrage pur data.

---

**D-CO1 — PLUSB de cause mathématique** : pas de time-based combo streaks en 1.0 (EXP-7 déjà cité). Opposable.
**Anti-gaming** : les **cycles triviaux** (`a b a` rentréeturn) sont détectés par A11 (stratégie dominante §25) et exclus des combos — un par niveau certifié.