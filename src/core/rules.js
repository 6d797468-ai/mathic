/**
 * core/rules.js — Constantes et règles fondamentales de MATHIC
 *
 * Gate : G1
 */

/**
 * Opérateurs disponibles et leurs symboles d'affichage.
 */
export const OPERATORS = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
};

/**
 * Nombre cible du mode libre. Une tuile qui atteint EXACTEMENT cette
 * valeur explose (disparaît) et libère la case.
 */
export const TARGET_NUMBER = 24;

/**
 * Plafond des valeurs : toute fusion dont le résultat dépasserait cet
 * entier est REFUSÉE (les tuiles glissent sans se fondre).
 */
export const VALUE_CAP = 999;

/**
 * Directions possibles pour le glissement.
 */
export const DIRECTIONS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};
