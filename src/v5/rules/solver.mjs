import { createSession, isSolved, getMoves, apply, canonical } from "./engine.mjs";

const MAXPICK = 512;

export function certify(spec, { maxDepth = 8, budget = 20000 } = {}) {
  if (isSolved(createSession(spec))) return { solvable: true, minMoves: 0, solutions: 1, budgeted: false };
  const start = createSession(spec);
  const queue = [{ s: start, d: 0 }];
  const seen = new Set([canonical(start)]);
  let minMoves = Infinity;
  let solutions = 0;
  let nodes = 0;
  let budgeted = false;
  while (queue.length && nodes < budget) {
    const { s, d } = queue.shift();
    if (d > maxDepth) break;
    nodes++;
    for (const mv of getMoves(s)) {
      const n = apply(s, mv);
      if (!n) continue;
      const key = canonical(n);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isSolved(n)) {
        if (nodes > budget) budgeted = true;
        if (d + 1 < minMoves) minMoves = d + 1;
        solutions++;
        if (solutions >= MAXPICK) return { solvable: true, minMoves, solutions, budgeted: true };
        continue;
      }
      queue.push({ s: n, d: d + 1 });
    }
    if (nodes > budget) budgeted = true;
  }
  return {
    solvable: Number.isFinite(minMoves),
    minMoves: Number.isFinite(minMoves) ? minMoves : Infinity,
    solutions,
    budgeted,
  };
}