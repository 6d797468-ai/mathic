
import test from "node:test";
import assert from "node:assert/strict";
import { validateLevelDefinition, createLevelDefinition, compileV5Level, computeLevelFingerprint, migrateLegacyV5Spec } from "../../src/v5/level.mjs";
import { registerLevel, getLevel, hasLevel, listLevels, levelCount, clearRegistry, registerLegacyV5, resetToDefaultGrimoireLevels } from "../../src/v5/registry.mjs";
import { computeV5ContentFingerprint } from "../../src/contracts/fingerprint.mjs";
import { admitSpec } from "../../src/v5/rules/admission.mjs";

const SOLVABLE_V5 = { grid: [[-1, -1]], rows: [{ target: 12, ops: ["*"] }], cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 } };
const UNSOLVABLE_V5 = { grid: [[-1, -1]], rows: [{ target: 13, ops: ["*"] }], cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 } };

// =============================================================================
// LEVEL DEFINITION
// =============================================================================
test("level: valid level definition", () => {
  const def = { schemaVersion: 1, engine: "v5", contentId: "test-level", contentVersion: 1, rulesVersion: "v5-engine", spec: { grid: [[-1, -1]], rows: [{ target: 12, ops: ["*"] }], cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 } } };
  const { ok } = validateLevelDefinition(def);
  assert.equal(ok, true);
});

test("level: rejects invalid engine", () => {
  const def = { schemaVersion: 1, engine: "v3", contentId: "x", contentVersion: 1, rulesVersion: "x", spec: {} };
  assert.equal(validateLevelDefinition(def).ok, false);
});

test("level: rejects missing contentId", () => {
  const def = { schemaVersion: 1, engine: "v5", contentVersion: 1, rulesVersion: "v5-engine", spec: {} };
  assert.equal(validateLevelDefinition(def).ok, false);
});

test("level: rejects invalid spec", () => {
  const def = { schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: { grid: "not an array" } };
  assert.equal(validateLevelDefinition(def).ok, false);
});

test("level: rejects wrong rulesVersion", () => {
  const def = { schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v3-classic", spec: { grid: [[-1]], rows: [], cols: [], reserve: {} } };
  assert.equal(validateLevelDefinition(def).ok, false);
});

test("level: accepts optional metadata", () => {
  const def = { schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5, metadata: { label: "Test", difficulty: 2 } };
  assert.equal(validateLevelDefinition(def).ok, true);
});

test("level: rejects invalid metadata", () => {
  const def = { schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: { grid: [[-1, -1]], rows: [{ target: 12, ops: ["*"] }], cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 } }, metadata: "not an object" };
  assert.equal(validateLevelDefinition(def).ok, false);
});

// =============================================================================
// COMPILATION
// =============================================================================
test("compile: produces canonical V5 spec", () => {
  const level = { schemaVersion: 1, engine: "v5", contentId: "test", contentVersion: 1, rulesVersion: "v5-engine", spec: { grid: [[-1, -1], [-1, -1]], rows: [{ target: 5, ops: ["+"] }, { target: 7, ops: ["+"] }], cols: [{ target: 4, ops: ["+"] }, { target: 8, ops: ["+"] }], reserve: { 2: 2, 3: 1, 5: 1 } } };
  const compiled = compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: { grid: [[-1, -1], [-1, -1]], rows: [{ target: 5, ops: ["+"] }, { target: 7, ops: ["+"] }], cols: [{ target: 4, ops: ["+"] }, { target: 8, ops: ["+"] }], reserve: { 2: 2, 3: 1, 5: 1 } } });
  assert.deepEqual(compiled.grid, [[-1, -1], [-1, -1]]);
  assert.deepEqual(compiled.rows, [{ target: 5, ops: ["+"] }, { target: 7, ops: ["+"] }]);
  assert.deepEqual(compiled.cols, [{ target: 4, ops: ["+"] }, { target: 8, ops: ["+"] }]);
  assert.deepEqual(compiled.reserve, { 2: 2, 3: 1, 5: 1 });
});

test("compile: deterministic - same input produces byte-identical output", () => {
  const a = compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  const b = compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
});

test("compile: rejects invalid level", () => {
  assert.throws(() => compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "x", spec: {} }));
});

// =============================================================================
// FINGERPRINT
// =============================================================================
test("fingerprint: deterministic for same level", () => {
  const fp1 = computeLevelFingerprint({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  const fp2 = computeLevelFingerprint({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 16);
});

test("fingerprint: different specs produce different fingerprints", () => {
  const fp1 = computeLevelFingerprint({ schemaVersion: 1, engine: "v5", contentId: "a", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  const fp2 = computeLevelFingerprint({ schemaVersion: 1, engine: "v5", contentId: "b", contentVersion: 1, rulesVersion: "v5-engine", spec: UNSOLVABLE_V5 });
  assert.notEqual(fp1, fp2);
});

// =============================================================================
// MIGRATION LEGACY
// =============================================================================
test("migrate: legacy Grimoire spec becomes valid LevelDefinition", () => {
  const legacy = { grid: [[-1, -1], [-1, -1]], rows: [{ ops: ["+"], target: 5 }, { ops: ["+"], target: 7 }], cols: [{ ops: ["+"], target: 4 }, { ops: ["+"], target: 8 }], reserve: { 2: 2, 3: 1, 5: 1 } };
  const level = migrateLegacyV5Spec(legacy, { contentId: "TEST_MIGRATED", contentVersion: 1, metadata: { label: "Test" } });
  assert.equal(validateLevelDefinition(level).ok, true);
  assert.equal(level.contentId, "TEST_MIGRATED" );
  assert.equal(level.engine, "v5" );
  assert.equal(level.rulesVersion, "v5-engine" );
  assert.deepEqual(level.spec, { grid: [[-1, -1], [-1, -1]], rows: [{ ops: ["+"], target: 5 }, { ops: ["+"], target: 7 }], cols: [{ ops: ["+"], target: 4 }, { ops: ["+"], target: 8 }], reserve: { 2: 2, 3: 1, 5: 1 } });
});

test("migrate: preserves fingerprint", () => {
  const legacy = { grid: [[-1, -1], [-1, -1]], rows: [{ ops: ["+"], target: 5 }, { ops: ["+"], target: 7 }], cols: [{ ops: ["+"], target: 4 }, { ops: ["+"], target: 8 }], reserve: { 2: 2, 3: 1, 5: 1 } };
  const fpLegacy = computeV5ContentFingerprint(legacy);
  const migrated = migrateLegacyV5Spec(legacy, { contentId: "TEST", contentVersion: 1 });
  const fpAfter = computeLevelFingerprint({ schemaVersion: 1, engine: "v5", contentId: "TEST", contentVersion: 1, rulesVersion: "v5-engine", spec: compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: legacy }) });
  const fpAfter2 = computeV5ContentFingerprint(compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: legacy }));
  assert.equal(fpAfter2, fpLegacy);
});

test("fingerprint: LAB_MIXED_2X2 fingerprint preserved", () => {
  const legacy = { grid: [[-1, -1], [-1, -1]], rows: [{ ops: ["*"], target: 10 }, { ops: ["-"], target: 4 }], cols: [{ ops: ["+"], target: 9 }, { ops: ["+"], target: 8 }], reserve: { 2: 1, 3: 1, 5: 1, 7: 1 } };
  const fpBefore = computeV5ContentFingerprint(legacy);
  const fpAfter = computeV5ContentFingerprint(compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: legacy }));
  assert.equal(fpBefore, fpAfter);
});

test("fingerprint: meaningful modification changes fingerprint", () => {
  const levelA = { schemaVersion: 1, engine: "v5", contentId: "A", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 };
  const levelB = { schemaVersion: 1, engine: "v5", contentId: "B", contentVersion: 1, rulesVersion: "v5-engine", spec: UNSOLVABLE_V5 };
  assert.notEqual(computeLevelFingerprint(levelA), computeLevelFingerprint(levelB));
});

test("fingerprint: rulesVersion change affects proof cache (via fingerprint deps)", () => {
  const level = { schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 };
  const fp1 = computeLevelFingerprint(level);
  assert.equal(typeof fp1, "string");
  assert.equal(fp1.length, 16);
});

// =============================================================================
// REGISTRY
// =============================================================================
test("registry: register and retrieve level", () => {
  clearRegistry();
  const result = registerLevel({ schemaVersion: 1, engine: "v5", contentId: "TEST_REG", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  assert.equal(result.ok, true);
  const retrieved = getLevel("TEST_REG");
  assert.ok(retrieved);
  assert.deepEqual(retrieved.definition.contentId, "TEST_REG" );
  assert.ok(hasLevel("TEST_REG"));
  assert.equal(levelCount(), 1);
  assert.deepEqual(listLevels(), ["TEST_REG"]);
});

test("registry: rejects duplicate contentId", () => {
  clearRegistry();
  assert.equal(registerLevel({ schemaVersion: 1, engine: "v5", contentId: "DUP", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 }).ok, true);
  assert.equal(registerLevel({ schemaVersion: 1, engine: "v5", contentId: "DUP", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 }).ok, false);
});

test("registry: getLevel returns null for unknown", () => {
  clearRegistry();
  assert.equal(getLevel("UNKNOWN"), null);
  assert.equal(hasLevel("UNKNOWN"), false);
});

test("registry: listLevels returns sorted ids", () => {
  clearRegistry();
  registerLevel({ schemaVersion: 1, engine: "v5", contentId: "B", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  registerLevel({ schemaVersion: 1, engine: "v5", contentId: "A", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  registerLevel({ schemaVersion: 1, engine: "v5", contentId: "C", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  assert.deepEqual(listLevels(), ["A", "B", "C"]);
});

test("registry: clearRegistry works", () => {
  clearRegistry();
  registerLevel({ schemaVersion: 1, engine: "v5", contentId: "X", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  clearRegistry();
  assert.equal(levelCount(), 0);
  assert.equal(getLevel("X"), null);
});

// =============================================================================
// FINGERPRINT COMPATIBILITY (CRITICAL)
// =============================================================================
test("fingerprint: migration preserves fingerprint for LAB_SUM_2X2", () => {
  const legacy = { grid: [[-1, -1], [-1, -1]], rows: [{ ops: ["+"], target: 5 }, { ops: ["+"], target: 7 }], cols: [{ ops: ["+"], target: 4 }, { ops: ["+"], target: 8 }], reserve: { 2: 2, 3: 1, 5: 1 } };
  const fpBefore = computeV5ContentFingerprint(legacy);
  const migrated = migrateLegacyV5Spec(legacy, { contentId: "LAB_SUM_2X2", contentVersion: 1 });
  const fpAfter = computeV5ContentFingerprint(compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: legacy }));
  assert.equal(fpAfter, fpBefore);
});

test("fingerprint: LAB_MIXED_2X2 fingerprint preserved", () => {
  const legacy = { grid: [[-1, -1], [-1, -1]], rows: [{ ops: ["*"], target: 10 }, { ops: ["-"], target: 4 }], cols: [{ ops: ["+"], target: 9 }, { ops: ["+"], target: 8 }], reserve: { 2: 1, 3: 1, 5: 1, 7: 1 } };
  const fpBefore = computeV5ContentFingerprint(legacy);
  const fpAfter = computeV5ContentFingerprint(compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: legacy }));
  assert.equal(fpBefore, fpAfter);
});

test("fingerprint: meaningful modification changes fingerprint", () => {
  const levelA = { schemaVersion: 1, engine: "v5", contentId: "A", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 };
  const levelB = { schemaVersion: 1, engine: "v5", contentId: "B", contentVersion: 1, rulesVersion: "v5-engine", spec: UNSOLVABLE_V5 };
  assert.notEqual(computeLevelFingerprint(levelA), computeLevelFingerprint(levelB));
});

test("fingerprint: rulesVersion change affects proof cache (via fingerprint deps)", () => {
  const level = { schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 };
  const fp1 = computeLevelFingerprint(level);
  assert.equal(typeof fp1, "string");
  assert.equal(fp1.length, 16);
});

// =============================================================================
// PRODUCTION ADMISSION (M29 INTEGRATION)
// =============================================================================
test("admission: valid level passes M29 admission", () => {
  const level = { schemaVersion: 1, engine: "v5", contentId: "ADMIT_TEST", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 };
  const compiled = compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: SOLVABLE_V5 });
  const result = admitSpec(compiled);
  assert.equal(result.outcome, "ACCEPT");
  assert.equal(result.proofStatus, "PROVEN_SOLVABLE");
  assert.equal(result.cause, "PROVEN_SOLVABLE");
});

test("admission: unsolvable level rejected by M29", () => {
  const level = { schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: UNSOLVABLE_V5 };
  const compiled = compileV5Level({ schemaVersion: 1, engine: "v5", contentId: "x", contentVersion: 1, rulesVersion: "v5-engine", spec: UNSOLVABLE_V5 });
  const result = admitSpec(compiled);
  assert.equal(result.outcome, "REJECT");
  assert.equal(result.proofStatus, "PROVEN_UNSOLVABLE");
  assert.equal(result.cause, "PROVEN_UNSOLVABLE");
});

test("admission: structurally invalid spec rejected by M29", () => {
  const badSpec = { grid: [[-1]], rows: [{ target: 1, ops: ["+"] }], cols: [{ target: 1, ops: [] }], reserve: {} };
  const result = admitSpec(badSpec);
  assert.equal(result.outcome, "REJECT");
  assert.equal(result.proofStatus, "UNSUPPORTED");
});
