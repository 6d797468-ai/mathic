/**
 * G3 — Level Engine V1
 *
 * Valide les modules : definitions, solver (pur + worker-ready),
 * certificate, session.
 *
 * Usage : node tests/g3-levels.test.mjs
 */

import {
  LEVEL_PALETTE, DEFAULT_BOARD_SIZE, getLevelByIndex, paletteSize,
} from '../src/levels/definitions.js';
import {
  solveLevel, certificateLevel, verifyCertificate,
} from '../src/levels/solver.js';
import { createSession } from '../src/levels/session.js';
import { createBoard } from '../src/core/board.js';
import { createRng } from '../src/random.js';
import { generatePuzzle } from '../src/puzzle.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

// --- G3-DEFINITIONS ----------------------------------------------------------------

console.log('— G3-DEFINITIONS : palette de niveaux —');
check('palette 3 niveaux', LEVEL_PALETTE.length === 3);
check('taille palette = 3', paletteSize() === 3);
check('niveau 0 = Découverte 3 coups', getLevelByIndex(0).label === 'Découverte · 3 coups');
check('niveau cyclique (3 → 0)', getLevelByIndex(3).label === getLevelByIndex(0).label);
check('DEFAULT_BOARD_SIZE 4×4', DEFAULT_BOARD_SIZE.rows === 4 && DEFAULT_BOARD_SIZE.cols === 4);

// --- G3-SOLVER (pur) -----------------------------------------------------------------

console.log('— G3-SOLVER : solveLevel —');
{
  const r = createRng(123);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60, rng: r });
  const solved = solveLevel({ board: p.board, target: p.target, maxMoves: p.moves });
  check('solveLevel trouve un chemin', solved.found === true);
  check('chemin longueur = moves', solved.path.length === p.moves);
}

// --- G3-CERTIFICATE ------------------------------------------------------------------

console.log('— G3-CERTIFICATE : certificateLevel —');
{
  const r = createRng(456);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 4, attempts: 80, rng: r });
  const cert = certificateLevel({ board: p.board, target: p.target, moves: p.moves });
  check('certificat valide', cert.valid === true);
  check('certificat replayOk', cert.replayOk === true);
  check('chemin longueur = moves', cert.path.length === p.moves);
}

// --- G3-VERIFY ------------------------------------------------------------------------

console.log('— G3-CERTIFICATE : verifyCertificate —');
{
  const r = createRng(789);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60, rng: r });
  const solved = solveLevel({ board: p.board, target: p.target, maxMoves: p.moves });
  const ok = verifyCertificate({ board: p.board, target: p.target, moves: p.moves, path: solved.path });
  check('verifyCertificate vrai pour chemin optimal', ok === true);
  // Un chemin trop court (1 coup) doit échouer.
  const bad = verifyCertificate({ board: p.board, target: p.target, moves: p.moves, path: [{ dir: 'up', op: 'add' }] });
  check('verifyCertificate faux pour chemin trop court', bad === false);
}

// --- G3-SESSION -----------------------------------------------------------------------

console.log('— G3-SESSION : createSession —');
{
  const session = createSession({ mode: 'free', rows: 4, cols: 4, seed: 'test-free' });
  check('session free crée', session.mode === 'free');
  check('plateau non vide', session.currentBoard.flat().some((v) => v !== null));
  const before = session.currentMoveIndex;
  const res = session.command('up', 'add');
  check('command renvoie un résultat', typeof res.moved === 'boolean');
  check('moveIndex incrémenté', session.currentMoveIndex === before + 1);
  // Snapshot sérialisable.
  const snap = session.getSnapshot();
  check('snapshot JSON-sérialisable', JSON.stringify(snap).includes('board'));
}

console.log('— G3-SESSION : puzzle + replay —');
{
  const session = createSession({ mode: 'puzzle', rows: 4, cols: 4, moves: 3, seed: 'test-puzzle' });
  check('session puzzle crée', session.mode === 'puzzle');
  check('cible définie', typeof session.target === 'number' && session.target > 0);
  const beforeBoard = JSON.stringify(session.currentBoard);
  session.replay();
  const afterBoard = JSON.stringify(session.currentBoard);
  if (afterBoard !== beforeBoard) {
    console.error('  replay mismatch :', beforeBoard.slice(0, 100), '≠', afterBoard.slice(0, 100));
  }
  check('replay restore plateau identique', afterBoard === beforeBoard);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s)`);
  process.exit(1);
} else {
  console.log('\n✅ G3 Level Engine V1 — tous les tests passent');
}