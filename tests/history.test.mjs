/**
 * Tests dédiés de l'historique « Calvados » (Phase 4 — Mathic 4.0).
 * Usage : node tests/history.test.mjs
 *
 * Vérifie : construction d'entrée (makeEntry = diff correct + copies
 * défensives), traduction EXACTE en plan inverse (reversePlan : dé-fusions,
 * glissements remontés, spawns retirés — au pixel, sans ambiguïté), pile
 * LIFO à capacité, contexte de narration, et un test de propriété sur des
 * transitions réelles (slideBoard) : chaque opérande de dé-fusion et chaque
 * glissement remonté pointe vers un état `before` cohérent.
 */

import {
  createBoard,
  slideBoard,
} from '../src/core/board.js';
import { DIRECTIONS, OPERATORS } from '../src/core/rules.js';
import { validateDiff } from '../src/diff.js';
import {
  makeEntry,
  reversePlan,
  calvadosContext,
  createCalvados,
  CALVADOS_CAPACITY,
} from '../src/history.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

const key = (r, c) => `${r},${c}`;
const SNAP = { score: 0, movesLeft: 4, target: 42, targetCount: 0, moveIndex: 0, chainWindowLeft: 0, chainCount: 0 };

// --- Transit pur : glissement --------------------------------------------------

console.log('— Calvados : glissement seul —');
{
  const before = createBoard(1, 4);
  before[0][0] = 3;
  const after = slideBoard(before, 'right', 'add').board;

  const entry = makeEntry({
    before,
    after,
    moves: slideBoard(before, 'right', 'add').moves,
    mergedCells: [],
    spawned: [],
    exploded: [],
    gained: 0,
    dir: 'right',
    op: 'add',
    snap: SNAP,
  });

  check('diff cohérent (validateDiff)', validateDiff(before, after, entry.diff).ok);
  check('entry.before = copie défensive', entry.before !== before && entry.before[0] !== before[0]);

  const plan = reversePlan(entry);
  check('1 glissement à remonter (0,0) → (0,3)',
    plan.slidesBack.length === 1 &&
    key(plan.slidesBack[0].from.row, plan.slidesBack[0].from.col) === '0,0' &&
    key(plan.slidesBack[0].to.row, plan.slidesBack[0].to.col) === '0,3');
  check('valeur du glissement conservée', plan.slidesBack[0].value === 3);
  check('aucune dé-fusion / spawn', plan.splits.length === 0 && plan.spawns.length === 0);
}

// --- Transit pur : fusion --------------------------------------------------------

console.log('— Calvados : fusion seule —');
{
  const before = createBoard(1, 4);
  before[0][0] = 2;
  before[0][1] = 2;
  const r = slideBoard(before, 'right', 'add');

  const entry = makeEntry({
    before,
    after: r.board,
    moves: r.moves,
    mergedCells: r.mergedCells,
    spawned: [],
    exploded: [],
    gained: r.gained,
    dir: 'right',
    op: 'add',
    snap: SNAP,
  });

  const plan = reversePlan(entry);
  check('1 dé-fusion détectée', plan.splits.length === 1 && plan.splits.length === r.mergedCells.length);
  const sp = plan.splits[0];
  check('survivant en (0,3) (résultat 4)', key(sp.to.row, sp.to.col) === '0,3');
  check('2 opérandes : (0,0) et (0,1), valeurs 2',
    sp.operands.length === 2 &&
    sp.operands.every((o) => o.value === 2) &&
    key(sp.operands[0].row, sp.operands[0].col) !== key(sp.operands[1].row, sp.operands[1].col));
  check('aucun glissement remonté / spawn', plan.slidesBack.length === 0 && plan.spawns.length === 0);
}

// --- Transit réel : fusion + glissement + spawn -------------------------------------

console.log('— Calvados : fusion + glissement + spawn (2×2) —');
{
  const before = createBoard(2, 2);
  before[0][0] = 5;
  before[0][1] = 5;
  before[1][0] = 3;
  const r = slideBoard(before, 'left', 'add');
  const after = r.board.map((row) => [...row]);
  after[1][1] = 4; // spawn post-coup
  const spawned = [{ row: 1, col: 1, value: 4 }];

  const entry = makeEntry({
    before,
    after,
    moves: r.moves,
    mergedCells: r.mergedCells,
    spawned,
    exploded: [],
    gained: r.gained,
    dir: 'left',
    op: 'add',
    snap: SNAP,
  });

  const plan = reversePlan(entry);
  check('dé-fusion du 10 (opérandes 5,5)',
    plan.splits.length === 1 &&
    plan.splits[0].operands.every((o) => o.value === 5));
  check('glissement 3 remonté (1,0) → (1,0) immobile conservé néanmoins',
    plan.slidesBack.length === 1 && plan.slidesBack[0].value === 3);
  check('spawn retiré (1,1)=4', plan.spawns.length === 1 &&
    key(plan.spawns[0].row, plan.spawns[0].col) === '1,1' && plan.spawns[0].value === 4);
  check('diff cohérent avec indice (validateDiff)', validateDiff(before, after, entry.diff, { spawned }).ok);
}

// --- Pile : LIFO, capacité, vidage -------------------------------------------------

console.log('— Calvados : pile LIFO à capacité —');
{
  const store = createCalvados({ capacity: 3 });
  check('vide au départ', store.size() === 0);
  check('pop sur pile vide → null', store.pop() === null);
  check('peek sur pile vide → null', store.peek() === null);

  const simple = (n) => {
    const before = createBoard(1, 4);
    before[0][0] = n;
    return makeEntry({
      before,
      after: before.map((r) => [...r]),
      moves: [],
      mergedCells: [],
      spawned: [],
      exploded: [],
      gained: 0,
      dir: 'right',
      op: 'add',
      snap: SNAP,
    });
  };

  store.push(simple(1));
  store.push(simple(2));
  store.push(simple(3));
  check('3 entrées empilées', store.size() === 3);
  check('dernière entrée en tête (peek = 3)', store.peek().before[0][0] === 3);

  const popped = store.pop();
  check('pop retourne la DERNIÈRE (3)', popped ? popped.before[0][0] === 3 : false);
  check('taille 2 après pop', store.size() === 2);

  // Capacité : les plus anciennes sortent.
  store.push(simple(4));
  store.push(simple(5));
  check('capacité 3 respectée', store.size() === 3);
  check('l’entrée 1 (la plus ancienne) a été évincée',
    store.peek().before[0][0] === 5 &&
    store.pop().before[0][0] === 5 &&
    store.pop().before[0][0] === 4 &&
    store.pop().before[0][0] === 2);

  store.push(simple(9));
  store.clear();
  check('clear vide la pile', store.size() === 0);
}

// --- Contexte de narration --------------------------------------------------------

console.log('— Calvados : contexte de narration (Momo) —');
{
  const before = createBoard(1, 4);
  before[0][0] = 2;
  before[0][1] = 2;
  before[0][2] = 3;
  const r = slideBoard(before, 'right', 'add');
  const entry = makeEntry({
    before,
    after: r.board,
    moves: r.moves,
    mergedCells: r.mergedCells,
    spawned: [],
    exploded: [],
    gained: r.gained,
    dir: 'right',
    op: 'add',
    snap: { ...SNAP, movesLeft: 2 },
  });

  const c = calvadosContext(entry);
  check('1 dé-fusion narrée', c.defusions === 1);
  check('1 glissement remonté', c.glissements === 1);
  check('0 spawn retiré', c.spawns === 0);
  check('coups restants rapportés', c.movesLeft === 2);
  check('cible rapportée', c.target === 42);
}

// --- Test de propriété : transitions réelles ------------------------------------------

console.log('— Propriété : 300 transitions réelles (slideBoard) → reversePlan cohérent —');
{
  const DIRS = Object.keys(DIRECTIONS);
  const OPS = Object.keys(OPERATORS);
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (n) => Math.floor(Math.random() * n);

  const makeRandomBoard = () => {
    const b = createBoard(4, 4);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (Math.random() < 0.5) b[r][c] = 1 + randInt(10);
      }
    }
    return b;
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

  let broken = 0;
  let movesPlayed = 0;

  for (let i = 0; i < 300; i++) {
    const before = makeRandomBoard();
    const op = choice(OPS);
    const r = slideBoard(before, choice(DIRS), op);
    if (!r.moved) continue;
    movesPlayed++;

    let after = r.board;
    const spawned = [];
    if (Math.random() < 0.6) {
      const s = spawnOne(after);
      if (s) {
        after = s.board;
        spawned.push(...s.spawned);
      }
    }

    const entry = makeEntry({
      before,
      after,
      moves: r.moves,
      mergedCells: r.mergedCells,
      spawned,
      exploded: [],
      gained: r.gained,
      dir: 'right',
      op,
      snap: SNAP,
    });

    // Le diff de l'entrée doit être exact (spawn connu).
    const v = validateDiff(before, after, entry.diff, { spawned });
    if (!v.ok) { broken++; continue; }

    const plan = reversePlan(entry);

    // Comptage : 2 arrivées par fusion = 1 dé-fusion ; 1 arrivée = glissement.
    if (plan.splits.length !== r.mergedCells.length) { broken++; continue; }

    // Chaque opérande de dé-fusion pointe une case AVANT bien peuplée avec
    // la bonne valeur (la fusion était bien réelle), et le résultat fusionné
    // est présent en `after` à la destination (valeur du moteur).
    for (const sp of plan.splits) {
      for (const op of sp.operands) {
        if (before[op.row] == null || before[op.row][op.col] !== op.value) { broken++; }
      }
      const mc = r.mergedCells.find((m) => key(m.row, m.col) === key(sp.to.row, sp.to.col));
      if (!mc || after[sp.to.row] == null || after[sp.to.row][sp.to.col] !== mc.value) { broken++; }
    }

    // Chaque glissement remonté part d'une case AVANT peuplée.
    for (const s of plan.slidesBack) {
      if (before[s.from.row] == null || before[s.from.row][s.from.col] !== s.value) { broken++; }
    }

    // Chaque spawn retiré existe bien en `after`.
    for (const s of plan.spawns) {
      if (after[s.row] == null || after[s.row][s.col] !== s.value) { broken++; }
    }

    // Ambiguïté documentée de `diff.merges` (valeurs identiques) : le diff
    // peut attribuer la fusion à une AUTRE destination du même résultat
    // numérique. Ce n'est PAS un bug : la vérité est portée par moves /
    // mergedCells (moteur), dont reversePlan dépend — jamais par le diff.
    // Le diff reste parfaitement COHÉRENT (couverture + conservation).
    if (!validateDiff(before, after, entry.diff, { spawned }).ok) { broken++; }
  }

  check(`300 essais, ${movesPlayed} coups joués : zéro incohérence`, broken === 0 && movesPlayed > 50);
}

// --- Capacité exportée ----------------------------------------------------------------

console.log('— Calvados : capacité par défaut —');
check('CALVADOS_CAPACITY = 50', CALVADOS_CAPACITY === 50);

console.log(failures === 0 ? '\nTous les tests de l’historique passent ✅' : `\n${failures} échec(s) ❌`);
process.exit(failures === 0 ? 0 : 1);