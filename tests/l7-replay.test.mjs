/**
 * L7 — Replay déterministe complet
 *
 * Valide que seed + commandes reconstruit exactement :
 * board, score, moves, events, result
 *
 * Usage : node tests/l7-replay.test.mjs
 */

import { createSession } from '../src/levels/session.js';
import { createRng } from '../src/random.js';
import { generatePuzzle } from '../src/puzzle.js';
import { solveLevel } from '../src/levels/solver.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('— L7-REPLAY : Mode free deterministic replay —');
{
  const seed = 'replay-test-free-1';
  const session1 = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  const session2 = createSession({ mode: 'free', rows: 4, cols: 4, seed });

  // Play 20 moves on session1
  const commands = [
    ['up', 'add'], ['right', 'mul'], ['down', 'sub'], ['left', 'div'],
    ['up', 'add'], ['right', 'mul'], ['down', 'sub'], ['left', 'div'],
    ['up', 'add'], ['right', 'mul'], ['down', 'sub'], ['left', 'div'],
    ['up', 'add'], ['right', 'mul'], ['down', 'sub'], ['left', 'div'],
    ['up', 'add'], ['right', 'mul'], ['down', 'sub'], ['left', 'div'],
  ];

  for (const [dir, op] of commands) {
    session1.command(dir, op);
  }

  const snap1 = session1.getSnapshot();
  const events1 = session1.getEvents();

  // Replay on session2
  session2.replay();
  for (const [dir, op] of commands) {
    session2.command(dir, op);
  }

  const snap2 = session2.getSnapshot();
  const events2 = session2.getEvents();

  check('board identique après replay', deepEqual(snap1.board, snap2.board));
  check('score identique', snap1.score === snap2.score);
  check('moves identique', snap1.moves === snap2.moves);
  check('isGameOver identique', snap1.isGameOver === snap2.isGameOver);
  check('victory identique', snap1.victory === snap2.victory);
  check('seed identique', snap1.seed === snap2.seed);
  check('events count identique', events1.length === events2.length);

  // Compare events (excluding timestamps)
  for (let i = 0; i < events1.length; i++) {
    const e1 = { ...events1[i], timestamp: undefined };
    const e2 = { ...events2[i], timestamp: undefined };
    check(`event ${i} identique`, deepEqual(e1, e2));
  }
}

console.log('— L7-REPLAY : Mode puzzle deterministic replay —');
{
  const seed = 'replay-test-puzzle-1';
  const session1 = createSession({ mode: 'puzzle', rows: 4, cols: 4, moves: 3, seed });
  const session2 = createSession({ mode: 'puzzle', rows: 4, cols: 4, moves: 3, seed });

  // Solve the puzzle to get the exact solution path
  const solution = solveLevel({
    board: session1.currentBoard,
    target: session1.target,
    maxMoves: session1.moves,
  });

  if (solution.found) {
    for (const { dir, op } of solution.path) {
      session1.command(dir, op);
    }

    const snap1 = session1.getSnapshot();
    const events1 = session1.getEvents();

    session2.replay();
    for (const { dir, op } of solution.path) {
      session2.command(dir, op);
    }

    const snap2 = session2.getSnapshot();
    const events2 = session2.getEvents();

    check('puzzle board identique', deepEqual(snap1.board, snap2.board));
    check('puzzle score identique', snap1.score === snap2.score);
    check('puzzle moves identique', snap1.moves === snap2.moves);
    check('puzzle victory identique', snap1.victory === snap2.victory);
    check('puzzle target identique', snap1.target === snap2.target);
    check('puzzle events count identique', events1.length === events2.length);

    for (let i = 0; i < events1.length; i++) {
      const e1 = { ...events1[i], timestamp: undefined };
      const e2 = { ...events2[i], timestamp: undefined };
      check(`puzzle event ${i} identique`, deepEqual(e1, e2));
    }
  }
}

console.log('— L7-REPLAY : 100 seeds × full game replay —');
{
  let ok = true;
  let total = 0;
  for (let seed = 0; seed < 100; seed++) {
    const session1 = createSession({ mode: 'free', rows: 4, cols: 4, seed: String(seed) });
    const session2 = createSession({ mode: 'free', rows: 4, cols: 4, seed: String(seed) });

    // Play 15 moves
    const rng = createRng(seed + 1000);
    const DIRS = ['up', 'down', 'left', 'right'];
    const OPS = ['add', 'sub', 'mul', 'div'];
    const commands = [];

    for (let i = 0; i < 15; i++) {
      const dir = DIRS[rng.int(0, 3)];
      const op = OPS[rng.int(0, 3)];
      commands.push([dir, op]);
    }

    for (const [dir, op] of commands) {
      session1.command(dir, op);
    }

    const snap1 = session1.getSnapshot();

    session2.replay();
    for (const [dir, op] of commands) {
      session2.command(dir, op);
    }

    const snap2 = session2.getSnapshot();

    if (!deepEqual(snap1, snap2)) {
      ok = false;
      console.error(`  seed ${seed} : REPLAY MISMATCH`);
    }
    total++;
  }
  check(`${total} replay complets identiques`, ok);
}

console.log('— L7-REPLAY : Snapshot load/restore —');
{
  const session = createSession({ mode: 'free', rows: 4, cols: 4, seed: 'snapshot-test' });
  session.command('up', 'add');
  session.command('right', 'mul');
  session.command('down', 'sub');

  const snap = session.getSnapshot();
  const serialized = JSON.stringify(snap);
  const restored = JSON.parse(serialized);

  const session2 = createSession({ mode: 'free', rows: 4, cols: 4, seed: 'snapshot-test' });
  session2.loadSnapshot(restored);

  check('loadSnapshot restaure board', deepEqual(session.getSnapshot().board, session2.getSnapshot().board));
  check('loadSnapshot restaure score', session.getSnapshot().score === session2.getSnapshot().score);
  check('loadSnapshot restaure moves', session.getSnapshot().moves === session2.getSnapshot().moves);
  check('loadSnapshot restaure target', session.getSnapshot().target === session2.getSnapshot().target);
}

console.log('— L7-REPLAY : Replay with undo —');
{
  const session1 = createSession({ mode: 'free', rows: 4, cols: 4, seed: 'undo-replay' });
  const session2 = createSession({ mode: 'free', rows: 4, cols: 4, seed: 'undo-replay' });

  session1.command('up', 'add');
  session1.command('right', 'mul');
  session1.undo(); // Back to after first move
  session1.command('down', 'sub');

  const snap1 = session1.getSnapshot();

  session2.replay();
  session2.command('up', 'add');
  session2.command('right', 'mul');
  session2.undo();
  session2.command('down', 'sub');

  const snap2 = session2.getSnapshot();

  check('replay with undo board identique', deepEqual(snap1.board, snap2.board));
  check('replay with undo score identique', snap1.score === snap2.score);
  check('replay with undo moves identique', snap1.moves === snap2.moves);
}

console.log('— L7-REPLAY : K3/U1 continuation déterministe après undo —');
{
  // Préfixe réellement appliqué : l'annulation efface la commande A ;
  // continuer avec X doit être identique à jouer X depuis l'état initial.
  const seed = 'k3-u1';
  const ref = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  ref.command('down', 'sub');
  const refSnap = ref.getSnapshot();

  const s = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  s.command('right', 'mul'); // A
  check('precond : A est bien un coup (moves+1)', s.currentMoveIndex >= 1);
  s.undo(); // retour à S0
  check('undo ramène à la position de départ', s.currentMoveIndex === 0);
  s.command('down', 'sub'); // X
  check('U1 board == [X] directement', deepEqual(s.getSnapshot().board, refSnap.board));
  check('U1 score == [X] directement', s.getSnapshot().score === refSnap.score);
  check('U1 moves == [X] directement', s.getSnapshot().moves === refSnap.moves);
}

console.log('— L7-REPLAY : K3/U2 continuation déterministe après loadSnapshot —');
{
  // Snapshot S0 (état initial, moves=0) → loadSnapshot → X :
  // identique à jouer X directement depuis (seed).
  const seed = 'k3-u2';
  const ref = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  ref.command('up', 'add');
  ref.undo();
  const s0 = ref.getSnapshot(); // S0 : état initial, moves 0

  const t1 = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  t1.loadSnapshot(JSON.parse(JSON.stringify(s0)));
  t1.command('down', 'sub');
  const final1 = t1.getSnapshot();

  const t2 = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  t2.loadSnapshot(JSON.parse(JSON.stringify(s0)));
  t2.command('down', 'sub');
  const final2 = t2.getSnapshot();

  const direct = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  direct.command('down', 'sub');
  const directSnap = direct.getSnapshot();

  check('U2 load(initial)+X reproductible (t1 == t2)', deepEqual(final1, final2));
  check('U2 board == [X] directement', deepEqual(final1.board, directSnap.board) && deepEqual(final1.score, directSnap.score) && deepEqual(final1.moves, directSnap.moves));
}

console.log("— L7-REPLAY : K3/U1+U2 trois chemins identiques (S1 == S1p == S1pp) —");
{
  const seed = 'k3-eq';
  const X = ['down', 'sub'];
  const A = ['right', 'mul'];

  // Chemin 1 : seed → [X] directement (préfixe réel = X)
  const p1 = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  p1.command(X[0], X[1]);
  const s1 = p1.getSnapshot();

  // Chemin 2 : seed → [A], undo, [X] (A effacé → préfixe réel = X)
  const p2 = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  p2.command(A[0], A[1]);
  p2.undo();
  p2.command(X[0], X[1]);
  const s1p = p2.getSnapshot();

  // Chemin 3 : seed → [A], undo → snapshot S0 → load → [X]
  const p3 = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  p3.command(A[0], A[1]);
  p3.undo();
  const s0 = JSON.parse(JSON.stringify(p3.getSnapshot()));
  const p4 = createSession({ mode: 'free', rows: 4, cols: 4, seed });
  p4.loadSnapshot(s0);
  p4.command(X[0], X[1]);
  const s1pp = p4.getSnapshot();

  check('S1 == S1\' (undo) == S1\'\' (snapshot+x)', deepEqual(s1, s1p) && deepEqual(s1p, s1pp));
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s)`);
  process.exit(1);
} else {
  console.log('\n✅ L7 Replay déterministe — tous les tests passent');
}