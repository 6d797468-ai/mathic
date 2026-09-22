/**
 * src/levels/solver.worker.js — Adaptation Worker du solveur (G3)
 *
 * Le Worker reçoit un message { type: 'solve', board, target, maxMoves }
 * et répond avec le résultat de solveLevel. Zéro DOM, zéro état global.
 *
 * Gate : G3
 */

import { solveLevel, certificateLevel, verifyCertificate } from './solver.js';

self.onmessage = (ev) => {
  const { id, type, board, target, moves, maxMoves, path } = ev.data;
  try {
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
        self.postMessage({ id, error: `Unknown type: ${type}` });
        return;
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};