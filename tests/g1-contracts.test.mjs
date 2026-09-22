/**
 * G1 — Contracts & Invariants
 *
 * Valide les contrats RULES / STATE / EVENTS (docs/contracts/*.md)
 * et les invariants du Game Core.
 *
 * Usage : node tests/g1-contracts.test.mjs
 */

import { createBoard, slideBoard, computeMerge, isValidMerge } from '../src/core/board.js';
import { OPERATORS, TARGET_NUMBER, VALUE_CAP, DIRECTIONS } from '../src/core/rules.js';
import {
  createMergeEvent,
  createTargetCollapsedEvent,
  createTileSpawnedEvent,
  createGameOverEvent,
} from '../src/core/events.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

// --- G1-RULES-V1 ----------------------------------------------------------------

console.log('— G1-RULES-V1 : constantes & opérateurs intouchables —');
check('OPERATORS symboles', OPERATORS.add === '+' && OPERATORS.sub === '−' && OPERATORS.mul === '×' && OPERATORS.div === '÷');
check('TARGET_NUMBER = 24', TARGET_NUMBER === 24);
check('VALUE_CAP = 999', VALUE_CAP === 999);
check('DIRECTIONS 4 sens', Object.keys(DIRECTIONS).sort().join(',') === 'down,left,right,up');

console.log('— G1-RULES-V1 : ADD (A === B requis) —');
check('add 3+3 ok', isValidMerge(3, 3, 'add'));
check('add 3+5 non', !isValidMerge(3, 5, 'add'));
check('add 3+3 = 6', computeMerge(3, 3, 'add') === 6);

console.log('— G1-RULES-V1 : SUB (A > B strict) —');
check('sub 5−2 ok', isValidMerge(5, 2, 'sub'));
check('sub 2−5 non', !isValidMerge(2, 5, 'sub'));
check('sub 5−2 = 3', computeMerge(5, 2, 'sub') === 3);

console.log('— G1-RULES-V1 : MUL (toujours autorisé) —');
check('mul 2×3 ok', isValidMerge(2, 3, 'mul'));
check('mul 1×1 ok', isValidMerge(1, 1, 'mul'));
check('mul 2×3 = 6', computeMerge(2, 3, 'mul') === 6);

console.log('— G1-RULES-V1 : DIV (A % B === 0) —');
check('div 6÷3 ok', isValidMerge(6, 3, 'div'));
check('div 3÷6 non', !isValidMerge(3, 6, 'div'));
check('div 6÷3 = 2', computeMerge(6, 3, 'div') === 2);

console.log('— G1-RULES-V1 : Plafond VALUE_CAP —');
check('plafond 500+500 refusé', !isValidMerge(500, 500, 'add'));
check('plafond 20×50 refusé', !isValidMerge(20, 50, 'mul'));
check('plafond 3×333 = 999 autorisé', isValidMerge(3, 333, 'mul'));
check('plafond 3×334 > 999 refusé', !isValidMerge(3, 334, 'mul'));

console.log('— G1-RULES-V1 : Cible TARGET_NUMBER (fusion vers 24) —');
{
  const b = createBoard(1, 4);
  b[0][0] = 12; b[0][1] = 12;
  const r = slideBoard(b, 'right', 'add'); // 12+12 = 24 (cible)
  check('cible 24 : fusion vers 24', r.mergedCells.length === 1 && r.mergedCells[0].value === 24);
}

// --- G1-STATE-V1 ----------------------------------------------------------------

console.log('— G1-STATE-V1 : sérialisabilité —');
{
  const state = {
    sessionId: 'sess-1',
    rows: 4, cols: 4, target: 24,
    board: [[1, null], [null, 2]],
    score: 10, moves: 3,
    isGameOver: false, victory: false,
    seed: 'abc',
  };
  const roundtrip = JSON.parse(JSON.stringify(state));
  check('JSON roundtrip identique', JSON.stringify(roundtrip) === JSON.stringify(state));
  check('aucun DOM', state.document === undefined && state.window === undefined);
}

// --- G1-EVENTS-V1 ----------------------------------------------------------------

console.log('— G1-EVENTS-V1 : POJO purs —');
{
  const e = createMergeEvent({ moveIndex: 1, op: 'add', cells: [{ row: 0, col: 0, value: 2 }], gained: 4 });
  check('MERGE_OCCURRED type', e.type === 'MERGE_OCCURRED');
  check('MERGE occurred timestamp number', typeof e.timestamp === 'number');
  check('MERGE occurred moveIndex', e.moveIndex === 1);
  check('MERGE occurred gained', e.gained === 4);
  check('MERGE occurred pas de fn', !('fn' in e));
  check('MERGE occurred JSON-safe', JSON.stringify(e).includes('MERGE_OCCURRED'));
}
{
  const e = createTargetCollapsedEvent({ cells: [{ row: 0, col: 0 }], bonus: 100, isCombo: true });
  check('TARGET_COLLAPSED type', e.type === 'TARGET_COLLAPSED');
  check('TARGET_COLLAPSED bonus', e.bonus === 100);
  check('TARGET_COLLAPSED isCombo', e.isCombo === true);
}
{
  const e = createTileSpawnedEvent({ row: 1, col: 2, value: 3 });
  check('TILE_SPAWNED type', e.type === 'TILE_SPAWNED');
  check('TILE_SPAWNED cell', JSON.stringify(e.cell) === JSON.stringify({ row: 1, col: 2, value: 3 }));
}
{
  const e = createGameOverEvent({ victory: true, score: 500 });
  check('GAME_OVER type', e.type === 'GAME_OVER');
  check('GAME_OVER victory', e.victory === true);
  check('GAME_OVER score', e.score === 500);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s)`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les contrats G1 validés');
}