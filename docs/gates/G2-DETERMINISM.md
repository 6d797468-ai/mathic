# G2 — Determinism V1

> Gate : G2 — Status : **PASS** (2026-09-22)
> Prérequis : G1 ✅

## Checklist

### G2.1 — PRNG Complet

- [x] `src/random.js` — `createRng(seed)` avec mulberry32
- [x] `next()` — float [0, 1)
- [x] `int(min, max)` — entier [min, max] inclus
- [x] `pick(arr)` — élément aléatoire
- [x] `getState()` — `{ seed, state }` (sauvegarde)
- [x] `setState(state)` — restore
- [x] `clone()` — indépendant mais même état
- [x] Tests `G2-PRNG` — 7 assertions

### G2.2 — Trois Flux RNG Séparés

- [x] `createRngStreams(seed)` → `{ game, cosmetic, puzzle }`
- [x] Chaque flux dérivé d'un XOR different (0x0, 0xDEADBEEF, 0xCAFEBABE)
- [x] Flux indépendants (avancer l'un n'affecte pas les autres)
- [x] Tests `G2-PRNG` — 2 assertions (déterminisme + indépendance)

### G2.3 — Replay Exact

- [x] 100 seeds × 10 replays = 1000 exécutions identiques
- [x] `generatePuzzle({ rows, cols, moves, attempts, rng })` — seedé
- [x] Tests `G2-REPLAY` — 1 assertion (1000/1000 identiques)

### G2.4 — Cross-Platform Determinism

- [x] `slideBoard` pur — 1000 coups aléatoires, mêmes résultats
- [x] `spawnRandomTile(board, maxValue, rng)` — seedé
- [x] Tests `G2-SLIDE` + `G2-SPAWN` — 2 assertions

### G2.5 — Migration Math.random()

- [x] `src/core/board.js` — `spawnRandomTile`/`fillInitialTiles` acceptent `rng`
- [x] `src/puzzle.js` — `unmerge`/`buildCandidate`/`generatePuzzle` acceptent `rng`
- [x] `tests/playtest-puzzle.mjs` — seedé avec `createRng(1000+i)` / `createRng(2000+i)`
- [x] Fallback `Math.random()` conservé pour compatibilité (non déterministe)

## Résultats

```
G2-PRNG    : 9/9 pass ✅
G2-REPLAY  : 1000 exécutions identiques ✅
G2-SLIDE   : 1000 coups déterministes ✅
G2-SPAWN   : spawn déterministe ✅
Playtest   : 50/50 victoires, 50/50 blocage, 0 faux positif ✅
```

## Prochain Gate

→ **G3 Level Engine V1** sur branche `gate/g3-levels`