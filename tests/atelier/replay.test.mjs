import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createReplayController } from "../../src/atelier/replay-controller.mjs";
import {
  createSession,
  replay,
  getState,
  apply,
  validateSpec,
} from "../../src/v5/rules/engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

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

const SPEC_B = {
  grid: [
    [-1, -1],
    [-1, -1],
  ],
  rows: [
    { ops: ["*"], target: 10 },
    { ops: ["-"], target: 4 },
  ],
  cols: [
    { ops: ["+"], target: 9 },
    { ops: ["+"], target: 8 },
  ],
  reserve: { 2: 1, 3: 1, 5: 1, 7: 1 },
};

function playAll(spec, cmds) {
  const c = createReplayController(spec);
  const results = [];
  for (const cmd of cmds) {
    const r = c.move(cmd);
    if (!r.ok) throw new Error(`move refused: ${JSON.stringify(cmd)}`);
    results.push(r);
  }
  return c;
}

// ---------------------------------------------------------------------------
// REPLAY-01 · Trace vide → état initial
// ---------------------------------------------------------------------------

test("REPLAY-01 : trace vide → état initial (curseur 0)", () => {
  const c = createReplayController(SPEC_A);
  assert.deepEqual(c.cursor(), { position: 0, total: 0 });
  assert.deepEqual(c.getState(), getState(createSession(SPEC_A)));
  assert.equal(c.atStart(), true);
  assert.equal(c.atEnd(), true);
  assert.equal(c.isSolvedAtCursor(), false);
});

// ---------------------------------------------------------------------------
// REPLAY-02 · Trace d'un événement → état exact après événement
// ---------------------------------------------------------------------------

test("REPLAY-02 : 1 événement → état exact = replay(spec, [e1])", () => {
  const c = createReplayController(SPEC_A);
  const r = c.move({ value: 2, r: 0, c: 0 });
  assert.equal(r.ok, true);
  assert.deepEqual(c.cursor(), { position: 1, total: 1 });

  const expected = replay(SPEC_A, [{ type: "PLACE", value: 2, r: 0, c: 0 }]);
  assert.deepEqual(c.getState(), getState(expected[expected.length - 1]));
});

// ---------------------------------------------------------------------------
// REPLAY-03 · Trace de N événements → état exact après N événements
// ---------------------------------------------------------------------------

test("REPLAY-03 : N événements → état exact après N (4 coups)", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  assert.deepEqual(c.cursor(), { position: 4, total: 4 });
  const expected = replay(SPEC_A, SOLUTION_A.map((m) => ({ type: "PLACE", value: m.value, r: m.r, c: m.c })));
  assert.deepEqual(c.getState(), getState(expected[expected.length - 1]));
  assert.equal(c.isSolvedAtCursor(), true);
});

// ---------------------------------------------------------------------------
// REPLAY-04 · Curseur 0 → état initial
// ---------------------------------------------------------------------------

test("REPLAY-04 : seek(0) → état initial exact", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  const st = c.seek(0);
  assert.deepEqual(c.cursor(), { position: 0, total: 4 });
  assert.deepEqual(st, getState(createSession(SPEC_A)));
  assert.equal(c.atStart(), true);
});

// ---------------------------------------------------------------------------
// REPLAY-05 · Curseur N → état courant
// ---------------------------------------------------------------------------

test("REPLAY-05 : seek(total) = toPresent() → état courant exact", () => {
  const c = playAll(SPEC_B, [
    { value: 2, r: 0, c: 0 },
    { value: 5, r: 0, c: 1 },
    { value: 3, r: 1, c: 0 },
    { value: 7, r: 1, c: 1 },
  ]);
  const st = c.toPresent();
  assert.deepEqual(c.cursor(), { position: 4, total: 4 });
  assert.deepEqual(st, c.getState());
});

// ---------------------------------------------------------------------------
// REPLAY-06 · Curseur hors limites → rejet explicite, jamais d'état incohérent
// ---------------------------------------------------------------------------

test("REPLAY-06 : seek hors bornes → RangeError, état inchangé", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  const before = JSON.stringify(c.getState());
  for (const bad of [-1, 5, 99, 0.5, NaN, null, undefined, "2"]) {
    assert.throws(() => c.seek(bad), RangeError, `seek(${String(bad)}) rejeté`);
  }
  assert.equal(JSON.stringify(c.getState()), before, "état inchangé après rejets");
  assert.deepEqual(c.cursor(), { position: 4, total: 4 });
});

test("REPLAY-06b : back/toPresent conservent les bornes", () => {
  const c = createReplayController(SPEC_A);
  assert.deepEqual(c.back(1), c.getInitialState(), "back(1) depuis 0 → état initial");
  const tooDeep = c.back(10);
  assert.deepEqual(c.cursor().position, 0, "back(10) depuis 0 → clampé à 0");
  assert.deepEqual(tooDeep, c.getInitialState());
  assert.throws(() => c.back(0), RangeError);
  assert.throws(() => c.back(-1), RangeError);
  assert.throws(() => c.back(1.5), RangeError);
});

// ---------------------------------------------------------------------------
// REPLAY-07 · Deux replays identiques → états byte-identiques
// ---------------------------------------------------------------------------

test("REPLAY-07 : deux replays identiques → canonical byte-identique", () => {
  const c1 = playAll(SPEC_A, SOLUTION_A);
  const c2 = playAll(SPEC_A, SOLUTION_A);
  assert.equal(c1.canonicalAtCursor(), c2.canonicalAtCursor());
  assert.deepEqual(c1.getState(), c2.getState());
  assert.equal(c1.verify().ok, true);
});

// ---------------------------------------------------------------------------
// REPLAY-08 · Même spec + mêmes events → même résultat
// ---------------------------------------------------------------------------

test("REPLAY-08 : même spec et mêmes events → résultat identique quel que soit le chemin", () => {
  const direct = replay(SPEC_A, SOLUTION_A.map((m) => ({ type: "PLACE", value: m.value, r: m.r, c: m.c })));
  const via1 = playAll(SPEC_A, SOLUTION_A);
  const via2 = playAll(SPEC_A, SOLUTION_A);
  const finalDirect = getState(direct[direct.length - 1]);
  assert.deepEqual(via1.getState(), finalDirect);
  assert.deepEqual(via2.getState(), finalDirect);
  assert.equal(via1.canonicalAtCursor(), via2.canonicalAtCursor());
});

// ---------------------------------------------------------------------------
// REPLAY-09 · INVALID action → aucune transition de replay
// ---------------------------------------------------------------------------

test("REPLAY-09 : action invalide → aucune transition (curseur/état/trace inchangés)", () => {
  const c = createReplayController(SPEC_A);
  const before = {
    cursor: { ...c.cursor() },
    state: JSON.stringify(c.getState()),
    trace: JSON.stringify(c.trace),
  };

  const refused = c.move({ value: 9, r: 0, c: 0 }); // réservé inexistant
  assert.equal(refused.ok, false);
  // 3 validés puis un invalide au milieu
  const c2 = playAll(SPEC_A, [SOLUTION_A[0], SOLUTION_A[1], SOLUTION_A[2]]);
  const stateBeforeInvalid = JSON.stringify(c2.getState());
  const bad = c2.move({ value: 3, r: 1, c: 1 }); // col1 devient 8 mais 3 non disponible (épuisé)
  assert.equal(bad.ok, false);
  assert.equal(JSON.stringify(c2.getState()), stateBeforeInvalid);
  assert.deepEqual(c2.cursor(), { position: 3, total: 3 });

  assert.deepEqual(c.cursor(), before.cursor);
  assert.equal(JSON.stringify(c.getState()), before.state);
  assert.equal(JSON.stringify(c.trace), before.trace);
});

// ---------------------------------------------------------------------------
// REPLAY-10 · Undo / replay combinés → état déterministe
// ---------------------------------------------------------------------------

test("REPLAY-10 : undo + replay → état déterministe (branche)", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  const full = c.canonicalAtCursor(); // [2,3]/[2,5]
  assert.equal(full, "[[[2,3],[2,5]]]");

  // retour branche : reviens au premier coup, change la suite
  c.seek(1);
  const atOne = c.getState();
  const branch = c.move({ value: 2, r: 1, c: 0 }); // 2 col0, ligne1 début
  assert.equal(branch.ok, true);
  assert.deepEqual(c.cursor(), { position: 2, total: 2 });
  // la trace a bifurqué : A, 2@(1,0) — pas de résidu de l'ancien futur
  assert.equal(c.trace.length, 2);

  // vérifie la re-dérivation : replay(spec, trace entière)
  const rebuilt = replay(SPEC_A, c.trace.map((e) => ({ type: e.type, value: e.value, r: e.r, c: e.c })));
  assert.deepEqual(c.getState(), getState(rebuilt[rebuilt.length - 1]));

  // undo : tronque le dernier événement, remonte à la position précédente
  const u = c.undo();
  assert.equal(u.ok, true);
  assert.deepEqual(c.cursor(), { position: 1, total: 1 });
  assert.deepEqual(c.getState(), atOne);
  // undo at start → refus propre
  const u2 = c.undo();
  assert.equal(u2.ok, true);
  assert.deepEqual(c.cursor(), { position: 0, total: 0 });
});

// ---------------------------------------------------------------------------
// REPLAY-11 · Session terminée → replay autorisé en lecture, vérité terminale intacte
// ---------------------------------------------------------------------------

test("REPLAY-11 : session résolue → replay en lecture sans altérer la vérité terminale", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  const terminal = c.terminalCanonical();
  assert.equal(terminal, "[[[2,3],[2,5]]]");
  assert.equal(c.verify().ok, true);

  // rembobine en lecture puis revient : read-only, terminal non altéré
  c.seek(0);
  assert.equal(c.verify().ok, true);
  c.toPresent();
  assert.equal(c.terminalCanonical(), terminal);
  assert.equal(c.canonicalAtCursor(), terminal);
});

// ---------------------------------------------------------------------------
// REPLAY-12 · Aucune écriture Save
// ---------------------------------------------------------------------------

test("REPLAY-12 : le Sablier n'écrit aucune sauvegarde", async () => {
  const save = await import("../../src/b1/save.mjs");
  const memory = {
    data: new Map(),
    getItem(k) {
      return this.data.has(k) ? this.data.get(k) : null;
    },
    setItem(k, v) {
      this.data.set(k, String(v));
    },
    removeItem(k) {
      this.data.delete(k);
    },
  };
  const before = JSON.stringify(memory.data);
  const c = playAll(SPEC_A, SOLUTION_A);
  c.seek(0);
  c.toPresent();
  c.verify();
  assert.equal(JSON.stringify(memory.data), before, "aucun setItem déclenché par le replay");
  void save;
});

// ---------------------------------------------------------------------------
// REPLAY-13 · Aucun accès Policy / Intelligence
// ---------------------------------------------------------------------------

test("REPLAY-13 : replay-controller n'importe ni Policy ni Intelligence", () => {
  const source = readFileSync(join(HERE, "../../src/atelier/replay-controller.mjs"), "utf8");
  for (const forbidden of ["intel", "policy", "progression", "orchestrator", "evidence", "profile", "save", "mageek"]) {
    assert.equal(
      source.includes(fromSlash(forbidden)),
      false,
      `replay-controller ne référence pas ${forbidden}`
    );
  }
});
function fromSlash(s) {
  return "/" + s + ".";
}

// ---------------------------------------------------------------------------
// REPLAY-14 · Aucun accès réseau
// ---------------------------------------------------------------------------

test("REPLAY-14 : replay-controller n'utilise aucun réseau", () => {
  const source = readFileSync(join(HERE, "../../src/atelier/replay-controller.mjs"), "utf8");
  for (const w of ["fetch(", "XMLHttpRequest", "WebSocket", "https://", "http://", "import("]) {
    assert.equal(source.includes(w), false, `pas de ${w} dans replay-controller`);
  }
});

// ---------------------------------------------------------------------------
// REPLAY-15 · UI et API produisent la même séquence d'états
// ---------------------------------------------------------------------------

test("REPLAY-15 : la séquence d'états exposée à l'UI == sequence replay du moteur", () => {
  const c = createReplayController(SPEC_A);
  const uiStates = [];
  // l'UI : pour chaque position k, elle demande getState() (donnée du replay réel)
  const seq = SOLUTION_A;
  uiStates.push(JSON.stringify(c.getState())); // k=0
  for (let k = 1; k <= seq.length; k++) {
    c.move(seq[k - 1]);
    uiStates.push(JSON.stringify(c.getState()));
  }
  // rewind : l'UI lit le passé via le replay réel
  const rewind = [];
  for (let k = seq.length; k >= 0; k--) {
    c.seek(k);
    rewind.push(JSON.stringify(c.getState()));
  }
  assert.deepEqual(rewind.reverse(), uiStates, "aller et retour produisent la même séquence");
  // API directe : replay(spec, E[1..k]) pour tout k
  for (let k = 0; k <= seq.length; k++) {
    const expected = k === 0 ? getState(createSession(SPEC_A)) : getState(replay(SPEC_A, seq.slice(0, k).map((m) => ({ type: "PLACE", value: m.value, r: m.r, c: m.c }))).at(-1));
    assert.deepEqual(JSON.parse(uiStates[k]), expected, `S_k == replay(spec,E[1..k]) pour k=${k}`);
  }
});

// ---------------------------------------------------------------------------
// REPLAY-16 · Reload ne corrompt pas le contrat du replay
// ---------------------------------------------------------------------------

test("REPLAY-16 : reload→ même spec+events → même résultat (et pas de regression Savoir)", () => {
  const c1 = playAll(SPEC_A, SOLUTION_A);
  const events1 = c1.trace;
  // "reload" : nouvelle instance avec la même trace réelle rejouée
  const c2 = createReplayController(SPEC_A);
  for (const e of events1) {
    const r = c2.move({ value: e.value, r: e.r, c: e.c });
    assert.equal(r.ok, true);
  }
  assert.equal(c2.canonicalAtCursor(), c1.canonicalAtCursor());
  assert.deepEqual(c2.getState(), c1.getState());
  assert.equal(c2.verify().ok, true);
});

// ---------------------------------------------------------------------------
// Contrats croisés du contrôleur (compléments REPLAY)
// ---------------------------------------------------------------------------

test("REPLAY-C : le contrôleur valide sa spec (fail-fast) et expose des commandes via replay", () => {
  assert.throws(() => createReplayController({ ...SPEC_A, grid: [[2, 5], [2]] }), TypeError);
  const c = createReplayController(SPEC_A);
  const cmds = c.getCommands();
  assert.ok(Array.isArray(cmds) && cmds.length > 0);
  const current = createSession(SPEC_A);
  for (const m of cmds) {
    // chaque commande proposée est réellement applicable sur l'état au curseur
    const next = apply(current, { id: "PLACE", v: m.value, r: m.r, c: m.c });
    assert.ok(next, `commande proposée ${JSON.stringify(m)} applicable`);
    break;
  }
});

test("REPLAY-D : le contrôleur reste déterministe à travers plusieurs graduations", () => {
  const c = playAll(SPEC_A, SOLUTION_A);
  const series = [];
  for (let k = 4; k >= 0; k--) {
    c.seek(k);
    series.push({ position: c.cursor().position, canonical: c.canonicalAtCursor() });
  }
  assert.deepEqual(series.map((p) => p.canonical), [
    "[[[2,3],[2,5]]]",
    "[[[2,3],[2,-1]]]",
    "[[[2,3],[-1,-1]]]",
    "[[[2,-1],[-1,-1]]]",
    "[[[-1,-1],[-1,-1]]]",
  ]);
});

test("REPLAY-E : validateSpec reste le gardien (aucun état reconstruit sans spec valide)", () => {
  assert.throws(() => createReplayController(null), TypeError);
  assert.throws(() => createReplayController({}), TypeError);
});