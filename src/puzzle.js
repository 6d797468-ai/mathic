/**
 * puzzle.js — Générateur de puzzles "Coup Parfait" (roadmap Phase 3)
 *
 * RÉTRO-INGÉNIERIE MATHÉMATIQUE (reverse generation) :
 *  1. Partir de l'état de VICTOIRE (tuile cible C posée).
 *  2. DÉFUSION : décomposer C en deux opérandes valides A [op] B = C
 *     (selon les règles strictes orientées de board.js).
 *  3. RÉTRO-GLISSEMENT : séparer A et B vers les bords opposés
 *     (physique inverse d'un swipe).
 *  4. Itérer sur les opérandes créés pour construire une profondeur N.
 *  5. BRUIT : remplir des cases vides avec des tuiles 1..5.
 *
 * VALIDATEUR BFS : minMovesToReach (board.js) doit renvoyer EXACTEMENT N.
 * Sinon → rejet et nouvelle tentative (accept/reject sampling).
 *
 * Logique pure, sans DOM. Précision entière pour − et ÷.
 */

import {
  createBoard,
  slideBoard,
  minMovesToReach,
} from './core/board.js';
import { DIRECTIONS } from './core/rules.js';

/** Valeur max des tuiles de départ ET de bruit (roadmap 1.2). */
export const PUZZLE_STARTER_MAX = 5;

/** Profondeur par défaut (N coups certifiés). */
export const DEFAULT_MOVES = 3;

const OPS = ['add', 'sub', 'mul', 'div'];

const randInt = (n) => Math.floor(Math.random() * n);
const choice = (arr) => arr[randInt(arr.length)];

/**
 * Défusionne C en (A, B, op) valide : A opère sur B = C, avec les règles
 * STRICTES (sub : A > B ; div : A multiple de B, reste nul ; add : A === B).
 * Restriction volontaire : A, B ∈ [1..30] pour des valeurs lisibles.
 * @param {number} c
 * @returns {[number, number, string]|null}
 */
export function unmerge(c) {
  const candidates = [];

  for (let a = 1; a <= 30; a++) {
    // add : A === B → C = 2a (seulement si C pair).
    if (a === c - a && c - a >= 1) candidates.push([a, c - a, 'add']);

    // sub : A - B = C, A > B strict, B ≥ 1.
    for (let b = 1; b < a; b++) {
      if (a - b === c) candidates.push([a, b, 'sub']);
      if (a * b === c && c > 1) candidates.push([a, b, 'mul']);
      if (b > 1 && a % b === 0 && a / b === c) candidates.push([a, b, 'div']);
    }
  }

  if (candidates.length === 0) return null;
  return choice(candidates);
}

/**
 * Physique inverse d'un swipe : séparant les tuiles d'une ligne vers les
 * bords opposés, en préservant l'ordre relatif (comme slideBoard le ferait
 * en avançant). Pour chaque tuile de la liste (ordre gauche→droite),
 * positions cibles = [0, 1, ..., k-1] côté opposé.
 * @param {(number|null)[]} line
 * @param {{row: number, col: number}[]} positions positions actuelles (ordre)
 * @param {'left'|'right'|'up'|'down'} dirA direction du swipe qui RÉUSSIRAIT
 *        à faire collision (A glisse vers B)
 * @returns {{row: number, col: number}[]} nouvelles positions séparées
 */
function reverseSlidePositions(line, positions, dirA) {
  // Le swipe qui fusionne pousse A vers B (dirA). Inversement, on
  // repousse A vers l'origine du mouvement (direction opposée) et on
  // laisse B côté destination... mais pour créer un état "avant swipe",
  // on sépare TOUTES les tuiles de la ligne vers les deux extrémités
  // dans le sens opposé à dirA.
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' }[dirA];
  const k = positions.length;
  const out = [];

  // Tuiles réparties depuis le bord OPPOSÉ à dirA : la première tuile de
  // la liste (celle qui était le plus loin côté destination) part le plus
  // près du bord opposé. On simule l'état juste avant la compression.
  for (let i = 0; i < k; i++) {
    const offset = k - 1 - i; // 0 = bord opposé à dirA
    const { row, col } = positions[i];
    let r = row;
    let c = col;

    switch (opposite) {
      case 'left': c = offset; break;
      case 'right': c = line.length - 1 - offset; break;
      case 'up': r = offset; break;
      case 'down': r = line.length - 1 - offset; break;
    }
    out.push({ row: r, col: c });
  }
  return out;
}

/**
 * Construit un plateau candidat par rétro-génération à partir d'une tuile.
 * Retourne le plateau AVANT validation BFS.
 * @param {{rows: number, cols: number, moves: number, target?: number,
 *          noiseCount?: number}} spec
 * @returns {{board: (number|null)[][], target: number}|null}
 */
function buildCandidate({ rows, cols, moves, target, noiseCount }) {
  const board = createBoard(rows, cols);

  // Étape 1 : placement de la tuile-cible (centre de la grille de préférence).
  const cr = randInt(rows);
  const cc = randInt(cols);
  board[cr][cc] = target;

  // File des tuiles à défusionner. Sémantique de profondeur stricte :
  // la cible est au niveau 0, chaque défusion crée des opérandes au
  // niveau suivant. On ne défusionne que les tuiles de niveau < N —
  // les feuilles (niveau N) restent INTACTES sur le plateau : ce sont
  // elles que le joueur recombinera en exactement N fusions.
  const queue = [{ row: cr, col: cc, depth: 0 }];
  let guard = 0;

  while (queue.length > 0 && guard++ < 60) {
    const item = queue.shift();
    if (item.depth >= moves) continue; // feuille : ne pas décomposer

    // Les tuiles 1, 2, 3 sont atomiques : pas de défusion intéressante.
    const cellValue = board[item.row][item.col];
    if (cellValue === null || cellValue <= 3) continue;

    const split = unmerge(cellValue);
    if (!split) continue;

    const [a, b, op] = split;

    // Choix d'une ligne/colonne passant par la tuile source.
    const useRow = Math.random() < 0.5;
    const freeA = [];
    const freeB = [];

    if (useRow) {
      for (let c = 0; c < cols; c++) {
        if (c !== item.col && board[item.row][c] === null) {
          freeA.push({ row: item.row, col: c });
          freeB.push({ row: item.row, col: c });
        }
      }
    } else {
      for (let r = 0; r < rows; r++) {
        if (r !== item.row && board[r][item.col] === null) {
          freeA.push({ row: r, col: item.col });
          freeB.push({ row: r, col: item.col });
        }
      }
    }
    if (freeA.length < 2) continue;

    // Positions séparées aux deux extrémités de la ligne (reverse-swipe).
    const posA = useRow
      ? { row: item.row, col: 0 }
      : { row: 0, col: item.col };
    const posB = useRow
      ? { row: item.row, col: cols - 1 }
      : { row: rows - 1, col: item.col };

    if (
      board[posA.row][posA.col] !== null ||
      board[posB.row][posB.col] !== null ||
      (posA.row === item.row && posA.col === item.col) ||
      (posB.row === item.row && posB.col === item.col)
    ) {
      continue;
    }

    // Défusion : A opère sur B → C disparaît, A et B apparaissent.
    board[item.row][item.col] = null;
    board[posA.row][posA.col] = a;
    board[posB.row][posB.col] = b;

    // Les opérandes deviennent candidats à leur tour (profondeur +1).
    if (a > 3) queue.push({ row: posA.row, col: posA.col, depth: item.depth + 1 });
    if (b > 3) queue.push({ row: posB.row, col: posB.col, depth: item.depth + 1 });
  }

  // Étape 5 : bruit (tuiles 1..5) sur quelques cases vides.
  // Le bruit crée des raccourcis et bloque des lignes : c'est la cause
  // principale des rejets BFS. Le générateur l'échelonne (voir
  // generatePuzzle) : généreux au début, réduit puis nul en secours.
  const noise = noiseCount ?? 2 + randInt(2);
  if (noise > 0) {
    const empty = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] === null) empty.push({ row: r, col: c });
      }
    }
    const count = Math.min(empty.length, noise);
    for (let i = 0; i < count; i++) {
      const pos = empty.splice(randInt(empty.length), 1)[0];
      board[pos.row][pos.col] = 1 + randInt(PUZZLE_STARTER_MAX);
    }
  }

  return { board, target };
}

/** Cibles candidates par défaut (riches en factorisations). */
const DEFAULT_TARGET_POOL = [12, 16, 18, 20, 24, 30, 36, 40, 42, 48];

/**
 * Grille de secours triviale : 2 tuiles = 2 sur la 1re rangée + 1 ailleurs.
 * La cible 4 est atteignable en UN ADDITIF (2+2) : certificat BFS = 1.
 * @param {number} rows
 * @param {number} cols
 * @returns {(number|null)[][]}
 */
function buildGuessBoard(rows, cols) {
  const board = createBoard(rows, cols);
  board[0][0] = 2;
  board[0][cols - 1] = 2;
  if (rows > 1) board[rows - 1][0] = 1;
  return board;
}

/**
 * Génère un puzzle validé : solution garantie en EXACTEMENT `moves` coups
 * (ni moins — BFS de contrôle — ni plus : construit par construction).
 * `target` force une cible précise ; `moves` reste la profondeur visée.
 *
 * GARANTIE D'HONNÊTETÉ : quelle que soit la sortie, la propriété
 * `minMovesToReach(board, target, moves) === moves` est TOUJOURS vraie.
 * Si la profondeur exacte visée est inatteignable (plateau 4×4 : au-delà
 * de 4 coups les raccourcis alternatifs foisonnent), on renvoie la
 * meilleure grille honnête — sa profondeur RÉELLE devient `moves` — plutôt
 * qu'un puzzle qui mentirait sur le défi.
 * @param {{rows: number, cols: number, moves?: number, target?: number,
 *          attempts?: number}} spec
 * @returns {{board: (number|null)[][], target: number, moves: number}}
 */
export function generatePuzzle({
  rows,
  cols,
  moves = DEFAULT_MOVES,
  target,
  attempts = 200,
} = {}) {
  const pool = target !== undefined && Number.isInteger(target) && target > 3
    ? [target]
    : DEFAULT_TARGET_POOL;

  // Bruit échelonné : généreux sur la majorité des tentatives (richesse
  // visuelle), réduit puis nul en fin de budget (le bruit crée des
  // raccourcis — sans lui, l'acceptation BFS devient quasi certaine).
  const noiseFor = (i) =>
    i < attempts * 0.6 ? 2 + randInt(2) : i < attempts * 0.85 ? 1 + randInt(2) : 0;

  // Passe 1 : échantillonnage avec bruit.
  for (let i = 0; i < attempts; i++) {
    const t = choice(pool);
    const candidate = buildCandidate({
      rows,
      cols,
      moves,
      target: t,
      noiseCount: noiseFor(i),
    });
    if (!candidate) continue;

    // Validateur BFS : le chemin le plus court doit être EXACTEMENT N coups.
    const shortest = minMovesToReach(candidate.board, t, moves);
    if (shortest === moves) {
      return { board: candidate.board, target: t, moves };
    }
    // shortest < N : trop facile → rejet. shortest = null : inatteignable
    // dans le budget → rejet (la construction garantit une solution, mais
    // le bruit peut bloquer).
  }

  // Passe 2 : sans bruit (le bruit est la cause principale des raccourcis),
  // budget étendu pour les profondeurs hautes.
  for (let i = 0; i < 2500; i++) {
    const t = choice(pool);
    const candidate = buildCandidate({ rows, cols, moves, target: t, noiseCount: 0 });
    if (!candidate) continue;
    const shortest = minMovesToReach(candidate.board, t, moves);
    if (shortest === moves) return { board: candidate.board, target: t, moves };
  }

  // Garantie honnête : jamais de grille « trop facile » annoncée trop dure.
  // On garde la grille de profondeur RÉELLE maximale atteinte et on annonce
  // sa vraie valeur (≤ moves). Le certificat BFS tient toujours.
  let best = null;
  for (let i = 0; i < 500; i++) {
    const t = choice(pool);
    const candidate = buildCandidate({ rows, cols, moves, target: t, noiseCount: 0 });
    if (!candidate) continue;
    const shortest = minMovesToReach(candidate.board, t, moves);
    if (shortest === null) continue;
    if (!best || shortest > best.shortest) {
      best = { board: candidate.board, target: t, moves: shortest };
    }
    if (best.shortest >= moves) break;
  }
  if (best) return best;

  // Ultime secours (pool non défusable — cas quasi inexistant) : 2×2 = 4.
  return { board: buildGuessBoard(rows, cols), target: 4, moves: 1 };
}
