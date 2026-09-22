/**
 * targets.js — Génération d'objectifs atteignables
 *
 * Principe (Phase 4) : une cible est "atteignable" si elle peut résulter
 * d'une opération entre deux tuiles actuellement présentes dans la même
 * ligne ou la même colonne (elles peuvent se rencontrer en glissant).
 *
 * Si aucune combinaison actuelle ne convient (plateau pauvre, historique
 * épuisant les candidats), on retombe sur une cible aléatoire dans une
 * fourchette raisonnable — atteignable via les prochaines tuiles générées.
 *
 * Logique pure, sans DOM. Réutilise les règles de board.js.
 */

import { isValidPair, computeMerge } from './board.js';

/** Fourchette de cibles générées. */
export const TARGET_MIN = 6;
export const TARGET_MAX = 60;

/** Taille de l'historique anti-répétition. */
export const HISTORY_SIZE = 5;

const OPS = ['add', 'sub', 'mul', 'div'];

/**
 * La valeur atteint-elle exactement la cible ?
 * @param {number} value
 * @param {number} target
 * @returns {boolean}
 */
export function isTargetReached(value, target) {
  return value === target;
}

/**
 * Collecte tous les résultats d'opérations valides entre paires de tuiles
 * partageant une ligne ou une colonne.
 * @param {(number|null)[][]} board
 * @returns {Set<number>}
 */
export function collectReachableResults(board) {
  const rows = board.length;
  const cols = board[0].length;
  const results = new Set();

  const tryPair = (a, b) => {
    // Règles strictes orientées : on teste les DEUX sens de glissement.
    for (const op of OPS) {
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        if (isValidPair(x, y, op)) {
          const r = computeMerge(x, y, op);
          if (Number.isInteger(r)) results.add(r);
        }
      }
    }
  };

  // Paires horizontales
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      if (board[r][i] === null) continue;
      for (let j = i + 1; j < cols; j++) {
        if (board[r][j] === null) continue;
        tryPair(board[r][i], board[r][j]);
      }
    }
  }

  // Paires verticales
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < rows; i++) {
      if (board[i][c] === null) continue;
      for (let j = i + 1; j < rows; j++) {
        if (board[j][c] === null) continue;
        tryPair(board[i][c], board[j][c]);
      }
    }
  }

  return results;
}

/**
 * Retire toutes les tuiles atteignant exactement la cible (explosion).
 * Mutation volontaire, cohérente avec spawnRandomTile.
 * @param {(number|null)[][]} board
 * @param {number} target
 * @returns {{row: number, col: number, value: number}[]} tuiles consommées
 */
export function consumeTargetTiles(board, target) {
  const consumed = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === target) {
        consumed.push({ row: r, col: c, value: target });
        board[r][c] = null;
      }
    }
  }
  return consumed;
}

/**
 * Trouve toutes les paires de tuiles (même ligne ou colonne) dont une
 * opération valide produit exactement la cible. Sert à la surbrillance
 * pédagogique : montre au joueur où l'objectif est atteignable.
 * @param {(number|null)[][]} board
 * @param {number} target
 * @returns {[{row: number, col: number}, {row: number, col: number}][]}
 */
export function findTargetPairs(board, target) {
  const rows = board.length;
  const cols = board[0].length;
  const pairs = [];
  const seen = new Set();

  const consider = (a, b) => {
    const va = board[a.row][a.col];
    const vb = board[b.row][b.col];
    for (const op of OPS) {
      for (const [x, y] of [[va, vb], [vb, va]]) {
        if (isValidPair(x, y, op) && computeMerge(x, y, op) === target) {
          const key = `${a.row},${a.col}|${b.row},${b.col}`;
          if (!seen.has(key)) {
            seen.add(key);
            pairs.push([a, b]);
          }
          return;
        }
      }
    }
  };

  // Paires horizontales
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      if (board[r][i] === null) continue;
      for (let j = i + 1; j < cols; j++) {
        if (board[r][j] === null) continue;
        consider({ row: r, col: i }, { row: r, col: j });
      }
    }
  }

  // Paires verticales
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < rows; i++) {
      if (board[i][c] === null) continue;
      for (let j = i + 1; j < rows; j++) {
        if (board[j][c] === null) continue;
        consider({ row: i, col: c }, { row: j, col: c });
      }
    }
  }

  return pairs;
}

/**
 * Premier indice exploitable pour la cible : positions des tuiles de la
 * première paire trouvée, leurs VALEURS, et l'opération qui les unit.
 * Sert aux indices du coach : l'op ET les valeurs sont injectés dans le
 * prompt du LLM (Hype-Man), jamais affichés directement.
 * @param {(number|null)[][]} board
 * @param {number} target
 * @returns {{cells: {row: number, col: number}[], op: string, a: number, b: number}|null}
 */
export function findTargetHint(board, target) {
  const rows = board.length;
  const cols = board[0].length;

  const consider = (a, b) => {
    const va = board[a.row][a.col];
    const vb = board[b.row][b.col];
    for (const op of OPS) {
      for (const [x, y] of [[va, vb], [vb, va]]) {
        if (isValidPair(x, y, op) && computeMerge(x, y, op) === target) {
          return { cells: [a, b], op, a: va, b: vb };
        }
      }
    }
    return null;
  };

  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      if (board[r][i] === null) continue;
      for (let j = i + 1; j < cols; j++) {
        if (board[r][j] === null) continue;
        const hit = consider({ row: r, col: i }, { row: r, col: j });
        if (hit) return hit;
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < rows; i++) {
      if (board[i][c] === null) continue;
      for (let j = i + 1; j < rows; j++) {
        if (board[j][c] === null) continue;
        const hit = consider({ row: i, col: c }, { row: j, col: c });
        if (hit) return hit;
      }
    }
  }
  return null;
}

/**
 * Décrit l'atteignabilité de la cible sur le plateau : nombre de paires
 * directes (opérations entre tuiles d'une même ligne/colonne produisant
 * exactement la cible), et tuiles valant déjà la cible.
 * Sert aux commentaires du coach — les faits, garantis justes.
 * @param {(number|null)[][]} board
 * @param {number} target
 * @returns {{directPairs: number, existingTiles: number, achievableNow: boolean}}
 */
export function describeTarget(board, target) {
  const directPairs = findTargetPairs(board, target).length;
  let existingTiles = 0;
  for (const row of board) {
    for (const v of row) {
      if (v === target) existingTiles++;
    }
  }
  return {
    directPairs,
    existingTiles,
    achievableNow: directPairs > 0 || existingTiles > 0,
  };
}

/**
 * Choisit une nouvelle cible.
 * @param {(number|null)[][]} board
 * @param {number[]} [recentTargets] cibles récentes à éviter
 * @returns {number}
 */
export function pickTarget(board, recentTargets = []) {
  const history = new Set(recentTargets.slice(-HISTORY_SIZE));
  const reachable = collectReachableResults(board);

  const candidates = [...reachable].filter(
    (v) => v >= TARGET_MIN && v <= TARGET_MAX && !history.has(v)
  );

  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Fallback : aléatoire dans la fourchette, hors historique si possible.
  const pool = [];
  for (let v = TARGET_MIN; v <= TARGET_MAX; v++) {
    if (!history.has(v)) pool.push(v);
  }
  const source = pool.length > 0 ? pool : [TARGET_MIN + (TARGET_MAX - TARGET_MIN) / 2];
  return source[Math.floor(Math.random() * source.length)];
}
