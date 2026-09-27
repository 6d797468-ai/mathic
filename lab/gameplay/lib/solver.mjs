export function minMoves(init, engine, maxDepth = 16, nodeBudget = 500000) {
  if (engine.isSolved(init)) return { min: 0, budgeted: false };
  const seen = new Set([engine.canonical(init)]);
  let frontier = [init];
  let nodes = 0;
  for (let d = 1; d <= maxDepth; d++) {
    const next = [];
    for (const s of frontier) {
      for (const mv of engine.getMoves(s)) {
        const t = engine.apply(s, mv);
        if (!t) continue;
        const k = engine.canonical(t);
        if (seen.has(k)) continue;
        seen.add(k);
        if (engine.isSolved(t)) return { min: d, budgeted: false };
        next.push(t);
        if (++nodes > nodeBudget) return { min: Infinity, budgeted: true };
      }
    }
    frontier = next;
  }
  return { min: Infinity, budgeted: false };
}

// Comptage de solutions. 
// - dedupeStates=true (grilles B) : chaque état distinct n'est exploré qu'une fois -> compte les ASSIGNATIONS distinctes,
//   indispensable pour ne pas surcompter par permutations de l'ordre de placement.
// - dedupeStates=false (chaînes A) : énumère les SEQUENCES d'actions distinctes.
// nodeBudget borne le nombre d'états explorés (sécurité anti-explosion) -> budgeted=true si atteint.
export function countSolutions(init, engine, { maxDepth = 10, cap = 1000, dedupeStates = false, nodeBudget = 500000, maxSolutions = 0 } = {}) {
  let count = 0;
  let best = Infinity;
  const bestSeqs = [];
  let nodes = 0;
  let budgeted = false;
  let saturated = false;
  const globalSeen = dedupeStates ? new Set() : null;
  const localSeen = new Set();

  function dfs(s, depth, seq) {
    if (budgeted || saturated) return;
    nodes++;
    if (nodes > nodeBudget) {
      budgeted = true;
      return;
    }
    if (dedupeStates) {
      const key = engine.canonical(s);
      if (localSeen.has(key)) return;
      localSeen.add(key);
    }
    if (engine.isSolved(s)) {
      count++;
      if (maxSolutions && count >= maxSolutions) saturated = true;
      if (depth < best) {
        best = depth;
        bestSeqs.length = 0;
      }
      if (depth === best) bestSeqs.push(seq);
      return;
    }
    for (const mv of engine.getMoves(s)) {
      const t = engine.apply(s, mv);
      if (!t) continue;
      if (dedupeStates) {
        const k = engine.canonical(t);
        if (globalSeen.has(k)) continue;
        globalSeen.add(k);
      }
      dfs(t, depth + 1, [...seq, mv]);
    }
  }

  if (engine.isSolved(init)) {
    best = 0;
    count = 1;
  } else {
    if (dedupeStates) globalSeen.add(engine.canonical(init));
    dfs(init, 0, []);
  }
  const reached = Math.min(count, cap);
  return { count: reached, capHit: count >= cap, budgeted, saturated, best, bestSeqs };
}

export function stats(init, engine, maxDepth = 12, nodeBudget = 250000) {
  let sumBranch = 0;
  let nonterm = 0;
  let dead = 0;
  let decision = 0;
  let nodes = 0;
  let budgeted = false;
  const seen = new Set([engine.canonical(init)]);
  let frontier = [init];
  for (let d = 0; d < maxDepth; d++) {
    const next = [];
    for (const s of frontier) {
      if (budgeted) break;
      if (engine.isSolved(s)) continue;
      nodes++;
      if (nodes > nodeBudget) {
        budgeted = true;
        break;
      }
      const mvs = engine.getMoves(s);
      nonterm++;
      sumBranch += mvs.length;
      if (mvs.length >= 2) decision++;
      if (mvs.length === 0) dead++;
      for (const mv of mvs) {
        const t = engine.apply(s, mv);
        if (!t) continue;
        const k = engine.canonical(t);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(t);
      }
    }
    frontier = next;
  }
  return {
    branchingAvg: nonterm ? sumBranch / nonterm : 0,
    deadEndRate: nonterm ? dead / nonterm : 0,
    decisionRatio: nonterm ? decision / nonterm : 0,
    statesSeen: seen.size,
    budgeted,
  };
}