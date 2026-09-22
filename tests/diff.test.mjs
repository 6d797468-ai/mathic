/**
 * Tests dédiés du diffBoards (Phase 4 — « Mathic 4.0 »).
 * Usage : node tests/diff.test.mjs
 *
 * Vérifie : classification (glissées / fusionnées / créées / retirées),
 * exactitude AVEC indice de spawn, cohérence SANS indice (couverture +
 * conservation, `validateDiff`), déterminisme, non-mutation, et un test de
 * propriété sur des transitions réelles (slideBoard).
 */

import {
  createBoard,
  slideBoard,
  DIRECTIONS,
  OPERATORS,
} from '../src/board.js';
import {
  diffBoards,
  diffSummary,
  validateDiff,
} from '../src/diff.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => ak.includes(k) && deepEq(a[k], b[k]));
}

const key = (r, c) => `${r},${c}`;

// --- Glissement simple ------------------------------------------------------

console.log('— Slice : glissement seul —');
{
  const before = createBoard(1, 4);
  before[0][0] = 3;
  const after = createBoard(1, 4);
  after[0][3] = 3;

  const d = diffBoards(before, after);
  check('1 glissement détecté', d.slides.length === 1);
  check('trajectoire (0,0) → (0,3)', d.slides[0].from.row === 0 && d.slides[0].from.col === 0 &&
    d.slides[0].to.row === 0 && d.slides[0].to.col === 3);
  check('valeur conservée', d.slides[0].value === 3);
  check('aucune fusion / création / retrait',
    d.merges.length === 0 && d.created.length === 0 && d.removed.length === 0);
  const v = validateDiff(before, after, d);
  check('cohérence validée', v.ok);
}

// --- Fusion seule -----------------------------------------------------------

console.log('— Slice : fusion seule —');
{
  const before = createBoard(1, 4);
  before[0][0] = 2;
  before[0][1] = 2;
  const after = createBoard(1, 4);
  after[0][3] = 4;

  const d = diffBoards(before, after);
  check('1 fusion détectée', d.merges.length === 1);
  check('résultat 4 en (0,3)', d.merges[0].value === 4 && d.merges[0].to.col === 3);
  check('2 opérandes (0,0) et (0,1)',
    d.merges[0].from.some((t) => key(t.row, t.col) === '0,0') &&
    d.merges[0].from.some((t) => key(t.row, t.col) === '0,1'));
  check('op add expliquant 2+2', d.merges[0].op === 'add');
  check('aucun glissement / création / retrait',
    d.slides.length === 0 && d.created.length === 0 && d.removed.length === 0);
  const v = validateDiff(before, after, d);
  check('cohérence validée', v.ok);
}

// --- Fusion + tuile immobile -------------------------------------------------

console.log('— Slice : fusion + tuile immobile —');
{
  const before = createBoard(1, 4);
  before[0][0] = 2;
  before[0][1] = 2;
  before[0][2] = 3;
  const after = createBoard(1, 4);
  after[0][2] = 3;
  after[0][3] = 4;

  const d = diffBoards(before, after);
  check('tuile 3 immobile (unchanged)', d.unchanged.length === 1 &&
    key(d.unchanged[0].from.row, d.unchanged[0].from.col) === '0,2');
  check('fusion 2+2 → 4', d.merges.length === 1 && d.merges[0].value === 4);
  check('aucune création / retrait', d.created.length === 0 && d.removed.length === 0);
  const v = validateDiff(before, after, d);
  check('cohérence validée', v.ok);
}

// --- Spawn connu (indice exact) ----------------------------------------------

console.log('— Slice : spawn connu (opts.spawned) —');
{
  const before = createBoard(1, 4);
  before[0][0] = 2;
  before[0][1] = 2;
  // Coup réel : mul ↑ gauche → [4, _, _, _] puis spawn 3 en (0,2).
  const after = createBoard(1, 4);
  after[0][0] = 4;
  after[0][2] = 3;

  const d = diffBoards(before, after, {
    spawned: [{ row: 0, col: 2, value: 3 }],
  });
  check('fusion 2+2 → 4 exacte (op add)', d.merges.length === 1 &&
    d.merges[0].value === 4 && d.merges[0].op === 'add');
  check('spawn répertorié en créations', d.created.length === 1 &&
    key(d.created[0].row, d.created[0].col) === '0,2' && d.created[0].value === 3);
  check('aucun glissement / retrait', d.slides.length === 0 && d.removed.length === 0);
  const v = validateDiff(before, after, d, {
    spawned: [{ row: 0, col: 2, value: 3 }],
  });
  check('cohérence validée avec indice', v.ok);
}

// --- Explosion + spawn ----------------------------------------------------------

console.log('— Slice : explosion (retraits reconstructibles) + spawn —');
{
  const before = createBoard(1, 4);
  before[0][0] = 2;
  before[0][1] = 2;
  before[0][2] = 5;
  before[0][3] = 1;
  // Coup réel : mul à droite → [_, _, 5, 4] ; la cible 5 explose → [_, _, _, 4] ;
  // spawn 3 en (0,0) → [3, _, _, 4].
  const after = createBoard(1, 4);
  after[0][0] = 3;
  after[0][3] = 4;

  const d = diffBoards(before, after, {
    spawned: [{ row: 0, col: 0, value: 3 }],
  });
  check('fusion 2+2 → 4', d.merges.length === 1 && d.merges[0].value === 4 &&
    key(d.merges[0].to.row, d.merges[0].to.col) === '0,3');
  check('tuile 5 retirée (explosée)', d.removed.some((t) => key(t.row, t.col) === '0,2' && t.value === 5));
  check('tuile 1 retirée (explosée)', d.removed.some((t) => key(t.row, t.col) === '0,3' && t.value === 1));
  check('spawn répertorié', d.created.length === 1 && key(d.created[0].row, d.created[0].col) === '0,0');
  const v = validateDiff(before, after, d, {
    spawned: [{ row: 0, col: 0, value: 3 }],
  });
  check('cohérence validée', v.ok);
}

// --- Identité (aucun changement) ------------------------------------------------

console.log('— Slice : aucun changement —');
{
  const before = createBoard(2, 2);
  before[0][0] = 4;
  before[0][1] = 2;
  before[1][0] = 8;
  const d = diffBoards(before, before.map((r) => [...r]));
  check('changed = false', d.changed === false);
  const s = diffSummary(d);
  check('toutes les catégories à zéro',
    s.slid === 0 && s.merged === 0 && s.created === 0 && s.removed === 0);
  const v = validateDiff(before, before, d);
  check('cohérence validée', v.ok);
}

// --- Déterminisme ---------------------------------------------------------------

console.log('— Slice : déterminisme —');
{
  const before = createBoard(1, 4);
  before[0][0] = 4;
  before[0][1] = 4;
  before[0][2] = 2;
  before[0][3] = 2;
  const after = createBoard(1, 4);
  after[0][2] = 4;
  after[0][3] = 8;
  const d1 = diffBoards(before, after);
  const d2 = diffBoards(before, after);
  check('deux appels → même diff', deepEq(d1, d2));
}

// --- Ambiguïté documentée, cohérence garantie ------------------------------------

console.log('— Slice : ambiguïté informationnelle (cohérence, pas de mensonge) —');
{
  // avant [4,4,2,2] → après [_,_,4,8] : impossible de savoir si le « 4 »
  // provient du 4 initial (glissé) ou de 2+2. Le diff reste COHÉRENT :
  // couverture totale + valeurs conservées (validateDiff), sans fabriquer
  // de résultat faux.
  const before = createBoard(1, 4);
  before[0][0] = 4;
  before[0][1] = 4;
  before[0][2] = 2;
  before[0][3] = 2;
  const afterReal = slideBoard(before, 'right', 'add').board;
  check('après réel (moteur) : [_,_,8,4]', JSON.stringify(afterReal[0]) === '[null,null,8,4]');

  const d = diffBoards(before, afterReal);
  const v = validateDiff(before, afterReal, d);
  check('couverture + conservation garanties malgré l’ambiguïté', v.ok);
  check('au moins une fusion reconstituée', d.merges.length >= 1);
}

// --- Non-mutation des entrées ------------------------------------------------------

console.log('— Slice : pureté (aucune mutation) —');
{
  const before = createBoard(2, 2);
  before[0][0] = 6;
  before[1][1] = 3;
  const after = createBoard(2, 2);
  after[0][0] = 6;
  const beforeClone = before.map((r) => [...r]);
  const afterClone = after.map((r) => [...r]);
  diffBoards(before, after);
  check('avant inchangé', deepEq(before, beforeClone));
  check('après inchangé', deepEq(after, afterClone));
}

// --- Test de propriété : transitions aléatoires réelles ---------------------------

console.log('— Propriété : 300 transitions réelles (slideBoard) —');
{
  const DIRS = Object.keys(DIRECTIONS);
  const OPS = Object.keys(OPERATORS);
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (n) => Math.floor(Math.random() * n);

  const makeRandomBoard = () => {
    const b = createBoard(4, 4);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (Math.random() < 0.55) b[r][c] = 1 + randInt(12);
      }
    }
    return b;
  };

  const consumeValue = (board, value) => {
    const consumed = [];
    const out = board.map((r) => [...r]);
    for (let r = 0; r < out.length; r++) {
      for (let c = 0; c < out[r].length; c++) {
        if (out[r][c] === value) {
          consumed.push({ row: r, col: c, value });
          out[r][c] = null;
        }
      }
    }
    return { board: out, consumed };
  };

  const spawnOne = (board) => {
    const empty = [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        if (board[r][c] === null) empty.push({ row: r, col: c });
      }
    }
    if (empty.length === 0) return null;
    const pos = choice(empty);
    const value = 1 + randInt(5);
    const out = board.map((r) => [...r]);
    out[pos.row][pos.col] = value;
    return { board: out, spawned: [{ row: pos.row, col: pos.col, value }] };
  };

  let incoherent = 0;
  let movesPlayed = 0;

  for (let i = 0; i < 300; i++) {
    const state = makeRandomBoard();
    const pristine = state.map((r) => [...r]);
    const r = slideBoard(state, choice(DIRS), choice(OPS));
    if (!r.moved) continue;
    movesPlayed++;

    let after = r.board;
    const spawned = [];

    // Explosion simulée ~ la moitié du temps (les tuiles retirées n'ont pas
    // besoin d'indice : toute source sans contrepartie est une explosion).
    if (Math.random() < 0.5) {
      const present = [];
      for (const row of after) for (const v of row) if (v !== null) present.push(v);
      if (present.length > 0) after = consumeValue(after, choice(present)).board;
    }
    // Spawn simulé ~ la moitié du temps.
    if (Math.random() < 0.5) {
      const s = spawnOne(after);
      if (s) {
        after = s.board;
        spawned.push(...s.spawned);
      }
    }

    // Avec indice de spawn : le diff doit être EXACT.
    const d = diffBoards(state, after, { spawned });
    const v = validateDiff(state, after, d, { spawned });
    if (!v.ok) incoherent++;

    // Sans indice sur le résultat final : toujours COHÉRENT (comptabilité).
    const d2 = diffBoards(state, after);
    const v2 = validateDiff(state, after, d2);
    if (!v2.ok) incoherent++;

    // Sans indice sur le résultat brut (ni explosion ni spawn).
    const d3 = diffBoards(state, r.board);
    const v3 = validateDiff(state, r.board, d3);
    if (!v3.ok) incoherent++;

    // Le diff ne mute jamais l'état source.
    if (!deepEq(state, pristine)) incoherent++;
  }

  check(`300 essais, ${movesPlayed} coups joués : zéro incohérence`, incoherent === 0 && movesPlayed > 50);
}

console.log(failures === 0 ? '\nTous les tests de diff passent ✅' : `\n${failures} échec(s) ❌`);
process.exit(failures === 0 ? 0 : 1);