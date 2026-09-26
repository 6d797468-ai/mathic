# MATHIC V6 — M27 · AUDIT ET REALISATION DU SEMANTIC WITNESS

**Gate `V5-SEMANTIC-WITNESS` : `CLOSED`**

M26 avait transforme un manque de preuve en état contractuel `BLOCKED`. M27
apporte la preuve manquante : un témoin sémantique qui statue sur le
comportement réel de l'implémentation souveraine, sans jamais la recalculer.

Ce document est l'audit **préalable** à l'écriture du code, puis le relevé
des résultats obtenus.

---

## 1. AUDIT PRÉALABLE — AVANT TOUTE ÉCRITURE

### 1.1 API réellement observée

`rule-engine-v5` exporte `isSolved(s)`. C'est la **seule** fonction publique
qui fasse évaluer la sémantique par `lineOk()` puis `evalOp()`.

Observation de terrain, exécutée avant conception :

| état observé | `isSolved` |
|---|---|
| ligne incomplète (`-1` présent) | `false` |
| ligne multiplicative complétée `3 * 4 * 1 = 12` | `true` |

`lineOk()` retourne `true` dès qu'une cellule vaut `-1` : **une ligne
incomplète n'est jamais évaluée**. C'est le point d'appui du témoin.

### 1.2 Donnée d'entrée

L'état V5 observé après la séquence, plus une réclamation **déclarative** :

```js
{ kind: "LINE_SATISFACTION", values: [n, n], cells: [{r,c},{r,c}],
  requiredOp: "*", target: 12 }
```

Aucun vocabulaire de Méthode, d'Intent ou de Grimoire n'y figure.

### 1.3 Transformation attendue

La ligne déclarée qui porte les deux valeurs remplit sa cible en utilisant
l'opérateur réclamé.

### 1.4 Observation de sortie

`isSolved(état observé)`, délégué tel quel. Aucune valeur n'est réinjectée.

### 1.5 Invariant mathématique utilisé

Aucun. **Le témoin ne calcule rien.** Il lit une déclaration et délègue une
évaluation. C'est ce qui le rend auditable : il ne peut pas être en désaccord
avec V5, puisqu'il n'a pas d'arithmétique propre.

### 1.6 Pourquoi cette observation constitue une preuve

Parce que la sémantique n'est tranchée que par le moteur souverain. Le témoin
ne peut produire `PROVEN` que si V5 lui-même déclare l'état résolu. Un désaccord
avec V5 est structurellement impossible.

### 1.7 Limites restantes

| Limite | Conséquence |
|---|---|
| L'oracle est global (`isSolved`) | Conservateur sur plateau partiel : verdict négatif si une autre ligne reste incomplète |
| La relation porte sur une **ligne**, pas une sous-expression | Une identité binaire `a op b = c` ne serait pas couverte |
| Lecture seule, sans recherche | Le témoin constate, il ne cherche pas de coup correctif |

---

## 2. LE PIEGE TROUVE EN AUDIT, ET SON CORRECTIF

Une première version du témoin formulait la relation comme une identité
binaire `a op b = c`. **Cette version était fausse et aurait produit un faux
`PROVEN`.**

Cas : ligne additive `3 + 4 + 5 = 12`, que V5 confirme résolue. La réclamation
`3 * 4 = 12` aurait été déclarée prouvée — ce qui est faux, et exactement le
défaut que M26 documentait.

Deux raisons ont conduit au correctif :

1. **Sens physique.** Sur une ligne `ops: ["*","*"], target: 12` avec
   `[3, 4, 1]`, c'est la **ligne** qui accomplit `3 * 4 * 1 = 12`, pas un
   couple d'opérandes isolé. L'identité binaire n'a pas de sens ici.
2. **Falsifiabilité.** Vérifier `a op b === c` obligerait à recalculer
   l'expression, donc à **dupliquer la sémantique V5** — interdit. Et même
   correctement calculé, le résultat serait un faux positif.

Le correctif : la relation est une **saturation de ligne déclarée**, et le
témoin vérifie que `requiredOp` figure dans `def.ops` de CETTE ligne avant de
déléguer. C'est une lecture de déclaration, pas un calcul. Le test `W-03`
verrouille ce cas.

---

## 3. REALISATION

### 3.1 Le témoin — `src/v5/rules/witness.mjs`

Sept gardes, dans l'ordre. Chacune peut produire un verdict négatif.

| # | Garde | Échec |
|---|---|---|
| G0 | entrée exploitable, `kind` connu, `cells`/`values`/`requiredOp`/`target` valides | `UNSUPPORTED` |
| G1 | les deux valeurs sont **physiquement** présentes aux cellules déclarées | `UNSUPPORTED` si vide, `UNPROVEN` si divergentes |
| G2 | les deux cellules partagent une ligne | `UNPROVEN` |
| G3 | `requiredOp` ∈ `def.ops` de CETTE ligne, et `def.target` = `target` | `UNPROVEN` |
| G4 | la ligne est complète, donc V5 l'évalue réellement | `UNSUPPORTED` |
| G5 | **délégation** : `isSolved(état observé)` | `UNPROVEN` si faux |

`PROVEN` n'est atteignable qu'après G5. Le verdict est `Object.freeze`, et
`proven` ne fait que refléter `status`.

### 3.2 La chaîne complète

```
Intent → compile() → [PLACE]
                        ↓  getMoves/apply  (légalité primitive, inchangée)
                     état réellement obtenu
                        ↓  methodRelation()  (déclaration, aucun calcul)
                     réclamation V5
                        ↓  witnessRelation()
                        ↓  isSolved()        ← l'arithmétique est tranchée ici
                     PROVEN | UNPROVEN | UNSUPPORTED
```

`valid` n'a pas été redéfini : il reste la légalité primitive.
`methodSemanticsCertified` devient `true` uniquement sur un `PROVEN` réel.

---

## 4. RESULTATS

### 4.1 Les trois faux positifs de M26 ne sont plus un verdict global

M26 rendait `BLOCKED` pour tout. M27 donne un verdict **spécifique** à chaque
cas, ce qui est strictement plus fort.

| # | Intention | Structure | M26 | M27 | Raison |
|---|---|---|---|---|---|
| 1 | `FACTORIZE(12)` | ligne additive | `BLOCKED` | `UNPROVEN` | `'*' ne figure pas dans la déclaration ops ["+","+"]` |
| 2 | `DECOMPOSE(7)` | ligne multiplicative | `BLOCKED` | `UNPROVEN` | `'+' ne figure pas dans la déclaration ops ["*","*"]` |
| 3 | `FACTORIZE(12)` | non colinéaire | `BLOCKED` | `UNPROVEN` | `aucune ligne commune` |

### 4.2 Premier `PROVEN` réel

`FACTORIZE(12)` avec `[3, 4]` sur une ligne `ops: ["*","*"], target: 12`
complétée par `1` → `3 * 4 * 1 = 12`, `isSolved` confirme,
`methodSemanticsCertified: true`. C'est la première certification de Méthode
de l'histoire du projet, et elle repose entièrement sur V5.

---

## 5. LE GATE NE SE LAISSE PAS AFFAIBLIR

Trois tentatives de truquage ont été injectées puis annulées. Chacune a été
détectée.

| Sonde | Résultat |
|---|---|
| Forcer `status = "PROVEN"` inconditionnellement | **3 échecs** |
| Supprimer le garde-fou de l'opérateur (G3) | **3 échecs** |
| Introduire une table d'opérateurs miroir | **1 échec** (garde structurelle) |

Après restauration : 28/28. `witness.mjs` a été comparé octet à octet avec sa
version d'origine.

Les gardes structurelles qui rendent cela possible :

- `W-14` — ni `lineOk`, ni `evalOp`, ni `sumFeasible`, ni table d'opérateurs
- `W-15` — ni recherche, ni solveur ; **un seul import** : `./engine.mjs`
- `W-16` — aucun module V5 n'importe `src/gameplay`
- `SB-07` à `SB-10` — les mêmes invariants côté gameplay

---

## 6. SUITE DE TESTS

| Suite | Role | Resultat |
|---|---|---|
| `tests/v5/semantic-witness.test.mjs` | le temoin, autonome, sans gameplay (W-07) | 16/16 |
| `tests/gameplay/m27-witness-integration.test.mjs` | la chaine complete M26 → M27 | 12/12 |
| `tests/gameplay/semantic-blocked.test.mjs` | non-regression M26, statuts ranges a UNPROVEN | 11/11 |
| `tests/gameplay/multi-strategy.test.mjs` | non-regression M26, inchangee | 8/8 |

---

## 7. CE QUE M27 NE FAIT PAS

- Il ne redefine pas `valid`.
- Il ne refute pas une strategie et ne cherche aucun coup correctif.
- Il ne certifie pas la **solvabilite** : le solveur reste un gate distinct.
- Il ne duplique aucune semantique V5.
- Il ne rend pas `UNSUPPORTED` transformable en `PROVEN` par defaut.
- Il n'introduit aucune Methode, aucun element d'UI, aucune persistence.

## 8. SUITE

La brique de preuve est fermee. Les briques gameplay qui dependent d'une
certification de Methode peuvent maintenant etre construites sur un `PROVEN` reel — et seulement sur celui-ci. Le gate distinct de **solvabilite** reste
ouvert et n'a pas ete touche.
