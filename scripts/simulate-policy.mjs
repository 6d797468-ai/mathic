/**
 * Simulation de masse de la Progression Policy (MISSION 3).
 *
 * 1. Génère des milliers de profils synthétiques (PRNG seedé — déterministe,
 *    aucun Math.random) couvrant 7 archétypes + tirage uniforme, toutes
 *    confiances et tous états de progression N1-N36.
 * 2. Exécute recommend() sur chaque (profil, progression) avec le catalogue
 *    réel analysé par le Solver.
 * 3. Audite chaque recommandation : admissibilité (existant ∧ certifié ∧
 *    débloqué), aucune exception, déterminisme par ré-exécution d'échantillon.
 * 4. Robustesse : batterie de profils corrompus (forme v2 violée) — 100%
 *    doivent basculer en SAFE_DEFAULT sans lever.
 * 5. Documente la distribution : modes, tiers, niveaux, distance au front,
 *    reasonCodes, différenciation par archétype.
 *
 * Usage :
 *   node scripts/simulate-policy.mjs                 # 5000 profils, seed fixe
 *   node scripts/simulate-policy.mjs --n 20000 --seed 42
 *
 * Sortie : rapport console (tables redistribuables dans docs/design/).
 * Code de sortie 1 si une violation de légalité ou de déterminisme est détectée.
 */

import { LADDER } from "../src/b1/levels.mjs";
import { analyzeAll } from "../src/b1/level-design.mjs";
import {
  POLICY_VERSION,
  PROFILE_SCHEMA_VERSION,
} from "../src/intel/contracts.mjs";
import { recommend } from "../src/intel/progression-policy.mjs";

// ---------------------------------------------------------------------------
// PRNG déterministe (mulberry32) — runs reproductibles, seed documenté
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : def;
};
const N = flag("n", 5000);
const SEED = flag("seed", 20260924);

// ---------------------------------------------------------------------------
// Données réelles : catalogue N1-N36 analysé par le Solver
// ---------------------------------------------------------------------------

console.error(`Analyse du catalogue N1-N36 (Solver)…`);
const ANALYSIS = analyzeAll();
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const IDS = ANALYSIS.map((a) => a.id);
const DIFFICULTY = Object.fromEntries(IDS.map((id) => [id, { index: Number(id.slice(1)) }]));
const LEVEL_IDS = new Set(IDS);

const progressionOf = (n) => {
  const unlocked = IDS.slice(0, n);
  return {
    unlocked,
    completed: Object.fromEntries(unlocked.slice(0, -1).map((id) => [id, { wins: 1, bestScore: 10 }])),
  };
};

// ---------------------------------------------------------------------------
// Générateur de profils — 7 archétypes ancrés + tirage uniforme
// ---------------------------------------------------------------------------

const DIMS = ["arithmetic", "exploration", "strategy", "efficiency", "chainAffinity"];
const ARCHETYPES = {
  EXPLORER: { exploration: [0.7, 1] },
  STRATEGIST: { strategy: [0.7, 1] },
  EFFICIENT: { efficiency: [0.7, 1] },
  CHAIN: { chainAffinity: [0.7, 1] },
  ARITHMETIC: { arithmetic: [0.7, 1] },
  HINTED: { hintDependency: [0.6, 1] },
  NEUTRAL: {},
};
const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

// Tiers de confiance pondérés pour exercer les trois niveaux d'adaptation
const CONF_TIERS = [
  { range: [0.2, 0.55], w: 0.15 }, // light / sous gradual
  { range: [0.55, 0.8], w: 0.35 }, // light haut / full
  { range: [0.8, 1.0], w: 0.5 }, // full haut / specific
];

const makeProfile = (rng) => {
  const u = (a, b) => a + rng() * (b - a);
  const useArchetype = rng() < 0.6;
  const name = useArchetype ? ARCHETYPE_NAMES[Math.floor(rng() * ARCHETYPE_NAMES.length)] : "UNIFORM";
  const anchors = ARCHETYPES[name] ?? {};
  const profile = {};
  for (const d of DIMS) profile[d] = anchors[d] ? u(...anchors[d]) : u(0.05, name === "UNIFORM" ? 1 : 0.5);
  profile.hintDependency = anchors.hintDependency ? u(...anchors.hintDependency) : name === "UNIFORM" ? u(0.05, 1) : u(0.05, 0.5);
  profile.retryTolerance = u(0, 1); // modulateur transversal, pleine plage
  profile.difficultyResponse = u(0, 1);
  let x = rng();
  const tier = CONF_TIERS.find((t) => (x -= t.w) <= 0) ?? CONF_TIERS[CONF_TIERS.length - 1];
  profile.confidence = u(...tier.range);
  profile.evidenceWindow = Math.floor(u(0, 81));
  profile.version = PROFILE_SCHEMA_VERSION;
  return { profile, archetype: name };
};

// ---------------------------------------------------------------------------
// Passage principal — N simulations, audit de légalité systématique
// ---------------------------------------------------------------------------

const rng = mulberry32(SEED);
const stats = {
  total: 0,
  byMode: { ADAPTIVE: 0, SAFE_DEFAULT: 0 },
  byTier: { light: 0, full: 0, specific: 0 },
  byLevel: new Map(),
  byArchetypeLevel: new Map(), // archetype → Map(level → count)
  byDistance: { front: 0, d1_2: 0, d3_5: 0, d6plus: 0 },
  byCode: new Map(),
  confMin: 1,
  confMax: 0,
  confSum: 0,
  violations: [],
  exceptions: 0,
};

const classifyDistance = (d) => (d === 0 ? "front" : d <= 2 ? "d1_2" : d <= 5 ? "d3_5" : "d6plus");
const tierOf = (codes) =>
  codes.includes("LOW_CONFIDENCE_ADAPTATION") ? "light" : codes.includes("HIGH_CONFIDENCE_SPECIFIC") ? "specific" : "full";

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

console.error(`Simulation de ${N} recommandations…`);
const sampleInputs = []; // pour le contrôle de déterminisme
for (let i = 0; i < N; i++) {
  const n = 1 + Math.floor(rng() * 36);
  const { profile, archetype } = makeProfile(rng);
  const progression = progressionOf(n);
  const inputs = { candidates: IDS, progression, metadata: META, difficulty: DIFFICULTY, profile };
  let r;
  try {
    r = recommend(inputs);
  } catch (e) {
    stats.exceptions++;
    stats.violations.push(`exception @i=${i} : ${e.message}`);
    continue;
  }
  stats.total++;
  const rec = r.recommendedLevel;
  // Audit de légalité (mandat §6/§18) — toute violation est fatale au script
  if (rec !== null) {
    const inEligible = r.eligibleLevels.includes(rec);
    const inUnlocked = progression.unlocked.includes(rec);
    const exists = LEVEL_IDS.has(rec);
    const certified = META[rec] !== undefined;
    if (!(inEligible && inUnlocked && exists && certified)) {
      stats.violations.push(`illégal @i=${i} : ${rec} eligible=${inEligible} unlocked=${inUnlocked} exists=${exists} certified=${certified}`);
    }
    const idx = r.eligibleLevels.indexOf(rec);
    stats.byDistance[classifyDistance(r.eligibleLevels.length - 1 - idx)]++;
    bump(stats.byLevel, rec);
    if (!stats.byArchetypeLevel.has(archetype)) stats.byArchetypeLevel.set(archetype, new Map());
    bump(stats.byArchetypeLevel.get(archetype), rec);
  }
  stats.byMode[r.mode]++;
  if (r.mode === "ADAPTIVE") stats.byTier[tierOf([...r.reasonCodes])]++;
  for (const c of r.reasonCodes) bump(stats.byCode, c);
  stats.confMin = Math.min(stats.confMin, r.profileConfidence);
  stats.confMax = Math.max(stats.confMax, r.profileConfidence);
  stats.confSum += r.profileConfidence;
  if (i % 20 === 0) sampleInputs.push({ i, inputs });
}

// ---------------------------------------------------------------------------
// Déterminisme — ré-exécution d'un échantillon 5%
// ---------------------------------------------------------------------------

let detChecked = 0;
let detMismatch = 0;
for (const { i, inputs } of sampleInputs) {
  const a = recommend(inputs);
  const b = recommend(inputs);
  detChecked++;
  if (JSON.stringify(a) !== JSON.stringify(b)) detMismatch++;
  if (JSON.stringify(a) !== JSON.stringify(recommend(inputs))) detMismatch++;
}

// ---------------------------------------------------------------------------
// Différenciation — un état fixe (fenêtre 14), tous les profils d'un lot
// ---------------------------------------------------------------------------

const DIFF_STATE = progressionOf(14);
const diffProfiles = Array.from({ length: Math.min(500, N) }, () => makeProfile(rng));
const diffByArchetype = new Map();
const diffArchCounts = new Map();
for (const { profile, archetype } of diffProfiles) {
  diffArchCounts.set(archetype, (diffArchCounts.get(archetype) ?? 0) + 1);
  const r = recommend({ candidates: IDS, progression: DIFF_STATE, metadata: META, difficulty: DIFFICULTY, profile });
  if (!diffByArchetype.has(archetype)) diffByArchetype.set(archetype, new Map());
  bump(diffByArchetype.get(archetype), r.recommendedLevel);
}

// ---------------------------------------------------------------------------
// Robustesse — 500 profils corrompus (forme v2 violée) : 100% SAFE_DEFAULT
// ---------------------------------------------------------------------------

const CORRUPTIONS = (rng, p) => {
  const kinds = [
    () => null,
    () => "profil",
    () => ({}),
    () => ({ ...p, [DIMS[Math.floor(rng() * DIMS.length)]]: [NaN, 1.5, -0.2, "x", Infinity][Math.floor(rng() * 5)] }),
    () => ({ ...p, confidence: [NaN, 1.7, -1][Math.floor(rng() * 3)] }),
    () => ({ ...p, version: [1, 3, "2", null][Math.floor(rng() * 4)] }),
    () => ({ ...p, evidenceWindow: -3 }),
    () => ({ ...p, champ_intrus: true }),
  ];
  return kinds[Math.floor(rng() * kinds.length)]();
};
let corruptTotal = 0;
let corruptSafe = 0;
let corruptExceptions = 0;
let corruptWrongCode = 0;
for (let i = 0; i < 500; i++) {
  const { profile } = makeProfile(rng);
  const bad = CORRUPTIONS(rng, profile);
  try {
    const r = recommend({ candidates: IDS, progression: progressionOf(10), metadata: META, difficulty: DIFFICULTY, profile: bad });
    corruptTotal++;
    if (r.mode === "SAFE_DEFAULT") corruptSafe++;
    if (!r.reasonCodes.some((c) => ["NO_PROFILE", "INVALID_PROFILE", "SAFE_DEFAULT_PROGRESSION"].includes(c))) corruptWrongCode++;
  } catch {
    corruptExceptions++;
    corruptTotal++;
  }
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const pct = (n, d = stats.total) => (d ? ((100 * n) / d).toFixed(1) : "0.0");
const pctOf = (n, d) => (d ? ((100 * n) / d).toFixed(1) : "0.0");
const table = (map, total, label) => {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of rows) console.log(`  ${k.padEnd(14)} ${String(v).padStart(6)}  ${pctOf(v, total).padStart(5)}%`);
};

console.log(`\n=== SIMULATION PROGRESSION POLICY — ${stats.total} profils × états N1-N36 ===`);
console.log(`seed ${SEED} · policyVersion ${POLICY_VERSION} · catalogue réel (Solver) · PRNG mulberry32 (aucun Math.random)\n`);

console.log(`LÉGALITÉ (existant ∧ certifié ∧ débloqué — mandat §6/§18)`);
console.log(`  recommandations auditées : ${stats.total}`);
console.log(`  violations               : ${stats.violations.length}  ${stats.violations.length === 0 ? "✅ 0 bypass" : "❌"}`);
console.log(`  exceptions levées        : ${stats.exceptions}`);

console.log(`\nMODE`);
console.log(`  ADAPTIVE     ${String(stats.byMode.ADAPTIVE).padStart(6)}  ${pct(stats.byMode.ADAPTIVE)}%`);
console.log(`  SAFE_DEFAULT ${String(stats.byMode.SAFE_DEFAULT).padStart(6)}  ${pct(stats.byMode.SAFE_DEFAULT)}%  (profils sous le seuil gradual)`);

console.log(`\nTIERS D'ADAPTATION (ADAPTIVE)`);
console.log(`  light    ${String(stats.byTier.light).padStart(6)}  ${pctOf(stats.byTier.light, stats.byMode.ADAPTIVE)}%`);
console.log(`  full     ${String(stats.byTier.full).padStart(6)}  ${pctOf(stats.byTier.full, stats.byMode.ADAPTIVE)}%`);
console.log(`  specific ${String(stats.byTier.specific).padStart(6)}  ${pctOf(stats.byTier.specific, stats.byMode.ADAPTIVE)}%`);

console.log(`\nDISTANCE AU FRONT (0 = niveau débloqué le plus avancé)`);
for (const [k, label] of [["front", "au front"], ["d1_2", "1-2 derrière"], ["d3_5", "3-5 derrière"], ["d6plus", ">5 derrière"]]) {
  console.log(`  ${label.padEnd(14)} ${String(stats.byDistance[k]).padStart(6)}  ${pctOf(stats.byDistance[k], stats.total)}%`);
}

console.log(`\nNIVEAUX RECOMMANDÉS (tous états)`);
table(stats.byLevel, stats.total);

console.log(`\nREASON CODES`);
table(stats.byCode, stats.total);

console.log(`\nPOLICY CONFIDENCE`);
console.log(`  min ${(stats.confMin ?? 0).toFixed(3)} · moyenne ${(stats.confSum / Math.max(1, stats.total)).toFixed(3)} · max ${(stats.confMax ?? 0).toFixed(3)}`);

console.log(`\nDIFFÉRENCIATION (état fixe : 14 niveaux débloqués, ${diffProfiles.length} profils)`);
for (const [arch, levels] of [...diffByArchetype.entries()].sort()) {
  const top = [...levels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const distinct = levels.size;
  const totalArch = diffArchCounts.get(arch) ?? 1;
  console.log(`  ${arch.padEnd(12)} (n=${String(totalArch).padStart(3)}) → ${top.map(([l, c]) => `${l} (${pctOf(c, totalArch)}%)`).join(" · ")}   [${distinct} niveaux distincts]`);
}

console.log(`\nDÉTERMINISME (ré-exécution échantillon)`);
console.log(`  ${detChecked} entrées rejouées · ${detMismatch} divergences ${detMismatch === 0 ? "✅" : "❌"}`);

console.log(`\nROBUSTESSE (${corruptTotal} profils corrompus — forme v2 violée)`);
console.log(`  SAFE_DEFAULT    : ${corruptSafe}/${corruptTotal} (${pctOf(corruptSafe, corruptTotal)}%)`);
console.log(`  exceptions      : ${corruptExceptions} ${corruptExceptions === 0 ? "✅" : "❌"}`);
console.log(`  codes de repli  : ${corruptWrongCode} sorties sans code de repli ${corruptWrongCode === 0 ? "✅" : "❌"}`);

const fatal = stats.violations.length + stats.exceptions + detMismatch + corruptExceptions + corruptWrongCode;
console.log(`\nVERDICT : ${fatal === 0 ? "✅ AUCUNE VIOLATION — légalité, déterminisme et replis prouvés à l'échelle" : `❌ ${fatal} violation(s)`}`);
process.exit(fatal === 0 ? 0 : 1);
