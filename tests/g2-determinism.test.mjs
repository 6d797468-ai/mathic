/**
 * G2 — Determinism V1
 *
 * Valide le PRNG (mulberry32), les 3 flux séparés, et le replay exact.
 * Usage : node tests/g2-determinism.test.mjs
 */

import { createRng, createRngStreams } from '../src/random.js';
import { createBoard, slideBoard, spawnRandomTile } from '../src/core/board.js';
import { generatePuzzle } from '../src/puzzle.js';
import { DIRECTIONS, OPERATORS } from '../src/core/rules.js';

const DIRS = Object.keys(DIRECTIONS);
const OPS = Object.keys(OPERATORS);

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

// --- PRNG -----------------------------------------------------------------------

console.log('— G2-PRNG : même seed → même séquence —');
{
  const a = createRng(42);
  const b = createRng(42);
  let ok = true;
  for (let i = 0; i < 1000 && ok; i++) {
    if (a.next() !== b.next()) ok = false;
  }
  check('1000 itérations identiques', ok);
}

console.log('— G2-PRNG : seed différent → séquence différente —');
{
  const a = createRng(42);
  const b = createRng(43);
  let sameCount = 0;
  for (let i = 0; i < 100; i++) {
    if (a.next() === b.next()) sameCount++;
  }
  check('peu de coïncidences (< 5)', sameCount < 5);
}

console.log('— G2-PRNG : int(min, max) bornes respectées —');
{
  const r = createRng(7);
  let ok = true;
  for (let i = 0; i < 1000 && ok; i++) {
    const v = r.int(3, 10);
    if (v < 3 || v > 10) ok = false;
  }
  check('toutes valeurs dans [3,10]', ok);
}

console.log('— G2-PRNG : pick —');
{
  const r = createRng(99);
  const arr = ['a', 'b', 'c'];
  let ok = true;
  for (let i = 0; i < 100 && ok; i++) {
    if (!arr.includes(r.pick(arr))) ok = false;
  }
  check('pick retourne un élément du tableau', ok);
}

console.log('— G2-PRNG : getState/setState roundtrip —');
{
  const r = createRng(123);
  for (let i = 0; i < 50; i++) r.next();
  const state = r.getState();
  const next1 = r.next();
  r.setState(state);
  const next2 = r.next();
  check('next1 === next2 après restore', next1 === next2);
}

console.log('— G2-PRNG : clone indépendant —');
{
  const r = createRng(5);
  const c = r.clone();
  let ok = true;
  for (let i = 0; i < 100 && ok; i++) {
    if (r.next() !== c.next()) ok = false;
  }
  check('clone frais suit la même séquence', ok);

  // Regression K1 : un clone à MI-SÉQUENCE doit repartir de l'état interne
  // courant (et pas de la seed initiale). Le premier clone naïf échouait.
  const r2 = createRng(11);
  for (let i = 0; i < 7; i++) r2.next();
  const c2 = r2.clone();
  let ok2 = true;
  for (let i = 0; i < 100 && ok2; i++) {
    if (r2.next() !== c2.next()) ok2 = false;
  }
  check('clone à mi-séquence (après 7 tirages) suit la même séquence', ok2);
}

console.log('— G2-PRNG : 3 flux séparés —');
{
  // Deux instances fraîches : les 3 flux doivent être identiques.
  const s = createRngStreams(42);
  const s2 = createRngStreams(42);
  let ok = true;
  for (let i = 0; i < 100 && ok; i++) {
    if (s.game.next() !== s2.game.next()) ok = false;
    if (s.cosmetic.next() !== s2.cosmetic.next()) ok = false;
    if (s.puzzle.next() !== s2.puzzle.next()) ok = false;
  }
  check('3 flux déterministes', ok);

  // Chaque flux est indépendant : avancer game n'affecte pas cosmetic/puzzle.
  const a = createRngStreams(1);
  const b = createRngStreams(1);
  for (let i = 0; i < 10; i++) a.game.next();
  let independent = true;
  for (let i = 0; i < 10 && independent; i++) {
    if (a.cosmetic.next() !== b.cosmetic.next()) independent = false;
    if (a.puzzle.next() !== b.puzzle.next()) independent = false;
  }
  check('flux indépendants (game n affecte pas cosmetic/puzzle)', independent);
}

// --- Replay exact (100 seeds × 10 replays = 1000 exécutions) ----------------------

console.log('— G2-REPLAY : 100 seeds × 10 replays —');
{
  let ok = true;
  let total = 0;
  for (let seed = 0; seed < 100; seed++) {
    const r = createRng(seed);
    const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60, rng: r });
    const boardStr0 = JSON.stringify(p.board);

    for (let replay = 0; replay < 10; replay++) {
      total++;
      const r2 = createRng(seed);
      const p2 = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60, rng: r2 });
      if (JSON.stringify(p2.board) !== boardStr0 || p2.target !== p.target || p2.moves !== p.moves) {
        ok = false;
        console.error(`  seed ${seed} replay ${replay} : DIFFÉRENT`);
      }
    }
  }
  check(`${total} exécutions identiques`, ok);
}

// --- Cross-platform determinism : slideBoard pur ----------------------------------

console.log('— G2-SLIDE : slideBoard déterministe (1000 coups) —');
{
  let ok = true;
  for (let i = 0; i < 1000 && ok; i++) {
    const r = createRng(i);
    const board = createBoard(4, 4);
    for (let k = 0; k < 6; k++) {
      const empty = [];
      for (let rr = 0; rr < 4; rr++) for (let c = 0; c < 4; c++) if (board[rr][c] === null) empty.push({ row: rr, col: c });
      if (empty.length === 0) break;
      const pos = empty[r.int(0, empty.length - 1)];
      board[pos.row][pos.col] = 1 + r.int(0, 5);
    }
    const dir = DIRS[r.int(0, DIRS.length - 1)];
    const op = OPS[r.int(0, OPS.length - 1)];
    const r1 = slideBoard(board, dir, op);
    const r2 = slideBoard(board, dir, op);
    if (JSON.stringify(r1.board) !== JSON.stringify(r2.board) || r1.moved !== r2.moved) ok = false;
  }
  check('1000 coups identiques', ok);
}

// --- Board.js spawn déterministe --------------------------------------------------

console.log('— G2-SPAWN : spawnRandomTile déterministe —');
{
  const r = createRng(777);
  const board = createBoard(3, 3);
  const a = spawnRandomTile(board, 5, r);
  const r2 = createRng(777);
  const board2 = createBoard(3, 3);
  const b = spawnRandomTile(board2, 5, r2);
  check('spawn identique', JSON.stringify(a) === JSON.stringify(b));
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s)`);
  process.exit(1);
} else {
  console.log('\n✅ G2 Determinism V1 — tous les tests passent');
}