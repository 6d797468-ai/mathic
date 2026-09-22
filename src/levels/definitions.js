/**
 * src/levels/definitions.js — Level definitions (G3)
 *
 * Palette de niveaux avec cible + profondeur. Chaque niveau est une
 * spécification : { target, moves, label }. Le générateur (puzzle.js)
 * construit une grille certifiée pour ces paramètres.
 *
 * Gate : G3
 */

/**
 * Palette de niveaux (portée croissante). target=null → cible tirée au hasard
 * dans le pool du générateur.
 * @type {Array<{target: number|null, moves: number, label: string}>}
 */
export const LEVEL_PALETTE = [
  { target: null, moves: 3, label: 'Découverte · 3 coups' },
  { target: 42, moves: 4, label: 'Défi · 42 en 4 coups' },
  { target: 48, moves: 5, label: 'Maître · 48 en 5 coups' },
];

/**
 * Dimensions par défaut du plateau.
 * @type {{rows: number, cols: number}}
 */
export const DEFAULT_BOARD_SIZE = { rows: 4, cols: 4 };

/**
 * Retrouve une définition de niveau par son index (cyclique).
 * @param {number} index
 * @returns {{target: number|null, moves: number, label: string}}
 */
export function getLevelByIndex(index) {
  return LEVEL_PALETTE[index % LEVEL_PALETTE.length];
}

/**
 * Taille totale de la palette.
 * @returns {number}
 */
export function paletteSize() {
  return LEVEL_PALETTE.length;
}