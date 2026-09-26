/**
 * @file multi-strategy.test.mjs
 * MATHIC V6 - M26 Multi-Strategy & Proof Test Suite
 *
 * Demonstrates:
 * 1. Intent canonicalization & serialization
 * 2. Method registry validation & rejection
 * 3. Deterministic compilation strictly to V5 commands
 * 4. Precondition checks without fake Ether
 * 5. Proof Engine validation using getMoves() + apply()
 * 6. Non-mutation of initial state during preview
 * 7. Intent rejection on illegal move/spec
 * 8. Multi-Strategy Proof: two valid distinct intents from same S0
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createSession, canonical } from "../../src/v5/rules/engine.mjs";
import { createIntent, serializeIntent, deserializeIntent } from "../../src/gameplay/methods/intent.mjs";
import { MethodRegistry } from "../../src/gameplay/methods/registry.mjs";
import { checkPreconditions } from "../../src/gameplay/methods/preconditions.mjs";
import { registerFoundingMethods } from "../../src/gameplay/methods/catalog.mjs";
import { compile } from "../../src/gameplay/commands/compiler.mjs";
import { prove } from "../../src/gameplay/proof/proof-engine.mjs";
import { preview } from "../../src/gameplay/session/preview.mjs";

function setupRegistry() {
  const reg = new MethodRegistry();
  registerFoundingMethods(reg);
  return reg;
}

function createSampleV5State() {
  const spec = {
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [
      { target: 7, ops: ["+"] },
      { target: 12, ops: ["*"] },
    ],
    cols: [
      { target: 6, ops: ["+"] },
      { target: 8, ops: ["+"] },
    ],
    reserve: { 3: 2, 4: 2 },
  };
  return createSession(spec);
}

test("M26 - Intent Model: canonical, serializable, immutable", () => {
  const intent = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    values: [3, 4],
    parameters: { target: 7 },
  });

  assert.equal(intent.methodId, "METHOD_DECOMPOSE");
  assert.deepEqual(intent.values, [3, 4]);
  assert.equal(intent.parameters.target, 7);

  // Immutability
  assert.throws(() => {
    intent.values.push(5);
  }, TypeError);

  // Serialization roundtrip
  const serialized = serializeIntent(intent);
  const deserialized = deserializeIntent(serialized);
  assert.deepEqual(deserialized.targets, intent.targets);
  assert.deepEqual(deserialized.values, intent.values);
  assert.equal(deserialized.methodId, intent.methodId);
});

test("M26 - Method Registry: accepts valid, rejects invalid/duplicates/imaginary primitives", () => {
  const reg = new MethodRegistry();
  registerFoundingMethods(reg);

  assert.equal(reg.has("METHOD_FUSE"), true);
  assert.equal(reg.has("METHOD_DECOMPOSE"), true);
  assert.equal(reg.has("METHOD_FACTORIZE"), true);
  assert.equal(reg.list().length, 3);

  // Rejects duplicate ID
  assert.throws(() => {
    reg.register({
      id: "METHOD_FUSE",
      name: "Duplicate",
      compile: () => {},
      primitiveOperations: ["PLACE"],
    });
  }, /identifiant dupliqué/);

  // Rejects method with imaginary V5 primitive (e.g. SPLIT, FUSE, FACTOR)
  assert.throws(() => {
    reg.register({
      id: "METHOD_SPLIT_IMAGINARY",
      name: "Imaginary Split",
      compile: () => {},
      primitiveOperations: ["SPLIT"],
    });
  }, /primitive non supportée 'SPLIT'/);
});

test("M26 - Preconditions: validates bounds, target emptiness, reserve", () => {
  const reg = setupRegistry();
  const s0 = createSampleV5State();

  // Valid intent
  const validIntent = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    values: [3, 4],
    parameters: { target: 7 },
  });
  const res1 = checkPreconditions(s0, validIntent, reg);
  assert.equal(res1.ok, true);

  // Out of bounds target
  const oobIntent = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [
      { r: 99, c: 0 },
      { r: 0, c: 1 },
    ],
    values: [3, 4],
    parameters: { target: 7 },
  });
  const res2 = checkPreconditions(s0, oobIntent, reg);
  assert.equal(res2.ok, false);
  assert.match(res2.reason, /hors limites/);

  // Missing values in reserve
  const missingReserveIntent = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    values: [99, 4],
    parameters: { target: 103 },
  });
  const res3 = checkPreconditions(s0, missingReserveIntent, reg);
  assert.equal(res3.ok, false);
  assert.match(res3.reason, /Réserves insuffisantes/);
});

test("M26 - Method Compiler: pure, deterministic, generates only V5 PLACE commands", () => {
  const reg = setupRegistry();
  const s0 = createSampleV5State();

  const intent = createIntent({
    methodId: "METHOD_FACTORIZE",
    targets: [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ],
    values: [3, 4],
    parameters: { target: 12 },
  });

  const compiled1 = compile(s0, intent, reg);
  const compiled2 = compile(s0, intent, reg);

  // Determinism
  assert.deepEqual(compiled1, compiled2);

  // Commands structure
  assert.equal(compiled1.commands.length, 2);
  assert.equal(compiled1.commands[0].id, "PLACE");
  assert.equal(compiled1.commands[0].v, 3);
  assert.equal(compiled1.commands[0].r, 1);
  assert.equal(compiled1.commands[0].c, 0);

  assert.equal(compiled1.commands[1].id, "PLACE");
  assert.equal(compiled1.commands[1].v, 4);
  assert.equal(compiled1.commands[1].r, 1);
  assert.equal(compiled1.commands[1].c, 1);
});

test("M26 - Proof Engine: uses getMoves() + apply(), rejects illegal moves", () => {
  const s0 = createSampleV5State();

  // Legal sequence
  const legalCmds = [
    { id: "PLACE", v: 3, r: 0, c: 0 },
    { id: "PLACE", v: 4, r: 0, c: 1 },
  ];
  const proofLegal = prove(s0, legalCmds);
  assert.equal(proofLegal.valid, true);
  assert.equal(proofLegal.steps.length, 2);
  assert.equal(proofLegal.steps[0].legal, true);

  // Illegal sequence (e.g. value not sum-feasible or lineOk invalid for col sum)
  // Placing 4 in (0,0) and 4 in (0,1) -> row sum = 8 != target 7 -> lineOk fails in getMoves!
  const illegalCmds = [
    { id: "PLACE", v: 4, r: 0, c: 0 },
    { id: "PLACE", v: 4, r: 0, c: 1 },
  ];
  const proofIllegal = prove(s0, illegalCmds);
  assert.equal(proofIllegal.valid, false);
  assert.equal(proofIllegal.steps[0].legal, true);
  assert.equal(proofIllegal.steps[1].legal, false);
  assert.match(proofIllegal.error, /illégale selon V5.getMoves/);
});

test("M26 - Preview Engine: non-mutation of initial state, returns structured object", () => {
  const reg = setupRegistry();
  const s0 = createSampleV5State();
  const beforeSnapshot = JSON.stringify(s0);

  const intent = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    values: [3, 4],
    parameters: { target: 7 },
  });

  const res = preview(s0, intent, reg);

  assert.equal(res.valid, true);
  assert.equal(res.methodId, "METHOD_DECOMPOSE");
  assert.equal(res.commands.length, 2);
  assert.notEqual(res.proposedState, null);
  assert.deepEqual(res.cost, { ether: 10 });

  // Verify initial state immutability
  assert.equal(JSON.stringify(s0), beforeSnapshot);
});

test("M26 - Intent Rejection: invalid intent or illegal V5 moves return valid === false without state mutation", () => {
  const reg = setupRegistry();
  const s0 = createSampleV5State();
  const beforeSnapshot = JSON.stringify(s0);

  // Invalid decomposition target sum (3 + 3 = 6 != target 7)
  const badIntent = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    values: [3, 3],
    parameters: { target: 7 },
  });

  const res = preview(s0, badIntent, reg);
  assert.equal(res.valid, false);
  assert.match(res.error, /Préconditions/);
  assert.equal(res.proposedState, null);

  // State remains pristine
  assert.equal(JSON.stringify(s0), beforeSnapshot);
});

test("M26 - Multi-Strategy Proof: same S0 produces multiple distinct legal strategies certified by V5", () => {
  const reg = setupRegistry();
  const s0 = createSampleV5State();
  const s0Snapshot = JSON.stringify(s0);

  // Strategy A: METHOD_DECOMPOSE on Row 0 (Target 7 = 3 + 4)
  const intentA = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    values: [3, 4],
    parameters: { target: 7 },
  });

  // Strategy B: METHOD_FACTORIZE on Row 1 (Target 12 = 3 * 4)
  const intentB = createIntent({
    methodId: "METHOD_FACTORIZE",
    targets: [
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ],
    values: [3, 4],
    parameters: { target: 12 },
  });

  const previewA = preview(s0, intentA, reg);
  const previewB = preview(s0, intentB, reg);

  // 1. Both strategies are valid
  assert.equal(previewA.valid, true);
  assert.equal(previewB.valid, true);

  // 2. Commands plans are distinct
  assert.notDeepEqual(previewA.commands, previewB.commands);

  // 3. Certified proposed states are distinct
  const canonicalA = canonical(previewA.proposedState);
  const canonicalB = canonical(previewB.proposedState);
  assert.notEqual(canonicalA, canonicalB);

  // 4. Initial state S0 is strictly unchanged
  assert.equal(JSON.stringify(s0), s0Snapshot);
});
