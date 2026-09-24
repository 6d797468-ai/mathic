import { createSession, evaluate, apply, finalScore, cellsSnapshot } from "./engine.mjs";
import { solve } from "./solver.mjs";

export const NM_DESIGN_BUDGET = 40000;

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

function play(level, actions) {
  let s = createSession(level);
  for (const a of actions) s = apply(s, a);
  return s;
}

export function nmFacts(level, { budget = NM_DESIGN_BUDGET } = {}) {
  const ff = firstFinals(level);
  const r = solve(level, { maxMoves: level.maxMoves, budget });
  const opts = r.samplePaths.map((p) => {
    const final = play(level, p);
    return {
      path: p,
      score: finalScore(final),
      chain: final.events.reduce((t, e) => t + e.chainBonus, 0),
      base: final.events.reduce((t, e) => t + e.base, 0),
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