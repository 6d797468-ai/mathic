import { test } from "node:test";
import assert from "node:assert/strict";
import { createV5GameAdapter } from "../../src/runtime/game-adapter-v5.js";

const SUM2X2 = {
  grid: [
    [-1, -1],
    [-1, -1],
  ],
  rows: [{ ops: ["+"], target: 5 }, { ops: ["+"], target: 7 }],
  cols: [{ ops: ["+"], target: 4 }, { ops: ["+"], target: 8 }],
  reserve: { 2: 2, 3: 1, 5: 1 },
};

const SOLUTION = [
  { id: "PLACE", value: 2, r: 0, c: 0 },
  { id: "PLACE", value: 3, r: 0, c: 1 },
  { id: "PLACE", value: 2, r: 1, c: 0 },
  { id: "PLACE", value: 5, r: 1, c: 1 },
];

function collect(a) {
  const types = [];
  a.subscribe((e) => types.push(e.type));
  return types;
}

test("GAME-V5 adapter : start émet GAME_STARTED, état sérialisable", () => {
  const a = createV5GameAdapter({ spec: SUM2X2 });
  const types = collect(a);
  a.start();
  assert.deepEqual(types, ["GAME_STARTED"]);
  const s = a.getState();
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(s.victory, false);
  assert.equal(s.isGameOver, false);
});

test("GAME-V5 adapter : move légal → PLACE_APPLIED + board à jour + déterminisme inter-instance", () => {
  const a = createV5GameAdapter({ spec: SUM2X2 });
  const b = createV5GameAdapter({ spec: SUM2X2 });
  const ta = collect(a);
  collect(b);
  a.start(); b.start();
  assert.ok(a.move(SOLUTION[0]));
  assert.ok(b.move(SOLUTION[0]));
  assert.ok(ta.includes("PLACE_APPLIED"));
  assert.equal(a.getState().board[0][0], 2);
  assert.equal(a.canonical(), b.canonical());
  assert.deepEqual(a.getState().reserve, b.getState().reserve);
});

test("GAME-V5 adapter : move illégal → MOVE_REJECTED, état inchangé", () => {
  const a = createV5GameAdapter({ spec: SUM2X2 });
  const types = collect(a);
  a.start();
  const before = a.canonical();
  assert.equal(a.move({ id: "PLACE", value: 99, r: 0, c: 0 }), false);
  assert.ok(types.includes("MOVE_REJECTED"));
  assert.equal(a.canonical(), before);
});

test("GAME-V5 adapter : undo restaure l'état précédent (UNDO_APPLIED)", () => {
  const a = createV5GameAdapter({ spec: SUM2X2 });
  const types = collect(a);
  a.start();
  a.move(SOLUTION[0]);
  const after = a.canonical();
  assert.ok(a.undo());
  assert.notEqual(a.canonical(), after);
  assert.ok(types.includes("UNDO_APPLIED"));
  assert.equal(a.undo(), false, "aucun undo au-delà de l'historique");
});

test("GAME-V5 adapter : séquence complète → TARGET_COLLAPSED + GAME_OVER victory", () => {
  const a = createV5GameAdapter({ spec: SUM2X2 });
  const types = collect(a);
  a.start();
  for (const cmd of SOLUTION) assert.ok(a.move(cmd), "coup de la solution légal");
  assert.ok(types.includes("TARGET_COLLAPSED"));
  assert.ok(types.includes("GAME_OVER"));
  const s = a.getState();
  assert.equal(s.victory, true);
  assert.equal(s.isGameOver, true);
  assert.equal(a.getCommands().length, 0, "plus de coups après victoire");
});

test("GAME-V5 adapter : getCommands expose des commandes cohérentes pour l'UI", () => {
  const a = createV5GameAdapter({ spec: SUM2X2 });
  a.start();
  const cmds = a.getCommands();
  assert.ok(cmds.length > 0);
  for (const c of cmds) {
    assert.equal(c.id, "PLACE");
    assert.ok(Number.isInteger(c.value) && c.value > 0);
    assert.ok(c.r >= 0 && c.r < 2 && c.c >= 0 && c.c < 2);
    assert.ok(a.move({ id: "PLACE", value: c.value, r: c.r, c: c.c }));
    a.undo();
  }
});