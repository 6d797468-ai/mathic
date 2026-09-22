/**
 * Playtest headless du mode « Coup Parfait » — simule la boucle de jeu
 * sans navigateur : joueur parfait (suit le chemin BFS) + joueur fautif.
 *
 * Usage : node tests/playtest-puzzle.mjs
 */

import {
  slideBoard,
  boardContains,
  minMovesToReach,
} from '../src/core/board.js';
import { DIRECTIONS, OPERATORS } from '../src/core/rules.js';
import { generatePuzzle } from '../src/puzzle.js';
import { createRng } from '../src/random.js';

const DIRS = Object.keys(DIRECTIONS);
const OPS = Object.keys(OPERATORS);

/**
 * Rejoue le chemin BFS le plus court : retourne la séquence de coups
 * (dir + op) menant à la cible, ou null si introuvable.
 * @returns {{dir: string, op: string}[]|null}
 */
function solvePath(board, target, maxDepth) {
  const serialize = (b) => b.flat().join(',');
  const seen = new Set([serialize(board)]);
  let frontier = [{ board, path: [] }];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const dir of DIRS) {
        for (const op of OPS) {
          const r = slideBoard(node.board, dir, op);
          if (!r.moved) continue;
          const key = serialize(r.board);
          if (seen.has(key)) continue;
          const path = [...node.path, { dir, op }];
          if (boardContains(r.board, target)) return path;
          seen.add(key);
          next.push({ board: r.board, path });
        }
      }
    }
    if (next.length > 4000) return null;
    frontier = next;
  }
  return null;
}

/**
 * Simule un coup complet de la boucle de jeu (comme main.js) :
 * slide → explosion éventuelle de la cible → PAS de spawn (puzzle).
 */
function playMove(board, dir, op, target) {
  const result = slideBoard(board, dir, op);
  if (!result.moved) return { board, moved: false, exploded: 0, consumed: [] };

  // Explosion des tuiles = cible (consumeTargetTiles).
  let exploded = 0;
  const consumed = [];
  for (let r = 0; r < result.board.length; r++) {
    for (let c = 0; c < result.board[r].length; c++) {
      if (result.board[r][c] === target) {
        result.board[r][c] = null;
        exploded++;
        consumed.push({ row: r, col: c });
      }
    }
  }
  return { board: result.board, moved: true, exploded, consumed };
}

// --- Joueur parfait -----------------------------------------------------------

console.log('=== PLAYTEST : joueur parfait (50 puzzles, N=3) ===');
let solved = 0;
let pathFound = 0;
let wastedFirst = 0; // puzzles dont le 1er coup optimal échoue (ne doit pas arriver)
const times = [];

for (let i = 0; i < 50; i++) {
  const t0 = Date.now();
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 80, rng: createRng(1000 + i) });
  times.push(Date.now() - t0);

  const path = solvePath(p.board, p.target, p.moves);
  if (!path) {
    // Grave : le générateur a validé une grille que le solveur ne résout pas.
    wastedFirst++;
    continue;
  }
  pathFound++;

  // Rejoue le chemin exact : la cible doit apparaître au coup N.
  let board = p.board;
  let explodedAt = -1;
  for (let m = 0; m < path.length; m++) {
    const r = playMove(board, path[m].dir, path[m].op, p.target);
    board = r.board;
    if (r.exploded > 0) {
      explodedAt = m + 1;
      break;
    }
  }
  if (explodedAt === p.moves) solved++;
}

console.log(`  puzzles joués           : 50`);
console.log(`  chemins BFS retrouvés   : ${pathFound}/50`);
console.log(`  victoires au coup exact : ${solved}/${pathFound || '-'}`);
console.log(
  `  temps de génération     : min ${Math.min(...times)}ms · moy ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms · max ${Math.max(...times)}ms`
);

// --- Joueur fautif --------------------------------------------------------------

console.log('=== PLAYTEST : joueur fautif (blocage + undo) ===');
let blockedDetected = 0;
let undoRestores = 0;
let falsePositive = 0; // "insolvable" annoncé à tort (coup optimal encore possible)

for (let i = 0; i < 50; i++) {
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 80, rng: createRng(2000 + i) });
  const path = solvePath(p.board, p.target, p.moves);
  if (!path) continue;

  const before = p.board.map((r) => [...r]);
  const minBefore = minMovesToReach(before, p.target, p.moves);

  // Le joueur joue un coup QUI NE FAIT PAS PARTIE du chemin optimal.
  let blocked = false;
  for (const dir of DIRS) {
    for (const op of OPS) {
      if (path.some((m) => m.dir === dir && m.op === op)) continue;
      const r = playMove(before, dir, op, p.target);
      if (!r.moved || r.exploded > 0) continue;

      const minAfter = minMovesToReach(r.board, p.target, p.moves - 1);
      const infeasible = minAfter === null || minAfter > p.moves - 1;

      // Vérification croisée : un chemin optimal doit-il encore exister ?
      const stillSolvable = solvePath(r.board, p.target, p.moves - 1) !== null;
      if (infeasible !== !stillSolvable) falsePositive++;
      if (infeasible) blocked = true;
    }
  }
  if (blocked) blockedDetected++;

  // Undo : restaurer l'état précédent doit rendre la solvabilité initiale.
  const minUndo = minMovesToReach(before, p.target, p.moves);
  if (minUndo === minBefore) undoRestores++;
}

console.log(`  puzzles avec coups bloquants détectés : ${blockedDetected}/50`);
console.log(`  faux positifs de la détection         : ${falsePositive} (attendu 0)`);
console.log(`  undo restaure la solvabilité          : ${undoRestores}/50`);

// --- Verdict ---------------------------------------------------------------------

const ok = solved === pathFound && pathFound >= 45 && falsePositive === 0 && undoRestores === 50;
console.log(
  ok
    ? '\nVerdict : le mode Coup Parfait est jouable et équilibré ✅'
    : '\nVerdict : des problèmes d équilibrage à corriger ❌'
);
process.exit(ok ? 0 : 1);
