# MATHIC V6 — GATE `V5-SOLVABILITY` (CONTRAT)

**Statut du gate : `CLOSED` en M28.**

Implémenté par `src/v5/rules/solvability-witness.mjs`. Le composant legacy
`src/v5/rules/solver.mjs` est mis en quarantaine et n'est plus une preuve.

Ce document décrit ce qui manquait, ce qui est exigé, et ce qui est
explicitement interdit. Il a servi de contrat à M28, qui l'a satisfait.

---

## 1. POURQUOI CE GATE EST NÉCESSAIRE

V5 établit sans conteste si **un coup donné** est jouable : M26 le prouve
via `getMoves()`. Personne ne pouvait en revanche établir si **un puzzle
donné** est soluble.

Le seul composant qui s'en approchait était `certify()`, dans
`src/v5/rules/solver.mjs`. Il a été audité et **rejeté comme oracle**, pour
deux raisons indépendantes. Les deux sont figées par
`tests/v5/legacy-solver.test.mjs`.

### 1.1 Défaut M28-SOLVER-001 — un faux certificat d'inexistence

Sur un puzzle réellement résolvable, `certify()` peut répondre :

```js
{ solvable: false, minMoves: null, solutions: 0, budgeted: false }
```

Les **deux moitiés** de cette réponse sont fausses :

- `solvable: false` — la solution existe, la recherche a simplement été
  tronquée avant de la trouver ;
- `budgeted: false` — la recherche **a** été tronquée. Le drapeau ment donc
  en annonçant l'exhaustivité.

Cause racine : `budgeted` n'est posé que sur `nodes > budget`, condition
**inatteignable** dans la boucle, dont la garde est `nodes < budget`. Le
drapeau est donc structurellement mort. Deux voies de troncature le
contournent sans jamais le poser : la troncature de budget, et le `break` de
profondeur (`d > maxDepth`), qui abandonne en outre la file entière.

La qualification exacte est celle d'un défaut de **complétude**, assorti
d'une **fausse allégation d'exhaustivité**. Ce n'est pas un défaut de
soundness au sens « affirme soluble à tort » : la direction positive est
correcte.

### 1.2 Défaut M28-SOLVER-002 — une affirmation non rejouable

`certify()` rend un résumé, aucun chemin. Un tiers ne peut donc pas rejouer
l'affirmation pour la vérifier. Ce n'est pas une preuve, c'est un rapport.

---

## 2. LE CONTRAT EXIGÉ

### 2.1 Définition formelle

```
Solvable(S0)  ⇔  ∃ π = (m1, …, mn) tel que

  (1) ∀i,  mi ∈ getMoves(S_{i-1})      [LÉGALITÉ V5]
  (2) ∀i,  S_i = apply(S_{i-1}, mi)    [TRANSITION V5]
  (3) isSolved(S_n)                    [OBJECTIF V5]
```

### 2.2 La condition (1) n'est pas substituable

`apply()` est **permissif** : il n'appelle ni `lineOk` ni `sumFeasible`, et
accepte un `PLACE` qui rend une ligne fausse. `replay()` passe par `apply()`,
donc il est permissif lui aussi.

Il en résulte qu'un chemin peut être **exécutable mais illégal**. C'est
exactement ce que vérifie `M28-03a` : la valeur 5 est dans la réserve, `apply`
et `replay` l'acceptent, `getMoves` ne la propose jamais.

Seule l'appartenance à `getMoves` encode les règles réelles. `verifyWitness()`
exige donc les deux axes indépendamment.

### 2.3 Les quatre verdicts

| Verdict | `proven` | `searchComplete` | Signification |
|---|---|---|---|
| `PROVEN_SOLVABLE` | `true` | `true` | un chemin existe, chaque pas est légal, chaque transition est réelle, l'objectif est atteint, le chemin est rejouable |
| `PROVEN_UNSOLVABLE` | `true` | `true` | l'espace réellement atteint a été **entièrement** exploré et ne contient aucune solution |
| `UNPROVEN` | `false` | `false` | recherche tronquée : **aucune** conclusion, ni dans un sens ni dans l'autre |
| `UNSUPPORTED` | `false` | `false` | la demande n'est pas couverte ; aucune recherche lancée |

`searchComplete` est une **dimension indépendante** du verdict, pas sa
répétition.

### 2.4 L'interdit central

> Un `PROVEN_UNSOLVABLE` **`searchComplete === false`** est un certificat
> d'inexistence présenté alors que l'espace n'a pas été épuisé. C'est la
> famille exacte de `M28-SOLVER-001`.

Cette combinaison est rendue **impossible par construction** : tous les
verdicts portant un pouvoir de preuve transitent par un point unique, `build()`,
qui lève une exception si elle est tentée. `M28-02d` vérifie l'invariant sur
240 combinaisons de bornes ; `M28-02e` vérifie que la condition de la garde est
vivante dans le source.

### 2.5 La profondeur suffisante n'est pas une convention

Une borne de profondeur posée à l'aveugle ne permet **pas** de certifier
l'inexistence : elle risquerait de déclarer insoluble un puzzle qui se résout
juste plus loin.

Il existe cependant une profondeur qui rend l'exploration exhaustive, et elle
se **déduit de faits V5** :

- `apply()` place une valeur et remplit une cellule ;
- `isSolved()` est faux tant qu'il reste une cellule à `-1`.

Toute solution depuis `S0` a donc une longueur **exactement** égale au nombre
de cellules vides : ni plus courte, ni plus longue.

En conséquence `maxDepth >= cellulesVides` rend l'espace entièrement
explorable, et **seulement dans ce cas** `PROVEN_UNSOLVABLE` est prononçable.
En dessous, le verdict est `UNPROVEN`, avec `truncatedBy: "maxDepth"` et une
raison qui nomme la borne fautive et le seuil à atteindre.

C'est le défaut que le witness s'interdit à lui-même : `M28-02b` vérifie
qu'un puzzle résolvable en 2 coups, borné à `maxDepth: 0`, rend `UNPROVEN` et
non un certificat d'inexistence.

### 2.6 Preuve rejouable

Le witness porte le chemin. `verifyWitness(witness, spec)` le rejoue par les
deux voies indépendantes du moteur (§2.2) et vérifie que l'empreinte finale
rejouée est **exactement** celle qui est certifiée. La spec d'origine est
exigée en paramètre : elle n'est jamais devinée.

### 2.7 Déterminisme

BFS en file FIFO sur `getMoves`, dont l'ordre est fixé par le moteur. Aucun
`worker`, aucun `Math.random`, aucune horloge. Deux exécutions sur la même spec
rendent un witness **strictement identique**, et le witness est figé.

La déduplication utilise `canonical()` (le plateau seul), licite parce que
depuis une racine fixée le plateau détermine le multiset posé, donc la réserve.
C'est un **invariant**, pas une commodité : `M28-06d` l'exerce sur une vraie
arborescence, parce qu'un `apply()` qui cesserait de décromenter la réserve la
casserait silencieusement.

---

## 3. CE QUI EST EXPLICITEMENT INTERDIT

| Interdit | Test |
|---|---|
| Utiliser `certify()` comme oracle de solvabilité | `M28-SOLVER-004`, `M28-07` |
| Réparer `certify()` à l'aveugle | le défaut est figé, documenté, non repaired |
| Dupliquer une table d'opérateurs dans le witness | `M28-06b`, `M28-06c-bis` |
| Comparer des valeurs de jeu dans le witness | `M28-06c-bis` (liste blanche de littéraux) |
| Utiliser `apply`/`replay` comme preuve de légalité | `M28-03a`, `M28-03c` |
| Déclarer soluble sans consulter `isSolved` | `M28-05b`, `M28-05c` |
| Rendre un verdict négatif sur une recherche tronquée | `M28-02a`, `M28-02b`, `M28-02d` |
| Introduire un ordre non reproductible | `M28-04` |

---

## 4. RÉSULTATS

| Mesure | Valeur |
|---|---|
| Tests du witness | 28 |
| Tests de quarantaine du legacy | 11 |
| Tests `tests/v5/rules.test.mjs` + `tests/atelier/symbiote.test.mjs` | 29 |
| Sondes anti-falsification | 10, **toutes détectées** |
| `npm test` | voir §5 |
| `npm run build` | voir §5 |

### 4.1 Sondes anti-falsification

Chaque sonde est une mutation du source, appliquée puis annulée. Une sonde qui
ne detected pas est un défaut de test, pas un succès.

| # | Mutation | Test qui la détecte |
|---|---|---|
| 1 | supprimer le contrôle de profondeur suffisante | `M28-02b` |
| 2 | mentir sur `searchComplete` en troncature | `M28-02a` |
| 3 | neutraliser la garde `build()` en `if (false)` | `M28-02e` |
| 4 | supprimer l'axe de légalité dans `verifyWitness` | `M28-03c` |
| 5 | déclarer soluble sans `isSolved` | 11 tests |
| 6 | table d'opérateurs miroir | `M28-06b` |
| 7 | rendre le legacy importable par le witness | 3 tests |
| 8 | comparer une cellule à une valeur de jeu | `M28-06c-bis` |
| 9 | ordre des coups aléatoire | `M28-04` |
| 10 | constante de jeu nommée | `M28-06c-bis` |

Les sondes 2, 3, 8 et 10 ont d'abord **échappé** à une première version des
tests. Les échappements ont été analysés, puis les tests durcis :

- sonde 2 : la mutation n'avait pas été appliquée (indentation), et
  `M28-02a` ne couvrait que `budget=1` ;
- sonde 3 : la garde étant une défense en profondeur **inatteignable**, aucune
  assertion de comportement ne peut la vérifier — `M28-02e` exige désormais la
  condition exacte, pas seulement le message d'erreur ;
- sondes 8 et 10 : la détection ne cherchait que des comparaisons
  « nombre === nombre ». `M28-06c-bis` inventories désormais **tous** les
  littéraux du code.

---

## 5. LIMITES ASSUMÉES

- **Bornes par défaut.** `maxDepth: 8`, `budget: 20000`. Un puzzle hors de
  portée rend `UNPROVEN` avec `nodesExpanded` et `truncatedBy`, jamais un
  verdict négatif. Le seuil n'est pas adapté automatiquement.
- **Pas d'énumération.** Le witness s'arrête à la première solution minimale. Il
  ne compte pas les solutions, contrairement à `certify()`. C'est hors gate.
- **Pas d'optimalité au-delà du minimal.** BFS donne la longueur minimale, ce qui
  est vérifié par une référence indépendante (`M28-04c`), mais le witness ne
  classe pas les solutions.
- **`canonical` suppose la racine fixée.** La déduplication n'est valable que
  pour une recherche partant d'un `S0` donné. Ce n'est pas un usage transversal.
- **La quarantaine n'est pas une suppression.** `solver.mjs` reste en place,
  testé et documenté : il est la pièce d'analyse qui explique pourquoi
  l'ancien mécanisme ne peut pas porter le gate.

---

## 6. CLASSIFICATION DÉFINITIVE DE `certify()`

Décision M28, actée après validation du gate. `certify()` est **conservé**,
testé, documenté — et **reclassifié**.

### 6.1 Les deux directions, de statut inégal

```
certify()
├── solvable: true
│   └── direction POSITIVE → SOUND
│       affirmation d'EXISTENCE vérifiable
│
└── solvable: false
    └── NON CERTIFICATIF
        • complétude cassée (M28-SOLVER-001)
        • budgeted: false → allégation d'exhaustivité, non un fait
        • ne peut jamais fermer V5-SOLVABILITY
```

| Résultat | Interprétation autorisée |
|---|---|
| `solvable: true` | affirmation positive **vérifiable** — les transitions viennent de `getMoves`/`apply`, donc du moteur souverain |
| `solvable: false` | **aucune** interprétation — ne prouve pas l'insolvabilité |
| `budgeted: false` | **aucune** interprétation — ne prouve pas l'exhaustivité, la branche qui le pose étant structurellement morte |

`certify()` **ne participe pas** à la fermeture de `V5-SOLVABILITY`, qui
repose exclusivement sur `src/v5/rules/solvability-witness.mjs`.

### 6.2 Pourquoi conserver, plutôt que supprimer

Retirer les deux tests consommateurs après la découverte du défaut produirait
une fausse impression de résolution : le problème n'aurait pas disparu, seule la
pièce gênante aurait été supprimée. Le composant reste donc comme **artefact
historique** et **témoin de régression permanent** : c'est lui qui empêche le
défaut de revenir sans bruit.

Ces quatre clauses sont vérifiées littéralement dans le source par
`M28-SOLVER-006`, et la survie de la direction positive par `M28-SOLVER-007`.

### 6.3 Frontière entre preuves souveraines et ancien outillage

```
                        V5 ENGINE  (rule-engine-v5)
                             │
              ┌──────────────┴──────────────┐
              │                             │
   semantic witness               solvability witness
   (witness.mjs)                  (solvability-witness.mjs)
              │                             │
       M27  CLOSED                    M28  CLOSED
              │                             │
              └──────────────┬──────────────┘
                             │
                        GAME GATES


   legacy solver.mjs / certify()   —  LEGACY / UNTRUSTED
              │
              ├─ tests historiques (conserves, 2 fichiers)
              ├─ régression permanente du défaut (M28-SOLVER-001)
              └─ NE PEUT PAS porter V5-SOLVABILITY
```

Cette frontière est **volontaire et saine**. M27 et M28 ne seront pas rouverts
pour faire disparaître `solver.mjs`.

---

## 7. CONSÉQUENCES

1. `certify()` ne peut plus être cité comme preuve. Sa direction **positive**
   reste exacte et ses deux tests consommateurs sont requalifiés en conséquence
   — voir l'en-tête de `tests/v5/rules.test.mjs` et la note dans
   `tests/atelier/symbiote.test.mjs`.
2. La solvabilité d'un puzzle est désormais énonçable en quatre verdicts, dont
   deux seulement portent une preuve, et chacun est rejouable.
3. Le tri-state du joueur, les étoiles, N36, la persistance et Android restent
   des chantiers ultérieurs. M28 ne les touche pas.
