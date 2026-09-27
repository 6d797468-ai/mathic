# Architecture PHASE 8 — Greffe du Rule Engine V5 (Concept B) en parallèle de V4

**Prérequis** : GATE 1 vert (rapport `lab/gameplay/reports/g0-report.md`), contrat `MATHIC-V5-CONTRACT-RULES-B.md` formel, V4 immuable.
**Principe fondateur** : zéro casse — le moteur V5 s'insère **à côté** de V4 ; la roue-op ne bouge qu'à la bascule finale, contractée.

## 1. Points de couture V4 réels (avérées dans le code)

| Couture V4 | Fichier (fait) | Rôle |
|---|---|---|
| `OPERATORS`, `slideBoard(board, dir, op='add')` | `src/board.js` | l'opérateur est **injecté** à chaque slide (point rouge de la roue/currentOp) |
| `operatorButtons .op-btn` + `currentOp` | `src/main.js:94x` | sélection UI de l'opérateur (roue) |
| `makeState` / `makeEvent` / `createAdapter` | `src/runtime/game-adapter.js` | contrat runtime V4 (K1–K4) |
| `onDirection` | `src/input.js` | gestes (swipes) |
| `generatePuzzle` (+ fallback moves:0) | `src/puzzle.js` | site MTH-001 |

Le **seul contrat** qui mute en V5 est `GAME-RULES` (injection roue → décision joueur). Tout le reste (undo/snapshot/replay/persistance/déterminisme) reste intact jusqu'à son propre contrat.

## 2. Module cible : `rule-engine-v5` (framework-agnostic, pur, déterministe)

Statut : **porté du lab** (`engine-b.mjs` + `validateSpec` + solver), **zéro dépendance produit**.

```
API (contrat minimal) :
  createSession(spec) -> SessionState      // validateSpec fail-fast
  commands(s)         -> Command[]          // coups légaux {id:"PLACE", v, r, c}
  apply(s, cmd)       -> SessionState|null  // autorité ; null = commande illégale
  isSolved(s)         -> bool
  getState(s)         -> { grid, reserve, solved }
  canonical(s)        -> string             // déterminisme
  replay(spec, events:Event[]) -> SessionState
evenement émis : { type:"PLACE", value, r, c }
```

Invariants : `0 Math.random`/`Date.now` dans le module ; pas d'IO ; pas de ref à l'UI ; `NaN` impossible (validateSpec) ; aucun import de `src/`.

## 3. Stratégie de greffe (étapes testables, commit par commit)

- **S2 — ajout à côté** *(GATE 2 vert, PHASE 8·A)* : nouveaux fichiers sous `src/v5/rules/` **uniquement** (création, aucun `src/` V4 édité). Tests unitaires dédiés. `npm test` (root) reste vert : la suite V4 + le lab courent ensemble (déjà le cas : le lab est référencé par `node --test`).
- **S3 — bras adiabatique** *(PHASE 8·B)* : route d'entrée V5 expérimentale (bouton « Laboratoire » à côté du mode classic). Nouveau `game-adapter-v5` émettant les événements `PLACE` par-dessus `makeEvent` — **la roue V4 reste branchée** dans son mode.
- **S4 — bascule du contrat `GAME-RULES`** : retrait de l'injection roue ; le seul changement visé est documenté `OLD→PROBLEM→NEW→MIGRATION→TESTS` (déjà formalisé). Régressions dédiées : indépendance, replay, déterminisme, aucun `Math.random` dans les chemins gameplay (grep CI).

## 4. Garde-fous (mission §5, §8, §19)

- `main` intouché ; tout sur `kali/v5-gameplay-lab` jusqu'au GATE final.
- Phase 8·A = **aucune ligne de code UI** tant que GATE 2 (ce document + mode) n'est pas signé.
- Le moteur reste l'autorité : le solver ne sert qu'à certifier/cadrer les specs (jamais l'inverse).
- Momo (ai.js) n'écrit jamais dans le SessionState ; il propose via un canal L1–L5.

## 5. Risques & décisions

| Risque | Mitigation | Décision |
|---|---|---|
| Régression V4 pendant la greffe | S2 = fichiers neufs ; tests N-1 à chaque commit | GATE 2 = `npm test` root vert + diff `src/` V4 vide |
| Mode secondaire A « Chaînes » jamais exploité | lots A-v2 validés 10/10, contrat parallèle éventuel | décision post-GATE 3 (à la demande) |
| G0.1 (compréhension) non mesurable par solver | validation humaine GATE 2 (session de jeu lab signée) | condition de sortie GATE 2 = un testeur du produit bat 1 niveau B |

## 6. GATE 2 — définition (unique étape suivante)

1. Signer ce blueprint (pas d'approbation d'écriture).
2. Spike S2 minimal réalisé **sans modifier V4** (prévoir branche feature : `kali/v5-rules`).
3. Mesure : `npm test` root (V4 + lab + v5-rules) 100 % vert ; `git diff main..HEAD -- src/` = vide.
4. Session de validation humaine minimale (cible : G0.1 & G0.2 perceptibles, une partie menée au bout).