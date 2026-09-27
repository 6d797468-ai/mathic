import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOculusController,
  analyzeAction,
  analyzeState,
  analyzeSpec,
  present,
} from "../../src/atelier/oculus-controller.mjs";
import { createReplayController } from "../../src/atelier/replay-controller.mjs";
import { createSession, getState, replay, apply } from "../../src/v5/rules/engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OCULUS_SRC = join(HERE, "../../src/atelier/oculus-controller.mjs");

const SPEC_A = {
  grid: [
    [-1, -1],
    [-1, -1],
  ],
  rows: [
    { ops: ["+"], target: 5 },
    { ops: ["+"], target: 7 },
  ],
  cols: [
    { ops: ["+"], target: 4 },
    { ops: ["+"], target: 8 },
  ],
  reserve: { 2: 2, 3: 1, 5: 1 },
};

const SOLUTION_A = [
  { value: 2, r: 0, c: 0 },
  { value: 3, r: 0, c: 1 },
  { value: 2, r: 1, c: 0 },
  { value: 5, r: 1, c: 1 },
];

const toEvents = (cmds) => cmds.map((m) => ({ type: "PLACE", value: m.value, r: m.r, c: m.c }));
const EVENTS_A = toEvents(SOLUTION_A);

function playAll(spec, cmds) {
  const c = createReplayController(spec);
  for (const cmd of cmds) {
    const r = c.move(cmd);
    if (!r.ok) throw new Error(`move refused: ${JSON.stringify(cmd)}`);
  }
  return c;
}

// ---------------------------------------------------------------------------
// OC-01 · État initial → analyse déterministe
// ---------------------------------------------------------------------------

test("OC-01 : état initial → analyse déterministe (curseur 0)", () => {
  const a = analyzeState(SPEC_A, EVENTS_A, 0);
  assert.equal(a.mode, "state");
  assert.equal(a.cursor, 0);
  assert.equal(a.total, 4);
  assert.equal(a.atPresent, false);
  assert.equal(a.solved, false);
  assert.equal(a.moves, 0);
  assert.deepEqual(a.grid, [[-1, -1], [-1, -1]]);
  assert.equal(a.lastEvent, null);
  assert.equal(a.specNote, "SAT");
  assert.ok(Array.isArray(a.lines.rows) && a.lines.rows.length === 2);
  assert.ok(Array.isArray(a.lines.cols) && a.lines.cols.length === 2);
  // l'analyse expose des OFFERED = la vraie loi du moteur (getMoves)
  assert.ok(a.offeredMoves.length >= 8);
  // chaque coup offert est réellement applicable
  for (const m of a.offeredMoves.slice(0, 3)) {
    assert.ok(apply(createSession(SPEC_A), { id: "PLACE", v: m.v, r: m.r, c: m.c }), `offert réellement applicable : ${m.label}`);
  }
});

// ---------------------------------------------------------------------------
// OC-02 · État historique M13 → analyse correcte
// ---------------------------------------------------------------------------

test("OC-02 : l'analyse de S_k == ce que l'UI du Sablier affiche à la position k", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  c.seek(2);
  // ce que l'UI affiche au curseur 2 :
  const uiState = c.getState();
  const a = analyzeState(SPEC_A, c.trace, 2);
  assert.deepEqual(a.grid, uiState.grid, "grille analysée == grille affichée");
  assert.deepEqual(a.reserve, uiState.reserve);
  assert.equal(a.moves, uiState.moves);
  assert.equal(a.cursor, 2);
  assert.equal(a.atPresent, false);
  assert.deepEqual(a.lastEvent, { type: "PLACE", value: 3, r: 0, c: 1 });
});

// ---------------------------------------------------------------------------
// OC-03 / OC-16 · Même état → même résultat byte-identique, y compris répété
// ---------------------------------------------------------------------------

test("OC-03 : même état → résultat identique", () => {
  const a1 = analyzeState(SPEC_A, EVENTS_A, 2);
  const a2 = analyzeState(SPEC_A, EVENTS_A, 2);
  assert.equal(JSON.stringify(a1), JSON.stringify(a2));
});

test("OC-16 : deux analyses successives du même état → byte-identiques", () => {
  const a1 = analyzeState(SPEC_A, EVENTS_A, 3);
  const a2 = analyzeState(SPEC_A, EVENTS_A, 3);
  const a3 = analyzeAction(SPEC_A, EVENTS_A, 3, { value: 2, r: 3, c: 3 });
  const a4 = analyzeAction(SPEC_A, EVENTS_A, 3, { value: 2, r: 3, c: 3 });
  assert.equal(JSON.stringify(a1), JSON.stringify(a2));
  assert.equal(JSON.stringify(a3), JSON.stringify(a4));
});

// ---------------------------------------------------------------------------
// OC-04 · Même état via replay direct → résultat identique
// ---------------------------------------------------------------------------

test("OC-04 : même état via deux chemins → résultat identique", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  const viaCursor = analyzeState(SPEC_A, c.trace, 2);
  // chemin « replay direct » : S_2 = replay(spec, E[1..2]) — même spec, même trace
  const S2 = getState(replay(SPEC_A, EVENTS_A.slice(0, 2)).at(-1));
  const viaReplay = analyzeState(SPEC_A, EVENTS_A, 2);
  assert.deepEqual(S2.grid, viaCursor.grid);
  assert.deepEqual(viaReplay.grid, viaCursor.grid);
  assert.deepEqual(viaReplay.reserve, viaCursor.reserve);
  assert.equal(viaCursor.cursor, viaReplay.cursor);
  assert.equal(JSON.stringify(viaCursor), JSON.stringify(viaReplay));
});

// ---------------------------------------------------------------------------
// OC-05 · Commande invalide → REJECTED + cause réelle
// ---------------------------------------------------------------------------

test("OC-05 : action sur cellule occupée → REJECTED_CELL_OCCUPIED avec faits réels", () => {
  const a = analyzeAction(SPEC_A, EVENTS_A, 1, { value: 3, r: 0, c: 0 });
  assert.equal(a.valid, false);
  assert.equal(a.reasonCode, "REJECTED_CELL_OCCUPIED");
  assert.deepEqual(a.affectedCells, [{ r: 0, c: 0, role: "occupée", content: 2 }]);
  assert.match(a.facts[0].fact, /déjà scellée par 2/);
  assert.equal(present(a).title, "INCANTATION REJETÉE");
});

test("OC-05b : action à réserve épuisée → REJECTED_RESERVE_EMPTY", () => {
  const c = playAll(SPEC_A, SOLUTION_A.slice(0, 2)); // pose 2@(0,0) puis 3@(0,1) → réserve 3 = 0
  const a = analyzeAction(SPEC_A, c.trace, 2, { value: 3, r: 1, c: 1 });
  assert.equal(a.valid, false);
  assert.equal(a.reasonCode, "REJECTED_RESERVE_EMPTY");
  assert.deepEqual(a.affectedValues, [{ value: 3, role: "épuisée", qty: 0 }]);
  assert.match(a.facts[0].fact, /Réserve de 3 : 0/);
});

test("OC-05c : hors grille → REJECTED_OUT_OF_BOUNDS", () => {
  const a = analyzeAction(SPEC_A, EVENTS_A, 0, { value: 2, r: 9, c: 9 });
  assert.equal(a.valid, false);
  assert.equal(a.reasonCode, "REJECTED_OUT_OF_BOUNDS");
  assert.match(a.facts[0].fact, /hors de la grille/);
});

test("OC-05d : id inconnu → REJECTED_COMMAND_UNKNOWN", () => {
  const a = analyzeAction(SPEC_A, EVENTS_A, 0, { id: "TRANSMUTE", value: 2, r: 0, c: 0 });
  assert.equal(a.valid, false);
  assert.equal(a.reasonCode, "REJECTED_COMMAND_UNKNOWN");
  assert.match(a.facts[0].fact, /'TRANSMUTE'/);
});

// ---------------------------------------------------------------------------
// OC-06 · Commande valide → VALID + ENGINE_OFFERS
// ---------------------------------------------------------------------------

test("OC-06 : action valide offerte par la loi → ENGINE_OFFERS, état après réel", () => {
  const a = analyzeAction(SPEC_A, EVENTS_A, 1, { value: 2, r: 1, c: 0 });
  assert.equal(a.valid, true);
  assert.equal(a.reasonCode, "ENGINE_OFFERS");
  assert.equal(a.offered, true);
  // le moteur produit réellement la transition
  const S1 = replay(SPEC_A, EVENTS_A.slice(0, 1)).at(-1);
  const next = apply(S1, { id: "PLACE", v: 2, r: 1, c: 0 });
  assert.deepEqual(a.stateAfter.grid, getState(next).grid);
});

test("OC-06b : action acceptée par apply mais écartée par la loi → ENGINE_ACCEPTS_NOT_OFFERED", () => {
  // 5@(0,0) : réserve OK, case vide, mais colonne 0 (target 4) serait violée
  const a = analyzeAction(SPEC_A, EVENTS_A, 0, { value: 5, r: 0, c: 0 });
  assert.equal(a.valid, true);
  assert.equal(a.offered, false);
  assert.equal(a.reasonCode, "ENGINE_ACCEPTS_NOT_OFFERED");
  // et le portail de la loi (getMoves) ne l'offre effectivement pas,
  // alors que apply produirait une transition : les deux faits cohabitent.
  const offered = analyzeState(SPEC_A, EVENTS_A, 0).offeredMoves;
  assert.equal(offered.some((m) => m.v === 5 && m.r === 0 && m.c === 0), false);
});

// ---------------------------------------------------------------------------
// OC-07 / OC-08 / OC-09 · Aucune mutation pendant l'analyse
// ---------------------------------------------------------------------------

test("OC-07 : l'analyse ne mute jamais le GameState du contrôleur", () => {
  const c = playAll(SPEC_A, SOLUTION_A.slice(0, 2));
  const beforeState = JSON.stringify(c.getState());
  const beforeCanon = c.canonicalAtCursor();
  analyzeState(SPEC_A, c.trace, 0);
  analyzeState(SPEC_A, c.trace, 1);
  analyzeState(SPEC_A, c.trace, 2);
  analyzeAction(SPEC_A, c.trace, 2, { value: 3, r: 1, c: 1 });
  assert.equal(JSON.stringify(c.getState()), beforeState);
  assert.equal(c.canonicalAtCursor(), beforeCanon);
});

test("OC-08 : l'analyse ne mute pas Save (aucune référence à save.mjs)", () => {
  const source = readFileSync(OCULUS_SRC, "utf8");
  for (const w of ["/save.", "progression", "orchestrator"]) {
    assert.equal(source.includes(w), false, `oculus ne référence pas ${w}`);
  }
});

test("OC-09 : l'analyse ne mute pas la trace replay", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  const before = JSON.stringify(c.trace);
  const beforePos = c.cursor().position;
  analyzeState(SPEC_A, c.trace, 0);
  analyzeAction(SPEC_A, c.trace, 3, { value: 2, r: 1, c: 1 });
  analyzeState(SPEC_A, c.trace, 4);
  assert.equal(JSON.stringify(c.trace), before);
  assert.equal(c.cursor().position, beforePos);
});

// ---------------------------------------------------------------------------
// OC-10 / OC-11 / OC-18 · Aucun réseau, aucun LLM, Intelligence OFF
// ---------------------------------------------------------------------------

test("OC-10 : oculus n'utilise aucun réseau", () => {
  const source = readFileSync(OCULUS_SRC, "utf8");
  for (const w of ["fetch(", "XMLHttpRequest", "WebSocket", "https://", "http://", "import("]) {
    assert.equal(source.includes(w), false, `pas de ${w} dans oculus`);
  }
});

test("OC-11 : oculus ne requiert aucun LLM", () => {
  const source = readFileSync(OCULUS_SRC, "utf8");
  for (const w of ["llm", "openai", "anthropic", "completion", "chat"]) {
    assert.equal(source.includes(w), false, `pas de ${w} dans oculus`);
  }
});

test("OC-18 : Intelligence OFF — l'Oculus repose uniquement sur le moteur", () => {
  const source = readFileSync(OCULUS_SRC, "utf8");
  for (const w of ["intel", "policy", "evidence", "profile", "mageek"]) {
    assert.equal(source.includes(w), false, `oculus ne référence pas ${w}`);
  }
  // et fonctionne hors de tout système d'intelligence :
  const a = analyzeAction(SPEC_A, EVENTS_A, 0, { value: 5, r: 0, c: 0 });
  assert.equal(a.offered, false);
  assert.equal(analyzeState(SPEC_A, EVENTS_A, 3).reasonCode, "ONGOING");
});

// ---------------------------------------------------------------------------
// OC-12 / OC-12b · Reason codes stables
// ---------------------------------------------------------------------------

test("OC-12 : reasonCode stable pour causes équivalentes", () => {
  const codes = [];
  for (const [value, r, c] of [[3, 0, 0], [5, 0, 0], [2, 0, 0]]) {
    codes.push(analyzeAction(SPEC_A, EVENTS_A, 1, { value, r, c }).reasonCode);
  }
  // toutes les trois visent une case occupée à k=1 → même code
  assert.deepEqual(codes, ["REJECTED_CELL_OCCUPIED", "REJECTED_CELL_OCCUPIED", "REJECTED_CELL_OCCUPIED"]);
  const ok = analyzeAction(SPEC_A, EVENTS_A, 1, { value: 2, r: 1, c: 0 }).reasonCode;
  assert.equal(ok, "ENGINE_OFFERS");
});

// ---------------------------------------------------------------------------
// OC-13 · Cells identiques pour mêmes entrées
// ---------------------------------------------------------------------------

test("OC-13 : affectedCells identiques pour mêmes entrées", () => {
  const a1 = analyzeAction(SPEC_A, EVENTS_A, 1, { value: 5, r: 0, c: 0 });
  const a2 = analyzeAction(SPEC_A, EVENTS_A, 1, { value: 5, r: 0, c: 0 });
  assert.deepEqual(a1.affectedCells, a2.affectedCells);
  assert.deepEqual(a1.affectedValues, a2.affectedValues);
});

// ---------------------------------------------------------------------------
// OC-14 / OC-15 · L'analyse reste rattachée au curseur k
// ---------------------------------------------------------------------------

test("OC-14 : l'analyse du curseur k reste attachée au curseur k", () => {
  for (let k = 0; k <= 4; k++) {
    const a = analyzeState(SPEC_A, EVENTS_A, k);
    assert.equal(a.cursor, k);
    assert.equal(a.grid, a.grid); // détail : la grille analysée est celle de k
    const expected = k === 0 ? getState(createSession(SPEC_A)).grid : getState(replay(SPEC_A, EVENTS_A.slice(0, k)).at(-1)).grid;
    assert.deepEqual(a.grid, expected, `grid(S_${k})`);
    assert.equal(a.atPresent, k === 4);
  }
});

test("OC-15 : changer le curseur change l'analyse (résultats potentiellement différents)", () => {
  const g0 = JSON.stringify(analyzeState(SPEC_A, EVENTS_A, 0).grid);
  const g2 = JSON.stringify(analyzeState(SPEC_A, EVENTS_A, 2).grid);
  const g4 = JSON.stringify(analyzeState(SPEC_A, EVENTS_A, 4).grid);
  assert.notEqual(g0, g2);
  assert.notEqual(g2, g4);
  // et les coups offerts évoluent à mesure que la grille se remplit
  assert.ok(analyzeState(SPEC_A, EVENTS_A, 0).offeredMoves.length > analyzeState(SPEC_A, EVENTS_A, 4).offeredMoves.length);
});

// ---------------------------------------------------------------------------
// OC-17 · Reload UI → état d'analyse cohérent
// ---------------------------------------------------------------------------

test("OC-17 : rechargement UI → même spec+trace rejouée → analyse byte-identique", () => {
  const c1 = playAll(SPEC_A, SOLUTION_A);
  const before = JSON.stringify(analyzeState(SPEC_A, c1.trace, 2));
  // « reload » : nouvelle instance rejouée avec la même trace
  const c2 = createReplayController(SPEC_A);
  for (const e of c1.trace) c2.move({ value: e.value, r: e.r, c: e.c });
  const after = JSON.stringify(analyzeState(SPEC_A, c2.trace, 2));
  assert.equal(before, after);
});

// ---------------------------------------------------------------------------
// Intégration M13/M14 · le couple Sablier→Oculus
// ---------------------------------------------------------------------------

test("OC-M13 : présente() ne contient que des faits réels, aucun calcul retourné", () => {
  const r = analyzeAction(SPEC_A, EVENTS_A, 1, { value: 3, r: 0, c: 0 });
  const p = present(r);
  assert.equal(p.title, "INCANTATION REJETÉE");
  assert.equal(p.tone, "err");
  assert.match(p.body, /déjà scellée par 2/);
});

test("OC-M13b : analyse d'un état résolu → SOLVED, présentation Ok", () => {
  const a = analyzeState(SPEC_A, EVENTS_A, 4);
  assert.equal(a.solved, true);
  assert.equal(a.reasonCode, "SOLVED");
  assert.equal(present(a).title, "CRÉATION STABILISÉE");
});

test("OC-M13c : le DERNIER COUP d'un état historique est exposé (action déjà faite)", () => {
  const a = analyzeState(SPEC_A, EVENTS_A, 2);
  assert.deepEqual(a.affectedCells, [{ r: 0, c: 1, role: "dernier coup", content: 3 }]);
});

// ---------------------------------------------------------------------------
// analyzeSpec · expose la raison réelle de validateSpec
// ---------------------------------------------------------------------------

test("OC-SPEC : spec invalide → SPEC_INVALID avec le message réel de validateSpec", () => {
  const bad = { ...SPEC_A, grid: [[2, 5], [2]] }; // ligne 1 de longueur 1
  const r = analyzeSpec(bad);
  assert.equal(r.mode, "spec");
  assert.equal(r.valid, false);
  assert.equal(r.reasonCode, "SPEC_INVALID");
  assert.match(r.message, /grid\[1\] : 1 cases ≠ 2/);
});

test("OC-SPECb : spec valide additionnelle SAT / inconsistante UNSAT", () => {
  assert.equal(analyzeSpec(SPEC_A).specNote, "SAT");
  const unsat = { ...SPEC_A, cols: [{ ops: ["+"], target: 9 }, { ops: ["+"], target: 8 }] }; // 17 ≠ 12
  assert.equal(analyzeSpec(unsat).specNote, "UNSAT");
});

// ---------------------------------------------------------------------------
// analyse en lecture seule au niveau moteur (preuve OC-07 renforcée)
// ---------------------------------------------------------------------------

test("OC-PURE : analyse = fonction pure de (spec, events, k, cmd) — aucun état caché", () => {
  const a1 = analyzeState(SPEC_A, EVENTS_A, 2);
  const b1 = analyzeAction(SPEC_A, EVENTS_A, 2, { value: 3, r: 1, c: 1 });
  // rejouer après une analyse « vide » ne change rien (pas d'historique caché)
  const a2 = analyzeState(SPEC_A, EVENTS_A, 2);
  const b2 = analyzeAction(SPEC_A, EVENTS_A, 2, { value: 3, r: 1, c: 1 });
  assert.equal(JSON.stringify(a1), JSON.stringify(a2));
  assert.equal(JSON.stringify(b1), JSON.stringify(b2));
});

test("OC-API : createOculusController délègue à l'analyse pure", () => {
  const oc = createOculusController(SPEC_A);
  assert.equal(oc.kind, "oculus");
  assert.equal(oc.spec, SPEC_A);
  const a = oc.analyzeState(EVENTS_A, 2);
  assert.equal(a.cursor, 2);
  assert.deepEqual(a.grid, analyzeState(SPEC_A, EVENTS_A, 2).grid);
  const ar = oc.analyzeAction(EVENTS_A, 1, { value: 3, r: 0, c: 0 });
  assert.equal(ar.reasonCode, "REJECTED_CELL_OCCUPIED");
  assert.equal(oc.analyzeSpec().reasonCode, "SPEC_OK");
  assert.equal(oc.present(ar).title, "INCANTATION REJETÉE");
  assert.throws(() => createOculusController(null), TypeError);
});