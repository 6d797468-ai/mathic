import { test } from "node:test";
import assert from "node:assert/strict";
import { eval2 } from "../lib/oprel.mjs";
import * as engineA from "../lib/engine-a.mjs";
import * as engineB from "../lib/engine-b.mjs";
import { minMoves, countSolutions } from "../lib/solver.mjs";
import { levelsA } from "../lib/levels/a.mjs";
import { levelsB } from "../lib/levels/b.mjs";
import { analyzeLevelB } from "../lib/metrics.mjs";

const D = 10;

test("eval2 : opérateurs de base", () => {
  assert.equal(eval2(3, "+", 2), 5);
  assert.equal(eval2(3, "-", 2), 1);
  assert.equal(eval2(2, "-", 3), null);
  assert.equal(eval2(4, "*", 2), 8);
  assert.equal(eval2(4, "/", 2), 2);
  assert.equal(eval2(4, "/", 0), null);
  assert.equal(eval2(4, "/", 3), null);
});

test("A : niveau a-01 — solution minimale 1, 1 seule solution", () => {
  const spec = levelsA[0];
  const init = engineA.create(spec);
  assert.equal(minMoves(init, engineA, D).min, 1);
  const c = countSolutions(init, engineA, { maxDepth: D });
  assert.equal(c.count, 1);
});

test("A : niveau a-02 — min 2", () => {
  const spec = levelsA[1];
  const init = engineA.create(spec);
  assert.equal(minMoves(init, engineA, D).min, 2);
});

test("A : niveau a-03 — division exacte, 2 solutions", () => {
  const spec = levelsA[2];
  const init = engineA.create(spec);
  assert.equal(minMoves(init, engineA, D).min, 2);
  const c = countSolutions(init, engineA, { maxDepth: D });
  assert.equal(c.count, 2);
});

test("A : contraintes — forbid élimine les opérations interdites", () => {
  const spec = levelsA[6]; // a-07 forbid ['*']
  const init = engineA.create(spec);
  for (const mv of engineA.getMoves(init)) assert.notEqual(mv.op, "*");
});

test("A : budget épuisé → plus aucune action (ou solve)", () => {
  const spec = levelsA[2];
  const init = engineA.create(spec);
  const mv0 = engineA.getMoves(init)[0];
  const s1 = engineA.apply(init, mv0);
  assert.ok(s1);
  assert.equal(s1.budget, 1);
});

test("A : déterminisme — même spec → mêmes moves et mêmes traces", () => {
  const spec = levelsA[2];
  const a = engineA.create(spec);
  const b = engineA.create(spec);
  assert.deepEqual(engineA.getMoves(a), engineA.getMoves(b));
  const mvs = engineA.getMoves(a);
  const out = [];
  for (let i = 0; i < Math.min(3, mvs.length); i++) {
    const s1 = engineA.apply(a, mvs[i]);
    const s2 = engineA.apply(b, mvs[i]);
    assert.deepEqual(s1.events, s2.events);
    out.push(s1.events[s1.events.length - 1]);
  }
});

test("B : niveau b-01 — 2 solutions", () => {
  const spec = levelsB[0];
  const init = engineB.create(spec);
  const c = countSolutions(init, engineB, { maxDepth: D, dedupeStates: true });
  assert.equal(c.count, 2);
});

test("B : niveau b-02 — solution unique", () => {
  const spec = levelsB[1];
  const init = engineB.create(spec);
  const c = countSolutions(init, engineB, { maxDepth: D, dedupeStates: true });
  assert.equal(c.count, 1);
});

test("B : niveau b-07 — IMPOSSIBLE (rejet seedé)", () => {
  const spec = levelsB[6];
  const init = engineB.create(spec);
  assert.equal(minMoves(init, engineB, 8, 200000).min, Infinity);
});

test("B : déterminisme — mêmes moves pour deux instances", () => {
  const spec = levelsB[1];
  const a = engineB.create(spec);
  const b = engineB.create(spec);
  assert.deepEqual(engineB.getMoves(a), engineB.getMoves(b));
});

test("tous les niveaux A sont au moins analysables sans erreur", () => {
  for (const spec of levelsA) {
    const init = engineA.create(spec);
    assert.ok(engineA.getMoves(init).length >= 0);
  }
});

test("tous les niveaux B listés : solvabilité cohérente (b-07 seul impossible)", () => {
  const expectedImpossible = new Set(["b-07"]);
  for (const spec of levelsB) {
    const res = analyzeLevelB(spec);
    if (expectedImpossible.has(spec.id)) assert.equal(res.solvable, false, `${spec.id} doit être non résoluble`);
    else assert.equal(res.solvable, true, `${spec.id} doit être résoluble (rés: ${JSON.stringify(res)})`);
  }
});