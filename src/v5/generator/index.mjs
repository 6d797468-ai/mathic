/**
 * MATHIC V5 — GENERATOR
 * ============================================================================
 * Générateur de niveaux V5 déterministe.
 * Produit des LevelDefinition candidates, les valide, compile, prouve, admet.
 */

import { rngFromSeed } from "./rng.mjs";
import { validateConstraints } from "./constraints.mjs";
import { createLevelDefinition, validateLevelDefinition, compileV5Level, computeLevelFingerprint } from "../level.mjs";
import { validateSpec } from "../../v5/rules/engine.mjs";
import { proveSolvability, SOLVABLE, UNSOLVABLE, UNPROVEN, UNSUPPORTED } from "../../v5/rules/solvability-witness.mjs";
import { admitSpec } from "../../v5/rules/admission.mjs";
import { computeV5ContentFingerprint } from "../../contracts/fingerprint.mjs";

const DEFAULT_CONSTRAINTS = Object.freeze({
  minRows: 2, maxRows: 2,
  minCols: 2, maxCols: 2,
  minValue: 1, maxValue: 9,
  allowedOps: ["+", "-", "*", "/"],
  minEmptyCells: 4, maxEmptyCells: 4,
  minTarget: 1, maxTarget: 100,
  reservePolicy: "balanced",
  maxAttemptsPerSeed: 100,
});

const MAX_RETRY_ATTEMPTS = 3;

const OPERATORS = ["+", "-", "*", "/"];

function applyOp(a, op, b) {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b !== 0 && a % b === 0 ? a / b : NaN;
    default: return NaN;
  }
}

function computeReserve(solution) {
  const counts = {};
  for (const row of solution) {
    for (const v of row) {
      counts[v] = (counts[v] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Choisit un opérateur qui garantit un résultat valide (entier positif) pour a et b.
 * @param {number} a
 * @param {number} b
 * @param {import("./rng.mjs").RNG} rng
 * @returns {string} opérateur valide
 */
function pickValidOp(a, b, rng) {
  // Essayer les opérateurs dans un ordre préférentiel
  const preferred = ["+", "*", "-", "/"];
  for (const op of preferred) {
    const result = applyOp(a, op, b);
    if (!isNaN(result) && Number.isInteger(result) && result >= 1 && result <= 100) {
      return op;
    }
  }
  // Fallback : addition (toujours valide pour a,b >= 1)
  return "+";
}

export function deriveCandidateSeed(baseSeed, index) {
  const seedStr = String(baseSeed) + "|" + index;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) >>> 0;
}

/**
 * Génère un candidat LevelDefinition à partir d'une seed.
 * Pure function : même seed = même candidat.
 *
 * @param {string|number} seed
 * @param {object} [constraints]
 * @returns {Promise<object>} { ok, levelDefinition, spec }
 */
export async function generateCandidate(seed, constraints = {}) {
  const rng = rngFromSeed(seed);

  // 1. Générer une solution 2x2 valide
  const solution = [
    [rng.nextInt(9) + 1, rng.nextInt(9) + 1],
    [rng.nextInt(9) + 1, rng.nextInt(9) + 1]
  ];

  // 2. Choisir des opérateurs pour les 4 lignes/colonnes
  const op0 = pickValidOp(solution[0][0], solution[0][1], rng);
  const op1 = pickValidOp(solution[1][0], solution[1][1], rng);
  const op2 = pickValidOp(solution[0][0], solution[1][0], rng);
  const op3 = pickValidOp(solution[0][1], solution[1][1], rng);

  // Calculer les cibles
  const row0Target = applyOp(solution[0][0], op0, solution[0][1]);
  const row1Target = applyOp(solution[1][0], op1, solution[1][1]);
  const col0Target = applyOp(solution[0][0], op2, solution[1][0]);
  const col1Target = applyOp(solution[0][1], op3, solution[1][1]);

  // Vérifier validité
  if (isNaN(row0Target) || isNaN(row1Target) || isNaN(col0Target) || isNaN(col1Target)) {
    return { ok: false, reason: "invalid operation result" };
  }
  if ([row0Target, row1Target, col0Target, col1Target].some(t => t < 1 || t > 100)) {
    return { ok: false, reason: "target out of bounds" };
  }

  // Réserve
  const reserve = computeReserve(solution);

  // Construire la spec V5
  const spec = {
    grid: [[-1, -1], [-1, -1]],
    rows: [
      { ops: [op0], target: row0Target },
      { ops: [op1], target: row1Target }
    ],
    cols: [
      { ops: [op2], target: col0Target },
      { ops: [op3], target: col1Target }
    ],
    reserve: computeReserve(solution)
  };

  // Valider la spec
  try {
    validateSpec(spec);
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  const levelDefinition = createLevelDefinition({
    contentId: `v5.gen.${rng.nextInt(0x1000000).toString(36)}-${rng.nextInt(0x1000000).toString(36)}`,
    contentVersion: 1,
    rulesVersion: "v5-engine",
    spec,
    metadata: { generated: true }
  });

  return { ok: true, levelDefinition, spec };
}

/**
 * Génère un candidat avec retry sur UNPROVEN.
 * Pipeline complet : validate → compile → M27 → M28 → M29
 *
 * @param {string|number} baseSeed
 * @param {object} [constraints]
 * @param {object} [options] { budgets: number[], maxRetries: number }
 * @returns {Promise<object>} { ok, candidate, proof, admission, metrics, attempts }
 */
export async function generateWithRetry(baseSeed, constraints = {}, options = {}) {
  const budgets = [2000, 8000, 32000];

  for (let attempt = 0; attempt <= 3; attempt++) {
    const candidateSeed = deriveCandidateSeed(baseSeed, attempt);
    const candidateResult = await generateCandidate(candidateSeed);

    if (!candidateResult.ok) {
      return { ok: false, reason: candidateResult.reason, attempts: attempt + 1 };
    }

    const { levelDefinition, spec } = candidateResult;

    // Compile
    const compiledSpec = compileV5Level(levelDefinition);

    // Budget pour cette tentative
    const budget = attempt === 0 ? 2000 : [2000, 8000, 32000][attempt - 1];

    // M28 Solvability Witness
    const proof = proveSolvability(compiledSpec, { maxDepth: 8, budget });

    // M29 Admission
    const admission = admitSpec(compiledSpec, { maxDepth: 8, budget });

    const fingerprint = computeV5ContentFingerprint(compiledSpec);

    const metrics = {
      attempt: attempt + 1,
      budget,
      proofStatus: proof.status,
      proofMinMoves: proof.minMoves,
      nodesExpanded: proof.nodesExpanded,
      nodesSeen: proof.nodesSeen,
      searchComplete: proof.searchComplete,
      admissionOutcome: admission.outcome,
      admissionCause: admission.cause,
      fingerprint: computeV5ContentFingerprint(compiledSpec),
    };

    // Routage selon proofStatus
    if (proof.status === "PROVEN_SOLVABLE" && admission.outcome === "ACCEPT") {
      return {
        ok: true,
        candidate: { levelDefinition, spec: compiledSpec },
        proof,
        admission,
        metrics,
        attempts: attempt + 1
      };
    }

    if (proof.status === "PROVEN_UNSOLVABLE") {
      return { ok: false, reason: "PROVEN_UNSOLVABLE", metrics, attempts: attempt + 1 };
    }

    if (proof.status === "UNSUPPORTED") {
      return { ok: false, reason: "UNSUPPORTED", metrics, attempts: attempt + 1 };
    }

    // UNPROVEN → retry si budget restant
    if (attempt < 3) {
      continue;
    }
    return { ok: false, reason: "UNPROVEN", metrics, attempts: attempt + 1 };
  }

  return { ok: false, reason: "max retries exceeded", attempts: 4 };
}

/**
 * Génère un catalogue de niveaux ACCEPT.
 *
 * @param {string|number} baseSeed
 * @param {number} targetCount - nombre de niveaux ACCEPT souhaités
 * @param {object} [constraints]
 * @returns {Promise<object>} { catalog, stats }
 */
export async function generateCatalog(baseSeed, targetCount, constraints = {}) {
  const catalog = [];
  const stats = {
    generated: 0,
    structuralReject: 0,
    semanticReject: 0,
    solvabilityReject: 0,
    unproven: 0,
    unsupported: 0,
    duplicates: 0,
    accepted: 0,
    startTime: Date.now()
  };

  const maxCandidates = 1000;
  const seenFingerprints = new Set();
  let seedIndex = 0;

  while (catalog.length < targetCount && stats.generated < 1000) {
    const result = await generateWithRetry(`${baseSeed}-${seedIndex++}`, {});

    stats.generated++;

    if (!result.ok) {
      const reason = result.reason;
      if (reason === "UNSUPPORTED") stats.unsupported++;
      else if (reason === "PROVEN_UNSOLVABLE") stats.solvabilityReject++;
      else if (reason === "UNPROVEN") stats.unproven++;
      else stats.solvabilityReject++;
      continue;
    }

    const fp = result.metrics.fingerprint;

    // Détection doublon
    if (seenFingerprints.has(result.metrics.fingerprint)) {
      stats.duplicates++;
      continue;
    }

    catalog.push({
      contentId: `v5.gen.${catalog.length + 1}`,
      contentVersion: 1,
      engine: "v5",
      seed: `gen-${stats.generated}`,
      rulesVersion: "v5-engine",
      fingerprint: result.metrics.fingerprint,
      proofStatus: result.proof.status,
      outcome: "ACCEPT",
      levelDefinition: result.candidate.levelDefinition,
      proofStatus: result.proof.status,
      cause: "PROVEN_SOLVABLE",
      outcome: "ACCEPT",
      difficultyMetrics: {
        solutionDepth: result.proof.minMoves,
        nodesExplored: result.proof.nodesExpanded,
        branchingFactor: result.proof.nodesSeen > 0 ? result.proof.nodesSeen / Math.max(1, result.proof.nodesExpanded) : 0,
        validMoves: 0,
        proofTimeMs: 0,
        generationTimeMs: 0
      },
      generationMetadata: {
        attempts: result.attempts,
        budget: result.metrics.budget,
        proofTimeMs: 0,
        generationTimeMs: 0
      }
    });

    if (catalog.length >= 20) break;
  }

  return {
    catalog,
    stats: {
      generated: stats.generated,
      structuralReject: stats.structuralReject,
      semanticReject: stats.semanticReject,
      solvabilityReject: stats.solvabilityReject,
      unproven: stats.unproven,
      unsupported: stats.unsupported,
      duplicates: stats.duplicates,
      accepted: catalog.length,
      totalTime: Date.now() - Date.now(),
      accepted: catalog.length,
      acceptanceRate: catalog.length / Math.max(1, stats.generated)
    }
  };
}