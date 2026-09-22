/**
 * src/levels/solver.js — Moteur de résolution de niveau (G3)
 *
 * Moteur PUR : zéro DOM, zéro effet secondaire, entièrement testable.
 * Résout un plateau vers une cible en un nombre donné de coups.
 * Peut tourner dans un Web Worker (via solver.worker.js).
 *
 * API :
 *   solveLevel({ board, target, maxMoves }) → { found, path, nodes, duration }
 *   certificateLevel({ board, target, moves }) → Certificate
 *   verifyCertificate({ board, target, moves, path }) → boolean
 *
 * Gate : G3
 */

import { slideBoard, boardContains } from '../core/board.js';
import { DIRECTIONS, OPERATORS } from '../core/rules.js';

const DIRS = Object.keys(DIRECTIONS);
const OPS = Object.keys(OPERATORS);

const serialize = (b) => b.flat().join(',');
const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

/**
 * Résout un niveau : trouve un chemin de coups (dir + op) menant à la cible
 * en au plus `maxMoves` coups. Recherche en largeur (BFS).
 *
 * @param {{board: (number|null)[][], target: number, maxMoves: number}} spec
 * @returns {{found: boolean, path: Array<{dir: string, op: string}>|null,
 *           nodes: number, duration: number}}
 */
export function solveLevel({ board, target, maxMoves }) {
  const t0 = now();
  const seen = new Set([serialize(board)]);
  let frontier = [{ board, path: [] }];
  let nodes = 1;

  for (let depth = 1; depth <= maxMoves; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const dir of DIRS) {
        for (const op of OPS) {
          const r = slideBoard(node.board, dir, op);
          if (!r.moved) continue;
          const key = serialize(r.board);
          if (seen.has(key)) continue;
          nodes++;
          const path = [...node.path, { dir, op }];
          if (boardContains(r.board, target)) {
            return { found: true, path, nodes, duration: now() - t0 };
          }
          seen.add(key);
          next.push({ board: r.board, path });
        }
      }
    }
    if (next.length > 8000) {
      // Arbre trop large : abandon honnête.
      return { found: false, path: null, nodes, duration: now() - t0 };
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return { found: false, path: null, nodes, duration: now() - t0 };
}

/**
 * Certificat de niveau : prouve qu'une grille est résoluble en EXACTEMENT
 * `moves` coups (ni moins, ni plus). Le certificat est une preuve constructive :
 * le chemin retourné est rejouable et mène à la cible au coup exact.
 *
 * @param {{board: (number|null)[][], target: number, moves: number}} spec
 * @returns {{valid: boolean, path: Array<{dir: string, op: string}>|null,
 *           actualMoves: number|null, nodes: number, duration: number,
 *           replayOk: boolean}}
 */
export function certificateLevel({ board, target, moves }) {
  const t0 = now();
  const result = solveLevel({ board, target, maxMoves: moves });
  if (!result.found) {
    return {
      valid: false,
      path: null,
      actualMoves: null,
      nodes: result.nodes,
      duration: now() - t0,
      replayOk: false,
    };
  }

  // Rejoue le chemin pour valider la profondeur exacte.
  let current = board;
  let explodedAt = -1;
  for (let i = 0; i < result.path.length; i++) {
    const { dir, op } = result.path[i];
    const r = slideBoard(current, dir, op);
    current = r.board;
    if (boardContains(current, target)) {
      explodedAt = i + 1;
      break;
    }
  }

  return {
    valid: result.path.length === moves && explodedAt === moves,
    path: result.path,
    actualMoves: result.path.length,
    nodes: result.nodes,
    duration: now() - t0,
    replayOk: explodedAt === moves,
  };
}

/**
 * Vérifie qu'un chemin (dir+op) est un certificat valide pour un niveau.
 * @param {{board: (number|null)[][], target: number, moves: number, path: Array<{dir: string, op: string}>}}
 * @returns {boolean}
 */
export function verifyCertificate({ board, target, moves, path }) {
  if (!Array.isArray(path) || path.length !== moves) return false;
  let current = board;
  for (let i = 0; i < path.length; i++) {
    const { dir, op } = path[i];
    const r = slideBoard(current, dir, op);
    if (!r.moved) return false;
    current = r.board;
    if (boardContains(current, target)) {
      return i + 1 === moves;
    }
  }
  return boardContains(current, target) && path.length === moves;
}