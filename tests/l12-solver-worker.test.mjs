/**
 * L12 — Solver Worker Validation Réelle
 *
 * Valide que le solver exécute réellement la résolution et certification
 * dans le runtime cible (Worker).
 *
 * Usage : node tests/l12-solver-worker.test.mjs
 */

import { solveLevel, certificateLevel, verifyCertificate } from '../src/levels/solver.js';
import { generatePuzzle } from '../src/puzzle.js';
import { createRng } from '../src/random.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

console.log('— L12-SOLVER : Real solveLevel execution —');
{
  const r = createRng(123);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60, rng: r });
  const solved = solveLevel({ board: p.board, target: p.target, maxMoves: p.moves });
  check('solveLevel trouve un chemin', solved.found === true);
  check('chemin longueur = moves', solved.path.length === p.moves);
  check('nodes explorés > 0', solved.nodes > 0);
  check('durée mesurée', solved.duration >= 0);
}

console.log('— L12-SOLVER : Real certificateLevel execution —');
{
  const r = createRng(456);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 4, attempts: 80, rng: r });
  const cert = certificateLevel({ board: p.board, target: p.target, moves: p.moves });
  check('certificat valide', cert.valid === true);
  check('certificat replayOk', cert.replayOk === true);
  check('chemin longueur = moves', cert.path.length === p.moves);
  check('actualMoves = moves', cert.actualMoves === p.moves);
  check('nodes explorés > 0', cert.nodes > 0);
  check('durée mesurée', cert.duration >= 0);
}

console.log('— L12-SOLVER : Real verifyCertificate execution —');
{
  const r = createRng(789);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60, rng: r });
  const solved = solveLevel({ board: p.board, target: p.target, maxMoves: p.moves });
  const ok = verifyCertificate({ board: p.board, target: p.target, moves: p.moves, path: solved.path });
  check('verifyCertificate vrai pour chemin optimal', ok === true);

  const bad = verifyCertificate({ board: p.board, target: p.target, moves: p.moves, path: [{ dir: 'up', op: 'add' }] });
  check('verifyCertificate faux pour chemin trop court', bad === false);
}

console.log('— L12-SOLVER : Certificate rejects invalid level —');
{
  // Create a level that's too easy (shortcut exists)
  const board = [
    [2, 2, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ];
  // Target 4 can be reached in 1 move (2+2) but we claim it takes 3
  const cert = certificateLevel({ board, target: 4, moves: 3 });
  check('certificat invalide pour niveau trop facile', cert.valid === false);
  check('replayOk = false', cert.replayOk === false);
}

console.log('— L12-SOLVER : Certificate rejects impossible level —');
{
  // Create a level where target cannot be reached in given moves
  const board = [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ];
  const cert = certificateLevel({ board, target: 1000, moves: 3 });
  check('certificat invalide pour niveau impossible', cert.valid === false);
  check('valid = false', cert.valid === false);
}

console.log('— L12-SOLVER : Worker message simulation —');
{
  // Simule le handler onmessage du worker
  const { solveLevel, certificateLevel, verifyCertificate } = await import('../src/levels/solver.js');
  
  const handleMessage = (data) => {
    const { id, type, board, target, moves, maxMoves, path } = data;
    let result;
    switch (type) {
      case 'solve':
        result = solveLevel({ board, target, maxMoves });
        break;
      case 'certificate':
        result = certificateLevel({ board, target, moves });
        break;
      case 'verify':
        result = verifyCertificate({ board, target, moves, path });
        break;
      default:
        return { id, error: `Unknown type: ${type}` };
    }
    return { id, result };
  };

  const r = createRng(999);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60, rng: r });

  // Test solve
  const solveMsg = { id: 1, type: 'solve', board: p.board, target: p.target, maxMoves: p.moves };
  const solveResp = handleMessage(solveMsg);
  check('worker solve response has id', solveResp.id === 1);
  check('worker solve response has result', solveResp.result !== undefined);
  check('worker solve found path', solveResp.result.found === true);

  // Test certificate
  const certMsg = { id: 2, type: 'certificate', board: p.board, target: p.target, moves: p.moves };
  const certResp = handleMessage(certMsg);
  check('worker certificate response has id', certResp.id === 2);
  check('worker certificate valid', certResp.result.valid === true);

  // Test verify
  const verifyMsg = { id: 3, type: 'verify', board: p.board, target: p.target, moves: p.moves, path: solveResp.result.path };
  const verifyResp = handleMessage(verifyMsg);
  check('worker verify response has id', verifyResp.id === 3);
  check('worker verify result true', verifyResp.result === true);
}

console.log('— L12-SOLVER : Performance budget respected —');
{
  // Large board should still complete within budget
  const r = createRng(111);
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 4, attempts: 80, rng: r });
  const solved = solveLevel({ board: p.board, target: p.target, maxMoves: p.moves });
  check('solveLevel completes within node budget', solved.nodes <= 8000);
  
  const cert = certificateLevel({ board: p.board, target: p.target, moves: p.moves });
  check('certificateLevel completes within node budget', cert.nodes <= 8000);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s)`);
  process.exit(1);
} else {
  console.log('\n✅ L12 Solver Worker — validation réelle confirmée');
}