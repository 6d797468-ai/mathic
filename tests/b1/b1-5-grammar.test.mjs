import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  apply,
  evaluate,
  enumerateActions,
  finalScore,
  cellsSnapshot,
} from "../../src/b1/engine.mjs";
import { replay } from "../../src/b1/replay.mjs";
import { solve } from "../../src/b1/solver.mjs";
import { LADDER } from "../../src/b1/levels.mjs";

const N = (id) => LADDER.find((l) => l.id === id);
const play = (level, acts) => {
  let s = createSession(level);
  for (const a of acts) s = apply(s, a);
  return s;
};

function snapshot(state) {
  return JSON.stringify({ cells: cellsSnapshot(state), score: state.score, trace: state.trace, movesLeft: state.movesLeft, won: state.won, nextChain: state.nextChain });
}

test("B1.5/B2/CG — LADDER : 41 niveaux en ordre pédagogique (M9), chaque niveau résolvable dans maxMoves", () => {
  assert.deepEqual(
    LADDER.map((l) => l.id),
    ["N1","N2","N3","N4","N5","N6","N7","N8","N9","N10","N11","N12","N13","N14","N15","N16","N17","N18","N19","N20","N21","N22","N23","N24","N37","N25","N26","N27","N38","N28","N29","N39","N30","N31","N32","N33","N34","N35","N40","N41","N36"]
  );
  for (const l of LADDER) {
    const r = solve(l, { maxMoves: l.maxMoves, budget: l.maxMoves <= 2 ? 40000 : 500000 });
    assert.equal(r.solvable, true, `${l.id} doit être solvable`);
    assert.ok(r.minMoves <= l.maxMoves, `${l.id} : minMoves ${r.minMoves} <= maxMoves ${l.maxMoves}`);
  }
});

test("B1.5 — N1 : une seule idée (sélection→preview→transformation), victoire en 1 coup", () => {
  const l = N("N1");
  const r = solve(l, { maxMoves: 1 });
  assert.equal(r.solvable, true);
  assert.equal(r.minMoves, 1);
  assert.equal(r.winsByDepth[0][0], 1);
  assert.equal(play(l, [{ a: 0, op: 1, b: 2 }]).won, true, "2+3=5 gagne");
});

test("B1.5 — N2 : plusieurs chemins vers le même objectif (≥2 premières actions)", () => {
  const r = solve(N("N2"), { maxMoves: 1 });
  assert.ok(r.routes.length >= 2, `N2 doit avoir ≥2 routes, en a ${r.routes.length}`);
  assert.equal(r.routes.length, 4, "2+3, 3+2, 4+1, 1+4");
});

test("B1.5 — N3 : même objectif, états post-coup distincts (postStates ≥ 2)", () => {
  const r = solve(N("N3"), { maxMoves: 1 });
  assert.ok(r.routes.length >= 2);
  assert.ok(r.postStates >= 2, `N3 doit distinguer les états post-coup, en a ${r.postStates}`);
});

test("B1.5 — N4 : préparation — aucune victoire en 1 coup, chemin unique 12×3→36+4", () => {
  const l = N("N4");
  const one = solve(l, { maxMoves: 1 });
  assert.equal(one.solvable, false, "N4 : AUCUNE solution en 1 coup");
  const r = solve(l, { maxMoves: l.maxMoves });
  assert.equal(r.solvable, true);
  assert.equal(r.minMoves, 2);
  const w = play(l, [{ a: 0, op: 2, b: 1 }, { a: 0, op: 4, b: 3 }]);
  assert.equal(w.won, true, "12×3=36 puis 36+4=40 gagne");
});

test("B1.5 — N5 : chaîne — aucune victoire en 1 coup, 2+4=6 puis 6×8=48", () => {
  const l = N("N5");
  assert.equal(solve(l, { maxMoves: 1 }).solvable, false, "N5 : AUCUNE solution en 1 coup");
  const r = solve(l, { maxMoves: l.maxMoves });
  assert.equal(r.solvable, true);
  const s1 = apply(createSession(l), { a: 1, op: 2, b: 3 }); // 2+4=6
  const s2 = apply(s1, { a: 1, op: 4, b: 5 }); // 6×8=48 (réutilisation → chaîne)
  assert.equal(s2.won, true);
  assert.equal(s1.events[0].delta, 0, "6 → base 0 : le coup préparatoire ne rapporte rien");
  assert.equal(s2.events[1].chainRun, 1, "réutilisation → chaîne activée");
});

test("B1.5 — N6 : optimisation — immédiat (14) < préparé (17)", () => {
  const l = N("N6");
  const r = solve(l, { maxMoves: l.maxMoves });
  assert.equal(r.solvable, true);
  assert.equal(solve(l, { maxMoves: 1 }).solvable, true, "la route rapide existe en 1 coup");
  const imm = play(l, [{ a: 0, op: 2, b: 1 }]); // 12×4=48
  const prep = play(l, [{ a: 0, op: 4, b: 1 }, { a: 0, op: 2, b: 3 }]); // 12+4=16, 16×3=48
  assert.ok(finalScore(prep) > finalScore(imm), `préparé ${finalScore(prep)} > immédiat ${finalScore(imm)}`);
  assert.equal(finalScore(imm), 14);
  assert.equal(finalScore(prep), 17);
});

test("B1.5 — PREVIEW = evaluate() : pur, non-mutant, jamais dans la trace", () => {
  for (const l of LADDER) {
    const s = createSession(l);
    const before = snapshot(s);
    for (const act of enumerateActions(s).slice(0, 8)) {
      const ev = evaluate(s, act);
      assert.equal(ev.ok, true);
      assert.deepEqual(snapshot(s), before, `${l.id} : evaluate() ne modifie RIEN (positions/valeurs/score/trace)`);
    }
    assert.ok(s.trace.length === 0, "preview n'entre jamais dans la trace");
  }
});

test("B1.5 — preview.delta == apply().events[-1].delta (même état, même action)", () => {
  for (const l of LADDER) {
    const s = createSession(l);
    for (const act of enumerateActions(s)) {
      const ev = evaluate(s, act);
      const nxt = apply(s, act);
      assert.ok(ev.ok && nxt);
      const last = nxt.events[nxt.events.length - 1];
      assert.equal(ev.delta, last.delta, `${l.id} ${JSON.stringify(act)} : delta preview==apply`);
      assert.deepEqual(nxt.trace[nxt.trace.length - 1], { a: act.a, op: act.op, b: act.b }, "trace = positions");
    }
  }
});

test("B1.5 — INVALID → STATE_BEFORE == STATE_AFTER (gestes automatiquement atomes)", () => {
  for (const l of LADDER) {
    const s = createSession(l);
    const before = snapshot(s);
    const invalid = [
      { a: 0, op: 0, b: 1 }, // op confondu avec A
      { a: 0, op: 1, b: 0 }, // a == b
      { a: -1, op: 1, b: 2 }, // hors bornes
      { a: 3, op: 3, b: 0 }, // op confondu avec B (hors grille → refus)
    ];
    for (const act of invalid) {
      const ev = evaluate(s, act);
      assert.equal(ev.ok, false, `${l.id} ${JSON.stringify(act)} doit être invalide`);
      assert.equal(apply(s, act), null, "apply() rejette sans consommer");
      assert.deepEqual(snapshot(s), before, `${l.id} : aucune modification d'état`);
    }
  }
});

test("B1.5 — UNDO après preview : état reconstruit identique au jeu direct (replay source)", () => {
  const l = N("N5");
  const acts = [{ a: 1, op: 2, b: 3 }]; // 2+4=6 : preview puis commit
  const s = play(l, acts);
  const expected = cellsSnapshot(s);
  const undone = replay(l, s.trace.slice(0, -1)).final;
  assert.equal(cellsSnapshot(undone), cellsSnapshot(createSession(l)), "undo = retour à l'état initial");
  assert.equal(replay(l, acts).final.score, s.score);
  void expected;
});