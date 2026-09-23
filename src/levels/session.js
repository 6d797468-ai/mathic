/**
 * levels/session.js — Session de jeu complète (L6)
 *
 * Encapsule une partie : état, commandes, undo, replay, progression.
 * Zéro DOM, zéro effet secondaire.
 *
 * API :
 *   createSession(spec) → Session
 *   session.command(dir, op) → CommandResult
 *   session.undo() → boolean
 *   session.getSnapshot() → GameState
 *   session.replay() → void
 *   session.getEvents() → Array
 *
 * Gate : L6
 */

import { createInitialState, cloneState, serializeState, deserializeState, generateSessionId } from '../core/state.js';
import { applyCommand, isValidCommand } from '../core/command.js';
import { createRng, createRngStreams } from '../random.js';
import { generatePuzzle } from '../puzzle.js';
import { LEVEL_PALETTE, DEFAULT_BOARD_SIZE, getLevelByIndex } from './definitions.js';
import { isGameOver, fillInitialTiles } from '../core/board.js';
import { createGameStartedEvent } from '../core/events.js';

/**
 * Crée une session de jeu (mode libre ou puzzle).
 * @param {{mode: 'free'|'puzzle', rows?: number, cols?: number, target?: number|null,
 *          moves?: number, seed?: number|string, levelIndex?: number, rng?: Object}} spec
 * @returns {Object} Session
 */
export function createSession({
  mode = 'free',
  rows = DEFAULT_BOARD_SIZE.rows,
  cols = DEFAULT_BOARD_SIZE.cols,
  target = null,
  moves = 3,
  seed = Date.now(),
  levelIndex = 0,
  rng: providedRng,
} = {}) {
  const baseSeed = seed;
  const rng = providedRng || createRng(seed);
  const streams = createRngStreams(baseSeed);

  // K3-U1/U2 : la position du flux game est une fonction pure de
  // (seed, tirages réellement consommés) — jamais un état RNG "opaque"
  // conservé après undo/load. Axe : seed + préfixe réellement appliqué.
  // Reposition = re-dérivation déterministe du seed de base avancée de
  // (baseGameDraws + préfixe) tirages.
  const SPAWN_DRAWS = 2; // spawnRandomTile = 2 rng.next() (idx + valeur)
  let baseGameDraws = 0; // tirages du flux game consommés à la création
  const drawsLedger = []; // tirages consommés par chaque coup appliqué

  const countRng = (stream) => {
    let n = 0;
    return {
      next: (...a) => { n += 1; return stream.next(...a); },
      get total() { return n; },
    };
  };

  const repositionGameStream = (prefixDraws) => {
    const s = createRngStreams(baseSeed);
    let n = baseGameDraws + prefixDraws;
    while (n-- > 0) s.game.next();
    streams.game = s.game;
  };

  // Configuration du niveau
  let puzzleTarget = target;
  let puzzleMoves = moves;
  let currentLevelIndex = levelIndex;

  if (mode === 'puzzle') {
    const levelDef = getLevelByIndex(levelIndex);
    if (target === null) puzzleTarget = levelDef.target;
    if (moves === 3) puzzleMoves = levelDef.moves;
  }

  // État initial
  let state = createInitialState({
    rows,
    cols,
    target: puzzleTarget,
    seed: String(baseSeed),
  });

  // Initialiser le plateau
  if (mode === 'puzzle') {
    const generated = generatePuzzle({
      rows,
      cols,
      moves: puzzleMoves,
      target: puzzleTarget,
      rng: streams.puzzle,
    });
    state = { ...state, board: generated.board, target: generated.target, moves: generated.moves };
  } else {
    // Mode free : remplir avec 6 tuiles initiales
    const fillCounter = countRng(streams.game);
    fillInitialTiles(state.board, 6, 5, fillCounter);
    baseGameDraws = fillCounter.total;
  }

  // Historique pour undo (pile d'états complets)
  const history = [];
  const maxHistory = 50;
  let eventLog = [];

  // Événement de démarrage
  const startEvent = createGameStartedEvent({
    sessionId: state.sessionId,
    mode,
    rows,
    cols,
    target: state.target,
    moves: state.moves,
  });
  eventLog.push(startEvent);

  const pushHistory = () => {
    history.push(cloneState(state));
    if (history.length > maxHistory) history.shift();
  };

  const popHistory = () => {
    if (history.length === 0) return false;
    state = history.pop();
    return true;
  };

  const recordEvents = (events) => {
    eventLog.push(...events);
  };

  return {
    get mode() { return mode; },
    get rows() { return rows; },
    get cols() { return cols; },
    get target() { return state.target; },
    get moves() { return state.moves; },
    get currentBoard() { return state.board; },
    get currentScore() { return state.score; },
    get currentMoveIndex() { return state.moves; },
    get gameOver() { return state.isGameOver; },
    get isVictory() { return state.victory; },
    get sessionId() { return state.sessionId; },
    get seed() { return state.seed; },

    /**
     * Applique un coup (direction + opérateur).
     * @param {string} dir
     * @param {string} op
     * @returns {CommandResult}
     */
    command(dir, op) {
      if (state.isGameOver) {
        return { moved: false, mergedCells: [], invalidCells: [], exploded: 0, gained: 0, gameOver: true, victory: state.victory };
      }

      if (!isValidCommand({ type: 'MOVE', dir, op })) {
        return { moved: false, mergedCells: [], invalidCells: [], exploded: 0, gained: 0, gameOver: false, victory: false };
      }

      pushHistory();
      const gameCounter = countRng(streams.game);
      const { state: newState, events } = applyCommand(state, { type: 'MOVE', dir, op }, gameCounter);
      drawsLedger.push(gameCounter.total);
      state = newState;
      recordEvents(events);

      return {
        moved: events.some((e) => e.type === 'MOVE_APPLIED' && e.moved),
        mergedCells: events.filter((e) => e.type === 'MERGE_OCCURRED').flatMap((e) => e.cells),
        invalidCells: events.find((e) => e.type === 'MOVE_APPLIED')?.invalidCells || [],
        exploded: events.filter((e) => e.type === 'TARGET_COLLAPSED').reduce((sum, e) => sum + e.cells.length, 0),
        gained: events.filter((e) => e.type === 'MOVE_APPLIED').reduce((sum, e) => sum + e.gained, 0),
        gameOver: state.isGameOver,
        victory: state.victory,
        events,
      };
    },

    /**
     * Undo (retour en arrière d'un coup).
     * K5-U3 : autorisé même après game over — on revient à un état
     * précédent légal (la pile historique ne contient QUE des états
     * « avant-coup », jamais game-over). Le runtime « dégrise » l'écran
     * de fin récupère une partie jouable.
     * @returns {boolean}
     */
    undo() {
      const result = popHistory();
      if (result) {
        drawsLedger.pop();
        repositionGameStream(drawsLedger.reduce((a, b) => a + b, 0));
        recordEvents([{ type: 'UNDO_APPLIED', moveIndex: state.moves, timestamp: Date.now() }]);
      }
      return result;
    },

    /**
     * Snapshot sérialisable de l'état complet.
     * @returns {GameState}
     */
    getSnapshot() {
      return cloneState(state);
    },

    /**
     * Restaure l'état initial (replay déterministe).
     */
    replay() {
      // Recrée les flux à partir de la seed de base
      const newStreams = createRngStreams(baseSeed);
      Object.assign(streams, newStreams);

      // Recrée l'état initial
      state = createInitialState({
        sessionId: state.sessionId,
        rows,
        cols,
        target: puzzleTarget,
        seed: String(baseSeed),
      });

      if (mode === 'puzzle') {
        const generated = generatePuzzle({
          rows,
          cols,
          moves: puzzleMoves,
          target: puzzleTarget,
          rng: streams.puzzle,
        });
        state = { ...state, board: generated.board, target: generated.target, moves: generated.moves };
      } else {
        fillInitialTiles(state.board, 6, 5, streams.game);
      }

      history.length = 0;
      drawsLedger.length = 0;
      eventLog = [startEvent];
    },

    /**
     * Récupère tous les événements émis.
     * @returns {Array}
     */
    getEvents() {
      return [...eventLog];
    },

    /**
     * Charge un état sérialisé (pour replay/persistance).
     * @param {GameState} snapshot
     */
    loadSnapshot(snapshot) {
      if (!isValidGameState(snapshot)) {
        throw new Error('Snapshot invalide');
      }
      state = cloneState(snapshot);
      history.length = 0;
      drawsLedger.length = 0;
      // Re-dérive la position du flux game à partir de (seed, préfixe) :
      // en mode free, chaque coup appliqué consomme SPAWN_DRAWS tirages ;
      // en mode puzzle (target !== null) le flux game n'est jamais consommé
      // par les coups. Estimation exacte pour le cas nominal (chaque coup
      // du snapshot a spawné), reproductible dans tous les cas.
      const applied = snapshot.target === null ? Math.max(0, snapshot.moves) : 0;
      const prefixDraws = applied * SPAWN_DRAWS;
      for (let i = 0; i < applied; i++) drawsLedger.push(SPAWN_DRAWS);
      repositionGameStream(prefixDraws);
    },

    /**
     * Passe au niveau suivant (mode puzzle).
     * @returns {boolean}
     */
    nextLevel() {
      if (mode !== 'puzzle') return false;
      currentLevelIndex++;
      const levelDef = getLevelByIndex(currentLevelIndex);
      puzzleTarget = levelDef.target;
      puzzleMoves = levelDef.moves;
      return true;
    },

    /**
     * Retourne la définition du niveau courant.
     * @returns {Object}
     */
    getCurrentLevel() {
      return getLevelByIndex(currentLevelIndex);
    },
  };
}

/**
 * Valide un GameState (import depuis state.js)
 * @param {Object} state
 * @returns {boolean}
 */
function isValidGameState(state) {
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