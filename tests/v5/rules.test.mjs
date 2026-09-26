import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSpec,
  createSession,
  isSolved,
  getMoves,
  apply,
  getState,
  canonical,
  replay,
  quickReject,
} from "../../src/v5/rules/engine.mjs";
import { certify } from "../../src/v5/rules/solver.mjs";

const SUM2X2 = {
  grid: [
    [-1, -1],
    [-1, -1],
  ],
  rows: [
    { ops: ["+"], target: 5 },
    { ops: ["+"], target: 7 },
  ],
  cols: [
    { ops: ["+"], target: 4 },
    { ops: ["+"], target: 8 },
  ],
  reserve: { 2: 2, 3: 1, 5: 1 },
};

const MIXED2X2 = {
  grid: [
    [-1, -1],
    [-1, -1],
  ],
  rows: [
    { ops: ["*"], target: 10 },
    { ops: ["-"], target: 4 },
  ],
  cols: [
    { ops: ["+"], target: 9 },
    { ops: ["+"], target: 8 },
  ],
  reserve: { 2: 1, 3: 1, 5: 1, 7: 1 },
};

const BAD = [
  { ...JSON.parse(JSON.stringify(SUM2X2)), grid: [[2, 5], [2]] },
  { ...JSON.parse(JSON.stringify(SUM2X2)), rows: SUM2X2.rows.slice(0, 1) },
  { ...JSON.parse(JSON.stringify(SUM2X2)), cols: SUM2X2.cols.slice(0, 1) },
  { ...JSON.parse(JSON.stringify(SUM2X2)), rows: SUM2X2.rows.map((l) => ({ ...l, ops: [...l.ops, "+"] })) },
  { ...JSON.parse(JSON.stringify(SUM2X2)), rows: SUM2X2.rows.map((l) => ({ ...l, ops: ["%"] })) },
  { ...JSON.parse(JSON.stringify(SUM2X2)), reserve: { ...SUM2X2.reserve, 0: 1 } },
  { ...JSON.parse(JSON.stringify(SUM2X2)), reserve: { ...SUM2X2.reserve, 3: -1 } },
];

test("validateSpec : rejette les specs corrompues", () => {
  for (const s of BAD) assert.throws(() => validateSpec(s), TypeError);
});

test("validateSpec : accepte les specs valides", () => {
  assert.doesNotThrow(() => validateSpec(SUM2X2));
  assert.doesNotThrow(() => validateSpec(MIXED2X2));
});

test("déterminisme : deux sessions identiques, mêmes coups, mêmes canonical", () => {
  const a = createSession(SUM2X2);
  const b = createSession(SUM2X2);
  assert.deepEqual(getMoves(a).map((m) => [m.v, m.r, m.c]), getMoves(b).map((m) => [m.v, m.r, m.c]));
  let sa = a, sb = b;
  for (let i = 0; i < 3; i++) {
    const ma = getMoves(sa)[0];
    const mb = getMoves(sb)[0];
    assert.deepEqual(ma, mb);
    sa = apply(sa, ma);
    sb = apply(sb, mb);
  }
  assert.equal(canonical(sa), canonical(sb));
});

test("replay : les événements PLACE reproduisent l'état final (contrat)", () => {
  const spec = SUM2X2;
  let s = createSession(spec);
  for (let i = 0; i < 3; i++) {
    const mv = getMoves(s)[0];
    s = apply(s, mv);
  }
  const out = replay(spec, s.events);
  assert.deepEqual(out[out.length - 1].grid, s.grid);
});

// ---------------------------------------------------------------------------
// M28 · QUALIFICATION DE CES TROIS TESTS LEGACY
//
// Ils exercent `certify()`, qui porte desormais le statut LEGACY /
// UNTRUSTED (voir l'en-tete de src/v5/rules/solver.mjs). Ils sont conserves
// comme tests de non-regression DU LEGACY, et ne comptent pas comme preuve.
//
// Ce qui reste valable : la direction POSITIVE. Si `certify` repond
// `solvable: true`, le puzzle est reellement resolvable — la generation de
// transitions vient du moteur souverain. Les assertions ci-dessous sur
// `solvable: true` restent donc exactes.
//
// Ce qui ne vaut RIEN : la direction NEGATIVE. `solvable: false` n'est pas
// une preuve d'inexistence, car la recherche a pu etre tronquee sans que
// `budgeted` ne le signale (M28-SOLVER-001). L'assertion correspondante est
// donc explicitement marquee « non probante » : elle verifie le comportement
// observe, pas une propriete mathématique.
//
// La preuve de solvabilite fait autorite dans
// tests/v5/solvability-witness.test.mjs.
// ---------------------------------------------------------------------------
test("LEGACY certify : SPEC somme 2×2 résolvable, minMoves fini, solution présente", () => {
  const r = certify(SUM2X2, { maxDepth: 4, budget: 5000 });
  assert.equal(r.solvable, true);
  assert.ok(Number.isInteger(r.minMoves) && r.minMoves >= 2 && r.minMoves <= 4);
  assert.ok(r.solutions >= 1);
});

test("LEGACY certify : spec tout-'+' incohérente refusée par quickReject puis insoluble", () => {
  const badSum = JSON.parse(JSON.stringify(SUM2X2));
  badSum.cols[1].target = 100;
  assert.equal(quickReject(badSum), true);
  const r = certify(badSum, { maxDepth: 4, budget: 5000 });
  // NON PROBANT : verifie le comportement observe du legacy, PAS une
  // inexistence. quickReject ci-dessus reste, lui, une preuve : il est
  // structurel (somme des cibles des lignes != somme des cibles colonnes).
  assert.equal(r.solvable, false);
});

test("LEGACY certify : résout l'exemple mixte ou réponde sans erreur", () => {
  const r = certify(MIXED2X2, { maxDepth: 6, budget: 5000 });
  assert.equal(typeof r.solvable, "boolean");
});

test("getState : exposé déterministe et immuable (copies)", () => {
  const s = createSession(SUM2X2);
  const g1 = getState(s);
  const g2 = getState(s);
  assert.deepEqual(g1, g2);
  g1.grid[0][0] = 999;
  assert.notEqual(s.grid[0][0], 999);
});

test("isSolved : état vide non résolu, grille complète correcte résolue", () => {
  let s = createSession(SUM2X2);
  assert.equal(isSolved(s), false);
  for (const mv of [
    { id: "PLACE", v: 2, r: 0, c: 0 },
    { id: "PLACE", v: 3, r: 0, c: 1 },
    { id: "PLACE", v: 2, r: 1, c: 0 },
    { id: "PLACE", v: 5, r: 1, c: 1 },
  ]) {
    s = apply(s, mv);
    assert.ok(s, "move légal");
  }
  assert.equal(isSolved(s), true);
});