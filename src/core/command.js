/**
 * core/command.js — GameCommand model & reducer (L4)
 *
 * Le runtime externe ne manipule pas directement le tableau.
 * Il envoie une commande, le moteur l'applique via un reducer pur.
 *
 * Gate : L4
 */

import { slideBoard } from './board.js';
import { boardContains } from './board.js';
import { consumeTargetTiles } from '../targets.js';
import { hasAnyMove, isGameOver } from './board.js';
import { TARGET_NUMBER, VALUE_CAP } from './rules.js';
import { createRng } from '../random.js';

/**
 * Type GameCommand (documentation JSDoc)
 * @typedef {Object} GameCommand
 * @property {'MOVE'} type
 * @property {'up'|'down'|'left'|'right'} dir
 * @property {'add'|'sub'|'mul'|'div'} op
 */

/**
 * Valide une commande.
 * @param {Object} cmd
 * @returns {boolean}
 */
export function isValidCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return false;
  if (cmd.type !== 'MOVE') return false;
  if (!['up', 'down', 'left', 'right'].includes(cmd.dir)) return false;
  if (!['add', 'sub', 'mul', 'div'].includes(cmd.op)) return false;
  return true;
}

/**
 * Résultat de l'application d'une commande.
 * @typedef {Object} CommandResult
 * @property {boolean} moved
 * @property {Array} mergedCells
 * @property {Array} invalidCells
 * @property {number} exploded
 * @property {number} gained
 * @property {boolean} gameOver
 * @property {boolean} victory
 * @property {Array} events - Domain events produits
 */

/**
 * Reducer pur : applique une commande à un état et retourne le nouvel état + événements.
 * @param {Object} state - GameState actuel
 * @param {GameCommand} cmd - Commande à appliquer
 * @param {Object} rng - Instance PRNG pour le spawn
 * @returns {{ state: Object, events: Array }}
 */
export function applyCommand(state, cmd, rng) {
  if (!isValidCommand(cmd)) {
    throw new Error('Commande invalide');
  }

  if (state.isGameOver) {
    return {
      state,
      events: [
        {
          type: 'MOVE_REJECTED',
          moveIndex: state.moves,
          dir: cmd.dir,
          op: cmd.op,
          reason: 'game-over',
          timestamp: Date.now(),
        },
      ],
    };
  }

  const beforeBoard = state.board.map((row) => [...row]);
  const result = slideBoard(state.board, cmd.dir, cmd.op);

  if (!result.moved) {
    return {
      state,
      events: [
        {
          type: 'MOVE_REJECTED',
          moveIndex: state.moves,
          dir: cmd.dir,
          op: cmd.op,
          reason: 'no-move',
          timestamp: Date.now(),
        },
      ],
    };
  }

  const newBoard = result.board;
  let newScore = state.score + result.gained;
  let exploded = 0;
  let victory = false;
  const events = [];

  // Événement MOVE_APPLIED
  events.push({
    type: 'MOVE_APPLIED',
    moveIndex: state.moves,
    dir: cmd.dir,
    op: cmd.op,
    moved: result.moved,
    gained: result.gained,
    mergedCells: result.mergedCells,
    invalidCells: result.invalidCells,
    timestamp: Date.now(),
  });

  // Événements MERGE_OCCURRED
  for (const cell of result.mergedCells) {
    events.push({
      type: 'MERGE_OCCURRED',
      moveIndex: state.moves,
      op: cmd.op,
      cells: [cell],
      gained: cell.value,
      timestamp: Date.now(),
    });
  }

  // Explosion des tuiles cible (mode puzzle)
  if (state.target !== null) {
    const consumed = consumeTargetTiles(newBoard, state.target);
    if (consumed.length > 0) {
      exploded = consumed.length;
      events.push({
        type: 'TARGET_COLLAPSED',
        cells: consumed,
        bonus: 100 * exploded,
        isCombo: false,
        timestamp: Date.now(),
      });
      victory = true;
    }
  }

  // Spawn (mode libre uniquement)
  let spawnEvent = null;
  if (state.target === null && result.moved) {
    const spawn = spawnRandomTile(newBoard, 5, rng);
    if (spawn) {
      spawnEvent = {
        type: 'TILE_SPAWNED',
        cell: { row: spawn.row, col: spawn.col, value: spawn.value },
        timestamp: Date.now(),
      };
      events.push(spawnEvent);
    }
  }

  // Vérification game over
  const newIsGameOver = isGameOver(newBoard);
  const newVictory = state.target !== null ? victory : false;

  const newState = {
    ...state,
    board: newBoard,
    score: newScore,
    moves: state.moves + 1,
    isGameOver: newIsGameOver,
    victory: newVictory,
  };

  // Événement GAME_OVER si applicable
  if (newIsGameOver && !state.isGameOver) {
    events.push({
      type: 'GAME_OVER',
      victory: newVictory,
      score: newScore,
      timestamp: Date.now(),
    });
  }

  return { state: newState, events };
}

/**
 * Spawn une tuile aléatoire (copie depuis board.js pour éviter la dépendance circulaire)
 * @param {(number|null)[][]} board
 * @param {number} maxValue
 * @param {Object} rng
 * @returns {{row: number, col: number, value: number}|null}
 */
function spawnRandomTile(board, maxValue, rng) {
  const empty = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === null) empty.push({ row: r, col: c });
    }
  }
  if (empty.length === 0) return null;
  const idx = Math.floor(rng.next() * empty.length);
  const { row, col } = empty[idx];
  const value = 1 + Math.floor(rng.next() * maxValue);
  board[row][col] = value;
  return { row, col, value };
}