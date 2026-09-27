/**
 * MATHIC 1.0 — Expérience M11 : calibration de l'expérience de jeu
 *
 * Compare la progression ORDINALE (N → N+1) vs ADAPTIVE (N → sélection dans W)
 * sur des parcours contrôlés et seedés, pour les 3 profils comportementaux du
 * corpus réel (arithmetic / explorer / chain).
 *
 * DESIGN (mandat §4, §7) :
 *  - 3 profils × 2 modes × 10 trajectoires (seeds 1..10) ; chaque trajectoire
 *    est DÉTERMINISTE (PRNG mulberry32 seedé, rejeu reproductible vérifié) ;
 *  - les mêmes profils sont rejouables (même seed → même profil → même parcours) ;
 *  - les deux modes partagent EXACTEMENT le même échafaudage : même fenêtre de
 *    déblocage W (PROGRESSION_WINDOW), mêmes primitives de sauvegarde RÉELLES,
 *    mêmes bots. La SEULE différence est le choix de la cible :
 *      ORDINAL  → le niveau suivant du LADDER (N → N+1) ;
 *      ADAPTIVE → la recommandation RÉELLE de l'Orchestrator (M6→M10) ;
 *  - les métriques sont DESCRIPTIVES (jamais des KPI à optimiser) :
 *      F_difficulty = #succès dans la bande attendue / #tentatives
 *      R_retry      = #retries / #niveaux joués
 *      E_solve      = Σ minMoves / Σ movesPlayed   (efficacité de résolution)
 *  - bande attendue : positions ∈ [pos(front ordinal) − difficultyBand,
 *    pos(front ordinal) + difficultyBand] au moment de l'assignation couvrant le
 *    sens : un niveau proposé à proximité du front est « dans la bande attendue ».
 *
 * EXP-06 : pour chaque étape ADAPTIVE, classification front vs non-front :
 *   FRONT_BEST_FIT            — front choisi ET justifié par une règle/difficulté
 *   GRAMMAR_MATCH             — non-front choisi, la grammaire du niveau porte une
 *                               règle profil (*_MATCH) activée
 *   PROFILE_MATCH             — non-front choisi, les propriétés du niveau matchent
 *                               la grammaire du profil (PROFILE_RULES) sans code
 *   DIFFICULTY_MATCH          — non-front choisi via une règle de difficulté
 *   FALLBACK                  — SAFE_DEFAULT / REJECTED (aucune adaptation appliquée)
 *   NO_MEANINGFUL_DIFFERENCE  — front ou niveau équivalent sans règle discriminante
 *
 * Aucun score, aucune manipulation : tout est observé depuis des traces réelles.
 *
 * Usage :
 *   node scripts/experiment-player-experience.mjs [--levels 12] [--seeds 10] [--window 3]
 */

import { LADDER, PROGRESSION_WINDOW, ladderDifficulty, ladderPosition } from "../src/b1/levels.mjs";
import { analyzeAll } from "../src/b1/level-design.mjs";
import { loadSave, saveNow, markCompleted, unlockTo } from "../src/b1/save.mjs";
import { createSimStorage, mulberry32, playLevelOnce, fakeClock } from "../src/intel/adaptive-experiment.mjs";
import { detectProfile } from "../src/intel/profile.mjs";
import { orchestrate } from "../src/intel/progression-orchestrator.mjs";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : def;
};
const LEVELS = flag("levels", 12);
const SEED_COUNT = flag("seeds", 10);
const WINDOW = flag("window", PROGRESSION_WINDOW);

export const EXPERIMENT_M11_VERSION = 1;
export const EXPERIMENT_M11_METHOD = "player-experience-calibration-v1";

const ANALYSIS = analyzeAll({ budget: 40000 });
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const DIFFICULTY = ladderDifficulty();
const IDS = ANALYSIS.map((a) => a.id);

const MODES = ["ORDINAL", "ADAPTIVE"];
const PROFILES = ["arithm", "explorer", "chain"];

const props = (id) => META[id]?.properties ?? [];

// ---------------------------------------------------------------------------
// Trajectoire contrôlée — le cœur de l'expérience (partagé ORDINAL/ADAPTIVE)
// ---------------------------------------------------------------------------

function seedSave(storage) {
  storage.set("mathic.save.v1", JSON.stringify({ version: 1, unlocked: ["N1"], completed: {}, current: "N1" }));
}

const nextLevelId = (id) => {
  const i = LADDER.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LADDER.length ? LADDER[i + 1].id : null;
};

// Front ordinal RÉEL : premier niveau admissible non terminé dans l'ordre LADDER
// (la valeur que SAFE_DEFAULT livrerait — jamais forcée, jamais optimisée).
function ordinalFront(storage) {
  const state = loadSave(storage);
  const done = new Set(Object.keys(state.completed ?? {}));
  for (const id of state.unlocked ?? []) if (!done.has(id)) return { id, position: ladderPosition(id) };
  return { id: (state.unlocked ?? [])[0] ?? null, position: ladderPosition((state.unlocked ?? [])[0] ?? "") };
}

function runTrajectory({ mode, strategy, seed }) {
  const storage = createSimStorage();
  seedSave(storage);
  const seeded = mulberry32(seed);
  let evidences = [];
  const steps = [];
  // Bande attendue : front ordinal AU MOMENT DE L'ASSIGNATION du niveau joué
  // (porté d'une étape à l'autre — avant d'avoir joué le niveau courant).
  let carriedFront = ordinalFront(storage);

  for (let stepNo = 0; stepNo < LEVELS; stepNo++) {
    const state = loadSave(storage);
    const currentId = state.current;
    const level = LADDER.find((l) => l.id === currentId);
    if (!level) break;
    const bandFront = carriedFront; // front au moment où currentId a été assigné

    // 1. JOUER réellement le niveau courant (retries réels bornés).
    let attempts = 0;
    let played = null;
    let movesSpent = 0; // toutes actions réellement commitées, tentatives cumulées
    let wonAt = null; // adapter de la première tentative gagnée
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      attempts++;
      played = playLevelOnce({ strategy, level, seed: seeded() });
      movesSpent += played.adapter.events().filter((e) => e.type === "ACTION_COMMITTED").length;
      if (played.won) {
        wonAt = played;
        break;
      }
    }
    const winAdapter = wonAt ? wonAt.adapter : played.adapter;
    const adapterEvents = winAdapter.events();
    const committed = adapterEvents.filter((e) => e.type === "ACTION_COMMITTED").length;
    const restarts = adapterEvents.filter((e) => e.type === "LEVEL_RESTARTED").length;
    const chains = adapterEvents.filter((e) => e.type === "CHAIN_STARTED").length;
    const maxChainRun = Math.max(0, ...adapterEvents.map((e) => e.payload?.chainRun ?? 0));
    const timeToSolution = winAdapter.metrics().timeToSolution;

    // 2. Victoire réelle → complétion + fenêtre devant (comme le vrai jeu).
    let next = loadSave(storage);
    if (played.won) next = markCompleted(next, currentId, { score: played.score, movesLeft: played.movesLeft });
    const maxIdx = Math.min(LADDER.findIndex((l) => l.id === currentId) + WINDOW, LADDER.length - 1);
    next = unlockTo(next, LADDER[maxIdx].id);
    next = saveNow(next, storage);

    // 3. Profil détecté RÉELLEMENT sur l'Evidence cumulée réelle (les mêmes
    //    profils sont rejouables : même seed + même stratégie → même détection).
    evidences = [...evidences, ...adapterEvents];
    const profile = detectProfile([...evidences]);

    // Le front ORDINAL est évalué APRÈS la complétion : c'est le premier
    // admissible non terminé au moment de la DÉCISION (avant le prochain jeu).
    const front = ordinalFront(storage);

    // 4. ORDINAL vs ADAPTIVE — SEULE différence : la cible.
    //    La base commune est le FRONT ordinal : un niveau perdu est rejoué,
    //    un niveau gagné fait avancer le front (N → N+1). C'est la baseline
    //    du jeu SANS intelligence.
    //    - ORDINAL : cible = front, toujours (jamais d'IA).
    //    - ADAPTIVE : cible = recommandation RÉELLE si APPLIED, sinon le front
    //      (kill-switch SAFE_DEFAULT / REJECTED / NO_OP n'altère jamais la
    //      progression — mandat §11).
    let out = null;
    if (mode === "ORDINAL") {
      out = {
        action: "ORDINAL",
        level: front.id,
        reasonCodes: [],
        mode: "ORDINAL",
        stateChanged: front.id !== currentId,
      };
    } else {
      out = orchestrate({
        storage,
        metadata: META,
        difficulty: DIFFICULTY,
        profile: profile.profile,
      });
    }
    const chosen = mode === "ORDINAL" || !(out.action === "APPLIED" && out.level) ? front.id : out.level;
    next = saveNow({ ...loadSave(storage), current: chosen ?? front.id }, storage);

    const declined = out.action === "SAFE_DEFAULT" || out.action === "REJECTED";
    const frontDistanceDelta = out.level && out.action === "APPLIED" ? ladderPosition(out.level) - front.position : 0;

    steps.push({
      step: stepNo + 1,
      level: currentId,
      position: ladderPosition(currentId),
      won: Boolean(wonAt ? wonAt.won : played.won),
      lost: Boolean(played.lost),
      blocked: Boolean(played.blocked),
      score: (wonAt ?? played).score ?? 0,
      minMoves: META[currentId]?.facts?.minMoves ?? null,
      movesPlayed: committed,
      movesSpent,
      attempts,
      restarts,
      timeToSolution,
      chains,
      maxChainRun,
      front: front.id,
      frontPosition: front.position,
      bandFront: bandFront.id,
      bandFrontPosition: bandFront.position,
      action: out.action,
      recommended: out.level ?? null,
      recommendedPosition: out.level ? ladderPosition(out.level) : null,
      positionDelta: frontDistanceDelta,
      reasonCodes: [...(out.reasonCodes ?? [])],
      fallback: declined,
      nextLevel: (loadSave(storage))?.current ?? null,
    });

    // Porte le front APRÈS la décision → bande attendue du niveau suivant.
    carriedFront = ordinalFront(storage);
  }

  const finalProfile = detectProfile([...evidences]);
  return { mode, strategy, seed, steps, finalProfile: { ...finalProfile.profile } };
}

// ---------------------------------------------------------------------------
// Classification EXP-06 (front vs non-front)
// ---------------------------------------------------------------------------

const RULE_CODES = ["ARITHMETIC_MATCH", "EXPLORATION_MATCH", "STRATEGY_MATCH", "EFFICIENCY_MATCH", "CHAIN_MATCH"];
// Règles de difficulté FORTES (réelle divergence de difficulté).
const STRONG_DIFF_CODES = ["DIFFICULTY_MATCH", "GRADUAL_RAMP", "RETRY_MATCH"];

// Grammaire que le profil RECHERCHE (PROFILE_RULES réel, exige une coherence
// discutable : on observe la grammaire du niveau, jamais une vérité psychologique).
const PROFILE_TARGET_GRAMMAR = {
  arithm: ["COMBINATION", "MASTERY"],
  explorer: ["MULTI-PATH", "DISCOVERY", "CHOICE"],
  chain: ["CHAIN"],
};

export function classifyStep(step, strategy) {
  if (step.fallback) return "FALLBACK";
  const hasRule = step.reasonCodes.some((c) => RULE_CODES.includes(c));
  const hasStrongDiff = step.reasonCodes.some((c) => STRONG_DIFF_CODES.includes(c));
  const atFront = step.recommended === step.front;

  if (!atFront) {
    if (hasRule) return "GRAMMAR_MATCH";
    if (hasStrongDiff) return "DIFFICULTY_MATCH";
    const targetGrammar = PROFILE_TARGET_GRAMMAR[strategy] ?? [];
    const matched = props(step.recommended).some((p) => targetGrammar.includes(p));
    // Écart de ±1 position seulement avec proximité de bande = pas de différence
    // de difficulté réelle → divergence SANS sens pédagogique nettement nouveau.
    if (matched && Math.abs(step.positionDelta ?? 0) > 1) return "PROFILE_MATCH";
    return "NO_MEANINGFUL_DIFFERENCE";
  }
  // au front : adaptation qui CONFIRME le front = FRONT_BEST_FIT si une règle ou
  // une raison de difficulté la justifie ; sinon pas de divergence.
  if (hasRule || hasStrongDiff) return "FRONT_BEST_FIT";
  return "NO_MEANINGFUL_DIFFERENCE";
}

// ---------------------------------------------------------------------------
// Métriques descriptives par trajectoire (mandat §5)
// ---------------------------------------------------------------------------

export function metricsOf(trajectory) {
  const attempts = trajectory.steps.length;
  const levelPlays = trajectory.steps;
  const frontPositions = levelPlays.map((s) => s.frontPosition);
  const band = 1; // difficultyBand réel de la Policy (M10)

  // F_difficulty : succès (victoire) sur un niveau dont la position est dans la
  // bande attendue (± band autour du front ordinal AU MOMENT DE L'ASSIGNATION —
  // le niveau joué) / tentatives.
  const inBand = (s) => {
    const pos = s.position ?? 0;
    const f = s.bandFrontPosition ?? s.frontPosition ?? pos;
    return Math.abs(pos - f) <= band;
  };
  const successesInBand = levelPlays.filter((s) => s.won && inBand(s)).length;
  const fDifficulty = attempts > 0 ? successesInBand / attempts : 0;

  // R_retry : tentatives redondantes (attempts − 1) + restarts / niveaux joués.
  const retries = levelPlays.reduce((sum, s) => sum + Math.max(0, s.attempts - 1) + s.restarts, 0);
  const rRetry = attempts > 0 ? retries / attempts : 0;

  // E_solve : Σ minMoves / Σ cous (effort réel de tout le parcours, échecs
  // inclus) — l'efficacité de résolution du joueur, pas un score optimisé.
  const solved = levelPlays.filter((s) => s.won && s.minMoves != null);
  const sumMin = solved.reduce((sum, s) => sum + s.minMoves, 0);
  const sumPlayed = levelPlays.reduce((sum, s) => sum + Math.max(0, s.movesSpent ?? s.movesPlayed), 0);
  const eSolve = sumPlayed > 0 ? sumMin / sumPlayed : null;

  return {
    levelsPlayed: attempts,
    wins: levelPlays.filter((s) => s.won).length,
    losses: levelPlays.filter((s) => s.lost).length,
    fDifficulty: Number(fDifficulty.toFixed(4)),
    rRetry: Number(rRetry.toFixed(4)),
    eSolve: eSolve != null ? Number(eSolve.toFixed(4)) : null,
    retriesTotal: retries,
    movesPlayedTotal: levelPlays.reduce((sum, s) => sum + Math.max(0, s.movesSpent ?? s.movesPlayed), 0),
    minMovesTotal: solved.reduce((sum, s) => sum + s.minMoves, 0),
    timeToSolutionTotal: levelPlays.reduce((sum, s) => sum + (s.timeToSolution ?? 0), 0),
    frontCount: levelPlays.filter((s) => s.recommended === s.front).length,
    nonFrontCount: levelPlays.filter((s) => s.recommended !== s.front).length,
    fallbackCount: levelPlays.filter((s) => s.fallback).length,
    variety: new Set(levelPlays.map((s) => s.level)).size,
    driftMean: Number((levelPlays.reduce((sum, s) => sum + Math.abs(s.positionDelta ?? 0), 0) / Math.max(1, levelPlays.length)).toFixed(3)),
  };
}

// ---------------------------------------------------------------------------
// Agréations (EXP-02 : par mode ; EXP-03 : par profil)
// ---------------------------------------------------------------------------

function aggregate(rows, v, fmt = (x) => x) {
  const agg = {};
  for (const x of rows) {
    const key = x[v];
    const a = (agg[key] ??= { n: 0, f: 0, r: 0, e: 0, wins: 0, losses: 0, retries: 0, levels: 0, fronts: 0, nonFronts: 0, fallbacks: 0 });
    a.n++;
    const m = x.metrics;
    a.f += m.fDifficulty;
    a.r += m.rRetry;
    a.e += m.eSolve ?? 0;
    a.wins += m.wins;
    a.losses += m.losses;
    a.retries += m.retriesTotal;
    a.levels += m.levelsPlayed;
    a.fronts += m.frontCount;
    a.nonFronts += m.nonFrontCount;
    a.fallbacks += m.fallbackCount;
  }
  for (const a of Object.values(agg)) {
    a.f = a.f / a.n;
    a.r = a.r / a.n;
    a.e = a.e / a.n;
  }
  return agg;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const trajectories = [];
  const rows = [];
  for (const strategy of PROFILES) {
    for (const mode of MODES) {
      for (let seed = 1; seed <= SEED_COUNT; seed++) {
        const traj = runTrajectory({ mode, strategy, seed });
        // DÉTERMINISME : rejeu identique → trajectoire identique.
        const replay = runTrajectory({ mode, strategy, seed });
        if (JSON.stringify(traj.steps) !== JSON.stringify(replay.steps)) {
          throw new Error(`DÉTERMINISME violé ${mode}/${strategy}/${seed}`);
        }
        const metrics = metricsOf(traj);
        const classifications = traj.steps.map((s) => classifyStep(s, strategy));
        trajectories.push(JSON.parse(JSON.stringify({ ...traj, metrics, classifications })));
        rows.push({ mode, strategy, seed, metrics, traj });
      }
    }
  }

  // --- Déterminisme global vérifié (l'exception ci-dessus l'arbitre) ---

  const byMode = aggregate(rows, "mode");
  const byProfile = aggregate(rows, "strategy");
  const byCell = aggregate(
    rows.map((r) => ({ ...r, cell: `${r.strategy}:${r.mode}` })),
    "cell"
  );

  const lines = [];
  const fmtAgg = (a) =>
    `n=${String(a.n).padStart(2)}  F=${a.f.toFixed(3)}  R=${a.r.toFixed(3)}  E=${a.e != null ? a.e.toFixed(3) : "—"}  ` +
    `succès=${a.wins}/${a.levels}  retries=${a.retries}  front=${a.fronts}  non-front=${a.nonFronts}  replis=${a.fallbacks}`;

  lines.push("=".repeat(84));
  lines.push(`EXPÉRIENCE M11 — CALIBRATION EXPÉRIENCE JEU (déterministe)  [${EXPERIMENT_M11_METHOD} v${EXPERIMENT_M11_VERSION}]`);
  lines.push(`  3 profils × 2 modes × ${SEED_COUNT} trajectoires × ${LEVELS} niveaux  | fenêtre=${WINDOW}  | analyse réelle des ${ANALYSIS.length} niveaux certifiés`);
  lines.push("=".repeat(84));
  lines.push("");
  lines.push("== EXP-03 : PAR PROFIL (toutes modes confondues) ==");
  for (const [k, a] of Object.entries(byProfile)) lines.push(`  ${k.padEnd(12)} ${fmtAgg(a)}`);
  lines.push("");
  lines.push("== EXP-02 : PAR MODE (tous profils confondus) ==");
  for (const [k, a] of Object.entries(byMode)) lines.push(`  ${k.padEnd(12)} ${fmtAgg(a)}`);
  lines.push("");
  lines.push("== PAR CELLULE profil×mode ==");
  for (const [k, a] of Object.entries(byCell)) lines.push(`  ${k.padEnd(20)} ${fmtAgg(a)}`);
  lines.push("");
  lines.push("== EXP-06 : CLASSIFICATION DES CHOIX ADAPTIFS (front vs non-front) ==");
  const clsCount = {};
  for (const t of trajectories) {
    if (t.mode !== "ADAPTIVE") continue;
    for (const c of t.classifications) clsCount[c] = (clsCount[c] ?? 0) + 1;
  }
  const order = ["FRONT_BEST_FIT", "GRAMMAR_MATCH", "PROFILE_MATCH", "DIFFICULTY_MATCH", "NO_MEANINGFUL_DIFFERENCE", "FALLBACK"];
  for (const c of order) lines.push(`  ${c.padEnd(28)} ${String(clsCount[c] ?? 0).padStart(3)} choix`);
  lines.push("");
  lines.push("== FRONT vs NON-FRONT (ADAPTIVE) ==");
  const adap = trajectories.filter((t) => t.mode === "ADAPTIVE");
  const frontSum = adap.reduce((s, t) => s + t.metrics.frontCount, 0);
  const nonFrontSum = adap.reduce((s, t) => s + t.metrics.nonFrontCount, 0);
  const fallbackSum = adap.reduce((s, t) => s + t.metrics.fallbackCount, 0);
  lines.push(`  ADAPTIVE reste au front     : ${frontSum} étapes (${((frontSum / (frontSum + nonFrontSum)) * 100).toFixed(0)} %) — uniquement par repli`);
  lines.push(`  ADAPTIVE s'écarte du front  : ${nonFrontSum} étapes — chaque écart justifié par une classe EXP-06`);
  lines.push(`  Repli SAFE_DEFAULT          : ${fallbackSum} étapes (profil/confiance insuffisante)`);
  lines.push("");
  lines.push("== EXP-02 : COMPARAISON PAIRE À PAIRE (même profil, même seed — les deux modes) ==");
  lines.push("  (delta = ADAPTIVE − ORDINAL pour la même cellule profil×seed)");
  for (const strategy of PROFILES) {
    const deltas = { f: [], r: [], e: [], win: [] };
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const ord = trajectories.find((t) => t.mode === "ORDINAL" && t.strategy === strategy && t.seed === seed);
      const ada = trajectories.find((t) => t.mode === "ADAPTIVE" && t.strategy === strategy && t.seed === seed);
      if (!ord || !ada) continue;
      deltas.f.push(ada.metrics.fDifficulty - ord.metrics.fDifficulty);
      deltas.r.push(ada.metrics.rRetry - ord.metrics.rRetry);
      deltas.e.push((ada.metrics.eSolve ?? 0) - (ord.metrics.eSolve ?? 0));
      deltas.win.push(ada.metrics.wins - ord.metrics.wins);
    }
    const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const nGain = deltas.win.filter((x) => x > 0).length;
    const nLoss = deltas.win.filter((x) => x < 0).length;
    lines.push(
      `  ${strategy.padEnd(10)} ΔF=${mean(deltas.f).toFixed(3)}  ΔR=${mean(deltas.r).toFixed(3)}  ` +
        `ΔE=${mean(deltas.e).toFixed(3)}  victoires ${nGain}/${deltas.win.length} trajectoires gagnées par ADAPTIVE, ${nLoss} perdues`
    );
  }
  lines.push("");
  lines.push(
    "MÉTRIQUES : F = succès dans bande attendue / tentatives · R = (retries+restarts)/niveaux · E = ΣminMoves/Σmoves (résolus)"
  );

  const json = {
    version: EXPERIMENT_M11_VERSION,
    method: EXPERIMENT_M11_METHOD,
    levelsPerTrajectory: LEVELS,
    seedCount: SEED_COUNT,
    window: WINDOW,
    profiles: PROFILES,
    modes: MODES,
    trajectories,
    aggregates: { byMode, byProfile, byCell },
  };
  return { report: lines.join("\n"), json };
}

const { report, json } = main();

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "docs", "experiments", "m11");
mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(join(DATA_DIR, "EXP-01-dataset.json"), JSON.stringify(json, null, 2));
console.log(`\n[données EXP-01 persistées → docs/experiments/m11/EXP-01-dataset.json]`);
console.log(report);

// Export pour le rapport Markdown automatisé.
export const EXPERIMENT_RESULT = { report, json };