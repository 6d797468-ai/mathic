/**
 * MATHIC M30 — CONTRACTS TESTS
 * ============================================================================
 * Tests des contrats communs d'enveloppe.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_SCHEMA_VERSION,
  ENGINE_TYPES,
  validateContentEnvelope,
  createContentEnvelope,
  extractSpec,
  sameContent,
  validateRulesEnvelope,
  createRulesEnvelope,
  extractRules,
  sameRules,
  STATE_SCHEMA_VERSION,
  validateStateEnvelope,
  createStateEnvelope,
  serializeState,
  deserializeState,
  testStateRoundtrip,
  canonicalizeNativeState,
  fingerprintNativeState,
  computeStateHash,
  EVENT_SCHEMA_VERSION,
  COMMON_EVENT_TYPES,
  validateEventEnvelope,
  createEventEnvelope,
  validateEventSequence,
  hashEvent,
  REPLAY_SCHEMA_VERSION,
  REPLAY_STATUS,
  validateReplayEnvelope,
  createReplayEnvelope,
  replay,
  verifyReplay,
  PLATFORM_VERSION,
  ENGINE_VERSIONS,
  getVersionContext,
  getFingerprintDependencies,
  getRulesVersion,
  versionInvalidatesCache,
  bumpVersion,
  computeV5ContentFingerprint,
  computeContentFingerprint,
  sameFingerprint,
  fnv1a64,
  fingerprintObject,
  ADAPTERS,
  getAdapter,
  isSupportedEngine,
} from "../src/contracts/index.mjs";

const SOLVABLE_V5 = {
  grid: [[-1, -1]],
  rows: [{ target: 12, ops: ["*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }],
  reserve: { 3: 1, 4: 1 },
};

const B1_LEVEL = {
  id: "N1",
  target: 12,
  maxMoves: 3,
  rows: 2,
  cols: 2,
  tiles: [
    { kind: "num", v: 3 },
    { kind: "num", v: 4 },
    { kind: "op", v: "*" },
    { kind: "num", v: 1 },
  ],
};

// =============================================================================
// ENVELOPE
// =============================================================================
test("envelope: valid V5 content envelope", () => {
  const env = createContentEnvelope({
    engine: "v5",
    contentId: "test-1",
    rulesVersion: "v5-engine",
    spec: SOLVABLE_V5,
  });
  assert.equal(validateContentEnvelope(env).ok, true);
});

test("envelope: valid B1 content envelope", () => {
  const env = createContentEnvelope({
    engine: "b1",
    contentId: "N1",
    rulesVersion: "b1-ladder",
    spec: { id: "N1", target: 12, maxMoves: 3, rows: 2, cols: 2, tiles: [] },
  });
  assert.equal(validateContentEnvelope(env).ok, true);
});

test("envelope: valid V3 content envelope", () => {
  const env = createContentEnvelope({
    engine: "v3",
    contentId: "v3-level-1",
    rulesVersion: "v3-classic",
    spec: { board: [[0,0],[0,0]], target: 24 },
  });
  assert.equal(validateContentEnvelope(env).ok, true);
});

test("envelope: rejects invalid engine", () => {
  const env = { schemaVersion: 1, engine: "x", contentId: "x", contentVersion: 1, rulesVersion: "x", spec: {} };
  assert.equal(validateContentEnvelope(env).ok, false);
});

test("envelope: rejects missing contentId", () => {
  const env = { schemaVersion: 1, engine: "v5", contentVersion: 1, rulesVersion: "v5-engine", spec: {} };
  assert.equal(validateContentEnvelope(env).ok, false);
});

test("envelope: sameContent compares correctly", () => {
  const a = createContentEnvelope({ engine: "v5", contentId: "x", rulesVersion: "v5-engine", spec: {}, contentVersion: 1 });
  const b = createContentEnvelope({ engine: "v5", contentId: "x", rulesVersion: "v5-engine", spec: {}, contentVersion: 1 });
  const c = createContentEnvelope({ engine: "v5", contentId: "y", rulesVersion: "v5-engine", spec: {}, contentVersion: 1 });
  assert.equal(sameContent(a, b), true);
  assert.equal(sameContent(a, c), false);
});

test("envelope: extractSpec extracts native spec", () => {
  const env = createContentEnvelope({ engine: "v5", contentId: "x", rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  const spec = extractSpec(env);
  assert.deepEqual(spec, SOLVABLE_V5);
});

// =============================================================================
// RULES
// =============================================================================
test("rules: valid V5 rules envelope", () => {
  const env = createRulesEnvelope({
    engine: "v5",
    rulesVersion: "v5-engine",
    rules: { operators: ["+", "-", "*", "/"] },
    completionContract: "completion-contract",
  });
  assert.equal(validateRulesEnvelope(env).ok, true);
});

test("rules: rejects invalid completionContract", () => {
  const env = { schemaVersion: 1, engine: "v5", rulesVersion: "x", rules: {}, completionContract: "invalid" };
  assert.equal(validateRulesEnvelope(env).ok, false);
});

test("rules: sameRules compares correctly", () => {
  const a = createRulesEnvelope({ engine: "v5", rulesVersion: "x", rules: { a: 1 } });
  const b = createRulesEnvelope({ engine: "v5", rulesVersion: "x", rules: { a: 1 } });
  const c = createRulesEnvelope({ engine: "v5", rulesVersion: "x", rules: { a: 2 } });
  assert.equal(sameRules(a, b), true);
  assert.equal(sameRules(a, c), false);
});

test("rules: extractRules extracts native rules", () => {
  const env = createRulesEnvelope({ engine: "v5", rulesVersion: "x", rules: { a: 1 } });
  assert.deepEqual(extractRules(env), { a: 1 });
});

// =============================================================================
// STATE
// =============================================================================
test("state: valid state envelope", () => {
  const env = createStateEnvelope({
    engine: "v5",
    contentId: "test",
    stateVersion: 1,
    state: { grid: [[1,2],[3,4]], reserve: { 3: 1 } },
    stateHash: "abc123",
  });
  assert.equal(validateStateEnvelope(env).ok, true);
});

test("state: serialize/deserialize roundtrip", () => {
  const env = createStateEnvelope({
    engine: "v5",
    contentId: "test",
    stateVersion: 1,
    state: { grid: [[1,2],[3,4]], reserve: { 3: 1 } },
    stateHash: "abc123",
  });
  assert.equal(testStateRoundtrip(env), true);
});

test("state: serialize produces canonical JSON", () => {
  const env = createStateEnvelope({
    engine: "v5",
    contentId: "test",
    stateVersion: 1,
    state: { b: 2, a: 1 },
    stateHash: "abc123",
  });
  const serialized = serializeState(env);
  const parsed = JSON.parse(serialized);
  const keys = Object.keys(parsed);
  // Les clés racine doivent être triées
  assert.deepEqual(keys, ["contentId", "engine", "schemaVersion", "state", "stateHash", "stateVersion"]);
});

test("state: fingerprintNativeState produces deterministic hash", () => {
  const state = { grid: [[1,2],[3,4]], reserve: { 3: 1 } };
  const fp1 = fingerprintNativeState(state, "v5", "v5-engine");
  const fp2 = fingerprintNativeState(state, "v5", "v5-engine");
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 16);
});

test("state: computeStateHash produces deterministic hash", () => {
  const env = {
    schemaVersion: 1,
    engine: "v5",
    contentId: "test",
    stateVersion: 1,
    state: { grid: [[1,2]], reserve: {} },
    stateHash: "abc",
  };
  const h1 = computeStateHash(env);
  const h2 = computeStateHash(env);
  assert.equal(h1, h2);
  assert.equal(h1.length, 16);
});

test("state: roundtrip serialize/deserialize preserves content", () => {
  const env = createStateEnvelope({
    engine: "v5",
    contentId: "test",
    stateVersion: 1,
    state: { grid: [[1,2],[3,4]], reserve: { 3: 1 } },
    stateHash: "abc123",
  });
  const serialized = serializeState(env);
  const deserialized = deserializeState(serializeState(env));
  assert.deepEqual(deserialized.state, env.state);
});

// =============================================================================
// EVENTS
// =============================================================================
test("events: valid event envelope", () => {
  const env = createEventEnvelope({
    engine: "v5",
    contentId: "test",
    eventId: "evt-1",
    sequence: 1,
    type: "MOVE_APPLIED",
    payload: { move: "PLACE", value: 3, r: 0, c: 0 },
    stateHash: "abc123",
    timestamp: Date.now(),
  });
  assert.equal(validateEventEnvelope(env).ok, true);
});

test("events: rejects invalid type", () => {
  const env = { schemaVersion: 1, engine: "v5", contentId: "x", eventId: "e", sequence: 1, type: "", payload: {}, stateHash: "x", timestamp: 0 };
  assert.equal(validateEventEnvelope(env).ok, false);
});

test("events: validateEventSequence validates ordering", () => {
  const events = [
    createEventEnvelope({ engine: "v5", contentId: "x", eventId: "1", sequence: 1, type: "A", payload: {}, stateHash: "h", timestamp: 1 }),
    createEventEnvelope({ engine: "v5", contentId: "x", eventId: "2", sequence: 2, type: "B", payload: {}, stateHash: "h", timestamp: 2 }),
    createEventEnvelope({ engine: "v5", contentId: "x", eventId: "3", sequence: 3, type: "C", payload: {}, stateHash: "h", timestamp: 3 }),
  ];
  assert.equal(validateEventSequence(events), true);
});

test("events: validateEventSequence rejects wrong order", () => {
  const events = [
    createEventEnvelope({ engine: "v5", contentId: "x", eventId: "1", sequence: 2, type: "A", payload: {}, stateHash: "h", timestamp: 1 }),
    createEventEnvelope({ engine: "v5", contentId: "x", eventId: "2", sequence: 1, type: "B", payload: {}, stateHash: "h", timestamp: 2 }),
  ];
  assert.equal(validateEventSequence(events), false);
});

test("events: hashEvent produces deterministic hash", () => {
  const env = createEventEnvelope({ engine: "v5", contentId: "x", eventId: "e", sequence: 1, type: "A", payload: { a: 1 }, stateHash: "h", timestamp: 1000 });
  const h1 = hashEvent(env);
  const h2 = hashEvent(env);
  assert.equal(h1, h2);
  assert.equal(h1.length, 16);
});

// =============================================================================
// REPLAY
// =============================================================================
test("replay: valid replay envelope", () => {
  const env = createReplayEnvelope({
    engine: "v5",
    contentId: "test",
    initialState: { spec: {}, grid: [[-1,-1]], reserve: {} },
    events: [{ type: "PLACE", value: 3, r: 0, c: 0 }],
    finalState: { grid: [[3,-1]], reserve: {} },
    status: "COMPLETE",
    fingerprint: "abc123",
  });
  assert.equal(validateReplayEnvelope(env).ok, true);
});

test("replay: rejects invalid status", () => {
  const env = { schemaVersion: 1, engine: "v5", contentId: "x", initialState: {}, events: [], finalState: {}, status: "INVALID_STATUS", fingerprint: "x" };
  assert.equal(validateReplayEnvelope(env).ok, false);
});

// =============================================================================
// VERSIONS
// =============================================================================
test("versions: getVersionContext returns correct context", () => {
  const v5ctx = getVersionContext("v5");
  assert.equal(v5ctx.rules, "v5-engine");
  assert.equal(v5ctx.witness, 1);
  assert.equal(v5ctx.engine, 1);
  assert.equal(v5ctx.platform, 1);

  const b1ctx = getVersionContext("b1");
  assert.equal(b1ctx.rules, "b1-ladder");
  assert.ok(!b1ctx.witness);
});

test("versions: getFingerprintDependencies returns correct deps", () => {
  assert.deepEqual(getFingerprintDependencies("v5"), ["v5-engine", "1"]);
  assert.deepEqual(getFingerprintDependencies("b1"), []);
  assert.deepEqual(getFingerprintDependencies("v3"), []);
});

test("versions: getRulesVersion returns correct version", () => {
  assert.equal(getRulesVersion("v5"), "v5-engine");
  assert.equal(getRulesVersion("b1"), "b1-ladder");
});

test("versions: versionInvalidatesCache detects rules change", () => {
  assert.equal(versionInvalidatesCache({ rules: "a" }, { rules: "b" }), true);
});

test("versions: versionInvalidatesCache detects witness change", () => {
  assert.equal(versionInvalidatesCache({ witness: 1 }, { witness: 2 }), true);
});

test("versions: bumpVersion increments correctly", () => {
  const v5 = bumpVersion("v5", { rules: true });
  assert.equal(v5.rules, "v5-engine-1");
  const v5w = bumpVersion("v5", { witness: true });
  assert.equal(v5w.witness, 2);
});

// =============================================================================
// FINGERPRINT
// =============================================================================
test("fingerprint: computeV5ContentFingerprint produces deterministic hash", () => {
  const fp1 = computeV5ContentFingerprint(SOLVABLE_V5);
  const fp2 = computeV5ContentFingerprint(SOLVABLE_V5);
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 16);
});

test("fingerprint: different specs produce different fingerprints", () => {
  const UNSOLVABLE = { grid: [[-1,-1]], rows: [{target:13,ops:["*"]}], cols:[{target:3,ops:[]},{target:4,ops:[]}], reserve:{3:1,4:1} };
  const fp1 = computeV5ContentFingerprint(SOLVABLE_V5);
  const fp2 = computeV5ContentFingerprint(UNSOLVABLE);
  assert.notEqual(fp1, fp2);
});

test("fingerprint: computeContentFingerprint dispatches correctly", () => {
  assert.ok(computeContentFingerprint("v5", SOLVABLE_V5));
  assert.equal(computeContentFingerprint("b1", {}), null);
  assert.equal(computeContentFingerprint("v3", {}), null);
});

test("fingerprint: sameFingerprint works", () => {
  assert.equal(sameFingerprint("abc", "abc"), true);
  assert.equal(sameFingerprint("a", "b"), false);
  assert.equal(sameFingerprint(null, "a"), false);
});

test("fingerprint: fnv1a64 produces deterministic hash", () => {
  const h1 = fnv1a64("test");
  const h2 = fnv1a64("test");
  assert.equal(h1, h2);
  assert.equal(h1.length, 16);
});

test("fingerprint: fingerprintObject produces deterministic hash", () => {
  const obj = { a: 1, b: { c: 2 } };
  const fp1 = fingerprintObject(obj);
  const fp2 = fingerprintObject(obj);
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 16);
});

// =============================================================================
// ADAPTERS
// =============================================================================
test("adapters: getAdapter returns correct adapter", () => {
  assert.equal(getAdapter("v3").engine, "v3");
  assert.equal(getAdapter("b1").engine, "b1");
  assert.equal(getAdapter("v5").engine, "v5");
});

test("adapters: isSupportedEngine works", () => {
  assert.equal(isSupportedEngine("v3"), true);
  assert.equal(isSupportedEngine("b1"), true);
  assert.equal(isSupportedEngine("v5"), true);
  assert.equal(isSupportedEngine("x"), false);
});

test("adapters: v5Adapter creates valid content envelope", () => {
  const adapter = getAdapter("v5");
  const env = adapter.toContentEnvelope({ spec: SOLVABLE_V5 });
  assert.equal(validateContentEnvelope(env).ok, true);
  assert.equal(env.engine, "v5");
});

test("adapters: b1Adapter creates valid content envelope", () => {
  const adapter = getAdapter("b1");
  const env = adapter.toContentEnvelope({ level: { id: "N1", target: 12, maxMoves: 3, rows: 2, cols: 2, tiles: [] } });
  assert.equal(validateContentEnvelope(env).ok, true);
  assert.equal(env.engine, "b1");
});

test("adapters: v3Adapter creates valid content envelope", () => {
  const adapter = getAdapter("v3");
  const env = adapter.toContentEnvelope({ spec: { board: [[0,0],[0,0]], target: 24 } });
  assert.equal(validateContentEnvelope(env).ok, true);
  assert.equal(env.engine, "v3");
});

test("adapters: adapters produce valid rules envelopes", () => {
  const v5Env = getAdapter("v5").toRulesEnvelope({ rulesVersion: "v5-engine", rules: {} });
  assert.equal(validateRulesEnvelope(v5Env).ok, true);

  const b1Env = getAdapter("b1").toRulesEnvelope({ rulesVersion: "b1-ladder", rules: {} });
  assert.equal(validateRulesEnvelope(b1Env).ok, true);

  const v3Env = getAdapter("v3").toRulesEnvelope({ rulesVersion: "v3-classic", rules: {} });
  assert.equal(validateRulesEnvelope(v3Env).ok, true);
});

test("adapters: isSupportedEngine rejects unknown", () => {
  assert.equal(isSupportedEngine("x"), false);
  assert.equal(isSupportedEngine(""), false);
});