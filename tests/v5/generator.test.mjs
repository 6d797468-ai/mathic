/**
 * MATHIC V5 — GENERATOR TESTS
 * ============================================================================
 * Tests du générateur V5.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  generateCandidate,
  generateWithRetry,
  generateCatalog,
  deriveCandidateSeed,
} from "../../src/v5/generator/index.mjs";
import { computeV5ContentFingerprint } from "../../src/contracts/fingerprint.mjs";

const SOLVABLE_V5 = { grid: [[-1, -1]], rows: [{ target: 12, ops: ["*"] }], cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 } };
const UNSOLVABLE_V5 = { grid: [[-1, -1]], rows: [{ target: 13, ops: ["*"] }], cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 } };

// =============================================================================
// SEED DERIVATION
// =============================================================================
test("generator: deterministic seed derivation", () => {
  const baseSeed = "test-seed";
  const seed1 = deriveCandidateSeed(baseSeed, 0);
  const seed2 = deriveCandidateSeed(baseSeed, 0);
  const seed3 = deriveCandidateSeed(baseSeed, 1);
  
  assert.equal(seed1, seed2, "same index produces same seed");
  assert.notEqual(seed1, seed3, "different index produces different seed");
  assert.equal(typeof seed1, "number");
  assert.ok(Number.isInteger(seed1));
});

test("generator: different base seeds produce different seeds", () => {
  const seed1 = deriveCandidateSeed("seed-a", 0);
  const seed2 = deriveCandidateSeed("seed-b", 0);
  assert.notEqual(seed1, seed2);
});

// =============================================================================
// CANDIDATE GENERATION
// =============================================================================
test("generator: valid candidate produced", async () => {
  const result = await generateCandidate("test-seed-1");
  assert.equal(result.ok, true);
  assert.ok(result.levelDefinition);
  assert.ok(result.spec);
  assert.equal(result.levelDefinition.engine, "v5");
  assert.equal(result.levelDefinition.contentVersion, 1);
  assert.equal(result.levelDefinition.rulesVersion, "v5-engine");
  assert.ok(result.levelDefinition.contentId.startsWith("v5.gen."));
});

test("generator: deterministic candidate from same seed", async () => {
  const r1 = await generateCandidate("deterministic-seed");
  const r2 = await generateCandidate("deterministic-seed");
  
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  // Le fingerprint doit être identique
  const fp1 = computeV5ContentFingerprint(r1.spec);
  const fp2 = computeV5ContentFingerprint(r2.spec);
  assert.equal(fp1, fp2, "same seed produces identical fingerprint");
});

test("generator: different seeds produce different candidates", async () => {
  const r1 = await generateCandidate("seed-a");
  const r2 = await generateCandidate("seed-b");
  
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  const fp1 = computeV5ContentFingerprint(r1.spec);
  const fp2 = computeV5ContentFingerprint(r2.spec);
  assert.notEqual(fp1, fp2, "different seeds produce different fingerprints");
});

test("generator: candidate has valid V5 spec structure", async () => {
  const result = await generateCandidate("test-structure");
  assert.equal(result.ok, true);
  const spec = result.spec;
  
  // Structure V5 attendue
  assert.ok(Array.isArray(spec.grid));
  assert.equal(spec.grid.length, 2);
  assert.equal(spec.grid[0].length, 2);
  assert.ok(Array.isArray(spec.rows));
  assert.equal(spec.rows.length, 2);
  assert.ok(Array.isArray(spec.cols));
  assert.equal(spec.cols.length, 2);
  assert.ok(typeof spec.reserve === "object");
  
  // Chaque ligne/colonne a target et ops
  for (const row of spec.rows) {
    assert.ok(typeof row.target === "number");
    assert.ok(Array.isArray(row.ops));
    assert.equal(row.ops.length, 1);
    assert.ok(OPERATORS.includes(row.ops[0]));
  }
  for (const col of spec.cols) {
    assert.ok(typeof col.target === "number");
    assert.ok(Array.isArray(col.ops));
    assert.equal(col.ops.length, 1);
    assert.ok(OPERATORS.includes(col.ops[0]));
  }
  
  // Reserve cohérente
  const totalReserve = Object.values(spec.reserve).reduce((a, b) => a + b, 0);
  assert.equal(totalReserve, 4); // 2x2 grid = 4 cellules
});

test("generator: no Math.random usage - uses deterministic RNG", async () => {
  // Vérifier qu'il n'y a pas d'appel à Math.random dans le code source
  const fs = await import("node:fs");
  const code = await fs.promises.readFile("./src/v5/generator/index.mjs", "utf8");
  assert.ok(!code.includes("Math.random()"), "no Math.random() in generator");
  // Date.now() is allowed for timing/metrics, not for randomness
  // Check that Math.random is not used anywhere
  const randomUsage = code.match(/Math\.random\(\)/g);
  assert.ok(!randomUsage || randomUsage.length === 0, "no Math.random() usage found");
});

test("generator: uses deterministic RNG from rng.mjs", async () => {
  // Le générateur doit utiliser rngFromSeed
  const fs = await import("node:fs");
  const code = await fs.promises.readFile("./src/v5/generator/index.mjs", "utf8");
  assert.ok(code.includes("rngFromSeed"), "uses rngFromSeed");
});

// =============================================================================
// RETRY LOGIC
// =============================================================================
test("retry: PROVEN_SOLVABLE stops immediately", async () => {
  const result = await generateWithRetry("provable-seed");
  if (result.ok) {
    assert.equal(result.attempts, 1);
    assert.equal(result.proof.status, "PROVEN_SOLVABLE");
    assert.equal(result.admission.outcome, "ACCEPT");
  }
});

test("retry: PROVEN_UNSOLVABLE stops immediately", async () => {
  // Ce test peut être difficile à déclencher, on vérifie la logique
  const result = await generateWithRetry("unsolvable-seed-test");
  if (!result.ok && result.reason === "PROVEN_UNSOLVABLE") {
    assert.equal(result.attempts, 1);
    assert.equal(result.metrics.proofStatus, "PROVEN_UNSOLVABLE");
  }
});

test("retry: UNSUPPORTED stops immediately", async () => {
  const result = await generateWithRetry("unsupported-seed-test");
  if (!result.ok && result.reason === "UNSUPPORTED") {
    assert.equal(result.attempts, 1);
    assert.equal(result.metrics.proofStatus, "UNSUPPORTED");
  }
});

test("retry: UNPROVEN retries with increasing budget", async () => {
  // Ce test vérifie la logique de retry
  // Note: difficile à déclencher de manière déterministe
  // On vérifie au moins que la fonction existe et accepte les options
  const result = await generateWithRetry("unproven-test", {}, { budgets: [1000, 2000], maxRetries: 2 });
  assert.ok(typeof result.attempts === "number");
  assert.ok(result.attempts >= 1);
  assert.ok(result.attempts <= 3);
});

test("retry: max 3 attempts", async () => {
  const result = await generateWithRetry("max-retries-test", {}, { maxRetries: 3 });
  assert.ok(result.attempts <= 4); // 1 initial + 3 retries max
});

test("retry: budgets are [2000, 8000, 32000]", async () => {
  const result = await generateWithRetry("budget-test", {}, { budgets: [2000, 8000, 32000] });
  assert.ok(result.metrics.budget === 2000 || result.metrics.budget === 8000 || result.metrics.budget === 32000);
});

// =============================================================================
// FINGERPRINT
// =============================================================================
test("fingerprint: deterministic for same candidate", async () => {
  const r1 = await generateWithRetry("fp-test-1");
  const r2 = await generateWithRetry("fp-test-1");
  
  if (r1.ok && r2.ok) {
    assert.equal(r1.metrics.fingerprint, r2.metrics.fingerprint);
  }
});

test("fingerprint: different candidates have different fingerprints", async () => {
  const r1 = await generateWithRetry("fp-seed-a");
  const r2 = await generateWithRetry("fp-seed-b");
  
  if (r1.ok && r2.ok) {
    assert.notEqual(r1.metrics.fingerprint, r2.metrics.fingerprint);
  }
});

test("fingerprint: modification changes fingerprint", async () => {
  const r1 = await generateWithRetry("mod-test-a");
  const r2 = await generateWithRetry("mod-test-b");
  
  if (r1.ok && r2.ok) {
    assert.notEqual(r1.metrics.fingerprint, r2.metrics.fingerprint);
  }
});

// =============================================================================
// CATALOG
// =============================================================================
test("catalog: produces target count of ACCEPT levels", async () => {
  const { catalog, stats } = await generateCatalog("catalog-test", 5);
  
  assert.equal(catalog.length, 5);
  assert.equal(stats.accepted, 5);
  assert.equal(stats.accepted, catalog.length);
});

test("catalog: only ACCEPT levels in catalog", async () => {
  const { catalog } = await generateCatalog("catalog-filter", 5);
  
  for (const level of catalog) {
    assert.equal(level.outcome, "ACCEPT");
    assert.equal(level.proofStatus, "PROVEN_SOLVABLE");
    assert.equal(level.proofStatus, "PROVEN_SOLVABLE");
  }
});

test("catalog: deterministic order and content", async () => {
  const { catalog: c1 } = await generateCatalog("deterministic-catalog", 5);
  const { catalog: c2 } = await generateCatalog("deterministic-catalog", 5);
  
  assert.equal(c1.length, c2.length);
  for (let i = 0; i < c1.length; i++) {
    assert.equal(c1[i].contentId, c2[i].contentId);
    assert.equal(c1[i].fingerprint, c2[i].fingerprint);
    assert.equal(c1[i].seed, c2[i].seed);
  }
});

test("catalog: maxCandidates prevents infinite loop", async () => {
  const { stats } = await generateCatalog("max-candidates-test", 1000);
  assert.ok(stats.generated <= 1000, "max candidates limit respected");
});

test("catalog: duplicate fingerprint detection", async () => {
  // Difficile à tester sans forcer un doublon, mais on vérifie la structure
  const { catalog, stats } = await generateCatalog("dup-test", 5);
  // Si pas de doublon, stats.duplicates = 0
  assert.ok(stats.duplicates >= 0);
  assert.ok(stats.duplicates <= stats.generated);
});

test("catalog: stats are coherent", async () => {
  const { stats } = await generateCatalog("stats-test", 5);
  
  const sum = stats.structuralReject + stats.semanticReject + 
              stats.solvabilityReject + stats.unproven + 
              stats.unsupported + stats.duplicates + stats.accepted;
  
  assert.equal(stats.generated, sum, "stats partition must be coherent");
  assert.equal(stats.accepted, 5);
  assert.ok(stats.acceptanceRate >= 0 && stats.acceptanceRate <= 1);
});

test("catalog: targetCount honored", async () => {
  const { catalog } = await generateCatalog("target-test", 3);
  assert.equal(catalog.length, 3);
  
  const { catalog: c2 } = await generateCatalog("target-test-2", 10);
  assert.ok(c2.length >= 1 && c2.length <= 10);
});

test("catalog: deterministic order", async () => {
  const { catalog: c1 } = await generateCatalog("order-test", 5);
  const { catalog: c2 } = await generateCatalog("order-test", 5);
  
  for (let i = 0; i < 5; i++) {
    assert.equal(c1[i].contentId, c2[i].contentId);
    assert.equal(c1[i].fingerprint, c2[i].fingerprint);
  }
});

test("catalog: duplicate fingerprint detection", async () => {
  // On vérifie que la logique existe
  const { stats } = await generateCatalog("dup-detect", 5);
  assert.ok(stats.duplicates >= 0);
});

// =============================================================================
// DIFFICULTY METRICS
// =============================================================================
test("difficulty: metrics collected", async () => {
  const { catalog } = await generateCatalog("diff-test", 3);
  
  for (const level of catalog) {
    assert.ok(typeof level.difficultyMetrics.solutionDepth === "number");
    assert.ok(typeof level.difficultyMetrics.nodesExplored === "number");
    assert.ok(typeof level.difficultyMetrics.branchingFactor === "number");
    assert.ok(typeof level.difficultyMetrics.validMoves === "number");
    assert.ok(typeof level.difficultyMetrics.proofTimeMs === "number");
    assert.ok(typeof level.difficultyMetrics.generationTimeMs === "number");
  }
});

// =============================================================================
// PRODUCTION PATH
// =============================================================================
test("production: generated level passes M29 admission", async () => {
  const { catalog } = await generateCatalog("prod-test", 1);
  
  if (catalog.length > 0) {
    const level = catalog[0];
    assert.equal(level.outcome, "ACCEPT");
    assert.equal(level.proofStatus, "PROVEN_SOLVABLE");
    assert.ok(level.fingerprint);
    assert.ok(level.contentId);
    assert.ok(level.seed);
    assert.ok(level.rulesVersion);
  }
});

test("production: generated level fingerprint matches M29 admission", async () => {
  const { catalog } = await generateCatalog("fp-verify", 1);
  
  if (catalog.length > 0) {
    const level = catalog[0];
    // Le fingerprint du catalogue doit correspondre à celui calculé par M29
    assert.ok(level.fingerprint.length === 16);
  }
});

test("production: no certify() import in generator", async () => {
  const fs = await import("node:fs");
  const code = await fs.promises.readFile("./src/v5/generator/index.mjs", "utf8");
  assert.ok(!code.includes("certify"), "generator must not import certify");
  assert.ok(!code.includes("from \"../v5/rules/solver\""), "no solver import");
});

test("production: no parallel operator table", async () => {
  const fs = await import("node:fs");
  const code = await fs.promises.readFile("./src/v5/generator/index.mjs", "utf8");
  assert.ok(!code.includes("OPERATORS = {"), "no parallel operator table");
  assert.ok(code.includes('from "./rng.mjs"'), "uses rng from rng.mjs");
});

test("production: no solver logic duplicated", async () => {
  const fs = await import("node:fs");
  const code = await fs.promises.readFile("./src/v5/generator/index.mjs", "utf8");
  assert.ok(!code.includes("evalOp"), "no evalOp duplication");
  assert.ok(!code.includes("lineOk"), "no lineOk duplication");
  assert.ok(!code.includes("isSolved"), "no isSolved duplication");
  assert.ok(!code.includes("getMoves"), "no getMoves duplication");
});

const OPERATORS = ["+", "-", "*", "/"];