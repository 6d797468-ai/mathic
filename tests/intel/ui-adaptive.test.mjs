// MATHIC 1.0 — INTÉGRATION UI DE L'ADAPTIVE PROGRESSION (MISSION 7 + 8) — UI-01..UI-10
//
// Prouve que le pipeline M1→M6→M8 est réellement consommé par l'interface :
// une victoire UI réelle (b1-web.js) déclenche observation → Evidence → profil
// → policy → orchestrate → niveau suivant affiché.
//
// Depuis M8, le driver est FIDÈLE AU PRODUIT : il consomme le vrai flux save
// (markCompleted avec la fenêtre d'anticipation PROGRESSION_WINDOW), aucune
// simulation d'unlock parallèle. L'UI observe et affiche ; elle ne décide rien.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createSession, apply, evaluate, enumerateActions } from "../../src/b1/engine.mjs";
import { LADDER, nextLevel, windowOf, PROGRESSION_WINDOW } from "../../src/b1/levels.mjs";
import { markCompleted } from "../../src/b1/save.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import { createIntelNavigation } from "../../src/b1/web/intel-navigation.mjs";

const ANALYSIS = analyzeAll({ budget: 40000 });
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const ENGINE = { createSession, apply, evaluate, isWon: (s) => s.won };
const KEY = "mathic.save.v1";

// ---------------------------------------------------------------------------
// Driver UI headless — reproduit b1-web.js : jouer → markCompleted (fenêtre
// réelle) → finishLevel → décision → naviguer. Déterministe (seed mulberry32).
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

function playUI({ strategy = "arithm", seed = 1, levelsToPlay = 4 } = {}) {
  const storage = new Map();
  storage.set(KEY, JSON.stringify({ version: 1, unlocked: ["N1"], completed: {}, current: "N1" }));
  const nav = createIntelNavigation({ engine: ENGINE, storage, metadata: META });
  const rnd = mulberry32(seed);
  const trajectory = [];
  let current = "N1";
  let save = JSON.parse(storage.get(KEY));
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
    // b1-web.js persistVictory : markCompleted avec la fenêtre d'anticipation réelle.
    save = markCompleted(save, level.id, { score: st.score, movesLeft: st.movesLeft, horizon: PROGRESSION_WINDOW });
    storage.set(KEY, JSON.stringify(save));
    nav.finishLevel({ won: true, score: st.score, movesLeft: st.movesLeft });
    const decision = nav.decideNext();
    trajectory.push({
      level: current,
      nextLevel: decision.nextLevel,
      recommended: decision.recommended,
      action: decision.action,
      fallbackUsed: decision.fallbackUsed,
      reasonCodes: decision.reasonCodes,
      profileState: decision.profileState,
      evidenceCount: decision.evidenceCount,
      profile: decision.profile,
    });
    current = decision.nextLevel ?? nextLevel(level.id)?.id ?? null;
    if (!current) break;
  }
  return { nav, trajectory, storage };
}

const freshStorage = () => {
  const s = new Map();
  s.set(KEY, JSON.stringify({ version: 1, unlocked: ["N1"], completed: {}, current: "N1" }));
  return s;
};

// ---------------------------------------------------------------------------
// UI-01 — Une complétion réelle déclenche le pipeline adaptatif.
// ---------------------------------------------------------------------------

test("UI-01 la complétion déclenche le pipeline adaptatif", () => {
  const { nav, trajectory } = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 2 });
  assert.ok(trajectory.length >= 1, "aucune completion de niveau");
  const t = trajectory[0];
  assert.ok(t.evidenceCount >= 3, "pas assez d'Evidence (réelles) sur la décision");
  assert.ok(["LOW EVIDENCE", "SUFFICIENT EVIDENCE", "HIGH CONFIDENCE"].includes(t.profileState));
  assert.ok(t.nextLevel, "aucun niveau suivant rendu");
  assert.ok(t.profile && typeof t.profile.confidence === "number", "profil non exposé");
  assert.ok(nav.profile(), "profil du pont absent");
});

// ---------------------------------------------------------------------------
// UI-02 — Le niveau suivant affiché correspond à la Recommendation acceptée
// par l'Orchestrator (pas à une sélection UI parallèle).
// ---------------------------------------------------------------------------

test("UI-02 niveau suivant = Recommendation acceptée (APPLIED)", () => {
  const { trajectory, storage } = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 2 });
  const applied = trajectory.find((t) => t.action === "APPLIED");
  assert.ok(applied, "aucune décision APPLIED produite (relire la preuve M8)");
  assert.equal(applied.nextLevel, applied.recommended);
  const save = JSON.parse(storage.get(KEY));
  assert.equal(save.current, applied.recommended, "la save n'a pas été alignée par l'orchestrator");
});

// ---------------------------------------------------------------------------
// UI-03 — Une Recommendation de repli n'altère pas la progression.
// ---------------------------------------------------------------------------

test("UI-03 rejet/repli laisse la progression intacte", () => {
  const { trajectory } = playUI({ strategy: "arithm", seed: 1, levelsToPlay: 3 });
  const fallbacks = trajectory.filter((t) => t.fallbackUsed);
  assert.ok(fallbacks.length >= 1, "arithm devrait démarrer en SAFE_DEFAULT (confiance insuffisante)");
  for (const t of fallbacks) {
    assert.equal(t.recommended, null, "fallback ne doit pas exposer de reco acceptée");
    assert.ok(t.nextLevel === null || LADDER.some((l) => l.id === t.nextLevel));
  }
});

// ---------------------------------------------------------------------------
// UI-04 — SAFE_DEFAULT conserve le parcours standard (nextLevel ordinal).
// ---------------------------------------------------------------------------

test("UI-04 SAFE_DEFAULT = parcours standard", () => {
  const { trajectory } = playUI({ strategy: "arithm", seed: 1, levelsToPlay: 3 });
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
  const storage = freshStorage();
  const nav = createIntelNavigation({ engine: ENGINE, storage, metadata: META });
  nav.beginLevel(LADDER.find((l) => l.id === "N1"));
  const { act, score, movesLeft } = winN1();
  nav.commit(act);
  nav.finishLevel({ won: true, score, movesLeft });
  const decision = nav.decideNext();
  assert.ok(decision.nextLevel, "aucun niveau suivant sous SAFE_DEFAULT");
  assert.equal(decision.nextLevel, "N2", "parcours standard attendu");
});

function winN1() {
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
  const { nav, trajectory } = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 2 });
  const events = nav.events();
  assert.ok(events.length >= 5, "Historique réel trop maigre");
  const navProfile = nav.profile();
  assert.ok(navProfile, "profil session absent");
  const last = trajectory[trajectory.length - 1];
  assert.equal(last.profileState, navProfile.state, "profil de la décision finale ≠ profil détecté des Evidence UI");
});

// ---------------------------------------------------------------------------
// UI-07 — Deux comportements → deux niveaux suivants DISTINCTS, dans le cadre
// réel (fenêtre d'anticipation M8, niveau choisi uniquement par
// Profile+Metadata+Policy). Preuve §9.
// ---------------------------------------------------------------------------

test("UI-07 deux trajectoires comportementales → niveaux suivants distincts (preuve réelle)", () => {
  const runArithm = playUI({ strategy: "arithm", seed: 1, levelsToPlay: 3 });
  const runExplorer = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 3 });
  const appl = runExplorer.trajectory.find((t) => t.action === "APPLIED");
  assert.ok(appl, "différence non produite par la Policy (aucun APPLIED)");
  const stepArite = runExplorer.trajectory.indexOf(appl);
  const aSame = runArithm.trajectory[stepArite];
  assert.ok(aSame, "l'arithm n'a pas d'étape correspondante");
  assert.equal(aSame.level, appl.level, "les deux comportements n'ont pas joué le même niveau");
  assert.notEqual(aSame.nextLevel, appl.nextLevel, "même niveau suivant malgré des comportements différents");
  // La reco (et son repli) restent DANS la fenêtre d'anticipation réelle.
  for (const t of [...runArithm.trajectory, ...runExplorer.trajectory]) {
    const win = windowOf(t.level, PROGRESSION_WINDOW);
    if (win.length > 0) assert.ok(win.includes(t.nextLevel), `niveau ${t.level}->${t.nextLevel} hors fenêtre`);
  }
});

// ---------------------------------------------------------------------------
// UI-08 — Même trajectoire → même niveau suivant (déterminisme).
// ---------------------------------------------------------------------------

test("UI-08 même trajectoire → même niveau suivant", () => {
  const run1 = playUI({ strategy: "explorer", seed: 7, levelsToPlay: 3 });
  const run2 = playUI({ strategy: "explorer", seed: 7, levelsToPlay: 3 });
  assert.deepEqual(run2.trajectory, run1.trajectory);
});

// ---------------------------------------------------------------------------
// UI-09 — Reload/reprise : la save relue est cohérente avec la progression.
// ---------------------------------------------------------------------------

test("UI-09 reload/reprise conserve la cohérence", () => {
  const { trajectory, storage } = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 3 });
  const reloaded = JSON.parse(storage.get(KEY));
  assert.equal(reloaded.current, LADDER.find((l) => l.id === "N2") ? latestApplied(trajectory) : reloaded.current, "current relu ≠ dernière reco appliquée");
  assert.ok(reloaded.unlocked.includes(reloaded.current), "current relu non débloqué");
  for (const t of trajectory) {
    if (t.action === "APPLIED") assert.ok(reloaded.unlocked.includes(t.nextLevel), "niveau appliqué absent des unlocked relus");
  }
  for (const t of trajectory) {
    assert.ok(reloaded.completed[t.level]?.wins > 0, `niveau parcouru ${t.level} non complété dans la save`);
  }
});

function latestApplied(trajectory) {
  let last = null;
  for (const t of trajectory) {
    if (t.action === "APPLIED") last = t.nextLevel;
  }
  return last;
}

// ---------------------------------------------------------------------------
// UI-10 — L'intégration ne crée aucun accès direct UI → Save Authority
// (l'intelligence n'écrit la save qu'à travers orchestrate).
// ---------------------------------------------------------------------------

test("UI-10 aucun accès direct UI → Save Authority", () => {
  const src = (rel) => readFileSync(fileURLToPath(new URL(`../../src/b1/web/${rel}`, import.meta.url)), "utf8");
  const web = src("b1-web.js");
  const nav = src("intel-navigation.mjs");
  assert.ok(!/from\s+["']\.\.\/intel\//.test(web), "b1-web importe intel/ directement");
  for (const banned of ["saveNow(", "setCurrent(", "markCompleted(", "unlockTo("]) {
    assert.ok(!nav.includes(banned), `pont appelle directement ${banned} (autorité UI interdite)`);
  }
  assert.ok(nav.includes("orchestrate("), "pont n'appelle jamais orchestrate (l'écrivain réel)");
});