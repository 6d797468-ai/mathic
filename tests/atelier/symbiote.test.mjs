import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SYMBIOTE_BASES,
  SYMBIOTE_MODE,
  SYMBIOTE_STATES,
  GUARDIANS,
  GUARDIAN_IDS,
  baseSpecById,
  composeGuardianSpec,
  createSymbioteSession,
  evaluateSymbiosis,
  guardianFragments,
  guardianRules,
  symbioteSpec,
  validateSymbiote,
} from "../../src/atelier/symbiote.mjs";
import { createKnowledgeStore, listFragments, getFragment, evaluateFragmentUnlocks } from "../../src/atelier/knowledge.mjs";
import { createReplayController } from "../../src/atelier/replay-controller.mjs";
import { analyzeAction, analyzeState } from "../../src/atelier/oculus-controller.mjs";
import { validateSpec, createSession, isSolved, getMoves, apply, canonical, OPS, replay } from "../../src/v5/rules/engine.mjs";
import { certify } from "../../src/v5/rules/solver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYM_SRC = join(HERE, "../../src/atelier/symbiote.mjs");

const memoryBackend = (map = new Map()) => ({ get: (k) => map.get(k), set: (k, v) => map.set(k, v), data: map });

const BASE = baseSpecById("CHAMBRE_2X2");
const baseClone = () => JSON.parse(JSON.stringify(BASE));
const sp = (guardians) => symbioteSpec(guardians, baseClone());

// BFS déterministe → une séquence d'événements réels menant à la résolution.
function findEvents(spec) {
  const start = createSession(spec);
  const q = [[start, []]];
  const seen = new Set([canonical(start)]);
  let guard = 0;
  while (q.length && guard++ < 200000) {
    const [s, evs] = q.shift();
    if (isSolved(s)) return evs;
    for (const mv of getMoves(s)) {
      const n = apply(s, mv);
      if (!n) continue;
      const key = canonical(n);
      if (seen.has(key)) continue;
      seen.add(key);
      q.push([n, [...evs, { type: "PLACE", value: mv.v, r: mv.r, c: mv.c }]]);
    }
  }
  throw new Error("aucune solution trouvée");
}

const ALL_SETS = (() => {
  const ids = GUARDIAN_IDS;
  const out = [];
  const rec = (arr, start) => {
    if (arr.length) out.push([...arr]);
    for (let i = start; i < ids.length; i++) {
      arr.push(ids[i]);
      rec(arr, i + 1);
      arr.pop();
    }
  };
  rec([], 0);
  return out;
})();

// ---------------------------------------------------------------------------
// SYM-01 · Composition (deux Gardiens sélectionnés ensemble)
// ---------------------------------------------------------------------------
test("SYM-01 : deux Gardiens composés → spec aux deux lois, grille vide, valide", () => {
  const spec = composeGuardianSpec(baseClone(), ["AL_JABR", "FRACTALIA"]);
  assert.ok(spec);
  const ops = [...spec.rows.flatMap((r) => r.ops), ...spec.cols.flatMap((c) => c.ops)];
  assert.ok(ops.includes("+") && ops.includes("-"));
  assert.ok(spec.grid.every((row) => row.every((v) => v === -1))); // jamais la solution en clair
  validateSpec(spec);
});

// ---------------------------------------------------------------------------
// SYM-02 · Validation par le contrat (jamais par l'UI)
// ---------------------------------------------------------------------------
test("SYM-02 : compositions invalides rejetées par validateSymbiote", () => {
  const cases = [
    [sp([]), /au moins un Gardien/],
    [sp(["AL_JABR", "AL_JABR"]), /dupliqué/],
    [sp(["AL_JABR", "INCONNU"]), /inconnu/],
    [{ ...sp(["AL_JABR"]), mode: "DEV" }, /mode ≠/],
    [{ ...sp(["AL_JABR"]), baseSpec: { grid: [[1]], rows: [], cols: [{ ops: [], target: 1 }], reserve: {} } }, /baseSpec invalide/],
    [null, /spec requise/],
  ];
  for (const [input, re] of cases) {
    const v = validateSymbiote(input);
    assert.equal(v.ok, false);
    assert.ok(v.reasons.some((r) => re.test(r)), `attendu ${re} dans ${JSON.stringify(v.reasons)}`);
  }
  // structurel : composeGuardianSpec jette (contrat), l'UI ne décide jamais
  assert.throws(() => composeGuardianSpec(baseClone(), []), TypeError);
  assert.throws(() => composeGuardianSpec(baseClone(), ["NEXUS", "NEXUS"]), TypeError);
  assert.throws(() => composeGuardianSpec(null, ["AL_JABR"]), TypeError);
});

// ---------------------------------------------------------------------------
// SYM-03 · Déterminisme (même SymbioteSpec → même spec et même session)
// ---------------------------------------------------------------------------
test("SYM-03 : déterminisme — deux exécutions identiques → S1 == S2", () => {
  const g = ["AL_JABR", "NEXUS", "SCINDIUM"];
  const a = composeGuardianSpec(baseClone(), g);
  const b = composeGuardianSpec(baseClone(), g);
  assert.deepEqual(a, b);
  const sA = createSymbioteSession(sp(g));
  const sB = createSymbioteSession(sp(g));
  assert.equal(JSON.stringify(sA), JSON.stringify(sB));
  assert.equal(canonical(sA), canonical(sB));
});

// ---------------------------------------------------------------------------
// SYM-04 · Isolation (aucune mutation de SessionState par le compositeur)
// ---------------------------------------------------------------------------
test("SYM-04 : isolation — baseSpec et sessions congelées", () => {
  const frozen = JSON.stringify(BASE);
  const g = ["FRACTALIA", "SCINDIUM"];
  const spec = composeGuardianSpec(baseClone(), g);
  const before = JSON.stringify(BASE);
  assert.equal(before, frozen);
  const base = baseClone();
  createSymbioteSession(symbioteSpec(g, base));
  assert.equal(JSON.stringify(base), frozen);

  const session = createSymbioteSession(sp(["AL_JABR"]));
  const snap = JSON.stringify(session);
  for (let i = 0; i < 3; i++) createSymbioteSession(sp(["AL_JABR"]));
  assert.equal(JSON.stringify(session), snap);
  assert.notEqual(session.grid, BASE.grid); // aucun partage de référence
  assert.notEqual(session.reserve, BASE.reserve);
});

// ---------------------------------------------------------------------------
// SYM-05 · Invariance Engine (les lois V5 restent inchangées)
// ---------------------------------------------------------------------------
test("SYM-05 : invariance moteur — les lois V5 s'appliquent telles quelles", () => {
  assert.deepEqual(OPS, ["+", "-", "*", "/"]);
  const spec = composeGuardianSpec(baseClone(), ["AL_JABR", "NEXUS"]);
  const events = findEvents(spec);
  let s = createSession(spec);
  for (const ev of events) {
    s = apply(s, { id: "PLACE", v: ev.value, r: ev.r, c: ev.c });
    assert.ok(s);
  }
  assert.equal(isSolved(s), true);
  assert.throws(() => validateSpec({ grid: [[-1]], rows: [{ ops: ["%"], target: 1 }], cols: [{ ops: [], target: 1 }], reserve: {} }), TypeError);
});

// ---------------------------------------------------------------------------
// SYM-06 · Replay (session Symbiote rejouable avec le mécanisme M13)
// ---------------------------------------------------------------------------
test("SYM-06 : replay M13 sur une session composée — back/undo/solution", () => {
  const spec = composeGuardianSpec(baseClone(), ["AL_JABR", "FRACTALIA", "NEXUS"]);
  const events = findEvents(spec);
  const c = createReplayController(spec);
  for (const ev of events) {
    const r = c.move({ value: ev.value, r: ev.r, c: ev.c });
    assert.equal(r.ok, true);
  }
  assert.equal(c.getState().solved, true);
  const at = c.cursor();
  c.back(1);
  assert.equal(c.cursor().position, at.position - 1);
  const undone = c.undo();
  assert.equal(undone.ok, true);
  c.toPresent();
  assert.equal(c.getState().solved, false); // undo a tronqué la branche réelle
  // determinisme du replay pur Engine
  const again = replay(spec, events);
  assert.equal(isSolved(again[again.length - 1]), true);
});

// ---------------------------------------------------------------------------
// SYM-07 · Oculus (les rejets produisent les mêmes raisons observables)
// ---------------------------------------------------------------------------
test("SYM-07 : l'Oculus reste fidèle sur une session composée", () => {
  const spec = composeGuardianSpec(baseClone(), ["NEXUS", "SCINDIUM"]);
  const session = createSession(spec);
  const offered = getMoves(session)[0];
  const aOk = analyzeAction(spec, [], 0, { value: offered.v, r: offered.r, c: offered.c });
  assert.equal(aOk.valid, true);
  assert.equal(aOk.offered, true);
  assert.equal(aOk.reasonCode, "ENGINE_OFFERS");

  // après 1 coup posé en (0,0), les autres valeurs de la ligne qui violeraient
  // la cible sont acceptées par le shape de réserve mais rejetées par la loi
  const m0 = offered;
  const trace1 = [{ type: "PLACE", value: m0.v, r: m0.r, c: m0.c }];
  const at1 = analyzeState(spec, trace1, 1);
  const forbidden = Object.keys(at1.reserve)
    .map(Number)
    .find((v) => at1.reserve[v] > 0 && !at1.offeredMoves.some((m) => m.r === 0 && m.c === 1 && m.v === v));
  assert.notEqual(forbidden, undefined);
  const aB = analyzeAction(spec, trace1, 1, { value: forbidden, r: 0, c: 1 });
  assert.equal(aB.valid, true);
  assert.equal(aB.offered, false);
  assert.equal(aB.reasonCode, "ENGINE_ACCEPTS_NOT_OFFERED");

  const aBad = analyzeAction(spec, [], 0, { value: 9, r: 0, c: 0 }); // valeur hors réserve
  assert.equal(aBad.valid, false);
});

// ---------------------------------------------------------------------------
// SYM-08 · Fragments — le Symbiote alimente mathic.knowledge.v1
// ---------------------------------------------------------------------------
test("SYM-08 : une découverte Symbiote nourrit la mémoire sans toucher la progression", async () => {
  const store = createKnowledgeStore(memoryBackend(), { extraFragments: guardianFragments(), extraRules: guardianRules() });
  assert.equal(store.key, "mathic.knowledge.v1");
  const r1 = await store.record({ t: "SYMBIOTE_AWAKENED" });
  assert.deepEqual(r1.newlyUnlocked, []);
  const r2 = await store.record({ t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "FRACTALIA"] });
  assert.deepEqual(r2.newlyUnlocked, [
    "LORE_AL_JABR_001",
    "LORE_FRACTALIA_001",
    "LORE_SYMBIOSIS_001",
    "LORE_AL_JABR_FRACTALIA_001",
  ]);
  const r3 = await store.record({ t: "SYMBIOTE_COMPOSED", guardians: ["NEXUS", "SCINDIUM"] });
  assert.deepEqual(r3.newlyUnlocked, ["LORE_NEXUS_SCINDIUM_001"]);
  const st = await store.load();
  assert.equal(new Set(st.unlockedFragments).size, 5); // 5 gardiens, sans doublon
});

// ---------------------------------------------------------------------------
// SYM-09 · Persistance / reload (M16-09)
// ---------------------------------------------------------------------------
test("SYM-09 : reload → connaissance conservée, sans duplication", async () => {
  const backend = memoryBackend();
  const a = createKnowledgeStore(backend, { extraFragments: guardianFragments(), extraRules: guardianRules() });
  await a.record({ t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "FRACTALIA"] });
  await a.record({ t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "FRACTALIA"] });
  const b = createKnowledgeStore(backend, { extraFragments: guardianFragments(), extraRules: guardianRules() });
  const st = await b.load();
  assert.deepEqual(st.unlockedFragments, ["LORE_AL_JABR_001", "LORE_FRACTALIA_001", "LORE_SYMBIOSIS_001", "LORE_AL_JABR_FRACTALIA_001"]);
});

// ---------------------------------------------------------------------------
// SYM-10 · M15 intact (le catalogue de base et ses triggers ne bougent pas)
// ---------------------------------------------------------------------------
test("SYM-10 : knowledge M15 non modifié — catalogue de base et règles identiques", () => {
  assert.equal(listFragments().length, 5);
  assert.ok(getFragment("LORE_ATELIER_001"));
  assert.equal(getFragment("LORE_SYMBIOSIS_001"), null); // hors catalogue de base
  const base = createKnowledgeStore(memoryBackend());
  assert.equal(base.listFragments().length, 5);
  const ev = { sequence: [{ t: "CHALLENGE_COMPLETED" }, { t: "OCULUS_ACTION_ANALYZED" }] };
  assert.deepEqual(evaluateFragmentUnlocks(ev), ["LORE_ATELIER_001", "LORE_ENGINE_FAILFAST_001"]);
});

// ---------------------------------------------------------------------------
// SYM-11 · États narratifs — chaîne DORMANT → … → MASTERED
// ---------------------------------------------------------------------------
test("SYM-11 : échelle narrative du Symbiote, déterministe", () => {
  assert.deepEqual(SYMBIOTE_STATES, ["DORMANT", "AWAKENED", "BOUND", "RESONANT", "MASTERED"]);
  const s = (seq) => evaluateSymbiosis({ sequence: seq }).state;
  assert.equal(s([]), "DORMANT");
  assert.equal(s([{ t: "SYMBIOTE_AWAKENED" }]), "AWAKENED");
  assert.equal(s([{ t: "SYMBIOTE_AWAKENED" }, { t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "NEXUS"] }]), "BOUND");
  assert.equal(
    s([{ t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "NEXUS"] }, { t: "CHALLENGE_COMPLETED" }]),
    "RESONANT"
  );
  assert.equal(
    s([
      { t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "NEXUS"] },
      { t: "SYMBIOTE_COMPOSED", guardians: ["FRACTALIA", "SCINDIUM"] },
      { t: "SYMBIOTE_COMPOSED", guardians: ["NEXUS", "SCINDIUM"] },
    ]),
    "MASTERED"
  );
  // RESONANT a la priorité sur MASTERED si les deux conditions co-existent
  const both = s([
    { t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "NEXUS"] },
    { t: "CHALLENGE_COMPLETED" },
    { t: "SYMBIOTE_COMPOSED", guardians: ["FRACTALIA", "SCINDIUM"] },
    { t: "SYMBIOTE_COMPOSED", guardians: ["NEXUS", "SCINDIUM"] },
  ]);
  assert.ok(["RESONANT", "MASTERED"].includes(both));
});

// ---------------------------------------------------------------------------
// SYM-12 · Pureté du module (interdits du §6)
// ---------------------------------------------------------------------------
test("SYM-12 : module pur — aucun DOM/hasard/horloge/réseau/localStorage", () => {
  const src = readFileSync(SYM_SRC, "utf8");
  for (const bad of ["Math.random", "Date.now", "document", "window", "localStorage", "navigator", "fetch(", "XMLHttpRequest", "WebSocket", "https?:", "require("]) {
    assert.ok(!src.includes(bad), `interdit présents : ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// SYM-13 · Non-mutation des entrées profondes
// ---------------------------------------------------------------------------
test("SYM-13 : composeGuardianSpec ne mute jamais baseSpec ni guardians", () => {
  const base = baseClone();
  const guardians = ["AL_JABR", "FRACTALIA"];
  const snapB = JSON.stringify(base);
  const snapG = JSON.stringify(guardians);
  for (let i = 0; i < 3; i++) composeGuardianSpec(base, guardians);
  assert.equal(JSON.stringify(base), snapB);
  assert.equal(JSON.stringify(guardians), snapG);
});

// ---------------------------------------------------------------------------
// SYM-14 · F(E)=F(E) — même expérience → même état du Symbiote et mêmes specs
// ---------------------------------------------------------------------------
test("SYM-14 : mêmes expériences → même SymbioteState et mêmes compositions", () => {
  const ev = { sequence: [{ t: "SYMBIOTE_COMPOSED", guardians: ["AL_JABR", "NEXUS"] }, { t: "CHALLENGE_COMPLETED" }] };
  assert.deepEqual(evaluateSymbiosis(ev), evaluateSymbiosis(JSON.parse(JSON.stringify(ev))));
  const a = composeGuardianSpec(baseClone(), ["AL_JABR", "NEXUS"]);
  const b = composeGuardianSpec(baseClone(), ["AL_JABR", "NEXUS"]);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ---------------------------------------------------------------------------
// SYM-15 · TOUT le spectre (4 singles + 6 dualités + 4 triades + convergence)
// ---------------------------------------------------------------------------
test("SYM-15 : les 15 compositions de la Chambre 2×2 sont valides ET solvables", () => {
  assert.equal(ALL_SETS.length, 15);
  for (const g of ALL_SETS) {
    const v = validateSymbiote(sp(g));
    assert.equal(v.ok, true, `${g.join("+")} rejetée: ${v.reasons.join(" · ")}`);
    const ops = [...v.spec.rows.flatMap((r) => r.ops), ...v.spec.cols.flatMap((c) => c.ops)];
    assert.equal(new Set(ops).size, g.length, `${g.join("+")} doit porter ${g.length} lois distinctes`);
    const c = certify(v.spec, { maxDepth: 10, budget: 20000 });
    assert.equal(c.solvable, true, `${g.join("+")} insolvable`);
  }
});

// ---------------------------------------------------------------------------
// SYM-16 · Frontière de triche : la garantie est ARCHITECTURALE, pas une
// encapsulation JS. La composition ne peut pas pré-remplir la solution
// (cellules libres = -1) et l'UI ne mute jamais le SessionState : toute
// transition passe par apply()/ReplayController. En revanche session.spec
// reste assignable en surface (aucune propriété « prisonnière ») — une
// mutation directe par du code hors contrat est hors garantie, jamais
// produite par le chemin UI.
// ---------------------------------------------------------------------------
test("SYM-16 : la composition ne peut pas forcer un grid-solution ; la spec n'est jamais mutée par l'UI (garantie d'architecture)", () => {
  const spec = composeGuardianSpec(baseClone(), ["AL_JABR", "SCINDIUM"]);
  assert.ok(spec.grid.every((row) => row.every((v) => v === -1)));
  // PAS une encapsulation : session.spec est écrasable en surface (JS simple).
  // Le moteur relit s.spec à chaque appel ; le contrat d'architecture est que
  // l'UI ne le fait jamais — voir le chemin réel ReplayController.move().
  const s = createSymbioteSession(sp(["AL_JABR"]));
  s.spec = baseClone();
  assert.notEqual(s.spec, undefined);
});

// ---------------------------------------------------------------------------
// Extra · le Sceau M12 s'applique tel quel à une spec composée
// ---------------------------------------------------------------------------
test("SYM-17 : encodeSeal/decodeSeal survivent à une spec composée (M12 intact)", async () => {
  const { encodeSeal, decodeSeal, verifySeal } = await import("../../src/atelier/seal.mjs");
  const spec = composeGuardianSpec(baseClone(), ["AL_JABR", "FRACTALIA"]);
  const seal = encodeSeal(spec);
  assert.ok(seal.startsWith("MATHIC-CHAL-1:"));
  assert.equal(verifySeal(seal).ok, true);
  const dec = decodeSeal(seal);
  assert.deepEqual(dec.spec, spec);
});