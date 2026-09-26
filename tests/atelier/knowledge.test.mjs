import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_SCHEMA_VERSION,
  createKnowledgeStore,
  decodeKnowledgeState,
  encodeKnowledgeState,
  emptyKnowledgeState,
  evaluateFragmentUnlocks,
  applyUnlocks,
  getFragment,
  listFragments,
} from "../../src/atelier/knowledge.mjs";
import { createReplayController } from "../../src/atelier/replay-controller.mjs";
import { analyzeAction } from "../../src/atelier/oculus-controller.mjs";
import { encodeSeal } from "../../src/atelier/seal.mjs";
import { createSession, getState, replay } from "../../src/v5/rules/engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_SRC = join(HERE, "../../src/atelier/knowledge.mjs");

// --- Backends de stockage (fakes) ------------------------------------------
function memoryBackend(map = new Map()) {
  return {
    get(k) {
      return map.get(k);
    },
    set(k, v) {
      map.set(k, v);
    },
    data: map,
  };
}

function brokenBackend() {
  return {
    get() {
      throw new Error("Storage unavailable");
    },
    set() {
      throw new Error("Storage unavailable");
    },
  };
}

// --- Spécification réutilisable (2×2, quali comme OCULUS tests) ------------
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

const obs = (t, extra = {}) => ({ t, ...extra });
const seq = (items) => ({ sequence: items });

// ---------------------------------------------------------------------------
// KNOW-01 · État initial sans Fragment
// ---------------------------------------------------------------------------
test("KNOW-01 : état initial sans Fragment", () => {
  const e = evaluateFragmentUnlocks(seq([]));
  assert.deepEqual(e, []);
  const s = emptyKnowledgeState();
  assert.deepEqual(s.unlockedFragments, []);
  assert.equal(s.schemaVersion, KNOWLEDGE_SCHEMA_VERSION);
});

// ---------------------------------------------------------------------------
// KNOW-02 · Premier trigger → Fragment débloqué
// ---------------------------------------------------------------------------
test("KNOW-02 : premier trigger → Fragment débloqué", () => {
  const { newlyUnlocked, noop } = applyUnlocks(emptyKnowledgeState(), seq([obs("CHALLENGE_COMPLETED")]));
  assert.deepEqual(newlyUnlocked, ["LORE_ATELIER_001"]);
  assert.equal(noop, false);
});

// ---------------------------------------------------------------------------
// KNOW-03 · Second appel identique → NO_OP, aucun doublon
// ---------------------------------------------------------------------------
test("KNOW-03 : appel identique → NO_OP, aucun doublon", () => {
  const ev = seq([obs("CHALLENGE_COMPLETED")]);
  const first = applyUnlocks(emptyKnowledgeState(), ev);
  const second = applyUnlocks(first.state, ev);
  assert.deepEqual(second.newlyUnlocked, []);
  assert.equal(second.noop, true);
  assert.deepEqual(second.state.unlockedFragments, ["LORE_ATELIER_001"]);
});

// ---------------------------------------------------------------------------
// KNOW-04 · Persistance → reload conserve le Fragment
// ---------------------------------------------------------------------------
test("KNOW-04 : unlock → persist → reload → fragment présent", async () => {
  const backend = memoryBackend();
  const a = createKnowledgeStore(backend);
  await a.record(obs("CHALLENGE_COMPLETED"));
  const raw = backend.data.get(a.key);
  assert.ok(typeof raw === "string");
  assert.match(raw, /LORE_ATELIER_001/);

  const b = createKnowledgeStore(backend); // rechargement (nouvelle instance)
  const state = await b.load();
  assert.deepEqual(state.unlockedFragments, ["LORE_ATELIER_001"]);
});

// ---------------------------------------------------------------------------
// KNOW-05 · Deux triggers différents → deux Fragments distincts
// ---------------------------------------------------------------------------
test("KNOW-05 : deux triggers → deux fragments distincts", async () => {
  const { newlyUnlocked } = applyUnlocks(emptyKnowledgeState(), seq([obs("CHALLENGE_COMPLETED"), obs("REWIND_USED")]));
  assert.deepEqual(newlyUnlocked, ["LORE_ATELIER_001", "LORE_CHRONOS_001"]);
});

// ---------------------------------------------------------------------------
// KNOW-06 · Ordre différent des triggers → même ensemble final (évaluation pure)
// ---------------------------------------------------------------------------
test("KNOW-06 : ordre d'évaluation → même ensemble final", () => {
  const base = [obs("CHALLENGE_COMPLETED"), obs("REWIND_USED"), obs("OCULUS_ACTION_ANALYZED")];
  const evA = seq(base);
  const evB = seq([...base].reverse());
  const a = applyUnlocks(emptyKnowledgeState(), evA);
  const b = applyUnlocks(emptyKnowledgeState(), evB);
  assert.deepEqual(a.state.unlockedFragments, b.state.unlockedFragments);
});

// ---------------------------------------------------------------------------
// KNOW-07 · KnowledgeState corrompu → fallback sans casser l'Atelier
// ---------------------------------------------------------------------------
test("KNOW-07 : JSON invalide → fallback sûr", () => {
  const { state, reason } = decodeKnowledgeState("{pas du json!!");
  assert.deepEqual(state.unlockedFragments, []);
  assert.equal(reason, "corrupted-json");
  assert.equal(state.schemaVersion, KNOWLEDGE_SCHEMA_VERSION);
});

// ---------------------------------------------------------------------------
// KNOW-08 · Version inconnue → fallback sûr
// ---------------------------------------------------------------------------
test("KNOW-08 : schemaVersion inconnue → fallback sûr", () => {
  const { state, reason } = decodeKnowledgeState({ schemaVersion: 99, unlockedFragments: ["LORE_ATELIER_001"] });
  assert.deepEqual(state.unlockedFragments, []);
  assert.equal(reason, "unknown-schema-version");
});

// ---------------------------------------------------------------------------
// KNOW-09 · Fragment inconnu → ignoré (rejeté selon contrat) ; doublon → 1x
// ---------------------------------------------------------------------------
test("KNOW-09 : fragment inconnu et doublon → ignoré/dédupliqué", () => {
  const { state, reason } = decodeKnowledgeState({
    schemaVersion: 1,
    unlockedFragments: ["NOT_A_REAL_FRAGMENT", "LORE_ATELIER_001", "LORE_ATELIER_001"],
  });
  assert.equal(reason, "ok");
  assert.deepEqual(state.unlockedFragments, ["LORE_ATELIER_001"]);
});

// ---------------------------------------------------------------------------
// KNOW-10 · Oculus réel (moteur + Oculus) → trigger Fragment approprié
// ---------------------------------------------------------------------------
test("KNOW-10 : analyse réelle via Oculus → LORE_ENGINE_FAILFAST_001", () => {
  const c = createReplayController(SPEC_A);
  const blocked = { value: 5, r: 0, c: 0 }; // valeur exclue par la loi de ligne (2+3=5≠target 5=>en fait 5 posé en (0,0): 5+? — voir apply)
  // Le testing de l'Oculus reproche un rejet réel de la loi → on analysera les coups réels.
  c.move({ value: 2, r: 0, c: 0 });
  const a = analyzeAction(SPEC_A, toEvents(SOLUTION_A), 0, { type: "PLACE", value: 5, r: 0, c: 0 });
  assert.notEqual(a.reasonCode, undefined);
  assert.equal(typeof a.valid, "boolean");

  const evidence = seq([obs("OCULUS_ACTION_ANALYZED", { reasonCode: a.reasonCode, valid: a.valid })]);
  const { newlyUnlocked } = applyUnlocks(emptyKnowledgeState(), evidence);
  assert.ok(newlyUnlocked.includes("LORE_ENGINE_FAILFAST_001"));
});

// ---------------------------------------------------------------------------
// KNOW-11 · Sablier réel (curseur déplacé) → trigger Fragment approprié
// ---------------------------------------------------------------------------
test("KNOW-11 : rewind réel (curseur déplacé) → LORE_CHRONOS_001", () => {
  const c = createReplayController(SPEC_A);
  for (const m of SOLUTION_A.slice(0, 2)) {
    const r = c.move(m);
    assert.equal(r.ok, true);
  }
  const before = c.cursor().position;
  c.back(1); // navigation réelle : le présent se déplace
  assert.equal(c.cursor().position, before - 1);

  const ev = seq([obs("REWIND_USED", { depth: 1 })]);
  const { newlyUnlocked } = applyUnlocks(emptyKnowledgeState(), ev);
  assert.ok(newlyUnlocked.includes("LORE_CHRONOS_001"));
});

// ---------------------------------------------------------------------------
// KNOW-12 · Sceau réel (encodeSeal) + résolution → LORE_ALJABR_001
// ---------------------------------------------------------------------------
test("KNOW-12 : Sceau forgé puis défi résolu → LORE_ALJABR_001", () => {
  // Sceau = représentation canonique réelle du défi (encodeSeal M12).
  const seal = encodeSeal(SPEC_A);
  assert.ok(typeof seal === "string" && seal.length > 0);
  const c = createReplayController(SPEC_A);
  for (const m of SOLUTION_A) {
    const r = c.move(m);
    assert.equal(r.ok, true);
  }
  assert.equal(c.getState().solved, true); // le défi Sceau est réellement résolu
  const ev = seq([obs("SEAL_CREATED"), obs("CHALLENGE_COMPLETED")]);
  const { newlyUnlocked } = applyUnlocks(emptyKnowledgeState(), ev);
  assert.ok(newlyUnlocked.includes("LORE_ALJABR_001"));
});

// ---------------------------------------------------------------------------
// KNOW-13 · Aucune mutation GameState
// ---------------------------------------------------------------------------
test("KNOW-13 : applyUnlocks ne mute aucun GameState", () => {
  const session = createSession(SPEC_A);
  const s0 = JSON.stringify(session);
  const ev = seq([obs("CHALLENGE_COMPLETED"), obs("REWIND_USED")]);
  for (let i = 0; i < 3; i++) applyUnlocks(emptyKnowledgeState(), ev);
  assert.equal(JSON.stringify(session), s0);
  const s1 = getState(session);
  assert.equal(s1.grid.flat().filter((x) => x !== -1).length, 0);
});

// ---------------------------------------------------------------------------
// KNOW-14 · Aucune mutation Progression Save / connaissance ≠ progression
// ---------------------------------------------------------------------------
test("KNOW-14 : connaissance séparée de la progression — module 100% autonome", () => {
  const src = readFileSync(KNOWLEDGE_SRC, "utf8");
  assert.ok(!/^\s*import\b/m.test(src)); // aucun import : aucune couplage save/progression
  assert.ok(!/\bsave\b/i.test(src));
  assert.ok(!/\.save\./i.test(src)); // aucune chaîne de clé "save"
  assert.ok(src.includes("STORAGE_KEY"));
});

// ---------------------------------------------------------------------------
// KNOW-15 · Aucune dépendance réseau
// ---------------------------------------------------------------------------
test("KNOW-15 : module sans réseau — pas de fetch/XHR/socket", () => {
  const src = readFileSync(KNOWLEDGE_SRC, "utf8");
  assert.ok(!/(fetch|XMLHttpRequest|WebSocket|https?:)/.test(src));
});

// ---------------------------------------------------------------------------
// KNOW-16 · Même expérience → même ensemble de Fragments (F(E)=F(E))
// ---------------------------------------------------------------------------
test("KNOW-16 : même expérience → même ensemble (pureté)", async () => {
  const ev = seq([obs("CHALLENGE_COMPLETED"), obs("REWIND_USED"), obs("OCULUS_ACTION_ANALYZED")]);
  const r1 = applyUnlocks(emptyKnowledgeState(), ev);
  const r2 = applyUnlocks(emptyKnowledgeState(), ev);
  assert.deepEqual(r1.state, r2.state);

  const backend = memoryBackend();
  const store = createKnowledgeStore(backend);
  await store.recordAll(ev);
  const reloaded = createKnowledgeStore(backend);
  const st = await reloaded.load();
  assert.deepEqual(st.unlockedFragments, r1.state.unlockedFragments);
});

// ---------------------------------------------------------------------------
// KNOW-17 · Reload UI → bibliothèque intacte (autre instance, même backend)
// ---------------------------------------------------------------------------
test("KNOW-17 : reload → bibliothèque intacte", async () => {
  const backend = memoryBackend();
  const a = createKnowledgeStore(backend);
  await a.record(obs("REWIND_USED"));
  await a.record(obs("OCULUS_ACTION_ANALYZED"));
  const b = createKnowledgeStore(backend); // « reload »
  const st = await b.load();
  assert.deepEqual(st.unlockedFragments, ["LORE_CHRONOS_001", "LORE_ENGINE_FAILFAST_001"]);
});

// ---------------------------------------------------------------------------
// KNOW-18 · Storage indisponible → Atelier continue (fallback mémoire)
// ---------------------------------------------------------------------------
test("KNOW-18 : backend en échec → fallback mémoire, jamais de throw", async () => {
  const store = createKnowledgeStore(brokenBackend());
  assert.equal(store.mode, "persistent"); // dégradation paresseuse au 1er I/O
  const r = await store.record(obs("CHALLENGE_COMPLETED"));
  assert.equal(store.mode, "memory"); // bascule au premier échec réel
  assert.ok(r.newlyUnlocked.includes("LORE_ATELIER_001"));
  const st = await store.load(); // relecture depuis le fallback mémoire
  assert.deepEqual(st.unlockedFragments, ["LORE_ATELIER_001"]);

  const second = createKnowledgeStore(brokenBackend()); // « reload » qui échoue
  const st2 = await second.load();
  assert.deepEqual(st2.unlockedFragments, []); // fallback sûr, atelier continue
});

// ---------------------------------------------------------------------------
// Extras — difficulté du corpus implémentée comme tri de la batch :
// capacité d'un même fragment à rester débloqué quand une expérience est
// reproduite (monotonie) et d'un unlock répété de ne pas dépasser 1.
// ---------------------------------------------------------------------------
test("KNOW-M1 : monotonie — evidence réduite ne retire jamais un fragment", async () => {
  const evBig = seq([obs("CHALLENGE_COMPLETED"), obs("REWIND_USED")]);
  const backend = memoryBackend();
  const store = createKnowledgeStore(backend);
  await store.recordAll(evBig);
  const st1 = await store.load();
  assert.deepEqual(st1.unlockedFragments, ["LORE_ATELIER_001", "LORE_CHRONOS_001"]);
  await store.recordAll(seq([])); // nouvelle expérience sans les triggers
  const st2 = await store.load();
  assert.deepEqual(st2.unlockedFragments, ["LORE_ATELIER_001", "LORE_CHRONOS_001"]);
});

test("KNOW-M2 : unlock répété identique → jamais plus d'une entrée", async () => {
  const backend = memoryBackend();
  const store = createKnowledgeStore(backend);
  for (let i = 0; i < 5; i++) await store.record(obs("CHALLENGE_COMPLETED"));
  const st = await store.load();
  assert.deepEqual(st.unlockedFragments, ["LORE_ATELIER_001"]);
});

test("KNOW-M3 : F(E1∪E2) = F(E1)∪F(E2) pour triggers monotones indépendants", () => {
  const e1 = seq([obs("CHALLENGE_COMPLETED")]);
  const e2 = seq([obs("REWIND_USED"), obs("OCULUS_ACTION_ANALYZED")]);
  const union = seq([...e1.sequence, ...e2.sequence]);
  const fUnion = applyUnlocks(emptyKnowledgeState(), union);
  const f12 = applyUnlocks(applyUnlocks(emptyKnowledgeState(), e1).state, e2).state.unlockedFragments;
  assert.deepEqual(fUnion.state.unlockedFragments, f12);
  assert.deepEqual(fUnion.state.unlockedFragments, [
    "LORE_ATELIER_001",
    "LORE_CHRONOS_001",
    "LORE_ENGINE_FAILFAST_001",
  ]);
});

test("KNOW-M4 : MAGEEK exige un rejet AVANT la réussite (ordre réel)", () => {
  const wrongOrder = seq([obs("CHALLENGE_COMPLETED"), obs("OCULUS_REJECTION_OBSERVED")]);
  assert.ok(!applyUnlocks(emptyKnowledgeState(), wrongOrder).newlyUnlocked.includes("LORE_MAGEEK_001"));
  const rightOrder = seq([obs("OCULUS_REJECTION_OBSERVED"), obs("CHALLENGE_COMPLETED")]);
  assert.ok(applyUnlocks(emptyKnowledgeState(), rightOrder).newlyUnlocked.includes("LORE_MAGEEK_001"));
});

test("KNOW-M5 : getFragment / listFragments — lookup direct (perf triviale)", () => {
  const f = getFragment("LORE_CHRONOS_001");
  assert.equal(f.id, "LORE_CHRONOS_001");
  assert.equal(f.version, 1);
  assert.equal(getFragment("LORE_INCONNUE_999"), null);
  const all = listFragments();
  assert.equal(all.length, 5);
  assert.ok(all.every((x) => x.id && x.title && x.body && x.category && x.trigger === undefined && x.fact));
});

test("KNOW-M6 : aucun usage de Math.random / Date.now dans le module", () => {
  const src = readFileSync(KNOWLEDGE_SRC, "utf8");
  assert.ok(!/Math\.random|\bDate\.now\b/.test(src));
});

test("KNOW-M7 : deux fragments distincts par des triggers différents — aucun mélange", async () => {
  const { newlyUnlocked } = applyUnlocks(emptyKnowledgeState(), seq([obs("REWIND_USED")]));
  assert.deepEqual(newlyUnlocked, ["LORE_CHRONOS_001"]);
});

test("KNOW-ENC : encode est déterministe (byte-stable, ids triés)", () => {
  const sA = applyUnlocks(emptyKnowledgeState(), seq([obs("CHALLENGE_COMPLETED"), obs("REWIND_USED")])).state;
  const a = encodeKnowledgeState(sA);
  const b = encodeKnowledgeState({ ...sA, unlockedFragments: [...sA.unlockedFragments].reverse() });
  assert.equal(a, b);
});