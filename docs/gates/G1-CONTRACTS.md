# G1 — Core Freeze + Contracts

> Gate : G1 — Status : **PASS** (2026-09-22)
> Prérequis : G0 ✅ G0.5 ✅ G0.6 ✅

## Checklist

### G1.1 — RULES (Contrat GAME-RULES-V1)

- [x] `docs/contracts/GAME-RULES-V1.md` — 5 règles intouchables
- [x] `src/core/rules.js` — constantes (`OPERATORS`, `TARGET_NUMBER`, `VALUE_CAP`, `DIRECTIONS`)
- [x] Tests `G1-RULES-V1` — 16 assertions couvrant ADD/SUB/MUL/DIV/plafond/cible

### G1.2 — STATE (Contrat GAME-STATE-V1)

- [x] `docs/contracts/GAME-STATE-V1.md` — schéma minimal sérialisable
- [x] `src/core/` — logique pure (zéro DOM, zéro effet secondaire)
- [x] Tests `G1-STATE-V1` — JSON roundtrip + pas de référence DOM

### G1.3 — EVENTS (Contrat GAME-EVENTS-V1)

- [x] `docs/contracts/GAME-EVENTS-V1.md` — 4 événements (MERGE, COLLAPSED, SPAWN, GAME_OVER)
- [x] `src/core/events.js` — fonctions factory retournant des POJO purs
- [x] Tests `G1-EVENTS-V1` — 5 tests, JSON-sérialisables, pas de fonctions

### G1.4 — Migration Board.js (shim de compatibilité)

- [x] `src/core/board.js` — logique migrée (17033 bytes, zéro DOM)
- [x] `src/core/rules.js` — constantes extraites
- [x] `src/board.js` (shim) — **supprimé**
- [x] Tous les imports mis à jour :
  - `src/main.js` → `./core/board.js` + `./core/rules.js`
  - `src/diff.js` → `./core/board.js` + `./core/rules.js`
  - `src/puzzle.js` → `./core/board.js` + `./core/rules.js`
  - `src/targets.js` → `./core/board.js`
  - `tests/logic.test.mjs` → `../src/core/board.js` + `../src/core/rules.js`
  - `tests/diff.test.mjs` → `../src/core/board.js` + `../src/core/rules.js`
  - `tests/history.test.mjs` → `../src/core/board.js` + `../src/core/rules.js`
  - `tests/playtest-puzzle.mjs` → `../src/core/board.js` + `../src/core/rules.js`
- [x] `npm test` — 4 suites, 16 tests G1 + 3 suites V3, playtest 50/50

### G1.5 — Invariants

- [x] Tests `tests/g1-contracts.test.mjs` — 16 assertions
- [x] Build Vite + SW — `mathic-v4-962d942-a29b19e3` (concret, pas de placeholder)

## Résultats

```
Tests G1 : 16/16 pass ✅
Tests V3 : 3 suites + playtest 50/50 ✅
Build    : dist/ + SW version concrète ✅
Shim     : supprimé, aucun import restant ✅
```

## Prochain Gate

→ **G2 Determinism V1** sur branche `gate/g2-determinism`