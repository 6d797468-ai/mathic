/**
 * core/state.js — GameState contract (L3)
 *
 * Contrat de référence sérialisable, sans DOM, sans navigateur,
 * sans Android, sans réseau.
 *
 * Gate : L3
 */

import { createBoard } from './board.js';
import { TARGET_NUMBER } from './rules.js';
import { toUint32 } from '../random.js';

/**
 * Type GameState (documentation JSDoc)
 * @typedef {Object} GameState
 * @property {string} sessionId
 * @property {number} rows
 * @property {number} cols
 * @property {number|null} target
 * @property {Array<Array<number|null>>} board
 * @property {number} score
 * @property {number} moves
 * @property {boolean} isGameOver
 * @property {boolean} victory
 * @property {string} seed
 */

/**
 * Génère un sessionId déterministe à partir d'une seed.
 * @param {string|number} seed
 * @returns {string}
 */
export function generateSessionId(seed) {
  return `sess-${toUint32(seed).toString(16)}`;
}

/**
 * Crée un GameState initial vide.
 * @param {Object} params
 * @param {string} [params.sessionId] — Si absent, généré depuis la seed
 * @param {number} params.rows
 * @param {number} params.cols
 * @param {number|null} params.target
 * @param {string} params.seed
 * @returns {GameState}
 */
export function createInitialState({ sessionId, rows, cols, target, seed }) {
  return {
    sessionId: sessionId || generateSessionId(seed),
    rows,
    cols,
    target,
    board: createBoard(rows, cols),
    score: 0,
    moves: 0,
    isGameOver: false,
    victory: false,
    seed: String(seed),
  };
}

/**
 * Valide qu'un objet respecte le contrat GameState.
 * @param {Object} state
 * @returns {boolean}
 */
export function isValidGameState(state) {
  if (!state || typeof state !== 'object') return false;
  if (typeof state.sessionId !== 'string') return false;
  if (!Number.isInteger(state.rows) || state.rows <= 0) return false;
  if (!Number.isInteger(state.cols) || state.cols <= 0) return false;
  if (state.target !== null && (!Number.isInteger(state.target) || state.target <= 0)) return false;
  if (!Array.isArray(state.board)) return false;
  if (state.board.length !== state.rows) return false;
  for (const row of state.board) {
    if (!Array.isArray(row) || row.length !== state.cols) return false;
    for (const cell of row) {
      if (cell !== null && (!Number.isInteger(cell) || cell <= 0)) return false;
    }
  }
  if (!Number.isInteger(state.score) || state.score < 0) return false;
  if (!Number.isInteger(state.moves) || state.moves < 0) return false;
  if (typeof state.isGameOver !== 'boolean') return false;
  if (typeof state.victory !== 'boolean') return false;
  if (typeof state.seed !== 'string') return false;
  return true;
}

/**
 * Clone profond d'un GameState (immutabilité).
 * @param {GameState} state
 * @returns {GameState}
 */
export function cloneState(state) {
  return {
    ...state,
    board: state.board.map((row) => [...row]),
  };
}

/**
 * Vérifie l'égalité profonde de deux GameState.
 * @param {GameState} a
 * @param {GameState} b
 * @returns {boolean}
 */
export function equalState(a, b) {
  if (a.sessionId !== b.sessionId) return false;
  if (a.rows !== b.rows || a.cols !== b.cols) return false;
  if (a.target !== b.target) return false;
  if (a.score !== b.score) return false;
  if (a.moves !== b.moves) return false;
  if (a.isGameOver !== b.isGameOver) return false;
  if (a.victory !== b.victory) return false;
  if (a.seed !== b.seed) return false;
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) {
      if (a.board[r][c] !== b.board[r][c]) return false;
    }
  }
  return true;
}

/**
 * Sérialise un GameState en JSON safe.
 * @param {GameState} state
 * @returns {string}
 */
export function serializeState(state) {
  return JSON.stringify(state);
}

/**
 * Désérialise un GameState depuis JSON.
 * @param {string} json
 * @returns {GameState}
 */
export function deserializeState(json) {
  return JSON.parse(json);
}