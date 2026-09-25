// MATHIC 1.0 — FENÊTRE D'ANTICIPATION (MISSION 8) — W-01..W-09
//
// Prouve que le Niveau B (N → {N+1 … N+k}) est en place :
//  - la fenêtre |W(p,t)| est augmentée DÉTERMINISTIQUEMENT par la progression
//    réelle (markCompleted + horizon) — le profil n'y a aucun pouvoir ;
//  - la Policy maximise dans W (déjà le cas, M3) ; le saut réel produit
//    désormais une divergence visible arithm/explorer DANS le flux save réel ;
//  - invariants : reco ∈ W, déterminisme, non-régression de markCompleted.

import { test } from "node:test";
import assert from "node:assert/strict";

import { LADDER, nextLevel, windowOf, PROGRESSION_WINDOW } from "../../src/b1/levels.mjs";
import { markCompleted } from "../../src/b1/save.mjs";
import { recommend } from "../../src/intel/progression-policy.mjs";
import { createSession, apply, evaluate, enumerateActions } from "../../src/b1/engine.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import { createIntelNavigation } from "../../src/b1/web/intel-navigation.mjs";

const ANALYSIS = analyzeAll({ budget: 40000 });
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));

const base = () => ({ version: 1, unlocked: ["N1"], completed: {}, current: "N1" });

// ---------------------------------------------------------------------------
// W-01 — windowOf produit exactement {N+1 … N+k}, recadré en fin de ladder.
// ---------------------------------------------------------------------------

test("W-01 windowOf facture {N+1..N+k} avec recadrage de fin", () => {
  assert.deepEqual(windowOf("N1", 3), ["N2", "N3", "N4"]);
  assert.deepEqual(windowOf("N8", 3), ["N9", "N10", "N11"], "exemple du mandat N8→N9,N10,N11");
  assert.deepEqual(windowOf("N35", 3), ["N36"], "recadrage : dernier niveau");
  assert.deepEqual(windowOf("N36", 3), [], "au bout du catalogue : fenêtre vide");
  assert.deepEqual(windowOf("N1", 1), ["N2"], "retour au comportement historique");
  assert.equal(PROGRESSION_WINDOW, 3, "k produit = 3 (décision Game Design)");
});

// ---------------------------------------------------------------------------
// W-02 — markCompleted horizon=1 = comportement historique (NON-RÉGRESSION).
// ---------------------------------------------------------------------------

test("W-02 markCompleted horizon=1 déverrouille uniquement N+1", () => {
  const st = markCompleted(base(), "N1", { score: 10, movesLeft: 2, horizon: 1 });
  assert.deepEqual(st.unlocked, ["N1", "N2"]);
  assert.equal(st.current, "N1");
  assert.equal(st.completed.N1.wins, 1);
});

// ---------------------------------------------------------------------------
// W-03 — markCompleted horizon=k débloque exactement N+1..N+k, sans dérive
// sur completed/current, et sans sur-déblocage au fil des victoires.
// ---------------------------------------------------------------------------

test("W-03 markCompleted horizon=3 débloque N+1..N+k sans dérive", () => {
  const st = markCompleted(base(), "N1", { score: 10, movesLeft: 2, horizon: PROGRESSION_WINDOW });
  assert.deepEqual(st.unlocked, ["N1", "N2", "N3", "N4"]);
  assert.equal(st.current, "N1");
  assert.deepEqual(Object.keys(st.completed), ["N1"]);
  // deux victoires successives : la fenêtre ne recule jamais, n'avance que par progression
  const st2 = markCompleted(st, "N2", { score: 11, movesLeft: 2, horizon: PROGRESSION_WINDOW });
  assert.deepEqual(st2.unlocked, ["N1", "N2", "N3", "N4", "N5"]);
  assert.equal(st2.completed.N2.wins, 1);
});

// ---------------------------------------------------------------------------
// W-04 — INVARIANT : toute recommendation (repli compris) reste DANS la
// fenêtre. L'espace de décision est gouverné par la progression, jamais
// dépassé par la Policy.
// ---------------------------------------------------------------------------

test("W-04 toute recommendation reste dans la fenêtre (invariant W)", () => {
  const cfg = { mode: "ADAPTIVE" };
  const profileE = { arithmetic: 0.3, exploration: 0.9, strategy: 0.4, efficiency: 0.3, chainAffinity: 0.5, confidence: 0.7, difficultyResponse: 0.8, hintDependency: 0 };
  const unlocked = ["N1", "N2", "N3", "N4", "N5"];
  const metadata = { N2: { properties: ["MULTI-PATH"] }, N3: { properties: ["CHOICE"] }, N4: { properties: ["SINGLE-PATH"] }, N5: { properties: ["CHAIN", "MULTI-PATH"] } };
  const r = recommend({
    candidates: LADDER.map((l) => l.id),
    progression: { ...base(), unlocked, completed: { N1: { wins: 1 } } },
    metadata,
    difficulty: {},
    profile: profileE,
    config: cfg,
  });
  assert.ok(r.eligibleLevels.length > 0, "aucun candidat éligible");
  for (const id of r.eligibleLevels) assert.ok(unlocked.includes(id), `éligible ${id} hors fenêtre`);
  if (r.recommendedLevel) assert.ok(r.eligibleLevels.includes(r.recommendedLevel), "reco hors éligibles");
});

// ---------------------------------------------------------------------------
// W-05 — DÉTERMINISME : même progression + même profil → même reco.
// ---------------------------------------------------------------------------

test("W-05 déterminisme profil+progression", () => {
  const inputs = {
    candidates: LADDER.map((l) => l.id),
    progression: { ...base(), unlocked: ["N1", "N2", "N3", "N4"], completed: { N1: { wins: 1 }, N2: { wins: 1 }, N3: { wins: 1 } } },
    metadata: { N4: { properties: ["MULTI-PATH"] } },
    difficulty: {},
    profile: { arithmetic: 0.2, exploration: 0.9, strategy: 0.3, efficiency: 0.4, chainAffinity: 0.6, confidence: 0.8, difficultyResponse: 0.7, hintDependency: 0 },
    config: { mode: "ADAPTIVE" },
  };
  const a = recommend({ ...inputs });
  const b = recommend({ ...inputs });
  assert.equal(a.recommendedLevel, b.recommendedLevel);
  assert.equal(a.mode, b.mode);
});

// ---------------------------------------------------------------------------
// W-06 — PREUVE DE DIVERGENCE RÉELLE DANS LA FENÊTRE : deux comportements
// (arithm vs explorer) face aux mêmes puzzles, flux save réel (markCompleted
// horizon 3). L'explorer reçoit un saut APPLIED N2→N5, l'arithm reste ordinal
// N2→N3. Les deux restent DANS windowOf(N2,3)={N3,N4,N5} : aucune règle
// contournée.
// ---------------------------------------------------------------------------

test("W-06 divergence réelle dans la fenêtre (arithm vs explorer)", () => {
  const arithm = traceDecision("N2", "arithm", 1);
  const explorer = traceDecision("N2", "explorer", 2);
  assert.equal(explorer.decision.action, "APPLIED", "explorer devrait recevoir une reco appliquée");
  assert.equal(explorer.decision.nextLevel, "N5", "reco adaptative surprise attendue au front de la fenêtre");
  assert.equal(arithm.decision.action, "FALLBACK", "arithm (confiance insuffisante) reste en repli");
  assert.equal(arithm.decision.nextLevel, "N3", "repli ordinal attendu");
  const win = windowOf("N2", PROGRESSION_WINDOW);
  assert.equal(win.length, 3);
  assert.ok(win.includes(explorer.decision.nextLevel), "reco explorer hors fenêtre");
  assert.ok(win.includes(arithm.decision.nextLevel), "repli arithm hors fenêtre");
});

// ---------------------------------------------------------------------------
// W-06bis — Même preuve via le run complet (seed stable) : la trajectoire
// complète explore la fenêtre sans jamais en sortir.
// ---------------------------------------------------------------------------

test("W-06bis les trajectoires complètes restent dans la fenêtre", () => {
  const run = playUI({ strategy: "explorer", seed: 2, levelsToPlay: 3 });
  for (const t of run) {
    const win = windowOf(t.level, PROGRESSION_WINDOW);
    if (win.length > 0) assert.ok(win.includes(t.nextLevel), `${t.level}->${t.nextLevel} hors fenêtre`);
  }
});

// ---------------------------------------------------------------------------
// W-07 — Le profil n'élargit JAMAIS W : à progression égale, deux profils
// distincts voient le MÊME espace éligible (seul le classement diffère).
// ---------------------------------------------------------------------------

test("W-07 le profil n'élargit pas la fenêtre", () => {
  const unlocked = ["N1", "N2", "N3", "N4", "N5"];
  const progression = { ...base(), unlocked, completed: { N1: { wins: 1 } } };
  const metadata = { N1: { properties: [] }, N2: { properties: ["MULTI-PATH"] }, N3: { properties: ["CHOICE"] }, N4: { properties: ["SINGLE-PATH"] }, N5: { properties: ["CHAIN"] } };
  const mk = (exploration, confidence) => recommend({
    candidates: LADDER.map((l) => l.id),
    progression,
    metadata,
    difficulty: {},
    profile: { arithmetic: 0.6, exploration, strategy: 0.4, efficiency: 0.3, chainAffinity: 0.5, confidence, difficultyResponse: 0, hintDependency: 0 },
    config: { mode: "ADAPTIVE" },
  });
  const arithmProf = mk(0.2, 0.9);
  const explorerProf = mk(0.9, 0.9);
  assert.deepEqual(arithmProf.eligibleLevels, explorerProf.eligibleLevels, "la fenêtre dépend du profil");
  assert.deepEqual(arithmProf.eligibleLevels, unlocked, "les éligibles ne sont pas exactement la fenêtre");
});

// ---------------------------------------------------------------------------
// W-08 — SAFE_DEFAULT reste le parcours ordinal classique (aucune régression).
// ---------------------------------------------------------------------------

test("W-08 SAFE_DEFAULT = parcours ordinal", () => {
  const r = recommend({
    candidates: LADDER.map((l) => l.id),
    progression: { ...base(), unlocked: ["N1", "N2", "N3", "N4"], completed: { N1: { wins: 1 } } },
    metadata: { N2: { properties: ["MULTI-PATH"] } },
    difficulty: {},
    profile: null,
    config: { mode: "ADAPTIVE" },
  });
  assert.equal(r.mode, "SAFE_DEFAULT");
  assert.equal(r.recommendedLevel, "N2", "premier niveau non terminé");
  assert.ok(r.reasonCodes.includes("NO_PROFILE"));
});

// ---------------------------------------------------------------------------
// W-09 — |W| ≥ min(k, restant du catalogue) après complétion.
// ---------------------------------------------------------------------------

test("W-09 taille de la fenêtre après complétion", () => {
  const afterN1 = markCompleted(base(), "N1", { score: 10, movesLeft: 2, horizon: 3 });
  assert.equal(afterN1.unlocked.length, 4, "N1..N4");
  const idx35 = LADDER.findIndex((l) => l.id === "N35");
  const stNearEnd = { ...base(), unlocked: LADDER.slice(0, idx35 + 1).map((l) => l.id), completed: {} };
  const afterN35 = markCompleted(stNearEnd, "N35", { score: 10, movesLeft: 1, horizon: 3 });
  assert.equal(afterN35.unlocked.at(-1), "N36", "recadrage : la fenêtre s'arrête au dernier niveau");
  assert.ok(afterN35.unlocked.length - stNearEnd.unlocked.length >= 1, "au moins N36");
  assert.ok(afterN35.unlocked.length - stNearEnd.unlocked.length <= 1, "pas de dérive au-delà du catalogue");
});

// ---------------------------------------------------------------------------
// Helpers — driver minimal partagé (jeu réel moteur réel, seed déterministe)
// ---------------------------------------------------------------------------

function traceDecision(levelId, strategy, seed) {
  const play = playUI({ strategy, seed, levelsToPlay: 3 });
  const found = play.find((t) => t.level === levelId);
  return { decision: found };
}

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

function playUI({ strategy = "arithm", seed = 1, levelsToPlay = 3 } = {}) {
  const KEY = "mathic.save.v1";
  const storage = new Map();
  storage.set(KEY, JSON.stringify({ version: 1, unlocked: ["N1"], completed: {}, current: "N1" }));
  const nav = createIntelNavigation({
    engine: { createSession, apply, evaluate, isWon: (s) => s.won },
    storage,
    metadata: META,
  });
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
    save = markCompleted(save, level.id, { score: st.score, movesLeft: st.movesLeft, horizon: PROGRESSION_WINDOW });
    storage.set(KEY, JSON.stringify(save));
    nav.finishLevel({ won: true, score: st.score, movesLeft: st.movesLeft });
    const decision = nav.decideNext();
    trajectory.push({ level: current, nextLevel: decision.nextLevel, action: decision.action });
    current = decision.nextLevel ?? nextLevel(level.id)?.id ?? null;
    if (!current) break;
  }
  return trajectory;
}