/**
 * G1 — Contracts & Invariants
 *
 * Valide les contrats RULES / STATE / EVENTS (docs/contracts/*.md)
 * et les invariants du Game Core.
 *
 * Usage : node --test tests/g1-contracts.test.mjs
 */

import { createBoard, slideBoard, computeMerge, isValidMerge } from '../src/core/board.js';
import { OPERATORS, TARGET_NUMBER, VALUE_CAP, DIRECTIONS } from '../src/core/rules.js';
import {
  createMergeEvent,
  createTargetCollapsedEvent,
  createTileSpawnedEvent,
  createGameOverEvent,
} from '../src/core/events.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

// --- G1-RULES-V1 ----------------------------------------------------------------

test('G1-RULES-V1 : constantes & opérateurs intouchables', () => {
  assert.strictEqual(OPERATORS.add, '+');
  assert.strictEqual(OPERATORS.sub, '−');
  assert.strictEqual(OPERATORS.mul, '×');
  assert.strictEqual(OPERATORS.div, '÷');
  assert.strictEqual(TARGET_NUMBER, 24);
  assert.strictEqual(VALUE_CAP, 999);
  assert.deepStrictEqual(Object.keys(DIRECTIONS).sort(), ['down', 'left', 'right', 'up']);
});

test('G1-RULES-V1 : ADD (A === B requis)', () => {
  assert.ok(isValidMerge(3, 3, 'add'));
  assert.ok(!isValidMerge(3, 5, 'add'));
  assert.strictEqual(computeMerge(3, 3, 'add'), 6);
});

test('G1-RULES-V1 : SUB (A > B strict)', () => {
  assert.ok(isValidMerge(5, 2, 'sub'));
  assert.ok(!isValidMerge(2, 5, 'sub'));
  assert.strictEqual(computeMerge(5, 2, 'sub'), 3);
});

test('G1-RULES-V1 : MUL (toujours autorisé)', () => {
  assert.ok(isValidMerge(2, 3, 'mul'));
  assert.ok(isValidMerge(1, 1, 'mul'));
  assert.strictEqual(computeMerge(2, 3, 'mul'), 6);
});

test('G1-RULES-V1 : DIV (A % B === 0)', () => {
  assert.ok(isValidMerge(6, 3, 'div'));
  assert.ok(!isValidMerge(3, 6, 'div'));
  assert.strictEqual(computeMerge(6, 3, 'div'), 2);
});

test('G1-RULES-V1 : Plafond VALUE_CAP', () => {
  assert.ok(!isValidMerge(500, 500, 'add'));
  assert.ok(!isValidMerge(20, 50, 'mul'));
  assert.ok(isValidMerge(3, 333, 'mul'));   // 3×333 = 999 ≤ 999
  assert.ok(!isValidMerge(3, 334, 'mul'));  // 3×334 = 1002 > 999
});

test('G1-RULES-V1 : Cible TARGET_NUMBER (fusion vers 24)', () => {
  const b = createBoard(1, 4);
  b[0][0] = 12; b[0][1] = 12;
  const r = slideBoard(b, 'right', 'add'); // 12+12 = 24 (cible)
  assert.strictEqual(r.mergedCells.length, 1);
  assert.strictEqual(r.mergedCells[0].value, 24);
});

// --- G1-STATE-V1 ----------------------------------------------------------------

test('G1-STATE-V1 : GameState sérialisable JSON (pas de DOM, pas de fn)', () => {
  const state = {
    sessionId: 'sess-1',
    rows: 4, cols: 4, target: 24,
    board: [[1, null], [null, 2]],
    score: 10, moves: 3,
    isGameOver: false, victory: false,
    seed: 'abc',
  };
  const roundtrip = JSON.parse(JSON.stringify(state));
  assert.deepStrictEqual(roundtrip, state);
  assert.strictEqual(state.document, undefined);
  assert.strictEqual(state.window, undefined);
});

// --- G1-EVENTS-V1 ----------------------------------------------------------------

test('G1-EVENTS-V1 : createMergeEvent est un POJO pur', () => {
  const e = createMergeEvent({ moveIndex: 1, op: 'add', cells: [{ row: 0, col: 0, value: 2 }], gained: 4 });
  assert.strictEqual(e.type, 'MERGE_OCCURRED');
  assert.strictEqual(typeof e.timestamp, 'number');
  assert.strictEqual(e.moveIndex, 1);
  assert.strictEqual(e.op, 'add');
  assert.strictEqual(e.gained, 4);
  assert.ok(!('fn' in e));
  assert.ok(JSON.stringify(e).includes('MERGE_OCCURRED'));
});

test('G1-EVENTS-V1 : createTargetCollapsedEvent est un POJO pur', () => {
  const e = createTargetCollapsedEvent({ cells: [{ row: 0, col: 0 }], bonus: 100, isCombo: true });
  assert.strictEqual(e.type, 'TARGET_COLLAPSED');
  assert.strictEqual(e.bonus, 100);
  assert.strictEqual(e.isCombo, true);
});

test('G1-EVENTS-V1 : createTileSpawnedEvent est un POJO pur', () => {
  const e = createTileSpawnedEvent({ row: 1, col: 2, value: 3 });
  assert.strictEqual(e.type, 'TILE_SPAWNED');
  assert.deepStrictEqual(e.cell, { row: 1, col: 2, value: 3 });
});

test('G1-EVENTS-V1 : createGameOverEvent est un POJO pur', () => {
  const e = createGameOverEvent({ victory: true, score: 500 });
  assert.strictEqual(e.type, 'GAME_OVER');
  assert.strictEqual(e.victory, true);
  assert.strictEqual(e.score, 500);
});

test('G1-EVENTS-V1 : tous les événements sont JSON-sérialisables', () => {
  const events = [
    createMergeEvent({ moveIndex: 0, op: 'add', cells: [], gained: 0 }),
    createGameOverEvent({ victory: false, score: 0 }),
  ];
  const json = JSON.stringify(events);
  assert.strictEqual(JSON.parse(json).length, 2);
});