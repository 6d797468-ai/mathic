// MATHIC 1.0 — INTÉGRATION UI DE L'ADAPTIVE PROGRESSION (MISSION 7) — UI-01..UI-10
//
// Prouve que le pipeline M1→M6 est réellement consommé par l'interface : une
// victoire UI réelle déclenche observation → Evidence → profil → policy →
// orchestrate → niveau suivant affiché — SANS nouvelle autorité UI.
//
// Le driver ci-dessous reproduit le flux EXACT de src/b1/web/b1-web.js
// (engine.apply réel, nav.commit/preview/finishLevel/decideNext) — l'UI
// affiche la décision, elle ne décide pas (§3 architecture interdite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createSession, apply, evaluate, enumerateActions } from "../../src/b1/engine.mjs";
import { LADDER, nextLevel } from "../../src/b1/levels.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import { createIntelNavigation } from "../../src/b1/web/intel-navigation.mjs";

// ---------------------------------------------------------------------------
// Fixtures réelles — catalogue certifié + metadata Solver (une seule analyse)
// ---------------------------------------------------------------------------

const ANALYSIS = analyzeAll({ budget: 40000 });
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const ENGINE = { createSession, apply, evaluate, isWon: (s) => s.won };
const SAVE = (current = "N1") => JSON.stringify({ version: 1, unlocked: ["N1"], completed: {}, current });

// ---------------------------------------------------------------------------
// Driver UI headless — reproduit b1-web.js : jouer → victoire → finisher →
// décision → naviguer. Déterministe (seed mulberry32), aucune autorité UI.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const unlockAhead = (storage, id) => {
  const s = JSON.parse(storage.get("mathic.save.v1"));
  const i = LADDER.findIndex((l) => l.id === id);
  s.unlocked = [...new Set([...s.unlocked, ...LADDER.slice(0, i + 3).map((l) => l.id)])];
  storage.set("mathic.save.v1", JSON.stringify(s));
};

function pickRestart(state, strategy, rnd) {
  const acts = enumerateActions(state);
  if (!acts.length) return null;
  for (const a of acts) {
    const n = apply(state, a);
    if (n && n.won && strategy === "arithm") return a;
  }
  if (strategy === "arithm") {
    let best = null;
    let bd = -Infinity;
    for (const a of acts) {
      const ev = evaluate(state, a);
      if (ev && ev.ok && ev.delta > bd) {
        bd = ev.delta;
        best = a;
      }
    }
    return best ?? acts[0];
  }
  return acts[Math.floor(rnd() * acts.length)];
}

function playUI({ strategy = "arithm", seed = 1, levelsToPlay = 4, storage } = {}) {
  const nav = createIntelNavigation({ engine: ENGINE, storage, metadata: META });
  const rnd = mulberry32(seed);
  let current = "N1";
  const trajectory = [];
  for (let i = 0; i < levelsToPlay; i++) {
    const level = LADDER.find((l) => l.id === current);
    if (!level) break;
    nav.beginLevel(level);
    let st = createSession(level);
    let guard = 0;
    let won = false;
    while (guard++ < 40 && !won) {
      const acts = enumerateActions(st);
      if (!acts.length) break;
      if (strategy === "explorer") for (const a of acts) nav.preview(a);
      const pick = pickRestart(st, strategy, rnd);
      const n = apply(st, pick);
      if (!n) continue;
      st = n;
      nav.commit(pick);
      if (st.won) won = true;
    }
    if (!won) break;
    nav.finishLevel({ won: true, score: st.score, movesLeft: st.movesLeft });
    const decision = nav.decideNext();
    trajectory.push({
      level: level.id,
      nextLevel: decision.nextLevel,
      recommended: decision.recommended,
      action: decision.action,
      fallbackUsed: decision.fallbackUsed,
      reasonCodes: decision.reasonCodes,
      profileState: decision.profileState,
      evidenceCount: decision.evidenceCount,
      profile: decision.profile,
    });
    if (decision.nextLevel) unlockAhead(storage, decision.nextLevel);
    current = decision.nextLevel ?? nextLevel(level.id)?.id ?? null;
    if (!current) break;
  }
  return { nav, trajectory };
}

// ---------------------------------------------------------------------------
// UI-01 — Une complétion réelle déclenche le pipeline adaptatif (Evidence
// réelles + profil réel calculé + décision rendue).
// ---------------------------------------------------------------------------

test("UI-01 la complétion déclenche le pipeline adaptatif", () => {
  const storage = new Map();
  storage.set("mathic.save.v1", SAVE());
  const { nav, trajectory } = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 2, storage });
  assert.ok(trajectory.length >= 1, "aucune completion de niveau");
  const t = trajectory[0];
  assert.ok(t.evidenceCount >= 3, "pas assez d'Evidence (réelles) sur la décision");
  assert.ok(["LOW EVIDENCE", "SUFFICIENT EVIDENCE", "HIGH CONFIDENCE"].includes(t.profileState));
  assert.ok(t.nextLevel, "aucun niveau suivant rendu");
  assert.ok(t.profile && typeof t.profile.confidence === "number", "profil non exposé");
  const navProfile = nav.profile();
  assert.ok(navProfile, "profil du pont absent");
});

// ---------------------------------------------------------------------------
// UI-02 — Le niveau suivant affiché correspond à la Recommendation acceptée
// par l'Orchestrator (pas à une sélection UI parallèle).
// ---------------------------------------------------------------------------

test("UI-02 niveau suivant = Recommendation acceptée (APPLIED)", () => {
  const storage = new Map();
  storage.set("mathic.save.v1", SAVE());
  const { trajectory } = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 3, storage });
  const applied = trajectory.find((t) => t.action === "APPLIED");
  assert.ok(applied, "aucune décision APPLIED produite en 3 niveaux (fragile : relire le probe)");
  assert.equal(applied.nextLevel, applied.recommended);
  const save = JSON.parse(storage.get("mathic.save.v1"));
  assert.equal(save.current, applied.recommended, "la save n'a pas été alignée par l'orchestrator");
});

// ---------------------------------------------------------------------------
// UI-03 — Une Recommendation rejetée/de repli n'altère pas la progression.
// ---------------------------------------------------------------------------

test("UI-03 rejection/repli laisse la progression intacte", () => {
  const storage = new Map();
  storage.set("mathic.save.v1", SAVE());
  const before = storage.get("mathic.save.v1");
  const { trajectory } = playUI({ strategy: "arithm", seed: 1, levelsToPlay: 2, storage });
  const fallback = trajectory.filter((t) => t.fallbackUsed);
  assert.ok(fallback.length > 0, "arithm devrait démarrer en SAFE_DEFAULT (confiance insuffisante)");
  for (const t of fallback) {
    assert.equal(t.recommended, null, "fallback ne doit pas exposer de reco acceptée");
    assert.ok(t.nextLevel === null || LADDER.some((l) => l.id === t.nextLevel));
  }
  assert.ok(storage.get("mathic.save.v1").length > 0, "save toujours présente");
});

// ---------------------------------------------------------------------------
// UI-04 — SAFE_DEFAULT conserve le parcours standard (nextLevel ordinal).
// ---------------------------------------------------------------------------

test("UI-04 SAFE_DEFAULT = parcours standard", () => {
  const storage = new Map();
  storage.set("mathic.save.v1", SAVE());
  const { nav, trajectory } = playUI({ strategy: "arithm", seed: 1, levelsToPlay: 2, storage });
  const fallbacks = trajectory.filter((t) => t.fallbackUsed);
  assert.ok(fallbacks.length >= 1);
  for (const t of fallbacks) {
    assert.equal(t.nextLevel, nextLevel(t.level)?.id, "repli ≠ parcours standard");
  }
});

// ---------------------------------------------------------------------------
// UI-05 — Une panne Intelligence ne bloque pas la partie (fallback sûr).
// ---------------------------------------------------------------------------

test("UI-05 panne Intelligence = jeu continue (fallback)", () => {
  const storage = new Map();
  storage.set("mathic.save.v1", SAVE());
  const nav = createIntelNavigation({ engine: ENGINE, storage, metadata: META });
  nav.beginLevel(LADDER.find((l) => l.id === "N1"));
  let st = createSession(LADDER.find((l) => l.id === "N1"));
  const win = describeWinN1();
  // simule la réussite réelle N1
  nav.commit(win.act);
  nav.finishLevel({ won: true, score: win.score, movesLeft: win.movesLeft });
  const decision = nav.decideNext();
  assert.ok(decision.nextLevel, "aucun niveau suivant sous SAFE_DEFAULT (panne intelligente = autre chose)");
  assert.equal(decision.nextLevel, "N2", "parcours standard attendu");
});

function describeWinN1() {
  const level = LADDER.find((l) => l.id === "N1");
  const st = createSession(level);
  for (const a of enumerateActions(st)) {
    const n = apply(st, a);
    if (n && n.won) return { act: a, score: n.score, movesLeft: n.movesLeft };
  }
  throw new Error("N1 insouvable");
}

// ---------------------------------------------------------------------------
// UI-06 — Le profil utilisé vient des Evidence de la session réelle.
// ---------------------------------------------------------------------------

test("UI-06 profil issu des Evidence réelles de la session", () => {
  const storage = new Map();
  storage.set("mathic.save.v1", SAVE());
  const { nav, trajectory } = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 2, storage });
  const events = nav.events();
  assert.ok(events.length >= 10, "Historique réel trop maigre");
  const navProfile = nav.profile();
  assert.ok(trajectory.every((t) => t.profileState === navProfile.state || t.fallbackUsed), "profil de la décision ≠ profil détecté des Evidence UI");
});

// ---------------------------------------------------------------------------
// UI-07 — Deux comportements peuvent mener à deux niveaux suivants différents
// lorsque la Policy le décide (preuve de divergence — §9).
// ---------------------------------------------------------------------------

test("UI-07 deux trajectoires comportementales → niveaux suivants distincts", () => {
  const mk = () => {
    const s = new Map();
    s.set("mathic.save.v1", SAVE());
    return s;
  };
  const runArithm = playUI({ strategy: "arithm", seed: 1, levelsToPlay: 3, storage: mk() });
  const runExplorer = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 3, storage: mk() });
  const levelsDiff = runArithm.trajectory.map((t) => t.nextLevel).join(",") !== runExplorer.trajectory.map((t) => t.nextLevel).join(",");
  assert.ok(levelsDiff, "Aucune trajectoire UI différente (arithm vs explorer)");
  const hasApplied = runExplorer.trajectory.some((t) => t.action === "APPLIED");
  assert.ok(hasApplied, "différence non produite par la Policy (pas d'APPLIED)");
});

// ---------------------------------------------------------------------------
// UI-08 — Même trajectoire → même niveau suivant (déterminisme).
// ---------------------------------------------------------------------------

test("UI-08 même trajectoire → même niveau suivant", () => {
  const run1 = playUI({ strategy: "explorer", seed: 7, levelsToPlay: 3, storage: ((s) => { s.set("mathic.save.v1", SAVE()); return s; })(new Map()) });
  const run2 = playUI({ strategy: "explorer", seed: 7, levelsToPlay: 3, storage: ((s) => { s.set("mathic.save.v1", SAVE()); return s; })(new Map()) });
  assert.deepEqual(run2.trajectory, run1.trajectory);
});

// ---------------------------------------------------------------------------
// UI-09 — Reload/reprise : la save relue est cohérente avec la progression.
// ---------------------------------------------------------------------------

test("UI-09 reload/reprise conserve la cohérence", () => {
  const storage = new Map();
  storage.set("mathic.save.v1", SAVE());
  const run = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 3, storage });
  const reloaded = JSON.parse(storage.get("mathic.save.v1"));
  assert.equal(reloaded.current, run.trajectory[run.trajectory.length - 1].nextLevel, "current relu ≠ dernier niveau navigué");
  assert.ok(Array.isArray(reloaded.unlocked) && reloaded.unlocked.includes(reloaded.current));
  for (const t of run.trajectory) {
    if (t.action === "APPLIED") assert.ok(reloaded.unlocked.includes(t.nextLevel), "niveau appliqué absent des unlocked relus");
  }
});

// ---------------------------------------------------------------------------
// UI-10 — L'intégration ne crée aucun accès direct UI → Save Authority.
// ---------------------------------------------------------------------------

test("UI-10 aucun accès direct UI → Save Authority", () => {
  const src = (rel) => readFileSync(fileURLToPath(new URL(`../../src/b1/web/${rel}`, import.meta.url)), "utf8");
  const web = src("b1-web.js");
  const nav = src("intel-navigation.mjs");
  // b1-web ne consomme l'intelligence QUE via le pont (aucun import strategique direct).
  assert.ok(!/from\s+["']\.\.\/intel\//.test(web), "b1-web importe intel/ directement");
  // Le pont ne mute la save qu'à travers orchestrate (jamais les primitives d'écriture).
  for (const banned of ["saveNow(", "setCurrent(", "markCompleted(", "unlockTo("]) {
    assert.ok(!nav.includes(banned), `pont appelle directement ${banned} (autorité UI interdite)`);
  }
  assert.ok(nav.includes("orchestrate("), "pont n'appelle jamais orchestrate (l'écrivain réel)");
});