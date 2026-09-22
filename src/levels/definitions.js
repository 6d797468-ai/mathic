/**
 * src/levels/definitions.js — Level Engine & Definitions (L9, L10)
 *
 * Sépare le MOTEUR (Engine) du CONTENU (Content).
 * Le moteur comprend LevelDefinition, le contenu est dans levels/.
 *
 * Gate : L9, L10
 */

import { generatePuzzle } from '../puzzle.js';

/**
 * Type LevelDefinition (L9)
 * @typedef {Object} LevelDefinition
 * @property {string} id - Identifiant unique (ex: "world-01/chapter-01/level-001")
 * @property {number} target - Nombre cible à atteindre
 * @property {number} moves - Nombre de coups optimal (certifié BFS)
 * @property {string} seed - Seed pour génération déterministe
 * @property {number} [rows=4] - Hauteur du plateau
 * @property {number} [cols=4] - Largeur du plateau
 * @property {string} [label] - Label affiché
 * @property {number} [world] - Monde (pour progression)
 * @property {number} [chapter] - Chapitre (pour progression)
 */

/**
 * Palette de niveaux bootstrap (L9).
 * target=null → cible tirée au hasard dans le pool du générateur.
 * @type {Array<LevelDefinition>}
 */
export const LEVEL_PALETTE = [
  { id: 'tutorial-01', target: 12, moves: 3, seed: 'tutorial-01', label: 'Découverte · 3 coups', world: 1, chapter: 1 },
  { id: 'tutorial-02', target: 24, moves: 4, seed: 'tutorial-02', label: 'Défi · 24 en 4 coups', world: 1, chapter: 1 },
  { id: 'tutorial-03', target: 42, moves: 5, seed: 'tutorial-03', label: 'Maître · 42 en 5 coups', world: 1, chapter: 1 },
];

/**
 * Dimensions par défaut du plateau.
 * @type {{rows: number, cols: number}}
 */
export const DEFAULT_BOARD_SIZE = { rows: 4, cols: 4 };

/**
 * Retrouve une définition de niveau par son index (cyclique).
 * @param {number} index
 * @returns {LevelDefinition}
 */
export function getLevelByIndex(index) {
  return LEVEL_PALETTE[index % LEVEL_PALETTE.length];
}

/**
 * Retrouve une définition de niveau par son ID.
 * @param {string} id
 * @returns {LevelDefinition|undefined}
 */
export function getLevelById(id) {
  return LEVEL_PALETTE.find((l) => l.id === id);
}

/**
 * Taille totale de la palette.
 * @returns {number}
 */
export function paletteSize() {
  return LEVEL_PALETTE.length;
}

/**
 * Génère un niveau certifié à partir d'une LevelDefinition.
 * @param {LevelDefinition} def
 * @param {Object} rng - PRNG instance
 * @returns {{board: (number|null)[][], target: number, moves: number}}
 */
export function generateLevel(def, rng) {
  return generatePuzzle({
    rows: def.rows || DEFAULT_BOARD_SIZE.rows,
    cols: def.cols || DEFAULT_BOARD_SIZE.cols,
    moves: def.moves,
    target: def.target,
    attempts: 200,
    rng,
  });
}