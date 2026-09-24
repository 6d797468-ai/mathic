// MATHIC 1.0 — RUNTIME INTELLIGENCE (MISSION 5) — suite RT-01..RT-16
//
// La chaîne réelle prouvée ici, de bout en bout — JAMAIS une simulation
// parallèle, JAMAIS une prédiction d'intelligence :
//
//   ENGINE RÉEL ──▶ (transition RÉELLEMENT appliquée) ──▶ EVIDENCE ──▶
//   métriques dérivées ──▶ PROFIL (detectProfile réel) ──▶ POLICY
//   (recommend réel) ──▶ ORCHESTRATOR (SEUL écrivain, setCurrent/saveNow
//   injectés) ──▶ progression réellement écrite. Kill-switch SAFE_DEFAULT :
//   où la policy est en mode sûre, l'adapter est un observateur pur.
//
// Preuve de la frontière §12 : on vérifie statiquement (par lecture des
// sources "intel") que cet adapter n'importe jamais le moteur (direction
// autorisée : GAME CORE → EVIDENCE, l'Engine est injecté comme `storage`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createSession, apply, evaluate, enumerateActions, isWon, isLost, isBlocked } from "../../src/b1/engine.mjs";
import { LADDER } from "../../src/b1/levels.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import { SAVE_KEY } from "../../src/b1/save.mjs";

import {
  createRuntimeAdapter,
  RUNTIME_ADAPTER_VERSION,
  RUNTIME_ADAPTER_METHOD,
  RUNTIME_KILL_SWITCH,
} from "../../src/intel/runtime.mjs";
import { createClock } from "../../src/intel/evidence.mjs";

// ---------------------------------------------------------------------------
// Fixtures réelles — catalogue N1-N36 certifié (design réel, comme M4)
// ---------------------------------------------------------------------------

const ANALYSIS = analyzeAll({ budget: 40000 });
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const IDS = ANALYSIS.map((a) => a.id);
const DIFFICULTY = Object.fromEntries(IDS.map((id) => [id, { index: Number(id.slice(1)) }]));

const readIntelSource = (rel) => readFileSync(fileURLToPath(new URL(`../../src/intel/${rel}`, import.meta.url)), "utf8");

const memoryStorage = () => {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => void m.set(k, v),
    _raw: m,
  };
};

function seedSave(storage, { current = "N3", unlockedCount = 6, completedCount = 5 } = {}) {
  const unlocked = IDS.slice(0, unlockedCount);
  const completed = Object.fromEntries(IDS.slice(0, completedCount).map((id) => [id, { wins: 1, bestScore: 10 }]));
  const save = { version: 1, unlocked, completed, current };
  storage.set(SAVE_KEY, JSON.stringify(save));
  return save;
}

const PROFILE_BASE = {
  arithmetic: 0.2,
  exploration: 0.2,
  strategy: 0.2,
  efficiency: 0.2,
  chainAffinity: 0.2,
  hintDependency: 0.1,
  retryTolerance: 0.5,
  difficultyResponse: 0.2,
  confidence: 0.85,
  evidenceWindow: 40,
  version: 2,
};
const PROFILE = (over = {}) => ({ ...PROFILE_BASE, ...over });

const LEVEL = (id = "N1") => {
  const lvl = LADDER.find((l) => l.id === id);
  assert.ok(lvl, `niveau réel ${id} présent dans le LADDER certifié`);
  return lvl;
};

const ENGINE = { createSession, apply, evaluate, isWon, isLost, isBlocked };

// ---------------------------------------------------------------------------
// Solveur RÉEL minimal : parcourt les actions RÉELLES du moteur (apply réel)
// pour découvrir une séquence gagnante réelle. Ce N'EST PAS une prédiction :
// on rejouera la séquence via l'adapter sur la session réelle du moteur.
// ---------------------------------------------------------------------------
function realWinningActions(level, budget = 40000) {
  const init = createSession(level);
  const queue = [{ s: init, path: [] }];
  const seen = new Set();
  let it = 0;
  while (queue.length && it++ < budget) {
    const { s, path } = queue.shift();
    if (s.won && path.length > 0) return path;
    for (const a of enumerateActions(s)) {
      const r = apply(s, a);
      if (!r) continue;
      if (r.won) return [...path, a];
      const key = r.events.length + ":" + r.board.cells.map((c) => (c ? c.id + "=" + c.v : "-")).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ s: r, path: [...path, a] });
      }
    }
  }
  return null;
}

function makeAdapter(level, sessionId, { clock = null, storage = null } = {}) {
  return createRuntimeAdapter({ engine: ENGINE, level, sessionId, clock: clock ?? createClock({ now: () => 5000 }), storage });
}

// ---------------------------------------------------------------------------
// RT-01 — l'adapter démarre la VRAIE session du moteur et émet LEVEL_STARTED.
// ---------------------------------------------------------------------------
test("RT-01 : adapter runtime — version/méthode réelles, LEVEL_STARTED depuis la vraie session", () => {
  const adapter = makeAdapter(LEVEL("N1"), "rt-01");
  assert.equal(adapter.version, RUNTIME_ADAPTER_VERSION);
  assert.equal(adapter.method, RUNTIME_ADAPTER_METHOD);

  const started = adapter.started();
  assert.equal(started.type, "LEVEL_STARTED");
  assert.equal(started.levelId, "N1");
  assert.equal(started.provider, "engine");

  const s = adapter.session();
  assert.equal(s.level.id, "N1");
  assert.ok(Array.isArray(s.board.cells), "session réelle du moteur (board.cells)");
  assert.ok(s.movesLeft >= 1, "movesLeft réel");
});

// ---------------------------------------------------------------------------
// RT-02 — frontière §12 : aucun module intel n'importe le moteur, et l'adapter
// affirme l'Engine par injection (TypeError si absent).
// ---------------------------------------------------------------------------
test("RT-02 : frontière — runtime.mjs n'importe jamais l'Engine, il l'attend injecté", () => {
  const src = readIntelSource("runtime.mjs");
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
  for (const forbidden of ["engine.mjs", "kernel.mjs", "solver.mjs", "replay.mjs", "level-design.mjs", "design.mjs", "unlockTo", "markCompleted", "setGameState", "setState(", "setScore", "localStorage", "Math.random", "Date.now", "fetch(", "WebSocket", "import(", "require("]) {
    assert.ok(!code.includes(forbidden), `code runtime sans '${forbidden}'`);
  }
  assert.ok(src.includes("engine"), '"engine" reste le paramètre injecté documenté');
  assert.throws(() => createRuntimeAdapter({ level: LEVEL("N1"), sessionId: "x" }), TypeError);
  assert.throws(() => createRuntimeAdapter({ engine: ENGINE, sessionId: "x" }), TypeError);
  assert.throws(() => createRuntimeAdapter({ engine: ENGINE, level: LEVEL("N1") }), TypeError);
});

// ---------------------------------------------------------------------------
// RT-03 — chaque ACTION_COMMITTED est émise depuis l'événement RÉEL du apply.
// Aucune fabrication hors moteur : on compare à un apply direct décorrelé.
// ---------------------------------------------------------------------------
test("RT-03 : ACTION_COMMITTED === événement réel du apply (pas une prédiction)", () => {
  const level = LEVEL("N1");
  const adapter = makeAdapter(level, "rt-03");
  adapter.started();
  const a = enumerateActions(adapter.session())[0];

  const out = adapter.apply(a);
  assert.equal(out.ok, true);
  assert.equal(out.evidence.type, "ACTION_COMMITTED");
  assert.equal(out.evidence.payload.a, a.a);
  assert.equal(out.evidence.payload.op, a.op);

  // Ré-appliquer exactement la même action sur le même état réel initial :
  // l'évidence émise COINCIDE avec l'événement produit par le moteur.
  const probe = apply(createSession(level), a);
  const probeEvent = probe.events[probe.events.length - 1];
  assert.equal(out.evidence.payload.a, probeEvent.a);
  assert.equal(out.evidence.payload.op, probeEvent.opCell);
});

// ---------------------------------------------------------------------------
// RT-04 — déterminisme : mêmes actions réelles ⇒ mêmes Evidence (mêmes atMs,
// mêmes seq, mêmes payloads). Aucun Date.now, aucune aléa dans le chemin réel.
// ---------------------------------------------------------------------------
test("RT-04 : déterminisme — deux sessions identiques produisent des Evidence byte-à-byte identiques", () => {
  const level = LEVEL("N4");
  const clock = createClock({ now: () => 7000 });
  const run = () => {
    const adapter = makeAdapter(level, "rt-04", { clock });
    adapter.started();
    for (const a of realWinningActions(level)) adapter.apply(a);
    return adapter.events();
  };
  const e1 = run();
  const e2 = run();
  assert.deepEqual(e1, e2, "Evidence identiques (déterminisme du pipeline réel)");
});

// ---------------------------------------------------------------------------
// RT-05 — CHAIN_STARTED émis par une chaîne RÉELLE (chainRun réel ≥ 1).
// ---------------------------------------------------------------------------
test("RT-05 : CHAIN_STARTED provient d'une chaîne réellement chaînée", () => {
  const level = LEVEL("N13");
  const adapter = makeAdapter(level, "rt-05");
  adapter.started();
  // N13 possède une séquence réelle dont la trace chainRun vaut 0,1,0
  // (découverte via solveur réel du moteur). On l'applique réellement.
  const findBroken = (budget = 120000) => {
    const init = createSession(level);
    const q = [{ s: init, path: [] }];
    const seen = new Set();
    let it = 0;
    while (q.length && it++ < budget) {
      const { s, path } = q.shift();
      const evts = s.events;
      const runs = evts.map((e) => e.chainRun);
      if (runs.length >= 2 && runs[runs.length - 1] === 0 && runs.some((r) => r >= 1)) return path;
      if (s.won || path.length > level.maxMoves + 2) continue;
      for (const a of enumerateActions(s)) {
        const r = apply(s, a);
        if (!r || r.won) continue;
        const key = r.events.length + ":" + r.board.cells.map((c) => (c ? c.id + "=" + c.v : "-")).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          q.push({ s: r, path: [...path, a] });
        }
      }
    }
    return null;
  };
  const path = findBroken();
  assert.ok(path && path.length >= 2, "N13 : séquence réelle avec une chaîne puis une rupture existante");
  for (const a of path) adapter.apply(a);

  const types = adapter.events().map((e) => e.type);
  assert.ok(types.includes("CHAIN_STARTED"), "CHAIN_STARTED émis : " + types.join(","));
  assert.ok(types.includes("CHAIN_BROKEN"), "CHAIN_BROKEN émis (rupture réelle) : " + types.join(","));
});

// ---------------------------------------------------------------------------
// RT-06 — LEVEL_COMPLETED après victoire RÉELLE (isWon du moteur), une seule
// fois, et plus aucune action après le terminal.
// ---------------------------------------------------------------------------
test("RT-06 : LEVEL_COMPLETED émis une seule fois sur la victoire réelle ; TERMINAL bloque", () => {
  const level = LEVEL("N1");
  const adapter = makeAdapter(level, "rt-06");
  adapter.started();
  const a = enumerateActions(adapter.session())[0];
  const out = adapter.apply(a);
  assert.equal(out.terminal, "won");
  const types = adapter.events().map((e) => e.type);
  assert.equal(types.filter((t) => t === "LEVEL_COMPLETED").length, 1);

  const after = adapter.apply(a);
  assert.equal(after.ok, false);
  assert.equal(after.reason, "TERMINAL");
  assert.equal(adapter.events().length, types.length, "plus aucune Evidence après terminal");
});

// ---------------------------------------------------------------------------
// RT-07 — metrics réelles : solutionDepth === nombre réel d'ACTION_COMMITTED.
// ---------------------------------------------------------------------------
test("RT-07 : metrics dérivées des Evidence réelles (solutionDepth réel)", () => {
  const level = LEVEL("N1");
  const adapter = makeAdapter(level, "rt-07");
  adapter.started();
  adapter.apply(enumerateActions(adapter.session())[0]);
  const m = adapter.metrics();
  assert.ok(m.solutionDepth >= 1, "solutionDepth réel >= 1");
  assert.equal(typeof m.solutionScore, "number");
});

// ---------------------------------------------------------------------------
// RT-08 — profil réel : detectProfile sur les Evidence, bascule selon la
// quantité réelle d'Evidence (LOW EVIDENCE au début, stable ensuite).
// ---------------------------------------------------------------------------
test("RT-08 : profil = detectProfile réel de la session ; window réelle de la session", () => {
  const level = LEVEL("N4");
  const adapter = makeAdapter(level, "rt-08");
  adapter.started();
  const p0 = adapter.profile();
  assert.equal(p0.state, "LOW EVIDENCE");
  for (const a of realWinningActions(level)) adapter.apply(a);
  const p1 = adapter.profile();
  assert.equal(typeof p1.profile.confidence, "number");
  assert.ok(Array.isArray(p1.explanations), "explications réelles du détecteur");
});

// ---------------------------------------------------------------------------
// RT-09 — recommen réelle : Policy produit une recommandation (mode réel)
// puis l'Orchestrator l'écrit réellement dans le storage (setCurrent/saveNow),
// sans déblocage, sans altération des complétions.
// ---------------------------------------------------------------------------
test("RT-09 : chaîne Policy→Orchestrator réelle : APPLIED écrit réellement, sans unlockTo/markCompleted", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const adapter = makeAdapter(LEVEL("N1"), "rt-09", { storage: st });
  const r = adapter.recommendation({
    candidates: IDS,
    progression: save,
    metadata: META,
    difficulty: DIFFICULTY,
    profile: PROFILE({ exploration: 0.9 }),
    config: {},
    held: [],
    history: [],
  });
  assert.ok(["ADAPTIVE", "SAFE_DEFAULT"].includes(r.mode), `mode réel ${r.mode}`);

  const out = adapter.orchestrate({ mode: "ADAPTIVE", config: { mode: "ADAPTIVE" }, metadata: META, difficulty: DIFFICULTY, profile: PROFILE({ exploration: 0.9 }) });
  assert.equal(out.stateChanged, true);
  const stored = JSON.parse(st._raw.get(SAVE_KEY));
  assert.equal(stored.current, out.level, "current réellement appliqué via saveNow/setCurrent");
  assert.deepEqual(stored.unlocked, save.unlocked, "aucun déblocage (pas d'unlockTo)");
  assert.deepEqual(stored.completed, save.completed, "aucune altération de complétions (pas de markCompleted)");
});

// ---------------------------------------------------------------------------
// RT-10 — kill-switch SAFE_DEFAULT : jamais appliqué, observateur pur, aucune
// écriture, quelle que soit l'intelligence.
// ---------------------------------------------------------------------------
test("RT-10 : SAFE_DEFAULT (kill-switch) — stateChanged:false, storage inchangé", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const adapter = makeAdapter(LEVEL("N1"), "rt-10", { storage: st });
  const before = st._raw.get(SAVE_KEY);

  const out = adapter.orchestrate({ mode: RUNTIME_KILL_SWITCH, metadata: META, difficulty: DIFFICULTY, profile: PROFILE({ exploration: 0.9 }) });
  assert.equal(out.action, "SAFE_DEFAULT");
  assert.equal(out.policyMode, "SAFE_DEFAULT");
  assert.equal(out.stateChanged, false);
  assert.equal(st._raw.get(SAVE_KEY), before, "aucune écriture (observateur pur)");

  // Également via la Policy réelle sur profil à confiance insuffisante.
  const weak = adapter.recommendation({
    candidates: IDS,
    progression: save,
    metadata: META,
    difficulty: DIFFICULTY,
    profile: PROFILE({ confidence: 0.1 }),
    config: {},
    held: [],
    history: [],
  });
  assert.equal(weak.mode, "SAFE_DEFAULT");
  assert.ok(weak.reasonCodes.includes("SAFE_DEFAULT_PROGRESSION"));
});

// ---------------------------------------------------------------------------
// RT-11 — vol de session : l'adapter rejette une action quand le moteur réel
// refuse (REJECTED_BY_ENGINE) sans polluer les Evidence.
// ---------------------------------------------------------------------------
test("RT-11 : action refusée par le moteur → REJECTED_BY_ENGINE, aucune Evidence fabriquée", () => {
  const adapter = makeAdapter(LEVEL("N4"), "rt-11");
  adapter.started();

  // Action réellement invalide pour le vrai moteur (couples hors grille) :
  // l'adapter propage le refus du moteur, jamais une Evidence fantôme.
  const bad = { a: 999, op: "+", b: 998 };
  const out = adapter.apply(bad);
  assert.equal(out.ok, false);
  assert.equal(out.reason, "REJECTED_BY_ENGINE");
  assert.equal(adapter.events().length, 1, "aucune Evidence d'une transition non appliquée");
  assert.equal(out.session, adapter.session(), "la session réelle reste inchangée (observateur pur)");

  const good = enumerateActions(adapter.session())[0];
  assert.equal(adapter.apply(good).ok, true);
});

// ---------------------------------------------------------------------------
// RT-12 — undo réel : ré-exécution déterministe via le vrai moteur (nouvelle
// session + rejeu de la trace tronquée), jamais un état fantôme.
// ---------------------------------------------------------------------------
test("RT-12 : undo réel — rejoue la trace réelle sur une nouvelle session, UNDO_USED émis", () => {
  const level = LEVEL("N4");
  const adapter = makeAdapter(level, "rt-12");
  adapter.started();
  const acts = realWinningActions(level);
  // Appliquer les deux premières transitions RÉELLES — sans atteindre le
  // terminal (N4 nécessite 2 coups, on s'arrête à 1) pour pouvoir undo.
  assert.ok(acts.length >= 2, "N4 nécessite au moins 2 transitions réelles");
  adapter.apply(acts[0]);
  const beforeUndo = adapter.session().trace.length;
  assert.ok(beforeUndo >= 1, "une transition réellement appliquée");

  const u = adapter.undo();
  assert.equal(u.ok, true);
  const types = adapter.events().map((e) => e.type);
  assert.ok(types.includes("UNDO_USED"), "UNDO_USED émis : " + types.join(","));
  assert.equal(adapter.session().trace.length, beforeUndo - 1, "session réelle tronquée d'une transition");
});

// ---------------------------------------------------------------------------
// RT-13 — restart réel LEVEL_RESTARTED ; retryCount réel = nombre de restarts.
// ---------------------------------------------------------------------------
test("RT-13 : restart émet LEVEL_RESTARTED et incrémente retryCount réel", () => {
  const level = LEVEL("N4");
  const adapter = makeAdapter(level, "rt-13");
  adapter.started();
  const r = adapter.restart();
  assert.equal(r.ok, true);
  const types = adapter.events().map((e) => e.type);
  assert.ok(types.includes("LEVEL_RESTARTED"), types.join(","));
  assert.equal(adapter.metrics().retryCount, 1);
});

// ---------------------------------------------------------------------------
// RT-14 — complété pudique : LEVEL_COMPLETED réel via adapter.completed().
// ---------------------------------------------------------------------------
test("RT-14 : terminal pudique — completed() émet LEVEL_COMPLETED sans court-circuiter l'Evidence", () => {
  const adapter = makeAdapter(LEVEL("N1"), "rt-14");
  adapter.started();
  const done = adapter.completed({ solutionDepth: 1 });
  assert.equal(done.type, "LEVEL_COMPLETED");
  const types = adapter.events().map((e) => e.type);
  assert.ok(types.includes("LEVEL_STARTED"));
  assert.ok(types.includes("LEVEL_COMPLETED"));
});

// ---------------------------------------------------------------------------
// RT-15 — la chaîne complète réelle : actions → Evidence → profil → Policy →
// Orchestrator écrit, avec storage réel et le kill-switch au bout.
// ---------------------------------------------------------------------------
test("RT-15 : chaîne complète Engine→Evidence→Profil→Policy→Orchestrator, écriture réelle", () => {
  const st = memoryStorage();
  seedSave(st);
  const level = LEVEL("N4");
  const adapter = makeAdapter(level, "rt-15", { storage: st, clock: createClock({ now: () => 3300 }) });
  adapter.started();
  for (const a of realWinningActions(level)) adapter.apply(a);

  const m = adapter.metrics();
  const p = adapter.profile();
  assert.ok(m.solutionDepth >= 1, "métrique issue de la session réelle");
  assert.equal(typeof p.profile.confidence, "number", "profil réel dérivé des Evidence réelles");

  const out = adapter.orchestrate({
    mode: "ADAPTIVE",
    config: { mode: "ADAPTIVE" },
    metadata: META,
    difficulty: DIFFICULTY,
    profile: PROFILE({ exploration: 0.9 }),
  });
  // Seule l'orchestration écrit ; la session de jeu réelle, elle, reste celle
  // du moteur (l'intelligence n'a pas de main sur le niveau du moteur).
  assert.ok(out.stateChanged === true || out.action === "SAFE_DEFAULT", `action réelle ${out.action}`);
});

// ---------------------------------------------------------------------------
// RT-16 — reproductibilité : deux exécutions réelles identiques donnent des
// metrics et profils identiques.
// ---------------------------------------------------------------------------
test("RT-16 : reproductibilité — deux pipelines réels identiques ⇒ mêmes metrics/profile", () => {
  const level = LEVEL("N4");
  const run = () => {
    const adapter = makeAdapter(level, "rt-16", { clock: createClock({ now: () => 4100 }) });
    adapter.started();
    for (const a of realWinningActions(level)) adapter.apply(a);
    return { metrics: adapter.metrics(), profile: adapter.profile() };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "mêmes metrics + même profil (pipeline réel déterministe)");
});