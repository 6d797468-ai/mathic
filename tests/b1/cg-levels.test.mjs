import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  apply,
  evaluate,
  isWon,
  isLost,
  enumerateActions,
  cellsSnapshot,
  finalScore,
} from "../../src/b1/engine.mjs";
import { LADDER, WORLDS } from "../../src/b1/levels.mjs";

const N = (id) => LADDER.find((l) => l.id === id);
const play = (level, acts) => {
  let s = createSession(level);
  for (const a of acts) s = apply(s, a);
  return s;
};

function metrics(level, budget) {
  const wins = [];
  const seen = new Set();
  let explored = 0;
  let truncated = false;
  function dfs(state, acts, maxChain) {
    if (acts.length >= level.maxMoves) return;
    if (++explored > budget) { truncated = true; return; }
    const key = cellsSnapshot(state) + "|" + state.nextChain + "|" + state.score;
    if (seen.has(key)) return;
    seen.add(key);
    for (const act of enumerateActions(state)) {
      const ev = evaluate(state, act);
      const nxt = apply(state, act);
      if (!nxt) continue;
      if (isWon(nxt)) {
        wins.push({ acts: [...acts, act], depth: acts.length + 1, final: nxt.score + 10, chainRun: Math.max(maxChain, ev.chainRun), snapshot: cellsSnapshot(nxt) });
        continue;
      }
      if (!isLost(nxt) && nxt.movesLeft > 0) dfs(nxt, [...acts, act], Math.max(maxChain, ev.chainRun));
    }
  }
  dfs(createSession(level), [], 0);
  const sorted = [...wins].sort((a, b) => a.depth - b.depth);
  const finals = [...new Set(sorted.map((w) => w.final))];
  return {
    wins: sorted,
    truncated,
    solvable: sorted.length > 0,
    minMoves: sorted.length ? sorted[0].depth : null,
    solutions: sorted.length,
    routes: new Set(sorted.filter((w) => w.depth === (sorted.length ? sorted[0].depth : 0)).map((w) => `${w.acts[0].a}-${w.acts[0].op}-${w.acts[0].b}`)).size,
    postStates: new Set(sorted.map((w) => w.snapshot)).size,
    finals,
    finalsCount: finals.length,
    chainDepth: sorted.length ? Math.max(...sorted.map((w) => w.chainRun)) : 0,
    chainAll: sorted.length > 0 && sorted.every((w) => w.chainRun >= 1),
  };
}

const BUDGET = { default: 400000, small: 40000 };

// Signatures certifiées (dfs exhaustive complet, cf. /tmp/opencode/cg-verify.mjs)
const CG = {
  N17: { minMoves: 1, routesGe: 4, postStatesGe: 3, finalsLe: 1, noWin1: false },
  N18: { minMoves: 2, routesGe: 2, finals: [18] },
  N19: { minMoves: 2, finals: [14], chainDepthGe: 1, chainAll: true },
  N20: { minMoves: 3, solutionsLe: 8, finals: [20], chainDepth: 2, chainAll: true },
  N21: { minMoves: 2, routesGe: 3, finals: [17, 20], chainAll: true },
  N22: { minMoves: 2, routesGe: 3, finalsGe: 4, finals: [27, 19, 24, 25], chainDepthGe: 1 },
  N23: { minMoves: 3, solutionsLe: 3, finals: [24], chainDepth: 2 },
  N24: { minMoves: 3, routesGe: 6, finalsGe: 3, chainDepthGe: 2 },
  N25: { minMoves: 2, finals: [16], divNeces: true, divFirstAll: true },
  N26: { minMoves: 3, finalsGe: 2, divNeces: true, divFirstAll: true, chainDepthGe: 2 },
  N27: { minMoves: 2, divNeces: true, chainAll: true, finalsGe: 2 },
  N28: { minMovesGe: 2, finalsGe: 3, chainDepthGe: 2, chainAll: true },
  N29: { minMoves: 3, finalsGe: 2, chainAll: true },
  N30: { minMoves: 1, finalsGe: 5, chainDepthGe: 1 },
  N31: { minMovesGe: 2, finalsGe: 13, chainDepthGe: 3, divUsed: true, postStatesGe: 15 },
  N32: { minMovesGe: 2, finalsGe: 4, divUsed: true, chainDepthGe: 2, postStatesGe: 6 },
  N33: { minMoves: 3, solutionsLe: 4, finals: [32], chainDepth: 2 },
  N34: { minMovesGe: 2, finalsGe: 8, divUsed: true, chainDepthGe: 2, postStatesGe: 15 },
  N35: { minMovesGe: 2, finalsGe: 3, routesGe: 3, divUsed: true, chainAll: true, chainDepthGe: 2 },
  N36: { minMovesGe: 2, finalsGe: 8, divUsed: true, chainDepthGe: 2, chainAll: true, postStatesGe: 30 },
};

test("CG — LADDER : exactement N1..N36, chaque monde peuplé, ids ordonnés", () => {
  assert.deepEqual(LADDER.map((l) => l.id), Array.from({ length: 36 }, (_, i) => `N${i + 1}`));
  const perWorld = Object.fromEntries(WORLDS.map((w) => [w.id, LADDER.filter((l) => l.world === w.id).map((l) => l.id)]));
  assert.deepEqual(perWorld, {
    W1: ["N1", "N2", "N3", "N17", "N18"],
    W2: ["N4", "N7", "N12", "N19", "N20", "N21"],
    W3: ["N5", "N8", "N13", "N22", "N23", "N24"],
    W4: ["N9", "N14", "N25", "N26", "N27"],
    W5: ["N6", "N10", "N11", "N28", "N29", "N30"],
    W6: ["N15", "N16", "N31", "N32", "N33", "N34", "N35", "N36"],
  });
  for (const l of LADDER) {
    assert.ok(Number.parseInt(l.id.slice(1)) >= 1);
    assert.ok(l.world && WORLDS.some((w) => w.id === l.world), `${l.id} rattaché à un monde`);
    assert.ok(l.maxMoves >= 1 && l.tiles.length === l.cols && l.rows === 1);
  }
});

for (const [id, want] of Object.entries(CG)) {
  const m = metrics(N(id), BUDGET.small);
  test(`CG — ${id} ${N(id).name} : signatures certifiées`, () => {
    assert.equal(m.truncated, false, `${id} : budget épuisé, signature incomplète`);
    assert.equal(m.solvable, true, `${id} solvable`);
    if (want.noWin1) assert.notEqual(m.minMoves, 1, `${id} : pas de victoire en 1 coup`);
    if (want.minMoves != null) assert.equal(m.minMoves, want.minMoves, `${id} : minMoves`);
    if (want.minMovesGe != null) assert.ok(m.minMoves >= want.minMovesGe, `${id} : minMoves>=`);
    if (want.routesGe != null) assert.ok(m.routes >= want.routesGe, `${id} : routes ${m.routes} >= ${want.routesGe}`);
    if (want.postStatesGe != null) assert.ok(m.postStates >= want.postStatesGe, `${id} : postStates ${m.postStates} >= ${want.postStatesGe}`);
    if (want.solutionsLe != null) assert.ok(m.solutions <= want.solutionsLe, `${id} : solutions ${m.solutions} <= ${want.solutionsLe}`);
    if (want.finalsGe != null) assert.ok(m.finalsCount >= want.finalsGe, `${id} : ${m.finalsCount} finals >= ${want.finalsGe}`);
    if (want.finals != null) assert.deepEqual(m.finals, want.finals, `${id} : ensemble des scores de victoire`);
    if (want.finalsLe != null) assert.ok(m.finalsCount <= want.finalsLe, `${id} : finals <=`);
    if (want.chainDepth != null) assert.equal(m.chainDepth, want.chainDepth, `${id} : profondeur de chaîne`);
    if (want.chainDepthGe != null) assert.ok(m.chainDepth >= want.chainDepthGe, `${id} : profondeur de chaîne >=`);
    if (want.chainAll) assert.equal(m.chainAll, true, `${id} : toute victoire est chaînée`);
    if (want.divUsed) {
      assert.ok(m.wins.some((w) => w.acts.some((a) => N(id).tiles[a.op]?.v === "/")), `${id} : ÷ dans une victoire`);
    }
    if (want.divNeces) assert.equal(metrics({ ...N(id), tiles: N(id).tiles.filter((t) => t.v !== "/") }, BUDGET.small).solvable, false, `${id} : sans ÷, insoluble`);
    if (want.divFirstAll) assert.ok(m.wins.every((w) => N(id).tiles[w.acts[0].op]?.v === "/"), `${id} : toute victoire débute par ÷`);
  });
}

test("CG — flagships joués réellement : preview pur, victoire, scores signés", () => {
  // N20 : sacrifice → double → toucher (chaîne 2)
  const n20 = N("N20");
  const p1 = evaluate(createSession(n20), { a: 3, op: 6, b: 0 }); // 10−8=2
  assert.equal(p1.delta, 0, "premier coup préparatoire ne rapporte rien");
  const s1 = apply(createSession(n20), { a: 3, op: 6, b: 0 });
  const p2 = evaluate(s1, { a: 3, op: 5, b: 1 }); // 2×2=4
  assert.equal(p2.delta, 2, "chaîne : +2 de bonus");
  const s2 = apply(s1, { a: 3, op: 5, b: 1 });
  const s3 = apply(s2, { a: 3, op: 4, b: 2 }); // 4+36=40
  assert.equal(s3.won, true, "4+36=40 touche le but");
  assert.equal(finalScore(s3), 20, "score N20 signé");
  assert.equal(s3.trace.length, 3);

  // N33 : unique route 14−2=12 → 12×5=60 → 60+36=96
  const n33 = N("N33");
  const w = play(n33, [{ a: 2, op: 7, b: 1 }, { a: 2, op: 6, b: 4 }, { a: 2, op: 5, b: 3 }]);
  assert.equal(w.won, true, "14−2=12, 12×5=60, 60+36=96 gagne");
  assert.equal(w.events[0].delta, 1);
  assert.equal(w.events[1].chainRun, 1, "réutilise 12");
  assert.equal(w.events[2].chainRun, 2, "réutilise 60");
  assert.equal(finalScore(w), 32, "score N33 signé");

  // N36 : couronnement — 18−3=15 → 15×24=360
  const n36 = N("N36");
  const w36 = play(n36, [{ a: 0, op: 8, b: 4 }, { a: 0, op: 7, b: 1 }]);
  assert.equal(w36.won, true, "18−3=15, 15×24=360");
  assert.equal(finalScore(w36), 49, "score N36 (route signée)");
});