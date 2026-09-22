# MATHIC V3 — Audit Architectural

> Commit de référence : `09a45a3` — Branche `main` — 2026-09-22

---

## Vue d'ensemble

MATHIC V3 est une PWA + Android (Capacitor) construite avec Vite + JavaScript ES Modules.
L'architecture V3 est un **God Object** centré sur `main.js` — fonctionnel, mais non extensible sans risque.

```
src/
 ├── main.js      1 110 lignes — orchestration globale (GameState + UI + AI + Events)
 ├── board.js       529 lignes — logique pure (✅ zéro DOM)
 ├── puzzle.js      313 lignes — génération + BFS certifié (✅ zéro DOM)
 ├── history.js     179 lignes — Calvados / Undo (✅ zéro DOM)
 ├── diff.js        312 lignes — diff vectoriel (✅ zéro DOM)
 ├── ai.js          619 lignes — Momo + wllama
 ├── ui.js          502 lignes — rendu DOM + animations
 ├── targets.js     218 lignes — détection paires/cibles
 ├── input.js        67 lignes — gestes/swipe
 ├── audio.js       148 lignes — Web Audio
 ├── profiler.js     89 lignes — FPS/RAM HUD
 ├── tutorial.js    198 lignes — FTUE overlay
 └── style.css      600 lignes — design system
```

---

## Modules : Inventaire et Frontières

### `board.js` ✅ — PROVEN — GELÉ

**Responsabilité :** Logique pure du plateau. Zéro DOM. Toutes les fonctions sont exportées et testées.

**Exports :**
- `createBoard(rows, cols)` — plateau vide
- `slideBoard(board, dir, op)` — coup déterministe (pure)
- `slideLine(line, op)` — ligne unitaire
- `spawnRandomTile(board, maxValue)` — ⚠️ `Math.random()` → **P0 G2**
- `fillInitialTiles(board, n, maxValue)` — ⚠️ `Math.random()` → **P0 G2**
- `isGameOver(board)` — pure
- `hasAnyMove(board, op)` — pure
- `isValidPair(a, b, op)` — pure
- `computeMerge(a, b, op)` — pure
- `isValidMerge(a, b, op)` — pure
- `countEmptyCells(board)` — pure
- `isCleaningMove(before, after, op)` — pure
- `minMovesToReach(board, target, maxDepth)` — BFS pur, **P1 — sur thread UI**
- `createChainTracker()` — pur, avec état interne
- `OPERATORS`, `DIRECTIONS`, `TARGET_NUMBER = 24`, `VALUE_CAP = 999`

**Invariants confirmés par les tests :**
- Fusion : une tuile fusionne au max 1× par coup
- SUB : A > B strictement (résultat ≥ 1)
- DIV : A % B === 0 (reste nul)
- ADD : A === B uniquement
- VALUE_CAP : toute fusion > 999 refusée

### `puzzle.js` ✅ — PROVEN — GELÉ

**Responsabilité :** Génération rétro-ingénierie + validateur BFS.

**Exports :**
- `generatePuzzle({ rows, cols, moves, target, attempts })` — BFS certifié
- `unmerge(c)` — défusion d'une valeur en (A, B, op)
- `PUZZLE_STARTER_MAX = 5`

**Dettes :**
- `randInt`, `choice` → `Math.random()` → **P0 G2**
- Pas de seed → non déterministe → **P0 G2**

### `history.js` ✅ — PROVEN — GELÉ

**Responsabilité :** Pile Calvados pour Undo. Immutable. Diff vectoriel.

**Exports :**
- `createCalvados()` — pile avec push/pop/clear
- `makeEntry(facts)` — snapshot immuable d'un coup
- `reversePlan(entry)` — plan de dé-fusion pour rewind
- `calvadosContext(entry)` — contexte pour Momo

### `diff.js` ✅ — PROVEN — GELÉ

**Responsabilité :** Diff vectoriel entre deux états de plateau.

### `ai.js` ⚠️ — EN SERVICE — DETTE

**Responsabilité :** Momo coach (wllama + fallbacks scriptés).

**Problème principal :**
- `coachReact`, `coachHint`, etc. reçoivent des variables de `main.js` directement (score, target, board...)
- Le LLM n'a pas de contrat d'interface défini
- Tournant sur le thread UI
- **Correction → G8 Momo Adapter**

### `ui.js` ⚠️ — EN SERVICE — DETTE

**Responsabilité :** Rendu DOM + animations + tile manager.

**Problème :** Couplé à `main.js` via imports d'état global. → **G3+ refactoring**

### `main.js` 🔴 — GOD OBJECT — DETTE P1

**Ce qui vit dans `main.js` (à déplacer) :**

| Responsabilité | Destination V4 |
|---|---|
| GameState (board, score, target...) | `src/core/state.js` |
| PUZZLE_LEVELS hardcodés | `levels/*.json` + G3 |
| Spawn aléatoire | `src/random.js` + G2 |
| reactToMove (Math.random) | `src/momo/adapter.js` |
| startPuzzle / afterPuzzleMove | `src/runtime/session.js` |
| localStorage record | `src/persistence/` + G7 |
| SW registration | reste dans main (UI concern) |
| Event listeners DOM | `src/ui/input.js` |

### `public/sw.js` 🔴 — DETTE P0 G0.5

**Problème :** `VERSION = 'mathic-v2'` hardcodé. Nouveau build → même cache → pas d'invalidation.

**Correction G0.5.1 :** `public/sw.template.js` + `scripts/build-sw.mjs` → `dist/sw.js` avec version concrète.

**Autre bug :** `serveRange()` retourne `totalSize = '*'` si `Content-Range` absent du cache. → **P0 G0.5.3**

---

## Dépendances V3

```
Vite 8.3.0          Build
Capacitor 8.5.2     Android WebView bridge
@wllama/wllama 3.6.1 LLM WASM runtime
TypeScript 7.0.2    Dev (capacitor.config.ts)
```

Pas de framework UI (React/Vue/Angular). Vanilla JS + DOM.

---

## Tests V3 — État

| Suite | Fichier | État |
|---|---|---|
| Logic (board, rules, merge) | `tests/logic.test.mjs` | ✅ PASS |
| Diff vectoriel | `tests/diff.test.mjs` | ✅ PASS |
| History / Calvados | `tests/history.test.mjs` | ✅ PASS |
| Playtest puzzle BFS | `tests/playtest-puzzle.mjs` | ✅ 50/50 |

Résultat `npm test` sur `09a45a3` : **3 suites, 0 fail, playtest 50/50 ✅**

---

## CI V3 — État

| Workflow | Fichier | État |
|---|---|---|
| Android debug APK | `.github/workflows/android-build.yml` | ✅ ACTIF — pas de npm test |
| GitHub Pages | `.github/workflows/pages.yml` | ✅ ACTIF — pas de npm test |
| Tests (npm test) | **ABSENT** | ❌ MANQUANT → G0.6.1 |

---

## Risques Critiques Identifiés

| Risque | Sévérité | Gate |
|---|---|---|
| `Math.random()` dans Game Core | P0 | G2 |
| SW version hardcodée | P0 | G0.5.1 |
| `npm test` absent du CI | P0 | G0.6.1 |
| BFS sur thread UI | P1 | G10 |
| Momo accède main.js internals | P0 | G8 |
| localStorage pour progression | P1 | G7 |
| Puzzle levels hardcodés | P1 | G3 |
| `serveRange()` totalSize = '*' | P0 | G0.5.3 |
