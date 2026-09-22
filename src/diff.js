/**
 * diff.js — Différentiel de tuiles entre deux états (Phase 4 « Mathic 4.0 »)
 *
 * `diffBoards(before, after)` recompose ce qui s'est passé entre deux
 * instantanés d'un plateau : tuiles glissées, fusionnées, créées, retirées.
 * C'est le socle de l'historique « Calvados » : étant donnés deux états, on
 * peut re-narrer / rejouer chaque transition sans perdre une ligne d'historique.
 *
 * Précision de l'inférence (honnêteté contractuelle) :
 *  - Sans indice, le diff est CANONIQUE et DÉTERMINISTE (appariement en
 *    ordre de balayage), mais deux états seuls sont parfois AMBIGUS : une
 *    tuile posée (spawn) peut valoir autant qu'une tuile déplacée, et un
 *    résultat de fusion peut valoir autant qu'une tuile immobilisée. Dans
 *    ces cas, le diff reste COHÉRENT (couverture + conservation des valeurs,
 *    vérifiables via `validateDiff`) mais les étiquettes exactes ne sont pas
 *    garanties.
 *  - La boucle de jeu connaît les spawns : `opts.spawned` (tuiles posées
 *    après le coup, coordonnées dans l'état APRES) lève une partie de
 *    l'ambiguïté : le diff devient exact sur les créations.
 *  - Les RETRAITS n'ont pas besoin d'indice : dans Mathic, la SEULE façon
 *    de retirer une tuile est l'explosion d'une cible, donc toute source de
 *    l'état avant sans contrepartie dans l'état après est, par construction,
 *    une tuile explosée. `removed` reconstitue donc l'explosion à l'identique.
 *
 * Les fusions reconstruites respectent les règles strictes de board.js ;
 * l'opérateur fourni est un opérateur « expliquant » (pas nécessairement
 * celui qui a été joué : 2×2 et 2+2 produisent tous deux 4).
 *
 * Logique pure, sans DOM. Identique aux conventions du repo.
 */

import { isValidPair, computeMerge, OPERATORS } from './board.js';

const OPS = Object.keys(OPERATORS); // ['add', 'sub', 'mul', 'div']

const posKey = (r, c) => `${r},${c}`;

/**
 * Énumère les tuiles non nulles d'un plateau en ordre de balayage
 * (ligne par ligne, gauche → droite). Ordre canonique partagé par
 * toutes les passes du diff.
 * @param {(number|null)[][]} board
 * @returns {{row: number, col: number, value: number}[]}
 */
function scanTiles(board) {
  const tiles = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const v = board[r][c];
      if (v !== null) tiles.push({ row: r, col: c, value: v });
    }
  }
  return tiles;
}

/**
 * x et y (tuiles de l'état AVANT) expliquent-ils la valeur `target` par une
 * fusion stricte ? Retourne l'opérateur et l'orientation arrivante/percutée.
 * @param {{value: number}} x
 * @param {{value: number}} y
 * @param {number} target
 * @returns {{op: string, swapped: boolean}|null}
 */
function explains(x, y, target) {
  for (const op of OPS) {
    if (isValidPair(x.value, y.value, op) && computeMerge(x.value, y.value, op) === target) {
      return { op, swapped: false };
    }
    if (isValidPair(y.value, x.value, op) && computeMerge(y.value, x.value, op) === target) {
      return { op, swapped: true };
    }
  }
  return null;
}

/**
 * Cherche la PREMIÈRE paire (ordonnée canoniquement) de sources encore
 * libres qui explique `targetValue` par fusion.
 * @param {{row:number, col:number, value:number}[]} src sources de l'état avant
 * @param {boolean[]} srcUsed
 * @param {number} targetValue
 * @returns {{i: number, j: number, op: string,
 *            arrivante: {row:number,col:number,value:number},
 *            percutee: {row:number,col:number,value:number}}|null}
 */
function findMergePair(src, srcUsed, targetValue) {
  for (let i = 0; i < src.length; i++) {
    if (srcUsed[i]) continue;
    for (let j = i + 1; j < src.length; j++) {
      if (srcUsed[j]) continue;
      const r = explains(src[i], src[j], targetValue);
      if (!r) continue;
      return {
        i,
        j,
        op: r.op,
        arrivante: r.swapped ? src[j] : src[i],
        percutee: r.swapped ? src[i] : src[j],
      };
    }
  }
  return null;
}

/**
 * Différentiel entre deux états d'un même plateau (avant/après).
 *
 * Catégories produites :
 *  - `unchanged` : tuile présente au même endroit avec la même valeur ;
 *  - `slides`    : tuile déplacée (même valeur, position différente) ;
 *  - `merges`    : une valeur de l'état après expliquée par une paire de
 *                  tuiles de l'état avant (fusion stricte validée) ;
 *  - `created`   : tuiles apparues (spawns — y compris celles passées dans
 *                  `opts.spawned`) ;
 *  - `removed`   : tuiles disparues (explosions de cibles — reconstructibles
 *                  sans indice, cf. préambule du fichier).
 *
 * Fonction pure et déterministe. Ne mute ni `before` ni `after`.
 * @param {(number|null)[][]} before état avant
 * @param {(number|null)[][]} after état après
 * @param {{spawned?: {row:number,col:number,value:number}[]}} [opts]
 * @returns {{unchanged: object[], slides: object[], merges: object[],
 *            created: object[], removed: object[], changed: boolean}}
 */
export function diffBoards(before, after, opts = {}) {
  const spawned = (opts.spawned || []).map((t) => ({ row: t.row, col: t.col, value: t.value }));
  const spawnedKeys = new Set(spawned.map((t) => posKey(t.row, t.col)));

  const src = scanTiles(before);
  const dst = scanTiles(after).filter((t) => !spawnedKeys.has(posKey(t.row, t.col)));

  const srcUsed = src.map(() => false);
  const dstUsed = dst.map(() => false);

  const unchanged = [];
  const slides = [];
  const merges = [];

  // Passe 1 — correspondance par VALEUR (ordre de balayage) : une tuile de
  // l'état avant qui se retrouve à l'identique est le même objet physique.
  for (let d = 0; d < dst.length; d++) {
    if (dstUsed[d]) continue;
    let s = -1;
    for (let j = 0; j < src.length; j++) {
      if (!srcUsed[j] && src[j].value === dst[d].value) {
        s = j;
        break;
      }
    }
    if (s === -1) continue;
    srcUsed[s] = true;
    dstUsed[d] = true;
    const item = {
      from: { row: src[s].row, col: src[s].col },
      to: { row: dst[d].row, col: dst[d].col },
      value: dst[d].value,
    };
    if (item.from.row === item.to.row && item.from.col === item.to.col) unchanged.push(item);
    else slides.push(item);
  }

  // Passe 2 — les états restants s'expliquent par des FUSIONS : on cherche
  // la première paire valide (ordres canoniques) qui produit la valeur.
  for (let d = 0; d < dst.length; d++) {
    if (dstUsed[d]) continue;
    const pair = findMergePair(src, srcUsed, dst[d].value);
    if (!pair) continue;
    srcUsed[pair.i] = true;
    srcUsed[pair.j] = true;
    dstUsed[d] = true;
    merges.push({
      to: { row: dst[d].row, col: dst[d].col },
      value: dst[d].value,
      op: pair.op,
      from: [
        { row: pair.arrivante.row, col: pair.arrivante.col, value: pair.arrivante.value },
        { row: pair.percutee.row, col: pair.percutee.col, value: pair.percutee.value },
      ],
    });
  }

  // Passe 3 — les restes : créations (spawns connus + non expliqués) et
  // retraits (sans contrepartie — explosions de cible, cf. préambule).
  const created = [...spawned];
  for (let d = 0; d < dst.length; d++) {
    if (!dstUsed[d]) created.push({ row: dst[d].row, col: dst[d].col, value: dst[d].value });
  }
  const removed = [];
  for (let j = 0; j < src.length; j++) {
    if (!srcUsed[j]) removed.push({ row: src[j].row, col: src[j].col, value: src[j].value });
  }

  return {
    unchanged,
    slides,
    merges,
    created,
    removed,
    changed: slides.length + merges.length + created.length + removed.length > 0,
  };
}

/**
 * Résumé chiffré d'un diff (compteurs par catégorie).
 * @param {ReturnType<typeof diffBoards>} diff
 * @returns {{unchanged: number, slid: number, merged: number,
 *            created: number, removed: number, changed: boolean}}
 */
export function diffSummary(diff) {
  return {
    unchanged: diff.unchanged.length,
    slid: diff.slides.length,
    merged: diff.merges.length,
    created: diff.created.length,
    removed: diff.removed.length,
    changed: diff.changed,
  };
}

/**
 * Vérifie la COHÉRENCE d'un diff : chaque tuile non nulle des deux états
 * est expliquée EXACTEMENT une fois (couverture), et les valeurs glissées /
 * fusionnées sont conservées (re-calcul strict via computeMerge).
 *
 * `opts` doit reproduire le même `spawned` que celui passé à diffBoards
 * (les spawns sont des points de vérité, pas des inférences).
 * @param {(number|null)[][]} before
 * @param {(number|null)[][]} after
 * @param {ReturnType<typeof diffBoards>} diff
 * @param {{spawned?: object[]}} [opts]
 * @returns {{ok: boolean, errors: string[], stats: object}}
 */
export function validateDiff(before, after, diff, opts = {}) {
  const errors = [];
  const rows = after.length;
  const cols = after[0].length;

  const spawnedKeys = new Set((opts.spawned || []).map((t) => posKey(t.row, t.col)));
  const consumedKeys = new Set();

  const beforeCover = new Set();
  const afterCover = new Set();
  const cover = (set, r, c) => {
    const k = posKey(r, c);
    if (set.has(k)) errors.push(`cellule couverte deux fois : ${k}`);
    set.add(k);
  };

  for (const e of diff.unchanged) {
    cover(beforeCover, e.from.row, e.from.col);
    cover(afterCover, e.to.row, e.to.col);
    if (before[e.from.row][e.from.col] !== e.value || after[e.to.row][e.to.col] !== e.value) {
      errors.push(`repos : valeur incohérente à ${posKey(e.from.row, e.from.col)}`);
    }
  }

  for (const e of diff.slides) {
    cover(beforeCover, e.from.row, e.from.col);
    cover(afterCover, e.to.row, e.to.col);
    if (before[e.from.row][e.from.col] !== e.value || after[e.to.row][e.to.col] !== e.value) {
      errors.push(`glissement : valeur incohérente ${posKey(e.from.row, e.from.col)} → ${posKey(e.to.row, e.to.col)}`);
    }
  }

  for (const e of diff.merges) {
    const [a, b] = e.from;
    cover(beforeCover, a.row, a.col);
    cover(beforeCover, b.row, b.col);
    cover(afterCover, e.to.row, e.to.col);
    if (before[a.row][a.col] !== a.value || before[b.row][b.col] !== b.value) {
      errors.push(`fusion : source absente de l'état avant (${posKey(a.row, a.col)})`);
    }
    if (after[e.to.row][e.to.col] !== e.value) {
      errors.push(`fusion : résultat absent de l'état après (${posKey(e.to.row, e.to.col)})`);
    }
    if (computeMerge(a.value, b.value, e.op) !== e.value) {
      errors.push(`fusion : ${a.value} [${e.op}] ${b.value} ≠ ${e.value}`);
    }
  }

  for (const e of diff.created) {
    cover(afterCover, e.row, e.col);
    if (after[e.row][e.col] !== e.value) {
      errors.push(`création : absence de la tuile ${e.value} en ${posKey(e.row, e.col)} (après)`);
    }
  }

  for (const e of diff.removed) {
    cover(beforeCover, e.row, e.col);
    if (before[e.row][e.col] !== e.value) {
      errors.push(`retrait : absence de la tuile ${e.value} en ${posKey(e.row, e.col)} (avant)`);
    }
  }

  // Couverture totale : aucune tuile non nulle ne reste orpheline.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = posKey(r, c);
      if (before[r][c] !== null && !consumedKeys.has(k) && !beforeCover.has(k)) {
        errors.push(`tuile avant non expliquée : ${k} = ${before[r][c]}`);
      }
      if (after[r][c] !== null && !spawnedKeys.has(k) && !afterCover.has(k)) {
        errors.push(`tuile après non expliquée : ${k} = ${after[r][c]}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, stats: diffSummary(diff) };
}