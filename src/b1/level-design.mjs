import { createSession, evaluate, apply, finalScore, cellsSnapshot } from "./engine.mjs";
import { solve } from "./solver.mjs";
import { LADDER } from "./levels.mjs";

export const NM_DESIGN_BUDGET = 40000;

export const STAGE_NAMES = ["", "DISCOVERY", "POSSIBILITY", "CHOICE", "CONSEQUENCE", "CHAIN", "OPTIMIZATION", "COMBINATION", "MASTERY"];

// Plafonnement pedagogique du curriculum par monde (convention de design, pas une donnee mesuree).
export const WORLD_STAGE_CAPS = { W1: 3, W2: 4, W3: 5, W4: 6, W5: 7, W6: 8 };

// Intentions pedagogiques declarees (flagships du mandat + onboarding).
// Distinguees des faits mesures : jamais presentees comme produites par le Solver.
export const DECLARED_INTENT = {
  N1: { tokens: ["DISCOVERY", "MULTI-PATH"], reason: "onboarding : comprendre l'action" },
  N2: { tokens: ["DISCOVERY", "MULTI-PATH"], reason: "onboarding : nombres et operateurs" },
  N3: { tokens: ["POSSIBILITY", "MULTI-PATH"], reason: "onboarding : reveler la possibilite" },
  N15: { tokens: ["SINGLE-PATH"], reason: "precision d'une route unique (flagship)" },
  N17: { tokens: ["MULTI-PATH"], reason: "flagship : les quatre chemins" },
  N22: { tokens: ["CHOICE", "CONSEQUENCE"], reason: "flagship : routes a scores differents" },
  N36: { tokens: ["MASTERY", "COMBINATION"], reason: "flagship : niveau de synthese" },
};

function enumerateActions(state) {
  const ops = state.board.cells.filter((c) => c !== null && c.kind === "op");
  const nums = state.board.cells.filter((c) => c !== null && c.kind === "num");
  const out = [];
  for (const o of ops) for (const na of nums) for (const nb of nums) {
    if (na.id === nb.id) continue;
    out.push({ a: na.id, op: o.id, b: nb.id });
  }
  return out;
}

function firstFinals(level) {
  const s0 = createSession(level);
  const acts = [];
  const counts = new Map();
  for (const act of enumerateActions(s0)) {
    const ev = evaluate(s0, act);
    if (!ev.ok) continue;
    acts.push(act);
    counts.set(ev.result, (counts.get(ev.result) ?? 0) + 1);
  }
  return { count: counts.size, finals: [...counts.keys()], acts };
}

function play(level, actions) {
  let s = createSession(level);
  for (const a of actions) s = apply(s, a);
  return s;
}

function valueMultiset(state) {
  return state.board.cells
    .filter((c) => c !== null && c.kind === "num")
    .map((c) => c.v)
    .sort((x, y) => x - y)
    .join(",");
}

function opSymbols(level) {
  const s0 = createSession(level);
  return s0.board.cells.map((c) => (c && c.kind === "op" ? c.v : null));
}

export function nmFacts(level, { budget = NM_DESIGN_BUDGET } = {}) {
  const ff = firstFinals(level);
  const r = solve(level, { maxMoves: level.maxMoves, budget });
  const opts = r.samplePaths.map((p) => {
    const final = play(level, p);
    return {
      score: finalScore(final),
      chain: final.events.reduce((t, e) => t + e.chainBonus, 0),
      postState: cellsSnapshot(final),
    };
  });
  const scores = new Set(opts.map((o) => o.score));
  const postStates = new Set(opts.map((o) => o.postState));
  return {
    id: level.id,
    solvable: r.solvable,
    minMoves: r.minMoves,
    finals: ff.count,
    finalValues: ff.finals,
    legalFirstActs: ff.acts.length,
    minimalRoutes: r.routes.length,
    minimalFirstMoves: r.routes.map((x) => x.first),
    minimalRuns: r.solutions,
    samplePaths: r.samplePaths,
    directWin: r.minMoves === 1 && r.routes.length > 0,
    multiPath: r.routes.length >= 2,
    consequences: {
      distinctScores: scores.size,
      distinctPostStates: postStates.size,
      chainPaths: opts.filter((o) => o.chain > 0).length,
      bestScore: opts.length ? Math.max(...scores) : null,
    },
    explored: r.explored,
  };
}

export function nmStage(facts) {
  if (!facts.solvable) return "unsolvable";
  if (facts.directWin && !facts.multiPath && facts.consequences.distinctScores <= 1) return "direct";
  if (facts.consequences.distinctScores >= 2) return "consequence";
  if (facts.multiPath) return "choice";
  return "single";
}

export function analyzeLevel(level, { budget = NM_DESIGN_BUDGET } = {}) {
  const f = nmFacts(level, { budget });
  const opsyms = opSymbols(level);
  const opts = f.samplePaths.map((p) => {
    const final = play(level, p);
    return {
      score: finalScore(final),
      chain: final.events.reduce((t, e) => t + e.chainBonus, 0),
      values: valueMultiset(final),
      opSet: new Set(p.map((a) => opsyms[a.op])),
    };
  });
  const scores = opts.map((o) => o.score);
  const scoreRange = opts.length ? [Math.min(...scores), Math.max(...scores)] : null;
  const scoreDiverse = new Set(scores).size >= 2;
  const chainDiverse = new Set(opts.map((o) => o.chain)).size >= 2;
  const stateDiverse = new Set(opts.map((o) => o.values)).size >= 2;
  const consequenceEvidence = scoreDiverse || chainDiverse || stateDiverse;
  const multiPath = f.minimalRoutes >= 2;
  const uniqueSolution = f.minimalRoutes === 1 && f.minimalRuns === 1;
  const equivalentRoutes = multiPath && !consequenceEvidence;
  const operatorDiversity = new Set(opts.flatMap((o) => [...o.opSet])).size;
  const maxDistinctOpsInPath = Math.max(0, ...opts.map((o) => o.opSet.size));
  const chainDepth = Math.max(0, ...opts.map((o) => o.chain));
  const combination = maxDistinctOpsInPath >= 3 && chainDepth >= 1;
  const mastery =
    level.world === "W6" &&
    f.minimalRoutes <= 2 &&
    consequenceEvidence &&
    chainDepth >= 1 &&
    (combination || f.minMoves >= 3);

  const seen = new Set();
  const props = [];
  if (level.world === "W1" && f.minimalRoutes <= 2 && f.finals <= 2) props.push("DISCOVERY");
  if (uniqueSolution || f.minimalRoutes === 1) props.push("SINGLE-PATH");
  if (multiPath) props.push("MULTI-PATH");
  if (multiPath && consequenceEvidence) props.push("CHOICE");
  if (consequenceEvidence) props.push("CONSEQUENCE");
  if (chainDepth >= 1) props.push("CHAIN");
  if (scoreDiverse) props.push("OPTIMIZATION");
  if (combination) props.push("COMBINATION");
  if (mastery) props.push("MASTERY");
  for (const p of props) seen.add(p);
  if (props.length === 0) props.push("DISCOVERY");

  const ambiguity = [];
  if (equivalentRoutes) ambiguity.push("multi-path technique sans consequence observable (routes equivalentes)");
  if (!scoreDiverse && !chainDiverse && stateDiverse) ambiguity.push("consequence par etat residuel seulement (ni score ni chaine ne divergent) : pertinence strategique a valider");
  if (uniqueSolution && chainDepth >= 1 && level.world !== "W6") ambiguity.push("route unique enchaine : precision, la chaine n'est qu'une variation du chemin unique");
  if (multiPath && scoreDiverse && chainDepth === 0) ambiguity.push("scores differents sans chaine : optimisation pure, pas de sequence");
  if (f.minimalRoutes === 1 && f.directWin && f.minMoves === 1 && level.world !== "W1") ambiguity.push("route unique directe : precision; le stage curriculum est conventionnel (dominant = SINGLE-PATH)");

  const derived = {
    ...f,
    consequenceEvidence,
    scoreDiverse,
    chainDiverse,
    stateDiverse,
    chainDepth,
    maxDistinctOpsInPath,
    combination,
    mastery,
  };
  const stage = curriculumStage(derived, level.world);
  const intended = DECLARED_INTENT[level.id];
  if (intended) {
    const intentStage = Math.max(...intended.tokens.map((t) => STAGE_NAMES.indexOf(t)), 0);
    if (intentStage > stage.stage) {
      stage.stage = Math.min(intentStage, stage.cap);
      stage.name = STAGE_NAMES[stage.stage];
      stage.declared = intended.tokens;
    }
  }

  return {
    id: level.id,
    world: level.world,
    samplePaths: f.samplePaths,
    facts: {
      minMoves: f.minMoves,
      routeCount: f.minimalRoutes,
      runs: f.minimalRuns,
      distinctFinalStates: f.consequences.distinctPostStates,
      scoreRange,
      operatorDiversity,
      chainDepth,
      uniqueSolution,
      multiPath,
      consequenceEvidence,
      finalValues: f.finals,
      legalFirstActs: f.legalFirstActs,
      bestScore: f.consequences.bestScore,
      maxDistinctOpsInPath,
    },
    properties: props,
    equivalentRoutes,
    ambiguity,
    declared: intended ? intended.tokens : [],
    stage,
  };
}

export function curriculumStage(facts, worldId) {
  const cap = WORLD_STAGE_CAPS[worldId] ?? 8;
  let e = 1;
  const flags = [];
  if (facts.multiPath) { e = Math.max(e, 2); flags.push("multiPath"); }
  if (facts.consequenceEvidence) { e = Math.max(e, 3); flags.push("consequence"); }
  if (facts.scoreDiverse || facts.stateDiverse || facts.chainDiverse) { e = Math.max(e, 4); flags.push("consequenceDeep"); }
  if (facts.chainDepth >= 2) { e = Math.max(e, 5); flags.push("chain"); }
  if (facts.scoreDiverse) { e = Math.max(e, 6); flags.push("optimization"); }
  if (facts.combination) { e = Math.max(e, 7); flags.push("combination"); }
  if (facts.mastery) { e = Math.max(e, 8); flags.push("mastery"); }
  e = Math.min(e, cap);
  return { stage: e, name: STAGE_NAMES[e], cap, flags: [...new Set(flags)] };
}

export function analyzeAll({ budget = NM_DESIGN_BUDGET } = {}) {
  return LADDER.map((l) => analyzeLevel(l, { budget }));
}

export function classifyLevel(level, { budget = NM_DESIGN_BUDGET } = {}) {
  const a = analyzeLevel(level, { budget });
  return a /* object de classification complet */;
}