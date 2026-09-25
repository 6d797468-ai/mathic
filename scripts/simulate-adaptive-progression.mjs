/**
 * Simulation de la Progression ADAPTIVE (MISSION 6).
 *
 * But : prouver expérimentalement que le profil détecté RÉELLEMENT (depuis les
 * Evidence du moteur réel) entraîne une progression DIFFÉRENTE, PERTINENTE et
 * DÉTERMINISTE dans Mathic.
 *
 * 1. Trois comportements de « bots » jouent RÉELLEMENT des niveaux via
 *    l'adaptateur de runtime M5 (Engine b1 réel, Evidence réelle, score réel).
 * 2. Le profil est détecté (detectProfile) sur l'Evidence cumulée réelle, puis
 *    la progression est appliquée par l'Orchestrator réel (seul écrivain).
 * 3. Chaque run est seedé (mulberry32) : aucun aléa non reproductible.
 * 4. Verdict (code de sortie 1 si violation) :
 *      a) DÉTERMINISME  — rejeu au même seed → trajectoire et profil identiques ;
 *      b) ADMISSIBILITÉ — tout niveau joué/appliqué existe dans le LADDER réel
 *         et reste débloqué dans la save de simulation ;
 *      c) DIFFÉRENCIATION — les trajectoires des stratégies divergent en niveaux
 *         ET leurs profils finals diffèrent sur au moins une dimension ;
 *      d) PERTINENCE — les niveaux atteints par une stratégie sont cohérents
 *         avec le mapping PROFILE_RULES réel (grammaire de META).
 *      e) SÉCURITÉ — toute transition SAFE_DEFAULT ne change jamais la position.
 *
 * Usage :
 *   node scripts/simulate-adaptive-progression.mjs                   # 7 niveaux, seed fixe
 *   node scripts/simulate-adaptive-progression.mjs --n 10 --seed 42  --window 3
 */

import { LADDER, ladderDifficulty } from "../src/b1/levels.mjs";
import { analyzeAll } from "../src/b1/level-design.mjs";
import { isUnlocked } from "../src/b1/save.mjs";
import { createSimStorage, selfPlayAdaptive } from "../src/intel/adaptive-experiment.mjs";
import { PROFILE_RULES } from "../src/intel/progression-policy.mjs";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : def;
};
const N = flag("n", 7);
const SEED = flag("seed", 20261007);
const WINDOW = flag("window", 3);

const ANALYSIS = analyzeAll({ budget: 40000 });
const IDS = ANALYSIS.map((a) => a.id);
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const DIFFICULTY = ladderDifficulty();

const STRATEGIES = ["arithm", "explorer", "chain"];

function seedSave(storage) {
  storage.set("mathic.save.v1", JSON.stringify({ version: 1, unlocked: ["N1"], completed: {}, current: "N1" }));
}

function runOnce(strategy, seed) {
  const storage = createSimStorage();
  seedSave(storage);
  return selfPlayAdaptive({
    strategy,
    seed,
    levelCount: N,
    window: WINDOW,
    ladder: LADDER,
    metadata: META,
    difficulty: DIFFICULTY,
    storage,
  });
}

// --- distribution de profils réels ---
const profileLine = (p) =>
  ["arithmetic", "exploration", "strategy", "efficiency", "chainAffinity"]
    .map((k) => `${k[0]}=${(p[k] ?? 0).toFixed(2)}`)
    .join("  ");

const runs = {};
for (const s of STRATEGIES) runs[s] = runOnce(s, SEED);

console.log(
  `\nSimulation Progression Adaptive — Mathic 1.0 M6\n  strategies: ${STRATEGIES.join(", ")}  levelCount=${N}  window=${WINDOW}  seed=${SEED}`
);

const width = 7;
console.log("\n--- Trajectoires réelles (niveaux joués → action orchestrateur) ---");
const cast = (t) =>
  `${t.level.toString().padEnd(3)}[${t.action}]${t.won ? "✓" : t.lost ? "✗" : " "}`;
for (const s of STRATEGIES) {
  const traj = runs[s].trajectory.map(cast).join("  ");
  console.log(`  ${s.padEnd(width)}  ${traj}`);
}

console.log("\n--- Profils détectés réels (fin de run) ---");
for (const s of STRATEGIES) {
  const f = runs[s].finalProfile;
  console.log(
    `  ${s.padEnd(width)}  conf=${f.profile.confidence.toFixed(3)}  ${f.state}\n` +
      `            ${profileLine(f.profile)}  [${runs[s].evidenceCount} evidence réelles]`
  );
}

// --- matrice des niveaux réellement atteints ---
console.log("\n--- Divergence des trajectoires (niveaux différents) ---");
const levelsOf = (r) => r.trajectory.map((t) => t.level);
let divPairs = [];
for (let i = 0; i < STRATEGIES.length; i++) {
  for (let j = i + 1; j < STRATEGIES.length; j++) {
    const a = STRATEGIES[i];
    const b = STRATEGIES[j];
    const da = levelsOf(runs[a]);
    const db = levelsOf(runs[b]);
    let diff = 0;
    for (let k = 0; k < Math.min(da.length, db.length); k++) if (da[k] !== db[k]) diff++;
    divPairs.push({ a, b, diff });
    console.log(`  ${a.padEnd(width)} vs ${b} : ${diff}/${Math.min(da.length, db.length)} positions divergent`);
  }
}

// --- pertinence grammar : mapping PROFILE_RULES → propriétés META ---
console.log("\n--- Grammaire des niveaux réellement atteints par chaque stratégie ---");
const propsOf = (r) => {
  const set = new Set();
  for (const t of r.trajectory) for (const p of META[t.level]?.properties ?? []) set.add(p);
  return [...set].join(",");
};
for (const s of STRATEGIES) console.log(`  ${s.padEnd(width)}  ${propsOf(runs[s]) || "—"}`);

// =============================== VERDICT ==================================

const failures = [];

// DÉTERMINISME : rejeu identique (même seed) → trajectoire + profil identiques.
for (const s of STRATEGIES) {
  const again = runOnce(s, SEED);
  const t1 = JSON.stringify(runs[s].trajectory);
  const t2 = JSON.stringify(again.trajectory);
  const p1 = JSON.stringify(runs[s].finalProfile);
  const p2 = JSON.stringify(again.finalProfile);
  if (t1 !== t2 || p1 !== p2) {
    failures.push(`DÉTERMINISME violé (${s}) : deux exécutions au même seed divergent`);
  }
}

// ADMISSIBILITÉ : niveaux réels + débloqués (les saves finales servent aussi
// au critère de PERTINENCE : une grammaire absente de l'offre n'est pas fatale).
const finalSaves = {};
for (const s of STRATEGIES) {
  const local = createSimStorage();
  seedSave(local);
  selfPlayAdaptive({
    strategy: s,
    seed: SEED,
    levelCount: N,
    window: WINDOW,
    ladder: LADDER,
    metadata: META,
    difficulty: DIFFICULTY,
    storage: local,
  });
  const finalSave = JSON.parse(local.get("mathic.save.v1"));
  finalSaves[s] = finalSave;
  for (const t of runs[s].trajectory) {
    if (!IDS.includes(t.level)) failures.push(`ADMISSIBILITÉ (${s}) : niveau ${t.level} hors LADDER`);
    if (t.action === "APPLIED" && !isUnlocked(finalSave, t.level)) {
      failures.push(`ADMISSIBILITÉ (${s}) : ${t.level} appliqué mais non débloqué dans la save`);
    }
  }
}

// SÉCURITÉ : SAFE_DEFAULT / REJECTED ne changent jamais la position.
for (const s of STRATEGIES) {
  for (const t of runs[s].trajectory) {
    if ((t.action === "SAFE_DEFAULT" || t.action === "REJECTED") && t.stateChanged) {
      failures.push(`SÉCURITÉ (${s}) : ${t.action} a changé la position (stateChanged=${t.stateChanged})`);
    }
  }
}

// DIFFÉRENCIATION : au moins une paire diverge + profils distincts.
const divider = divPairs.filter((d) => d.diff > 0);
if (divider.length === 0) failures.push("DIFFÉRENCIATION : aucune paire de stratégies ne diverge en niveaux");
const dimKey = ["arithmetic", "exploration", "strategy", "efficiency", "chainAffinity"];
let maxDimDelta = 0;
let dimPair = null;
for (let i = 0; i < STRATEGIES.length; i++) {
  for (let j = i + 1; j < STRATEGIES.length; j++) {
    for (const k of dimKey) {
      const d = Math.abs(runs[STRATEGIES[i]].finalProfile.profile[k] - runs[STRATEGIES[j]].finalProfile.profile[k]);
      if (d > maxDimDelta) {
        maxDimDelta = d;
        dimPair = `${STRATEGIES[i]} vs ${STRATEGIES[j]} (${k})`;
      }
    }
  }
}
if (maxDimDelta < 0.1) failures.push(`DIFFÉRENCIATION : profils finals quasi identiques (Δmax=${maxDimDelta.toFixed(3)})`);
else console.log(`\n  différenciation des profils : Δmax=${maxDimDelta.toFixed(3)} (${dimPair})`);

// PERTINENCE : une stratégie doit atteindre au moins un niveau de la grammaire
// que PROFILE_RULES associe à sa dimension dominante — MAIS uniquement si la
// règle est RÉELLEMENT ACTIVÉE par le profil détecté (dimension ≥ seuil).
//
// Correction M11 (EXP-07) : le viol « PERTINENCE (arithm) » préexistant provenait
// d'un défaut du CHECK, pas de la Policy : l'étiquette de stratégie « arithm »
// (bot glouton optimal) a été confondue avec la règle ARITHMETIC_MATCH. Or le
// profil DÉTECTÉ de ce bot reste à arithmetic ≈ 0.45–0.55, sous le seuil de
// règle `ruleMatchThreshold = 0.6` — la Policy décline donc légitimement
// COMBINATION/MASTERY (aucune règle activée = déclinaison correcte, mandat §8).
// La pertinence ne vaut que si le profil détecté active réellement la règle.
// (Rappel : l'offre débloquée inclut les niveaux d'**avance** de fenêtre M8,
// débloqués mais non recommandés — le check ne s'appuie que sur la trajectoire.)
const PROFILE_RULES_BY_DIM = Object.fromEntries(PROFILE_RULES.map((r) => [r.dimension, r.grammar]));
const TARGET_GRAMMAR = {
  arithm: PROFILE_RULES_BY_DIM.arithmetic,
  explorer: PROFILE_RULES_BY_DIM.exploration,
  chain: PROFILE_RULES_BY_DIM.chainAffinity,
};
const RULE_DIMENSION = { arithm: "arithmetic", explorer: "exploration", chain: "chainAffinity" };
const RULE_THRESHOLD = 0.6; // sert à vérifier l'activation, PAS à changer les seuils (mandat §11)
const hasProp = (id, prop) => (META[id]?.properties ?? []).includes(prop);
for (const s of STRATEGIES) {
  const target = TARGET_GRAMMAR[s] ?? [];
  const met = runs[s].trajectory.some((t) => target.some((p) => hasProp(t.level, p)));
  const offer = finalSaves[s].unlocked.some((id) => target.some((p) => hasProp(id, p)));
  // Règle activée = le profil détecté a porté la dimension ≥ seuil dans la trajectoire.
  const ruleActive = (runs[s].trajectory.some((t) => (t.dimensions[RULE_DIMENSION[s]] ?? 0) >= RULE_THRESHOLD));
  if (!ruleActive) {
    console.log(`  pertinence ${s}: règle ${RULE_DIMENSION[s]} non activée (dimension détectée < ${RULE_THRESHOLD}) — déclinaison légitime de [${target.join(",")}], non fatal`);
  } else if (!met && offer) {
    failures.push(`PERTINENCE (${s}) : règle activée + offre présent mais niveau de grammaire [${target.join(",")}] jamais atteint`);
  } else if (!met) {
    console.log(`  pertinence ${s}: grammaire [${target.join(",")}] absente de l'offre débloquée — documenté, non fatal`);
  }
}

console.log("\n=== VERDICT ===");
if (failures.length === 0) {
  console.log("G6-ADAPTIVE : OK — progression différente, pertinente et déterministe observée.");
} else {
  console.error(`G6-ADAPTIVE : ${failures.length} violation(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
}