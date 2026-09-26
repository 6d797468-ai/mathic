import * as engineA from "./engine-a.mjs";
import * as engineB from "./engine-b.mjs";
import { minMoves, countSolutions, stats } from "./solver.mjs";

const r2 = (x) => Math.round(x * 100) / 100;

function neutralizeA(spec, constraint) {
  const s = structuredClone(spec);
  s.constraints = spec.constraints?.filter((c) => c !== constraint) ?? [];
  if (constraint === "forbid") delete s.forbid;
  if (constraint === "preserve") delete s.preserve;
  if (constraint === "require") delete s.require;
  if (constraint === "sequence") delete s.sequence;
  if (constraint === "cap") delete s.cap;
  return s;
}

export function analyzeLevelA(spec, depthCap = 10) {
  const init = engineA.create(spec);
  const targetPreset = spec.line.includes(spec.objective.value);
  const sol = countSolutions(init, engineA, { maxDepth: depthCap, cap: 1000, dedupeStates: false, nodeBudget: 300000 });
  const st = stats(init, engineA, depthCap, 300000);
  const mm = minMoves(init, engineA, depthCap);
  const min = mm.min;
  const operatorUsage = {};
  for (const seq of sol.bestSeqs) for (const mv of seq) operatorUsage[mv.op] = (operatorUsage[mv.op] ?? 0) + 1;

  const constraintUsage = {};
  for (const c of spec.constraints ?? []) {
    const variant = neutralizeA(spec, c);
    const i2 = engineA.create(variant);
    const mm2 = minMoves(i2, engineA, depthCap);
    const min2 = mm2.min;
    const c2 = countSolutions(i2, engineA, { maxDepth: depthCap, cap: 1000 });
    constraintUsage[c] = { dSolutions: c2.count - sol.count, dMin: min2 === Infinity || min === Infinity ? null : min2 - min };
  }

  return {
    id: spec.id,
    title: spec.title,
    concept: "A",
    solvable: min !== Infinity,
    minMoves: min === Infinity ? null : min,
    minBudgeted: mm.budgeted,
    numSolutions: sol.count,
    branchingAvg: r2(st.branchingAvg),
    deadEndRate: r2(st.deadEndRate),
    decisionRatio: r2(st.decisionRatio),
    trivial: targetPreset || (min === 0) || (min === 1 && !spec.tutorial),
    minOneSolution: min === 1 && !spec.tutorial,
    operatorUsage,
    constraintUsage,
    solutionDiversity: sol.bestSeqs.length,
    statesSeen: st.statesSeen,
    targetPreset,
  };
}

export function analyzeLevelB(spec, depthCap = 12) {
  const init = engineB.create(spec);
  const cells = spec.grid.length * spec.grid[0].length;
  if (engineB.quickReject(init)) {
    return {
      id: spec.id,
      title: spec.title,
      concept: "B",
      solvable: false,
      minMoves: null,
      cells,
      numSolutions: 0,
      capHit: false,
      budgeted: false,
      quickRejected: true,
      branchingAvg: 0,
      deadEndRate: 0,
      decisionRatio: 0,
      trivial: false,
      minOneSolution: false,
      operatorUsage: {},
      constraintUsage: {},
      solutionDiversity: 0,
      statesSeen: 0,
      targetPreset: false,
    };
  }
  const sol = countSolutions(init, engineB, { maxDepth: cells, cap: 50000, dedupeStates: true, nodeBudget: 60000 });
  const probe = countSolutions(init, engineB, { maxDepth: cells, cap: 1, maxSolutions: 1, dedupeStates: true, nodeBudget: 90000 });
  const st = stats(init, engineB, cells, 20000);
  const min = probe.count > 0 ? cells : null;
  return {
    id: spec.id,
    title: spec.title,
    concept: "B",
    solvable: min !== null,
    minMoves: min,
    cells,
    numSolutions: sol.count,
    capHit: sol.capHit,
    budgeted: sol.budgeted || st.budgeted,
    quickRejected: false,
    branchingAvg: r2(st.branchingAvg),
    deadEndRate: r2(st.deadEndRate),
    decisionRatio: r2(st.decisionRatio),
    trivial: false,
    minOneSolution: false,
    operatorUsage: {},
    constraintUsage: {},
    solutionDiversity: Math.min(sol.bestSeqs.length, 50),
    statesSeen: st.statesSeen,
    targetPreset: false,
  };
}