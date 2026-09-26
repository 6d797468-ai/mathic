import { test } from "node:test";
import assert from "node:assert/strict";
import { apply2, reason } from "../../src/b1/kernel.mjs";
import { createSession, apply, enumerateActions, isWon, isLost, isBlocked, finalScore, cellsSnapshot } from "../../src/b1/engine.mjs";
import { replay } from "../../src/b1/replay.mjs";
import { solve } from "../../src/b1/solver.mjs";
import { LEVELS } from "../../src/b1/levels.mjs";

const L = (id) => LEVELS.find((l) => l.id === id);
const play = (level, acts) => {
  let s = createSession(level);
  for (const a of acts) s = apply(s, a);
  return s;
};
const cellOf = (s, id) => s.board.cells[id].v;

test("N0 — kernel : sémantique − fixée (K-0), a−b jamais inversé", () => {
  assert.equal(apply2(5, "-", 1), 4);
  assert.equal(apply2(5, "-", 5), 0, "5−5 = 0 : la règle non-négative (a−b ≥ 0) l'autorise");
  assert.equal(apply2(3, "-", 5), null, "3−5 : négatif → rejeté, JAMAIS −2");
  assert.equal(reason(3, "-", 5).includes("négatif"), true);
});

test("N0 — kernel : + × exacts, ÷ entière exacte, b≠0, déterministe", () => {
  assert.equal(apply2(12, "+", 4), 16);
  assert.equal(apply2(3, "*", 16), 48);
  assert.equal(apply2(50, "/", 4), null);
  assert.equal(apply2(96, "/", 2), 48);
  assert.equal(apply2(8, "/", 0), null);
  for (let i = 0; i < 50; i++) {
    const a = i - 25, b = i;
    assert.equal(apply2(a, "+", b), a + b);
  }
});

test("N0 — rejet atomique : action invalide, AUCUNE tuile consommée, état intact", () => {
  const lv = L("b1-5");
  const s = createSession(lv);
  const before = JSON.stringify(s);
  const nxt = apply(s, { a: 0, op: 3, b: 1 }); // 50 ÷ 4 → rejet
  assert.equal(nxt, null);
  assert.equal(JSON.stringify(s), before);
});

test("C-3 — ancrage : A×B ≠ B×A quand l'ancrage dépend de la cellule", () => {
  const lv = L("b1-5"); // 12@2, ×@5, 4@1 → 12×4 et 4×12
  const viaA = play(lv, [{ a: 2, op: 5, b: 1 }]);
  const viaB = play(lv, [{ a: 1, op: 5, b: 2 }]);
  assert.equal(isWon(viaA), true);
  assert.equal(isWon(viaB), true);
  assert.equal(cellOf(viaA, 2), 48, "48 ancré sur la cellule de l'opérande A (12)");
  assert.equal(cellOf(viaB, 1), 48, "48 ancré sur la cellule de l'opérande A (4)");
  assert.notEqual(JSON.stringify(viaA.board.cells), JSON.stringify(viaB.board.cells));
});

test("C-3 — les deux variantes ancrées sont des actions distinctes du solver", () => {
  const lv = L("b1-5");
  const r = solve(lv, { maxMoves: 1 });
  const anchor2 = r.routes.some((x) => x.first === "2-5-1");
  const anchor1 = r.routes.some((x) => x.first === "1-5-2");
  assert.ok(anchor2 && anchor1, `routes : ${r.routes.map((x) => x.first).join(", ")}`);
  assert.ok(r.postStates >= 2);
});

test("objectifs — win-on-touch, échec au 0 coup, bloqué ≠ échec (D-O1)", () => {
  const p = L("b1-4"); // 5@0, 7@1, ×@2, +@3 — seul 5×7 gagne
  const looser = play(p, [{ a: 0, op: 3, b: 1 }]); // 5+7=12
  assert.equal(isWon(looser), false);
  assert.equal(isBlocked(looser), true, "seule une tuile numérique restante → aucune formule possible");
  assert.equal(isLost(looser), false, "bloqué ≠ échec : il reste un coup");
  assert.equal(looser.movesLeft, 1);
  const w = play(p, [{ a: 0, op: 2, b: 1 }]);
  assert.equal(isWon(w), true);
  assert.equal(w.movesLeft, 1, "win-on-touch : le niveau est gagné même avec un coup restant");
});

test("chaîne — réutilisation de résultat : bonus cumulatif, reset hors réutilisation", () => {
  const lv = L("b1-6"); // 2@1, +@5, 4@2 → 6 ; 6×8@0/@3? → 48
  const s1 = apply(createSession(lv), { a: 1, op: 5, b: 2 }); // 2+4=6
  assert.equal(s1.events[0].chainRun, 0);
  const s2 = apply(s1, { a: 1, op: 4, b: 3 }); // 6×8=48 — réutilise 6
  assert.equal(s2.events[1].chainRun, 1);
  assert.equal(s2.events[1].chainBonus, 2);
  assert.equal(isWon(s2), true);
  const noChain = play(L("b1-1"), [{ a: 0, op: 2, b: 1 }]); // 12×4=48 sans réutilisation
  assert.equal(noChain.events[0].chainRun, 0);
});

test("score — bonus objectif ajouté une seule fois, à la fin seulement", () => {
  const lv = L("b1-1"); // immédiat : 12×4=48
  const w = play(lv, [{ a: 0, op: 2, b: 1 }]);
  assert.equal(w.events[0].delta, 4); // base |48|/10 = 4
  assert.equal(w.score, 4);
  assert.equal(finalScore(w), 14, "score final = 4 + bonus objectif 10");
  const prep = play(lv, [
    { a: 0, op: 4, b: 1 }, // 12+4=16 base 1
    { a: 0, op: 2, b: 3 }, // 16×3=48 base 4 + chaîne 2
  ]);
  assert.equal(prep.events[0].delta, 1);
  assert.equal(prep.events[1].delta, 6);
  assert.equal(finalScore(prep), 17, "préparation > immédiat (17 > 14) — la tension de S1, à confirmer humain");
});

test("replay B1-D — reconstruction exacte : états, score, événements, cellules", () => {
  const lv = L("b1-6");
  const a1 = { a: 1, op: 5, b: 2 }; // 2+4=6
  const a2 = { a: 1, op: 4, b: 3 }; // 6×8=48
  const s1 = apply(createSession(lv), a1);
  const s2 = apply(s1, a2);
  const r = replay(lv, [a1, a2]);
  assert.equal(r.ok, true);
  assert.equal(r.final.score, s2.score);
  assert.equal(r.final.won, true);
  assert.equal(JSON.stringify(r.final.board.cells), JSON.stringify(s2.board.cells));
  assert.deepEqual(r.final.events.map((e) => e.result), [6, 48]);
  assert.deepEqual(
    r.steps.map((st) => st.snapshot),
    [cellsSnapshot(createSession(lv)), cellsSnapshot(s1), cellsSnapshot(s2)],
    "chaque étape du replay reproduit l'état exact des cellules"
  );
});

test("replay — undo : l'état reconstruit par trace tronquée est identique au jeu direct", () => {
  const lv = L("b1-1");
  const s = play(lv, [
    { a: 0, op: 2, b: 1 },
    { a: 0, op: 4, b: 3 },
  ]);
  const undone = replay(lv, s.trace.slice(0, -1)).final;
  const direct = play(lv, [{ a: 0, op: 2, b: 1 }]);
  assert.equal(JSON.stringify(undone.board.cells), JSON.stringify(direct.board.cells));
  assert.equal(undone.score, direct.score);
  assert.equal(undone.movesLeft, direct.movesLeft);
});

test("B1-E — solver ≡ runtime ≡ replay : toute solution du solver rejouée donne l'état d'arrivée attendu", () => {
  for (const lv of LEVELS) {
    const r = solve(lv, { maxMoves: lv.maxMoves });
    for (const path of r.samplePaths) {
      const live = play(lv, path);
      assert.equal(isWon(live), true, `${lv.id} : chemin solver réellement jouable`);
      const rr = replay(lv, path);
      assert.equal(rr.ok, true);
      assert.equal(rr.final.won, true);
      assert.equal(JSON.stringify(rr.final.board.cells), JSON.stringify(live.board.cells));
    }
  }
});

test("déterminisme — deux sessions identiques produisent des événements et états identiques", () => {
  const lv = L("b1-2");
  const acts = [{ a: 0, op: 3, b: 2 }];
  const x = play(lv, acts);
  const y = play(lv, acts);
  assert.equal(JSON.stringify(x), JSON.stringify(y));
});

test("niveaux — hygiène globale : entiers positifs, jamais la cible au départ, opérateurs ∈ OPS", () => {
  for (const lv of LEVELS) {
    assert.ok(Number.isInteger(lv.rows) && Number.isInteger(lv.cols), `${lv.id} : grille`);
    assert.ok(lv.tiles.length <= lv.rows * lv.cols, `${lv.id} : capacité`);
    for (const t of lv.tiles) {
      if (t.kind === "num") assert.ok(Number.isInteger(t.v) && t.v > 0, `${lv.id} : toute valeur strictement positive`);
      if (t.kind === "op") assert.ok(["+", "-", "*", "/"].includes(t.v), `${lv.id} : opérateur valide (${t.v})`);
    }
    assert.ok(!lv.tiles.some((t) => t.kind === "num" && t.v === lv.target), `${lv.id} : cible absente au départ`);
    assert.ok(lv.target > 0, `${lv.id} : cible > 0`);
  }
});

test("niveaux — certification : chaque niveau résoluble dans maxMoves", () => {
  for (const lv of LEVELS) {
    const r = solve(lv, { maxMoves: lv.maxMoves });
    assert.equal(r.solvable, true, `${lv.id} résoluble`);
    assert.ok(r.minMoves <= lv.maxMoves, `${lv.id} : minMoves ${r.minMoves} ≤ ${lv.maxMoves}`);
    assert.ok(r.explored < 20000, `${lv.id} : sous budget`);
  }
});

test("b1-1 « Le Pont » — S1 : un coup immédiat ET une route à deux coups, états post-coup différents", () => {
  const lv = L("b1-1");
  const immediate = play(lv, [{ a: 0, op: 2, b: 1 }]); // 12×4=48
  const prep = play(lv, [
    { a: 0, op: 4, b: 1 }, // 12+4=16
    { a: 0, op: 2, b: 3 }, // 16×3=48
  ]);
  assert.equal(isWon(immediate), true);
  assert.equal(isWon(prep), true);
  assert.ok(
    JSON.stringify(immediate.board.cells) !== JSON.stringify(prep.board.cells),
    "les deux routes laissent des états post-coup différents (immédiat garde 3,+ ; préparation ne garde que +)"
  );
  const r = solve(lv, { maxMoves: 2 });
  assert.equal(r.minMoves, 1);
  assert.ok(r.postStates >= 2, `états distincts ≥ 2 (${r.postStates})`);
});

test("b1-2 « Le 2 partagé » — S7 : le 2 est exclusif, les deux routes ne cohabitent pas", () => {
  const lv = L("b1-2");
  const r = solve(lv, { maxMoves: 2 });
  assert.ok(r.routes.some((x) => x.first === "0-3-2"), "24×2");
  assert.ok(r.routes.some((x) => x.first === "1-4-2"), "96÷2");
  assert.ok(r.postStates >= 2, "états post-coup distincts (96 conservé vs 24 conservé)");
  const via24 = play(lv, [{ a: 0, op: 3, b: 2 }]);
  assert.equal(apply(via24, { a: 1, op: 4, b: 2 }), null, "après 24×2, le ÷2 du 96 n'existe plus");
});

test("b1-3 « Quatre routes » — S8 : ≤1 coup, 4 routes, 4 états post-coup distincts", () => {
  const lv = L("b1-3");
  const r = solve(lv, { maxMoves: 2 });
  assert.equal(r.minMoves, 1);
  assert.equal(r.solutions >= 4, true);
  for (const f of ["0-4-1", "2-6-1", "3-4-5", "7-8-1"]) {
    assert.ok(r.routes.some((x) => x.first === f), `route ${f}`);
  }
  assert.ok(r.postStates >= 4, `4 états post-coup distincts (${r.postStates}) — « si l'état d'après diffère »`);
});

test("b1-4 « La Falaise » — piège : le mauvais premier coup mène à un cul-de-sac", () => {
  const lv = L("b1-4");
  const trap = play(lv, [{ a: 0, op: 3, b: 1 }]); // 5+7=12
  assert.equal(isWon(trap), false);
  assert.equal(isBlocked(trap), true);
  assert.equal(apply(trap, { a: 0, op: 2, b: 0 }), null, "un seul opérande numérique restant");
  const r = solve(lv, { maxMoves: 2 });
  assert.equal(r.minMoves, 1);
});

test("b1-5 « Division exacte » — K-0/C-3 : rejets 50÷4/50÷12 atomiques, 12×4 et 4×12 distincts", () => {
  const lv = L("b1-5");
  for (const b of [1, 2]) assert.equal(apply2(50, "/", cellOf(createSession(lv), b)), null);
  const r = solve(lv, { maxMoves: 2 });
  assert.equal(r.minMoves, 1);
  assert.ok(r.routes.some((x) => x.first === "2-5-1") && r.routes.some((x) => x.first === "1-5-2"));
});

test("b1-6 « La Chaîne » — B1-B : jamais résoluble en 1 coup, la préparation est obligatoire", () => {
  const lv = L("b1-6");
  const one = solve(lv, { maxMoves: 1 });
  assert.equal(one.solvable, false, "aucune solution en 1 coup");
  const r = solve(lv, { maxMoves: 3 });
  assert.equal(r.minMoves, 2);
  assert.ok(r.winsByDepth.some(([d]) => d === 2), `victoires en 2 coups (${JSON.stringify(r.winsByDepth)})`);
  assert.ok(r.routes.every((x) => x.first.includes("-5-")), "toutes les routes min commencent par + (2+4=6) : × est réservé au coup final");
  assert.ok(r.routes.some((x) => x.first === "1-5-2") || r.routes.some((x) => x.first === "2-5-1"), "la préparation passe par 2+4 → 6");
});

test("enumerateActions — exclut les cellules consommées, chaque candidat listé est applicable", () => {
  const lv = L("b1-2");
  const s = play(lv, [{ a: 0, op: 3, b: 2 }]); // après 24×2 : 48 reste, 96 reste, ÷ ÷ restent
  const acts = enumerateActions(s);
  assert.ok(!acts.some((x) => x.op === 3 || x.b === 2 || x.a === 2), "cellules consommées exclues");
  assert.ok(acts.length > 0, "96÷48=2 reste un coup valide");
  assert.ok(acts.every((x) => apply(s, x) !== null), "chaque candidat listé est réellement applicable");
});