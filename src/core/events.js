/**
 * core/events.js — Domain Events pour MATHIC V4
 *
 * Ces événements sont de purs objets de données (Plain Old JavaScript Objects).
 * Ils décrivent formellement ce qui s'est produit dans la logique du jeu.
 *
 * Ils ne contiennent AUCUNE méthode et ne font AUCUNE référence à l'UI,
 * à l'audio ou à l'état du DOM. Ce sont des contrats de découplage purs.
 *
 * Le GameState ou le Board produit ces événements, et des listeners
 * (UI, Audio, Momo, Replay) réagiront en conséquence.
 *
 * Gate : G1
 */

/**
 * Valide la pureté d'un événement : pas de fonction, pas de DOM,
 * pas de référence circulaire, JSON-sérialisable + structuredClone-able.
 * @param {Object} event
 * @returns {boolean}
 */
export function isPureEvent(event) {
  if (typeof event !== 'object' || event === null) return false;
  // Aucune fonction
  for (const key of Object.keys(event)) {
    if (typeof event[key] === 'function') return false;
  }
  // Aucune référence DOM
  if ('document' in event || 'window' in event || 'navigator' in event) return false;
  // JSON-sérialisable
  try {
    JSON.parse(JSON.stringify(event));
  } catch {
    return false;
  }
  // structuredClone-able (vérification defensive)
  try {
    structuredClone(event);
  } catch {
    return false;
  }
  return true;
}

/**
 * Une partie a démarré.
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.mode — 'free' | 'puzzle'
 * @param {number} params.rows
 * @param {number} params.cols
 * @param {number|null} params.target
 * @param {number|null} params.moves
 * @returns {Object} Domain Event
 */
export function createGameStartedEvent({ sessionId, mode, rows, cols, target, moves }) {
  return {
    type: 'GAME_STARTED',
    timestamp: Date.now(),
    sessionId,
    mode,
    rows,
    cols,
    target,
    moves,
  };
}

/**
 * Un coup a été appliqué avec succès.
 * @param {Object} params
 * @param {number} params.moveIndex
 * @param {string} params.dir
 * @param {string} params.op
 * @param {boolean} params.moved
 * @param {number} params.gained
 * @param {Array} params.mergedCells
 * @param {Array} params.invalidCells
 * @returns {Object} Domain Event
 */
export function createMoveAppliedEvent({ moveIndex, dir, op, moved, gained, mergedCells, invalidCells }) {
  return {
    type: 'MOVE_APPLIED',
    timestamp: Date.now(),
    moveIndex,
    dir,
    op,
    moved,
    gained,
    mergedCells,
    invalidCells,
  };
}

/**
 * Un coup a été rejeté.
 * @param {Object} params
 * @param {number} params.moveIndex
 * @param {string} params.dir
 * @param {string} params.op
 * @param {string} params.reason — 'no-move' | 'game-over' | 'busy'
 * @returns {Object} Domain Event
 */
export function createMoveRejectedEvent({ moveIndex, dir, op, reason }) {
  return {
    type: 'MOVE_REJECTED',
    timestamp: Date.now(),
    moveIndex,
    dir,
    op,
    reason,
  };
}

/**
 * Une fusion de deux tuiles a eu lieu.
 * @param {Object} params
 * @param {number} params.moveIndex   L'index du coup joué
 * @param {string} params.op          L'opérateur utilisé (add, sub, mul, div)
 * @param {Object[]} params.cells     Les cellules concernées (au moins la destination)
 * @param {number} params.gained      Le score gagné par cette fusion
 * @returns {Object} Domain Event
 */
export function createMergeEvent({ moveIndex, op, cells, gained }) {
  return {
    type: 'MERGE_OCCURRED',
    timestamp: Date.now(),
    moveIndex,
    op,
    cells,
    gained,
  };
}

/**
 * Une tuile cible a été atteinte et a "explosé".
 * @param {Object} params
 * @param {Object[]} params.cells     Les cellules ayant explosé
 * @param {number} params.bonus       Le bonus gagné
 * @param {boolean} params.isCombo    Vrai si cela fait partie d'une chaîne
 * @returns {Object} Domain Event
 */
export function createTargetCollapsedEvent({ cells, bonus, isCombo = false }) {
  return {
    type: 'TARGET_COLLAPSED',
    timestamp: Date.now(),
    cells,
    bonus,
    isCombo,
  };
}

/**
 * La grille a généré une nouvelle tuile (spawn).
 * @param {Object} params
 * @param {number} params.row
 * @param {number} params.col
 * @param {number} params.value
 * @returns {Object} Domain Event
 */
export function createTileSpawnedEvent({ row, col, value }) {
  return {
    type: 'TILE_SPAWNED',
    timestamp: Date.now(),
    cell: { row, col, value },
  };
}

/**
 * Un undo a été appliqué.
 * @param {Object} params
 * @param {number} params.moveIndex
 * @returns {Object} Domain Event
 */
export function createUndoAppliedEvent({ moveIndex }) {
  return {
    type: 'UNDO_APPLIED',
    timestamp: Date.now(),
    moveIndex,
  };
}

/**
 * Un niveau puzzle a été complété.
 * @param {Object} params
 * @param {number} params.moves
 * @param {number} params.optimalMoves
 * @param {number} params.score
 * @returns {Object} Domain Event
 */
export function createLevelCompletedEvent({ moves, optimalMoves, score }) {
  return {
    type: 'LEVEL_COMPLETED',
    timestamp: Date.now(),
    moves,
    optimalMoves,
    score,
  };
}

/**
 * La partie est terminée.
 * @param {Object} params
 * @param {boolean} params.victory    Vrai si gagné (tous niveaux complétés), faux si bloqué
 * @param {number} params.score       Score final
 * @returns {Object} Domain Event
 */
export function createGameOverEvent({ victory, score }) {
  return {
    type: 'GAME_OVER',
    timestamp: Date.now(),
    victory,
    score,
  };
}