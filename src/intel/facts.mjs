import { solve as solveB1 } from "../b1/solver.mjs";
import { analyzeLevel, nmStage, NM_DESIGN_BUDGET } from "../b1/level-design.mjs";
import { LADDER } from "../b1/levels.mjs";

export const FACTS_VERSION = 1;

export const FACT_ID = Object.freeze({
  SOLVABLE: "SF-BASE-01-SOLVABLE",
  MIN_MOVES: "SF-BASE-02-MINMOVES",
  SOLUTION_COUNT: "SF-BASE-03-SOLUTIONS",
  DIRECT_WIN: "SF-ROUTE-04-DIRECTWIN",
  MULTI_PATH: "SF-ROUTE-05-MULTIPATH",
  FIRST_MOVE: "SF-ROUTE-06-FIRSTMOVE",
  CHAIN_DEPTH: "SF-CHAIN-07-CHAINDEPTH",
  CHAIN_POSSIBLE: "SF-CHAIN-08-CHAINPOSSIBLE",
  SCORE_RANGE: "SF-SCORE-09-SCORERANGE",
  BEST_SCORE: "SF-SCORE-10-BESTSCORE",
  LEGAL_FIRST_ACTS: "SF-AREA-11-LEGALFIRST",
  FINALS_COUNT: "SF-AREA-12-FINALS",
  STAGE: "SF-STAGE-13-STAGE",
  MOVE_VALIDITY: "SF-RULE-14-MOVEVALIDITY",
});

function resolveAction(level, act) {
  const t = level.tiles;
  return { a: t[act.a]?.v, op: t[act.op]?.v, b: t[act.b]?.v };
}

export function firstMoveOf(level, env) {
  const p = env && env.samplePaths && env.samplePaths[0];
  if (!p || !p[0]) return null;
  return resolveAction(level, p[0]);
}

export function solverFacts(level, { budget = NM_DESIGN_BUDGET } = {}) {
  if (!level || !Array.isArray(level.tiles)) {
    return {
      facts: new Map(),
      analysis: null,
      env: null,
      stage: "unsolvable",
      levelId: level && level.id ? level.id : null,
      solvable: false,
    };
  }
  const analysis = analyzeLevel(level, { budget });
  const f = analysis.facts;
  const env = solveB1(level, { maxMoves: level.maxMoves, budget });
  const stageFacts = {
    solvable: env.solvable,
    directWin: f.minMoves === 1 && f.routeCount > 0,
    multiPath: f.multiPath,
    minimalRoutes: f.routeCount,
    minimalRuns: f.runs,
    consequences: { distinctPostStates: f.distinctFinalStates, bestScore: f.bestScore },
  };
  const stage = nmStage(stageFacts);
  const directWin = f.minMoves === 1 && f.routeCount > 0;
  const firstMove = firstMoveOf(level, env);

  const F = (id, category, label, value, source) => ({
    id, category, label, value, source, verified: true,
  });

  const facts = new Map();
  facts.set(FACT_ID.SOLVABLE, F(FACT_ID.SOLVABLE, "base", "niveau solvable", env.solvable, "solve.solvable"));
  facts.set(FACT_ID.MIN_MOVES, F(FACT_ID.MIN_MOVES, "base", "coups minimum certifiés", env.minMoves, "solve.minMoves"));
  facts.set(FACT_ID.SOLUTION_COUNT, F(FACT_ID.SOLUTION_COUNT, "base", "nombre de solutions minimales", env.solutions, "solve.solutions"));
  facts.set(FACT_ID.DIRECT_WIN, F(FACT_ID.DIRECT_WIN, "route", "victoire directe en un coup", directWin, "solve.minMoves===1"));
  facts.set(FACT_ID.MULTI_PATH, F(FACT_ID.MULTI_PATH, "route", "plusieurs routes", f.multiPath, "analyzeLevel.multiPath", { routeCount: f.routeCount }));
  facts.set(FACT_ID.FIRST_MOVE, F(FACT_ID.FIRST_MOVE, "route", "premier coup d'une route minimale", firstMove, "solve.samplePaths[0][0]"));
  facts.set(FACT_ID.CHAIN_DEPTH, F(FACT_ID.CHAIN_DEPTH, "chain", "profondeur de chaîne", f.chainDepth, "analyzeLevel.chainDepth"));
  facts.set(FACT_ID.CHAIN_POSSIBLE, F(FACT_ID.CHAIN_POSSIBLE, "chain", "chaîne possible", f.chainDepth >= 1, "solve/analyzeLevel.chainDepth"));
  facts.set(FACT_ID.SCORE_RANGE, F(FACT_ID.SCORE_RANGE, "score", "fourchette de scores", f.scoreRange, "analyzeLevel.scoreRange"));
  facts.set(FACT_ID.BEST_SCORE, F(FACT_ID.BEST_SCORE, "score", "meilleur score", f.bestScore, "analyzeLevel.bestScore"));
  facts.set(FACT_ID.LEGAL_FIRST_ACTS, F(FACT_ID.LEGAL_FIRST_ACTS, "area", "coupes d'entrée légaux", f.legalFirstActs, "solve.routes.first"));
  facts.set(FACT_ID.FINALS_COUNT, F(FACT_ID.FINALS_COUNT, "area", "valeurs finales atteignables", f.finalValues.length, "analyzeLevel.finalValues"));
  facts.set(FACT_ID.STAGE, F(FACT_ID.STAGE, "stage", "stade du curriculum", stage, "nmStage"));

  return {
    facts,
    analysis,
    env,
    stage,
    levelId: level.id,
    solvable: env.solvable,
    minMoves: env.minMoves,
    solutionCount: env.solutions,
    directWin,
    multiPath: f.multiPath,
    routeCount: f.routeCount,
    firstMove,
    chainDepth: f.chainDepth,
    scoreRange: f.scoreRange,
    bestScore: f.bestScore,
    legalFirstActs: f.legalFirstActs,
  };
}

export function fact(reg, id) {
  return reg && reg.facts ? reg.facts.get(id) ?? null : null;
}

export const defaultSolverFacts = solverFacts;

export { LADDER };
