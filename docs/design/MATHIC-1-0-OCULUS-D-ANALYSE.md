# MATHIC 1.0 — MISSION 14 : OCULUS D'ANALYSE

**Référence** : MISSION 14 — `OCULUS D'ANALYSE` · Atelier Astral
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ (voir `MATHIC-1-0-OCULUS-D-ANALYSE-REPORT.md`).

---

## 1. Objet

Donner au joueur une couche de **lisibilité algorithmique** : une lentille qui
expose la vérité du moteur V5 sur l'état affiché — courant ou historique du
Sablier — sans jamais la trahir.

> « Qu'est-ce que le moteur a réellement décidé ? »

L'Oculus **explique**. Il ne joue pas, il ne recule pas, il ne reconstitue
jamais un état. Tout ce qu'il affiche est une **projection** de fonctions réelles
du moteur : `apply`, `getMoves`, `getState`, `replay`, `validateSpec`, `quickReject`.

Ce qui n'existait pas avant :

- `src/atelier/oculus-controller.mjs` : l'Oculus Controller (projection pure) ;
- 29 tests `OC-01..16 + OC-M13* + OC-SPEC* + OC-PURE + OC-API` ;
- panneau **◉ OCULUS** dans l'Atelier : analyse de l'état au curseur + analyse
  d'une « incantation » écartée par la loi du moteur ;
- la règle **`PREVIEW ≠ STATE`** et **`INVALID → REJECTED`** (cause réelle, jamais inventée).

## 2. Architecture (aucun nouveau moteur)

```
Atelier UI (atelier.js)
    ↓
Oculus Controller (oculus-controller.mjs)          ← NEW
    ↓
État adressable : S_k = replay(spec, events[0..k])  (M13 + Engine)
    ↓
analyse réelle : apply / getMoves / getState / validateSpec / quickReject
    ↓
AnalysisResult (faits machine-lisibles ; source : engine.*)
    ↓
present() → présentation diégétique (séparée des faits)
    ↓
visualisation UI (modale, lignes brutes, valeurs écartées)
```

## 3. Audit des primitives réelles (phase 1 — faits établis, rien déduit du nom)

| Primitive (Engine) | Contrat réel (lu dans `engine.mjs`) |
|---|---|
| `validateSpec(spec)` | **throw** `TypeError` avec message détaillé (ex : `grid[1] : 1 cases ≠ 2`) ou **retourne spec**. Vérifie forme rectangle/entiers/réserves, **pas** la solvabilité. |
| `apply(s, cmd)` | **`null`** ssi : `cmd.id ≠ "PLACE"`, ou `grid[r][c] ≠ -1` (occupée **ou** coordonnées hors champ → crash possible si `grid[r]` est `undefined`), ou `reserve[v] ≤ 0`. Ne vérifie **pas** les lois de ligne/colonne ; échoue sur r hors bornes (crash), d'où la garde d'adresse de l'Oculus. |
| `getMoves(s)` | **l'ensemble** des `PLACE v@(r,c)` qui satisfont `lineOk(row) && lineOk(col) && sumFeasible(t)` — **c'est la loi de ligne/colonne**, PAS exportée ailleurs. |
| `isSolved(s)` / `getState(s)` | solve global (toutes lignes+colonnes), et snapshot `grid/reserve/solved/moves`. |
| `replay(spec, events)` | `createSession` + `apply` séquentiels ; événement illisible/rejeté → `TypeError`. Fonction pure du préfixe. |
| `quickReject(spec)` | si toutes les ops sont `+` : vraie si `Σrows ≠ Σcols` **ou** `Σ(v·qte) ≠ Σrows` ; sinon `false` (annotation « NON-ADDITIF »). |

**Conséquence structurelle** : l'Oculus ne nomme **jamais** une cellule
« fautive » si le moteur n'établit pas ce fait. La loi de ligne/colonne n'étant
pas exportée, l'Oculus la **traite comme une boîte noire via `getMoves`** : un
coup absent des coups légaux est décrit comme « écarté par le portail de
légalité du moteur », sans inventer quelle ligne/colonne est coupable (§6, §9).

## 4. Modèle `AnalysisResult` (adapté aux données réellement disponibles)

```
State analysis (S_k) :
  mode, cursor=k, total, atPresent, solved, moves, grid, reserve,
  lastEvent (l'événement réel events[k-1] qui produisit S_k),
  offeredMoves (réel : getMoves(S_k) → la loi du moteur),
  lines (raw : spec.rows/cols + grille au curseur → affichage seul, aucun calcul),
  specNote ("SAT"|"UNSAT"|"NON-ADDITIF" ← quickReject même classe d'additivité),
  reasonCode ("SOLVED"|"ONGOING"), source ("engine.replay|...")     ← champ source traçu

Action analysis (cmd proposée sur S_k) :
  valid (apply(S_k,cmd) ≠ null — oracle réel),
  offered (la cmd figure-t-elle dans getMoves(S_k) ?),
  reasonCode :
    ENGINE_OFFERS                (acceptée et offerte par la loi)
    ENGINE_ACCEPTS_NOT_OFFERED   (apply OK mais écartée par getMoves)
    REJECTED_COMMAND_UNKNOWN / REJECTED_OUT_OF_BOUNDS /
    REJECTED_CELL_OCCUPIED / REJECTED_RESERVE_EMPTY / REJECTED_VALUE_INVALID
  stateBefore/stateAfter (réels), affectedCells[], affectedValues[], facts[],
  source ("engine.apply|engine.getMoves")

Spec analysis :
  valid, reasonCode ("SPEC_OK"|"SPEC_INVALID"), message (le message réel de validateSpec),
  specNote (quickReject), source
```

Aucun champ sans source déterministe n'est introduit.

## 5. Mapping reasonCode → présentation (ENGINE FACT ≠ DIEGETIC TEXT)

`present(result)` est la **seule** couche diégétique. Elle interpole les faits
réels (`grid[r][c]`, quantité de réserve, coordonnées) dans des formulations
sans ajouter de cause :

| reasonCode | Fait moteur | Titre |
|---|---|---|
| `SOLVED` | `getState().solved === true` | CRÉATION STABILISÉE |
| `ENGINE_OFFERS` | cmd ∈ `getMoves` | INCANTATION ACCEPTÉE |
| `ENGINE_ACCEPTS_NOT_OFFERED` | `apply ≠ null` ∧ cmd ∉ `getMoves` | ACCEPTÉE PAR LE MOTEUR — ÉCARTÉE PAR LA LOI |
| `REJECTED_CELL_OCCUPIED` | `grid[r][c] ≠ -1` | INCANTATION REJETÉE |
| `REJECTED_RESERVE_EMPTY` | `reserve[v] ≤ 0` | INCANTATION REJETÉE |
| `REJECTED_OUT_OF_BOUNDS` | coordonnées hors grille | INCANTATION HORS GRILLE |
| `REJECTED_COMMAND_UNKNOWN` | `cmd.id ≠ "PLACE"` | INCANTATION REJETÉE |
| `SPEC_INVALID` | message réel de `validateSpec` | SCEAU CORROMPU |

Exemple de corps (REJECTED_CELL_OCCUPIED, faits réels) :
> « Case (0,0) : déjà scellée par 2. Aucune superposition possible. »

## 6. Règles de vérité (ce que l'Oculus n'a PAS le droit de faire)

- Interdit : inventer `"Asymétrie critique"` sans fait moteur.
- Interdit : nommer une cellule fautive sans preuve moteur (ici : aucun coupable
  pour le portail de ligne — le joueur voit les lignes brutes et juge).
- Interdit : recalculer `lineOk`/`validateSpec`/les maths dans l'UI.
- Interdit : analyser un autre état que celui affiché (cette règle est vérifiée
  par le fait que l'analyse prend **explicitement** `(spec, events, k)` et que
  l'UI passe `ctrl.position` — pas un état reconstruit).

## 7. Règle PREVIEW ≠ STATE (action proposée)

L'Oculus effectue une **prévisualisation** uniquement parce que le moteur
possède une primitive de validation déterministe : `apply`. La prévisualisation
ne **modifie jamais** GameState / Save / trace : `apply` est pur, son résultat est
jeté après analyse (OC-07/08/09, et prouvé live : curseur et coups inchangés
après analyse UI).

## 8. Intégration M13 (Sablier → Oculus)

```
Sablier (position k) → ctrl.position
Oculus → analyzeState(spec, ctrl.trace, k) → S_k exactement celui affiché
Oculus → analyzeAction(spec, ctrl.trace, k, cmd) → pour la valeur écartée choisie
```

`OC-04` : jouer jusqu'à k puis analyser ≡ jouer jusqu'à n puis replier vers k
puis analyser → byte-identique. `OC-02` : l'analyse du passé reflète le `grid`
que le Sablier affiche. L'UI re-rend l'analyse à chaque déplacement de curseur
(« analyse rattachée au curseur »), jamais le présent silencieusement.

## 9. PRESERVE (respecté)

Engine · Kernel · Solver · Evidence · Profile · Policy · Orchestrator · Save ·
Progression · Sceau M12 · Replay Controller M13 · contrats de déterminisme.
Nouveau code : `src/atelier/oculus-controller.mjs`, `tests/atelier/oculus.test.mjs`,
UI Atelier (`index.html`, `atelier.css`, `atelier.js`), `docs/design/**`.
Aucun Engine modifié.

## 10. Verrou final attendu

`OC-01..16` PASS (29 tests au total) · `npm test` PASS (376) · playtest 50/50 ·
`npm run build` + `build:atelier` PASS · `git diff --check` PASS · worktree propre ·
`HEAD == origin` après push · §19 démontré sur l'UI réelle (chrome headless sur le
bundle `dist-atelier` : cyclage jouer/sablier/oculus sans mutation).