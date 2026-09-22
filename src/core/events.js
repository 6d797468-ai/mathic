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
 * Une fusion de deux tuiles a eu lieu.
 *
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
    gained
  };
}

/**
 * Une tuile cible a été atteinte et a "explosé".
 *
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
    isCombo
  };
}

/**
 * La grille a généré une nouvelle tuile (spawn).
 *
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
    cell: { row, col, value }
  };
}

/**
 * La partie est terminée.
 *
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
    score
  };
}
