import { createSession, apply, isWon, cellsSnapshot } from "./engine.mjs";

export function solve(level, { maxMoves = null, budget = 20000 } = {}) {
  maxMoves = maxMoves ?? level.maxMoves;
  const results = [];
  const seen = new Set();
  let explored = 0;

  function dfs(state, actions, depth) {
    if (depth >= maxMoves) return;
    if (++explored > budget) return;
    const snapshot = `${cellsSnapshot(state)}@${depth}`;
    if (seen.has(snapshot)) return;
    seen.add(snapshot);
    for (const act of candidates(state)) {
      const nxt = apply(state, act);
      if (!nxt) continue;
      const path = [...actions, act];
      if (isWon(nxt)) {
        results.push({ actions: path, depth: path.length, wonState: nxt });
        continue;
      }
      if (nxt.movesLeft > 0) dfs(nxt, path, depth + 1);
    }
  }

  dfs(createSession(level), [], 0);

  const minMoves = results.length ? Math.min(...results.map((r) => r.depth)) : null;
  const best = results.filter((r) => r.depth === minMoves);
  const routes = new Map();
  for (const r of best) {
    const key = r.actions[0];
    routes.set(`${key.a}-${key.op}-${key.b}`, (routes.get(`${key.a}-${key.op}-${key.b}`) ?? 0) + 1);
  }
  const postStates = new Set(results.map((r) => cellsSnapshot(r.wonState)));
  const winsByDepth = new Map();
  for (const r of results) {
    winsByDepth.set(r.depth, (winsByDepth.get(r.depth) ?? 0) + 1);
  }

  return {
    solvable: results.length > 0,
    solutions: results.length,
    minMoves,
    winsByDepth: [...winsByDepth.entries()].sort((x, y) => x[0] - y[0]),
    routes: [...routes.entries()].map(([first, count]) => ({ first, count })),
    postStates: postStates.size,
    samplePaths: best.slice(0, 8).map((r) => r.actions),
    explored,
  };
}

function candidates(state) {
  const ops = state.board.cells.filter((c) => c !== null && c.kind === "op");
  const nums = state.board.cells.filter((c) => c !== null && c.kind === "num");
  const out = [];
  for (const o of ops) {
    for (const na of nums) {
      for (const nb of nums) {
        if (na.id === nb.id) continue;
        out.push({ a: na.id, op: o.id, b: nb.id });
      }
    }
  }
  return out;
}