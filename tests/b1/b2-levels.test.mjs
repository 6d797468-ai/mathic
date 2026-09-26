import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, apply, finalScore, enumerateActions, isWon, isLost, cellsSnapshot } from "../../src/b1/engine.mjs";
import { solve } from "../../src/b1/solver.mjs";
import { LADDER } from "../../src/b1/levels.mjs";

const N = (id) => LADDER.find((l) => l.id === id);
const play = (level, acts) => {
  let s = createSession(level);
  for (const a of acts) s = apply(s, a);
  return s;
};

function collectFinals(level) {
  const finals = new Set();
  const seen = new Set();
  const stack = [[createSession(level), 0]];
  while (stack.length) {
    const [cur, d] = stack.pop();
    if (d >= level.maxMoves) continue;
    const key = cellsSnapshot(cur) + "|" + cur.nextChain;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const act of enumerateActions(cur)) {
      const nxt = apply(cur, act);
      if (!nxt) continue;
      if (isWon(nxt)) finals.add(finalScore(nxt));
      else if (!isLost(nxt) && nxt.movesLeft > 0) stack.push([nxt, d + 1]);
    }
  }
  return finals;
}

function clone(level, dropOp) {
  const tiles = level.tiles.filter((t) => !(t.kind === "op" && t.v === dropOp));
  return { ...level, tiles, cols: tiles.length, rows: 1 };
}

const CERT = {
  N7: {
    noWin1: true,
    minMoves: 2,
    routesGe: 2,
    postStatesGe: 2,
    paths: [
      { acts: [{ a: 0, op: 4, b: 3 }, { a: 0, op: 6, b: 2 }], final: 20, got: null },
      { acts: [{ a: 1, op: 4, b: 2 }, { a: 1, op: 6, b: 3 }], final: 19, got: null },
    ],
  },
  N8: {
    noWin1: true,
    minMoves: 2,
    postStatesGe: 2,
    twoChains: true,
    paths: [
      { acts: [{ a: 2, op: 4, b: 3 }, { a: 2, op: 5, b: 0 }], final: 15, got: null },
      { acts: [{ a: 3, op: 5, b: 0 }, { a: 3, op: 4, b: 1 }], final: 15, got: null },
    ],
  },
  N9: {
    noWin1: true,
    minMoves: 2,
    firstActionDiv: { a: 20, v: "/" },
    paths: [
      { acts: [{ a: 1, op: 4, b: 2 }, { a: 1, op: 6, b: 3 }], final: 15, got: null },
    ],
  },
  N10: {
    noWin1: true,
    minMoves: 2,
    exactMoves: true,
    postStatesGe: 2,
    finalsGe: 2,
    paths: [
      { acts: [{ a: 0, op: 4, b: 3 }, { a: 0, op: 6, b: 1 }], final: 19, got: null },
      { acts: [{ a: 1, op: 6, b: 0 }, { a: 1, op: 4, b: 2 }], final: 15, got: null },
    ],
  },
  N11: {
    detourBeats: {
      direct: { acts: [{ a: 0, op: 4, b: 1 }], final: 16, got: null },
      detour: { acts: [{ a: 2, op: 4, b: 3 }, { a: 0, op: 5, b: 2 }], final: 22, got: null },
    },
  },
  N12: {
    chainVsNoChain: {
      quick: { acts: [{ a: 0, op: 4, b: 3 }], final: 13, got: null },
      built: { acts: [{ a: 1, op: 4, b: 3 }, { a: 1, op: 5, b: 2 }], final: 16, got: null },
    },
  },
  N13: {
    noWin1: true,
    minMoves: 3,
    chainsAll: true,
    finalsGe: 2,
    paths: [
      { acts: [{ a: 1, op: 6, b: 3 }, { a: 1, op: 5, b: 2 }, { a: 1, op: 7, b: 0 }], final: 40, got: null },
    ],
  },
  N14: {
    noWin1: true,
    minMoves: 3,
    divisionNecessary: true,
    finalsGe: 2,
    paths: [
      { acts: [{ a: 1, op: 6, b: 2 }, { a: 1, op: 4, b: 3 }, { a: 0, op: 5, b: 1 }], final: 55, got: null },
      { acts: [{ a: 2, op: 4, b: 3 }, { a: 1, op: 6, b: 2 }, { a: 0, op: 5, b: 1 }], final: 27, got: null },
    ],
  },
  N15: {
    uniqueRoute: true,
    paths: [
      { acts: [{ a: 1, op: 6, b: 0 }], final: 11, got: null },
    ],
  },
  N16: {
    noWin1: true,
    minMoves: 2,
    postStatesGe: 2,
    finalsGe: 3,
    paths: [
      { acts: [{ a: 0, op: 6, b: 4 }, { a: 0, op: 8, b: 3 }], final: 55, got: null },
      { acts: [{ a: 4, op: 8, b: 3 }, { a: 4, op: 6, b: 0 }], final: 19, got: null },
    ],
  },
};

for (const [id, spec] of Object.entries(CERT)) {
  test(`B2 — ${id} : propriétés certifiées`, () => {
    const lvl = N(id);
    assert.ok(lvl, `${id} présent dans LADDER`);
    const safe = spec.noWin1 || spec.minMoves === 1 || spec.uniqueRoute;
    void safe;
    if (spec.noWin1) {
      assert.equal(solve(lvl, { maxMoves: 1, budget: 100000 }).solvable, false, `${id} : AUCUNE victoire en 1 coup`);
    }
    if (typeof spec.minMoves === "number") {
      const r = solve(lvl, { maxMoves: lvl.maxMoves, budget: 300000 });
      assert.equal(r.minMoves, spec.minMoves, `${id} : minMoves`);
    }
    if (spec.routesGe) {
      const r = solve(lvl, { maxMoves: lvl.maxMoves, budget: 300000 });
      assert.ok(r.routes.length >= spec.routesGe, `${id} : routes >= ${spec.routesGe}`);
    }
    if (spec.postStatesGe) {
      const r = solve(lvl, { maxMoves: lvl.maxMoves, budget: 300000 });
      assert.ok(r.postStates >= spec.postStatesGe, `${id} : états post-Objectif distincts`);
    }
    if (spec.finalsGe) {
      const finals = collectFinals(lvl);
      assert.ok(finals.size >= spec.finalsGe, `${id} : scores finaux distincts`);
    }
    if (spec.divisionNecessary) {
      const withOut = clone(lvl, "/");
      assert.equal(solve(withOut, { maxMoves: withOut.maxMoves, budget: 300000 }).solvable, false, `${id} : sans ÷, insoluble (division nécessaire)`);
    }
    if (spec.uniqueRoute) {
      const r = solve(lvl, { maxMoves: lvl.maxMoves, budget: 100000 });
      assert.equal(r.solutions, 1, `${id} : une seule formule gagnante`);
      assert.equal(r.minMoves, 1);
    }
  });
}

for (const [id, spec] of Object.entries(CERT)) {
  test(`B2 — ${id} : chemins signés gagnants (victoire + score exact)`, () => {
    const lvl = N(id);
    for (const p of spec.paths ?? []) {
      const s = play(lvl, p.acts);
      assert.equal(s.won, true, `${id} ${p.acts.map((a) => `${a.a}${a.op}${a.b}`).join(" ") } gagne`);
      p.got = finalScore(s);
      assert.equal(p.got, p.final, `${id} : final ${p.got} attendu ${p.final}`);
    }
    if (spec.twoChains) {
      const a = play(lvl, spec.paths[0].acts);
      const b = play(lvl, spec.paths[1].acts);
      assert.equal(a.events[1].chainRun, 1, "chaîne 1 active");
      assert.equal(b.events[1].chainRun, 1, "chaîne 2 active");
      assert.equal(a.won && b.won, true);
    }
    if (spec.firstActionDiv) {
      const p = play(lvl, spec.paths[0].acts);
      const tiles = lvl.tiles.map((t) => t.v);
      assert.equal(tiles[p.trace[0].op], "/", "la division est le premier coup");
      assert.ok(p.events[0].result === 10 && p.events[1].result === 24, "20÷2=10 puis 10+14=24");
    }
    if (spec.exactMoves) {
      const s = play(lvl, spec.paths[0].acts);
      assert.equal(s.movesLeft, 0, "budget épuisé exactement (pas de marge)");
    }
  });
}

test("B2 — N11 : le détour chaîné bat la victoire directe", () => {
  const lvl = N("N11");
  const direct = play(lvl, CERT.N11.detourBeats.direct.acts);
  const detour = play(lvl, CERT.N11.detourBeats.detour.acts);
  assert.equal(direct.won, true);
  assert.equal(detour.won, true);
  assert.equal(CERT.N11.detourBeats.direct.final, 16);
  assert.equal(CERT.N11.detourBeats.detour.final, 22);
  assert.ok(finalScore(detour) > finalScore(direct), "détour > direct");
  assert.ok(detour.events[1].chainRun >= 1, "le détour passe par une chaîne");
});

test("B2 — N12 : victoire immediate sans chaîne vs route construite", () => {
  const lvl = N("N12");
  const quick = play(lvl, CERT.N12.chainVsNoChain.quick.acts);
  const built = play(lvl, CERT.N12.chainVsNoChain.built.acts);
  assert.equal(quick.won && built.won, true);
  assert.equal(CERT.N12.chainVsNoChain.quick.final, 13);
  assert.equal(CERT.N12.chainVsNoChain.built.final, 16);
  assert.equal(quick.events[0].chainRun, 0, "victoire immédiate sans chaîne");
  assert.ok(built.events[1].chainRun >= 1, "route construite enchaînée");
});

test("B2 — N8 : deux chaînes distinctes, mêmes final 15 via échange d'ordre", () => {
  const lvl = N("N8");
  const s1 = play(lvl, [{ a: 2, op: 4, b: 3 }, { a: 2, op: 5, b: 0 }]); // 7+5=12 puis 12×2
  const s2 = play(lvl, [{ a: 3, op: 5, b: 0 }, { a: 3, op: 4, b: 1 }]); // 5×2=10 puis 10+14
  assert.equal(s1.won && s2.won, true);
  assert.equal(finalScore(s1), 15);
  assert.equal(finalScore(s2), 15);
  assert.notDeepEqual(s1.trace, s2.trace, "les deux chaînes sont réellement différentes");
});

test("B2 — N15 : une seule formule possible", () => {
  assert.equal(solve(N("N15"), { maxMoves: 1, budget: 100000 }).solutions, 1);
});

test("B2 — N16 : capstone — plusieurs routes, scores étagés, aucun win1", () => {
  const lvl = N("N16");
  assert.equal(solve(lvl, { maxMoves: 1, budget: 100000 }).solvable, false);
  const r = solve(lvl, { maxMoves: lvl.maxMoves, budget: 300000 });
  assert.ok(r.postStates >= 2);
  const finals = collectFinals(lvl);
  assert.ok(finals.size >= 3, `finals ${[...finals]}`);
});