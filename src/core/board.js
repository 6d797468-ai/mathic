/**
 * board.js — Modèle du plateau (logique pure, sans DOM)
 *
 * La grille est un tableau 2D [rows][cols].
 * Chaque cellule contient soit `null` (case vide), soit un entier > 0.
 *
 * Règles de fusion (Phase 3, version STRICTE orientée) — pour une paire
 * (percutee B, arrivante A) qui se rencontre en glissant : A [op] B = C,
 * et C prend la place de B. Le SENS du swipe compte pour − et ÷ :
 *   + (add) : A === B uniquement                 → A + B
 *   − (sub) : A > B strictement                  → A − B   (jamais ≤ 0)
 *   × (mul) : toute paire                        → A × B
 *   ÷ (div) : A % B === 0 (A multiple de B)      → A ÷ B   (reste nul)
 * Exemples : 5 glisse sur 2 → 3 ; 2 glisse sur 5 → invalide.
 * 6 glisse sur 3 → 2 ; 3 glisse sur 6 → invalide.
 *
 * V3 « Effondrement » : toute fusion dont le résultat dépasserait
 * VALUE_CAP (999) est REFUSÉE (VALUE_CAP, isValidMerge) — le joueur doit
 * réduire (÷, −) plutôt que gonfler les nombres indéfiniment.
 *
 * Une tuile ne fusionne qu'UNE fois par coup (héritage Phase 2).
 * La paire destination-side fusionne en priorité.
 *
 * Toutes les fonctions de glissement sont pures ; le rendu est assuré
 * par ui.js ; ce fichier ne touche jamais au DOM.
 */

import { createRng } from '../random.js';
import { OPERATORS, TARGET_NUMBER, VALUE_CAP, DIRECTIONS } from './rules.js';

/**
 * Crée une grille vide rows x cols.
 * @param {number} rows
 * @param {number} cols
 * @returns {(number|null)[][]}
 */
export function createBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

/**
 * Retourne la liste des coordonnées des cases vides.
 * @param {(number|null)[][]} board
 * @returns {{row: number, col: number}[]}
 */
export function getEmptyCells(board) {
  const empty = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === null) empty.push({ row: r, col: c });
    }
  }
  return empty;
}

/**
 * Insère une tuile (valeur 1 à maxValue) dans une case vide.
 * Mutation volontaire : commodité d'usage pour l'extérieur.
 *
 * Rebranding/équilibrage (roadmap 1.2) : le spawn NATUREL est strictement
 * limité aux tuiles 1..5 — par défaut comme par convention d'appel. Les
 * valeurs > 5 ne s'obtiennent que par fusion.
 *
 * @param {(number|null)[][]} board
 * @param {number} [maxValue]
 * @param {Object} [rng] — instance PRNG (createRng). Si absent, fallback
 *   Math.random() pour compatibilité (non déterministe).
 * @returns {({row: number, col: number, value: number}|null)}
 */
export function spawnRandomTile(board, maxValue = 5, rng = null) {
  const empty = getEmptyCells(board);
  if (empty.length === 0) return null;

  const rand = rng || { next: () => Math.random() };
  const idx = Math.floor(rand.next() * empty.length);
  const { row, col } = empty[idx];
  const value = 1 + Math.floor(rand.next() * maxValue);
  board[row][col] = value;
  return { row, col, value };
}

/**
 * Remplit le plateau avec n tuiles (état de départ).
 * Tuiles limitées à 1..5 (roadmap 1.2).
 * @param {(number|null)[][]} board
 * @param {number} n
 * @param {number} [maxValue]
 * @param {Object} [rng]
 */
export function fillInitialTiles(board, n = 6, maxValue = 5, rng = null) {
  for (let i = 0; i < n; i++) spawnRandomTile(board, maxValue, rng);
}

// --- Règles de fusion par opérateur ---------------------------------------

/**
 * Une paire (arrivante a, percutée b) est-elle fusionnable ? STRICTE :
 * le sens du swipe compte (a est la tuile qui glisse, b celle percutée).
 * @param {number} a
 * @param {number} b
 * @param {'add'|'sub'|'mul'|'div'} op
 * @returns {boolean}
 */
export function isValidPair(a, b, op) {
  switch (op) {
    case 'add':
      return a === b;
    case 'sub':
      return a > b; // strictement supérieure, résultat ≥ 1 garanti
    case 'mul':
      return true; // toute paire
    case 'div':
      return a % b === 0; // a multiple de b, reste nul
    default:
      return false;
  }
}

/**
 * Calcule le résultat de la fusion A [op] B avec A = tuile arrivante,
 * B = tuile percutée. STRICTE : pas de réorientation automatique.
 * À n'appeler que si isValidPair(a, b, op) est vrai.
 * @param {number} a
 * @param {number} b
 * @param {'add'|'sub'|'mul'|'div'} op
 * @returns {number}
 */
export function computeMerge(a, b, op) {
  switch (op) {
    case 'add':
      return a + b;
    case 'sub':
      return a - b;
    case 'mul':
      return a * b;
    case 'div':
      return a / b;
    default:
      throw new Error(`Opérateur inconnu : ${op}`);
  }
}

/**
 * Valide une paire ET le respect du plafond (VALUE_CAP) : une fusion dont
 * le résultat dépasserait le plafond est refusée (blocage V3).
 * @param {number} a tuile arrivante
 * @param {number} b tuile percutée
 * @param {'add'|'sub'|'mul'|'div'} op
 * @returns {boolean}
 */
export function isValidMerge(a, b, op) {
  return isValidPair(a, b, op) && computeMerge(a, b, op) <= VALUE_CAP;
}

// --- Glissement ------------------------------------------------------------


/**
 * Glisse une ligne (cellules ordonnées vers la destination) avec l'opérateur :
 * compacte les tuiles, fusionne les paires valides (une fois chacune).
 *
 * ORIENTATION STRICTE : la tuire de DERRIÈRE (côté départ) glisse et
 * percutte celle de DEVANT (côté destination). A = arrivante = derrière,
 * B = percutée = devant ; le résultat atterrit sur la case de B.
 *
 * Repère aussi les paires invalides qui entrent en contact (pour le shake).
 * Chaque tuile est suivie individuellement (tileMoves) afin que la couche
 * UI puisse animer les trajectoires réelles.
 * @param {(number|null)[]} line
 * @param {'add'|'sub'|'mul'|'div'} op
 * @returns {{
 *   values: (number|null)[],
 *   mergedFlags: boolean[],
 *   gained: number,
 *   invalidContactFlags: boolean[],
 *   tileMoves: ({from: number}|{aFrom: number, bFrom: number}|null)[]
 * }}
 */
export function slideLine(line, op) {
  // Chaque tuile garde son index d'origine dans la ligne (pour la trajectoire).
  const tiles = [];
  line.forEach((v, idx) => {
    if (v !== null) tiles.push({ value: v, from: idx });
  });

  const values = [];
  const mergedFlags = [];
  const invalidContactFlags = [];
  const tileMoves = [];
  let gained = 0;

  for (let i = 0; i < tiles.length; i++) {
    const hit = tiles[i]; // devant, côté destination — c'est B
    const arriving = i + 1 < tiles.length ? tiles[i + 1] : null; // derrière — c'est A

    if (arriving !== null && isValidMerge(arriving.value, hit.value, op)) {
      const result = computeMerge(arriving.value, hit.value, op);
      values.push(result); // le résultat prend la place de B (devant)
      mergedFlags.push(true);
      invalidContactFlags.push(false);
      // Deux tuiles convergent vers la case de B.
      tileMoves.push({ aFrom: arriving.from, bFrom: hit.from });
      gained += result;
      i++; // la tuile arrivante est consommée
    } else {
      values.push(hit.value);
      mergedFlags.push(false);
      tileMoves.push({ from: hit.from });
      // Contact invalide : une arrivante existe, la paire est refusée, et
      // l'arrivante ne fusionne pas non plus avec sa propre suivante
      // (sinon le contact avec B n'a jamais lieu réellement).
      const nextOfArriving = i + 2 < tiles.length ? tiles[i + 2].value : null;
      const arrivingMergesBehind =
        arriving !== null &&
        nextOfArriving !== null &&
        isValidMerge(nextOfArriving, arriving.value, op);
      invalidContactFlags.push(arriving !== null && !arrivingMergesBehind);
    }
  }

  while (values.length < line.length) {
    values.push(null);
    mergedFlags.push(false);
    invalidContactFlags.push(false);
    tileMoves.push(null);
  }
  return { values, mergedFlags, gained, invalidContactFlags, tileMoves };
}

/**
 * Extrait les lignes "orientées destination" du plateau pour une direction.
 * @param {(number|null)[][]} board
 * @param {'up'|'down'|'left'|'right'} dir
 * @returns {{ lines: (number|null)[][], positions: {row: number, col: number}[][] }}
 */
function extractLines(board, dir) {
  const rows = board.length;
  const cols = board[0].length;
  const lines = [];
  const positions = [];

  for (let i = 0; i < (dir === 'up' || dir === 'down' ? cols : rows); i++) {
    const line = [];
    const pos = [];
    for (let j = 0; j < (dir === 'up' || dir === 'down' ? rows : cols); j++) {
      let r, c;
      switch (dir) {
        case 'up': r = j; c = i; break;
        case 'down': r = rows - 1 - j; c = i; break;
        case 'left': r = i; c = j; break;
        case 'right': r = i; c = cols - 1 - j; break;
      }
      line.push(board[r][c]);
      pos.push({ row: r, col: c });
    }
    lines.push(line);
    positions.push(pos);
  }
  return { lines, positions };
}

/**
 * Applique un glissement complet du plateau dans la direction donnée,
 * avec l'opérateur sélectionné. Fonction pure : retourne un NOUVEAU plateau.
 * @param {(number|null)[][]} board
 * @param {'up'|'down'|'left'|'right'} dir
 * @param {'add'|'sub'|'mul'|'div'} [op]
 * @returns {{
 *   board: (number|null)[][],
 *   moved: boolean,
 *   gained: number,
 *   mergedCells: {row: number, col: number, value: number}[],
 *   invalidCells: {row: number, col: number}[],
 *   moves: {fromRow: number, fromCol: number, toRow: number, toCol: number, value: number}[]
 * }}
 */
export function slideBoard(board, dir, op = 'add') {
  const { lines, positions } = extractLines(board, dir);
  const newBoard = board.map((row) => [...row]);
  const mergedCells = [];
  const invalidCells = [];
  const moves = [];
  let moved = false;
  let gained = 0;

  for (let i = 0; i < lines.length; i++) {
    const { values, mergedFlags, gained: g, invalidContactFlags, tileMoves } =
      slideLine(lines[i], op);
    gained += g;

    for (let j = 0; j < values.length; j++) {
      const { row, col } = positions[i][j];
      const before = board[row][col];
      const after = values[j];
      if (before !== after) moved = true;
      newBoard[row][col] = after;

      const info = tileMoves[j];
      if (info) {
        if (info.aFrom !== undefined) {
          // Fusion : la tuile arrivante (A) ET la tuile percutée (B)
          // convergent vers la case destination.
          const posA = positions[i][info.aFrom];
          const posB = positions[i][info.bFrom];
          moves.push({
            fromRow: posA.row, fromCol: posA.col,
            toRow: row, toCol: col,
            value: board[posA.row][posA.col],
          });
          moves.push({
            fromRow: posB.row, fromCol: posB.col,
            toRow: row, toCol: col,
            value: board[posB.row][posB.col],
          });
        } else {
          const pos = positions[i][info.from];
          moves.push({
            fromRow: pos.row, fromCol: pos.col,
            toRow: row, toCol: col,
            value: board[pos.row][pos.col],
          });
        }
      }

      if (mergedFlags[j]) {
        mergedCells.push({ row, col, value: after });
      } else if (
        invalidContactFlags[j] &&
        values[j + 1] !== null &&
        // Un seul shake par paire : on marque la tuile destination-side.
        // Condition "ils se sont rencontrés" : l'un des deux a glissé
        // (au moins une case libérée derrière la paire).
        (before === null || board[positions[i][j + 1].row][positions[i][j + 1].col] === null)
      ) {
        invalidCells.push({ row, col });
        invalidCells.push({ row: positions[i][j + 1].row, col: positions[i][j + 1].col });
      }
    }
  }

  return { board: newBoard, moved, gained, mergedCells, invalidCells, moves };
}

/**
 * Au moins un mouvement est-il possible avec cet opérateur ?
 * @param {(number|null)[][]} board
 * @param {'add'|'sub'|'mul'|'div'} op
 * @returns {boolean}
 */
export function hasAnyMove(board, op) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const v = board[r][c];
      if (v === null) return true; // une case vide = tuiles déplaçables
      // Voisin de droite : v peut glisser dessus (v [op] droite), ou
      // glisser sur v (droite [op] v) selon le sens du swipe.
      if (c + 1 < board[r].length && board[r][c + 1] !== null &&
          (isValidMerge(v, board[r][c + 1], op) || isValidMerge(board[r][c + 1], v, op))) return true;
      if (r + 1 < board.length && board[r + 1][c] !== null &&
          (isValidMerge(v, board[r + 1][c], op) || isValidMerge(board[r + 1][c], v, op))) return true;
    }
  }
  return false;
}

// --- Mathic Chain (Phase 4) --------------------------------------------------

/**
 * Nombre de cases vides sur le plateau.
 * @param {(number|null)[][]} board
 * @returns {number}
 */
export function countEmptyCells(board) {
  return getEmptyCells(board).length;
}

/**
 * Un "coup de nettoyage" (persona Hype-Man) : une SOUSTRACTION ou une
 * DIVISION qui fusionne deux tuiles et libère de l'espace (+case vide) sur
 * un plateau ENCOMBRÉ (peu de cases libres avant le coup). C'est LA finesse
 * tactique que le coach doit féliciter.
 * @param {(number|null)[][]} before plateau avant le coup
 * @param {(number|null)[][]} after plateau après le coup (avant spawn)
 * @param {'add'|'sub'|'mul'|'div'} op
 * @returns {boolean}
 */
export function isCleaningMove(before, after, op) {
  if (!after || (op !== 'sub' && op !== 'div')) return false;
  const total = before.length * before[0].length;
  const beforeEmpty = countEmptyCells(before);
  const afterEmpty = countEmptyCells(after);
  const freed = afterEmpty - beforeEmpty;
  // Encombré : ≤ 15 % de cases libres (au minimum 1) avant le coup.
  const crowded = beforeEmpty <= Math.max(1, Math.floor(total * 0.15));
  return freed > 0 && crowded;
}

/**
 * Tracker de chaîne : détecte si deux objectifs sont détruits en moins de
 * 2 mouvements consécutifs (roadmap 4.1). Logique pure, buffer autonome.
 * @returns {{
 *   registerTarget: (moveIndex: number) => {chained: boolean, chainLength: number},
 *   reset: () => void
 * }}
 */
export function createChainTracker() {
  /** Historique des coups (index de mouvement) où une cible a explosé. */
  const hits = [];

  return {
    /**
     * Enregistre une destruction d'objectif au coup `moveIndex`.
     * @param {number} moveIndex index du coup courant (0, 1, 2…)
     * @returns {{chained: boolean, chainLength: number}}
     *   chained=true si un autre objectif a explosé au coup précédent ou
     *   l'avant-dernier (intervalle < 2 coups).
     */
    registerTarget(moveIndex) {
      const last = hits[hits.length - 1];
      hits.push(moveIndex);
      const chained = last !== undefined && moveIndex - last <= 2;
      if (!chained) return { chained: false, chainLength: 1 };
      // Longueur : on remonte la chaîne tant que l'intervalle reste ≤ 2.
      let len = 1;
      for (let i = hits.length - 2; i >= 0; i--) {
        if (hits[i + 1] - hits[i] <= 2) len++;
        else break;
      }
      return { chained: true, chainLength: len };
    },

    /** Remise à zéro (nouvelle partie). */
    reset() {
      hits.length = 0;
    },
  };
}

/**
 * La cible est-elle présente physiquement sur le plateau ?
 * (une cible explosive doit être tuile, pas seulement "calculable")
 * @param {(number|null)[][]} board
 * @param {number} target
 * @returns {boolean}
 */
export function boardContains(board, target) {
  for (const row of board) {
    for (const v of row) {
      if (v === target) return true;
    }
  }
  return false;
}

/**
 * Solveur BFS headless (roadmap 3.2) : nombre MINIMUM de coups pour que
 * la cible apparaisse physiquement sur le plateau (fusions consécutives
 * autorisées). Rejette les grilles "trop faciles" du générateur.
 *
 * Implémentation pure (aucun DOM). Budget d'états explorés pour rester
 * interactif. @returns {number|null} min coups, ou null si > budget/inatteignable
 * @param {(number|null)[][]} board
 * @param {number} target
 * @param {number} [maxDepth]
 * @returns {number|null}
 */
export function minMovesToReach(board, target, maxDepth = 5) {
  if (boardContains(board, target)) return 0;

  const serialize = (b) => b.flat().join(',');
  const seen = new Set([serialize(board)]);
  let frontier = [board];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const state of frontier) {
      for (const dir of Object.keys(DIRECTIONS)) {
        for (const op of Object.keys(OPERATORS)) {
          const r = slideBoard(state, dir, op);
          if (!r.moved) continue;
          const key = serialize(r.board);
          if (seen.has(key)) continue;
          if (boardContains(r.board, target)) return depth;
          seen.add(key);
          next.push(r.board);
        }
      }
    }
    // Garde-fou mémoire : au-delà, on déclare échec (grille rejetée).
    if (next.length > 4000) return null;
    frontier = next;
  }
  return null;
}

/**
 * Plus aucun opérateur ne permet un mouvement ? (game over complet)
 * @param {(number|null)[][]} board
 * @returns {boolean}
 */
export function isGameOver(board) {
  return !Object.keys(OPERATORS).some((op) => hasAnyMove(board, op));
}
