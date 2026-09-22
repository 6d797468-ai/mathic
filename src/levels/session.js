/**
 * src/levels/session.js — Session de jeu (G3)
 *
 * Encapsule une partie : état, commandes (swipes), replay, et génération
 * de niveaux. Zéro DOM, zéro effet secondaire.
 *
 * API :
 *   createSession(spec) → Session
 *   session.command(dir, op) → CommandResult
 *   session.replay() → void (restaure l'état initial)
 *   session.getSnapshot() → GameState
 *
 * Gate : G3
 */

import { createBoard, slideBoard, boardContains, spawnRandomTile, fillInitialTiles, hasAnyMove } from '../core/board.js';
import { TARGET_NUMBER, VALUE_CAP } from '../core/rules.js';
import { createRng, createRngStreams } from '../random.js';
import { generatePuzzle } from '../puzzle.js';
import { LEVEL_PALETTE, DEFAULT_BOARD_SIZE } from './definitions.js';

/**
 * Crée une session de jeu (mode libre ou puzzle).
 * @param {{mode: 'free'|'puzzle', rows?: number, cols?: number, target?: number|null,
 *          moves?: number, seed?: number|string, rng?: Object}} spec
 * @returns {Object} Session
 */
export function createSession({
  mode = 'free',
  rows = DEFAULT_BOARD_SIZE.rows,
  cols = DEFAULT_BOARD_SIZE.cols,
  target = null,
  moves = 3,
  seed = Date.now(),
  rng: providedRng,
} = {}) {
  const rng = providedRng || createRng(seed);
  const baseSeed = seed;
  const originalTarget = target;
  const originalMoves = moves;
  let streams = createRngStreams(baseSeed);

  let board = createBoard(rows, cols);
  let score = 0;
  let moveIndex = 0;
  let isGameOver = false;
  let victory = false;
  let puzzleTarget = target;
  let puzzleMoves = moves;
  let history = []; // pour undo (snapshots)

  const snapshot = () => JSON.parse(JSON.stringify({ board, score, moveIndex, isGameOver, victory }));

  const pushHistory = () => {
    history.push(snapshot());
    if (history.length > 50) history.shift();
  };

  const popHistory = () => {
    if (history.length === 0) return false;
    const s = history.pop();
    board = s.board;
    score = s.score;
    moveIndex = s.moveIndex;
    isGameOver = s.isGameOver;
    victory = s.victory;
    return true;
  };

  const initBoard = () => {
    if (mode === 'puzzle') {
      const generated = generatePuzzle({ rows, cols, moves: originalMoves, target: originalTarget, rng: streams.puzzle });
      board = generated.board;
      puzzleTarget = generated.target;
      puzzleMoves = generated.moves;
    } else {
      fillInitialTiles(board, 6, 5, streams.game);
    }
  };

  // Initialisation du plateau.
  initBoard();

  return {
    get mode() { return mode; },
    get rows() { return rows; },
    get cols() { return cols; },
    get target() { return puzzleTarget; },
    get moves() { return puzzleMoves; },
    get currentBoard() { return board; },
    get currentScore() { return score; },
    get currentMoveIndex() { return moveIndex; },
    get gameOver() { return isGameOver; },
    get isVictory() { return victory; },
    get rng() { return rng; },

    /**
     * Applique un coup (swipe direction + opérateur).
     * @param {string} dir
     * @param {string} op
     * @returns {{moved: boolean, mergedCells: Array, invalidCells: Array,
     *           exploded: number, gained: number, gameOver: boolean, victory: boolean}}
     */
    command(dir, op) {
      if (isGameOver) return { moved: false, mergedCells: [], invalidCells: [], exploded: 0, gained: 0, gameOver: true, victory };

      pushHistory();
      const result = slideBoard(board, dir, op);
      board = result.board;
      score += result.gained;
      moveIndex++;

      // Explosion des tuiles = cible (mode puzzle).
      let exploded = 0;
      if (puzzleTarget !== null) {
        for (let r = 0; r < board.length; r++) {
          for (let c = 0; c < board[r].length; c++) {
            if (board[r][c] === puzzleTarget) {
              board[r][c] = null;
              exploded++;
            }
          }
        }
      }

      // Spawn (mode libre uniquement).
      if (mode === 'free' && result.moved) {
        spawnRandomTile(board, 5, streams.game);
      }

      // Game over check.
      isGameOver = !hasAnyMove(board);
      victory = mode === 'puzzle' && exploded > 0;

      return {
        moved: result.moved,
        mergedCells: result.mergedCells,
        invalidCells: result.invalidCells,
        exploded,
        gained: result.gained,
        gameOver: isGameOver,
        victory,
      };
    },

    /**
     * Undo (retour en arrière).
     * @returns {boolean}
     */
    undo() {
      return popHistory();
    },

    /**
     * Snapshot sérialisable de l'état.
     * @returns {Object}
     */
    getSnapshot() {
      return {
        mode,
        rows,
        cols,
        target: puzzleTarget,
        moves: puzzleMoves,
        board,
        score,
        moveIndex,
        isGameOver,
        victory,
        seed: String(baseSeed),
      };
    },

    /**
     * Restaure l'état initial (replay).
     */
    replay() {
      // Recrée les flux à partir de la seed de base (déterministe).
      streams = createRngStreams(baseSeed);

      board = createBoard(rows, cols);
      score = 0;
      moveIndex = 0;
      isGameOver = false;
      victory = false;
      history = [];
      initBoard();
    },
  };
}