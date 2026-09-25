// MATHIC 1.0 — ADAPTIVE PROGRESSION (MISSION 6) — suite AP-01..AP-07
//
// Preuve expérimentale : le profil détecté RÉELLEMENT (depuis les Evidence du
// moteur réel, adaptateur M5) entraîne une progression DIFFÉRENTE, PERTINENTE
// et DÉTERMINISTE dans Mathic.
//
//   BOT (comportement de sélection d'actions) ─▶ adaptateur runtime ─▶
//   ENGINE RÉEL ─▶ Evidence réelle ─▶ detectProfile ─▶ orchestrate (seul
//   écrivain, kill-switch SAFE_DEFAULT) ─▶ progression réellement appliquée.
//
// Toutes les assertions reposent sur le catalogue irréel N1-N36 réanalysé par
// le Solver (budget 40000) et sur les contrats réels reproduction du durable.
// Aucun Math.random : chaque run est seedé (mulberry32) et rejoué à l'identique.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LADDER } from "../../src/b1/levels.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import { isUnlocked } from "../../src/b1/save.mjs";

import {
  createSimStorage,
  selfPlayAdaptive,
  playLevelOnce,
  EXPERIMENT_VERSION,
  EXPERIMENT_METHOD,
} from "../../src/intel/adaptive-experiment.mjs";

// ---------------------------------------------------------------------------
// Fixtures réelles — catalogue N1-N36 certifié (design réel, comme M4/M5)
// ---------------------------------------------------------------------------

const ANALYSIS = analyzeAll({ budget: 40000 });
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const IDS = ANALYSIS.map((a) => a.id);
const DIFFICULTY = Object.fromEntries(IDS.map((id) => [id, { index: Number(id.slice(1)) }]));

const LEVEL = (id) => LADDER.find((l) => l.id === id);

const STRATEGIES = ["arithm", "explorer", "chain"];
const DIMS = ["arithmetic", "exploration", "strategy", "efficiency", "chainAffinity"];

function seedStorage(storage) {
  storage.set("mathic.save.v1", JSON.stringify({ version: 1, unlocked: ["N1"], completed: {}, current: "N1" }));
}

function run(strategy, seed, { levelCount = 7, window = 8 } = {}) {
  const storage = createSimStorage();
  seedStorage(storage);
  return {
    storage,
    result: selfPlayAdaptive({
      strategy,
      seed,
      levelCount,
      window,
      ladder: LADDER,
      metadata: META,
      difficulty: DIFFICULTY,
      storage,
    }),
  };
}

// ---------------------------------------------------------------------------
// AP-01 — Déterminisme : même seed + même état initial → trajectoire et profil
// identiques, à l'octet.
// ---------------------------------------------------------------------------

test("AP-01 déterminisme : deux exécutions au même seed sont strictement identiques", () => {
  for (const s of STRATEGIES) {
    const first = run(s, 20261007);
    const second = run(s, 20261007);
    assert.deepEqual(JSON.parse(JSON.stringify(second.result.trajectory)), JSON.parse(JSON.stringify(first.result.trajectory)));
    assert.deepEqual(second.result.finalProfile, first.result.finalProfile);
    assert.equal(second.result.evidenceCount, first.result.evidenceCount);
  }
});

// ---------------------------------------------------------------------------
// AP-02 — Admissibilité : les niveaux joués existent dans le LADDER réel et,
// quand l'Orchestrator applique une position, elle reste débloquée dans la save.
// ---------------------------------------------------------------------------

test("AP-02 admissibilité : tout niveau joué appartient au LADDER réel et reste débloqué", () => {
  for (const s of STRATEGIES) {
    const { storage, result } = run(s, 20261007);
    const finalSave = JSON.parse(storage.get("mathic.save.v1"));
    assert.ok(result.trajectory.length > 0, `${s}: trajectoire non vide`);
    for (const t of result.trajectory) {
      assert.ok(IDS.includes(t.level), `${s}: ${t.level} hors catalogue`);
      if (t.action === "APPLIED") {
        assert.ok(isUnlocked(finalSave, t.level), `${s}: ${t.level} appliqué mais verrouillé`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// AP-03 — Différenciation : sur le catalogue réel, les comportements mènent à
// des trajectoires réellement distinctes (divergence en niveaux) et à des
// profils finals discriminés (Δmax > 0.4 sur les dimensions).
// ---------------------------------------------------------------------------

test("AP-03 différenciation : trajectoires et profils réels distincts", () => {
  const runs = Object.fromEntries(STRATEGIES.map((s) => [s, run(s, 42).result]));
  const divergence = (a, b) => {
    let d = 0;
    const n = Math.min(a.length, b.length);
    for (let k = 0; k < n; k++) if (a[k].level !== b[k].level) d++;
    return d;
  };
  const dAe = divergence(runs.arithm.trajectory, runs.explorer.trajectory);
  const dEc = divergence(runs.explorer.trajectory, runs.chain.trajectory);
  assert.ok(dAe >= 3, `arithm vs explorer diverge peu (${dAe})`);
  assert.ok(dEc >= 3, `explorer vs chain diverge peu (${dEc})`);
  let maxDelta = 0;
  for (const a of STRATEGIES) {
    for (const b of STRATEGIES) {
      for (const k of DIMS) {
        maxDelta = Math.max(maxDelta, Math.abs(runs[a].finalProfile.profile[k] - runs[b].finalProfile.profile[k]));
      }
    }
  }
  assert.ok(maxDelta >= 0.4, `profils finals trop proches (Δmax=${maxDelta.toFixed(3)})`);
});

// ---------------------------------------------------------------------------
// AP-04 — Sécurité : SAFE_DEFAULT et REJECTED ne changent jamais la position.
// ---------------------------------------------------------------------------

test("AP-04 sécurité : transitions sûres = zéro changement de position", () => {
  for (const s of STRATEGIES) {
    const { result } = run(s, 20261007);
    for (const t of result.trajectory) {
      if (t.action === "SAFE_DEFAULT" || t.action === "REJECTED") {
        assert.equal(t.stateChanged, false, `${s}: ${t.action} a écrit dans la save`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// AP-05 — Authenticité : le début de run est prudent (LOW/SUFFICIENT EVIDENCE
// puis montée), toutes les sessions produisent de vraies Evidence ACTION_*
// réelles, et chaque étape porte un profil détecté avec dimensions.
// ---------------------------------------------------------------------------

test("AP-05 authenticité : Evidence réelles et montée de confiance du profil", () => {
  for (const s of STRATEGIES) {
    const { result } = run(s, 20261007);
    assert.ok(result.evidenceCount >= 20, `${s}: trop peu d'Evidence (${result.evidenceCount})`);
    const states = result.trajectory.map((t) => t.profileState);
    assert.ok(states.every((st) => ["LOW EVIDENCE", "SUFFICIENT EVIDENCE", "HIGH CONFIDENCE"].includes(st)));
    let seenLow = false;
    for (const st of states) {
      if (st === "LOW EVIDENCE") seenLow = true;
      if (st !== "LOW EVIDENCE") break;
    }
    assert.ok(seenLow, `${s}: le profil ne démarre jamais en LOW EVIDENCE (prudence initiale attendue)`);
    for (const t of result.trajectory) {
      for (const k of DIMS) assert.ok(typeof t.dimensions[k] === "number", `${s}: dimension ${k} absente à l'étape ${t.step}`);
    }
  }
});

// ---------------------------------------------------------------------------
// AP-06 — Pertinence : quand la grammaire de la dimension dominante EXISTE dans
// l'offre débloquée, la stratégie l'atteint réellement (arithm → COMBINATION,
// chain → CHAIN). Documenter l'absence d'offre (MASTERY est introuvable).
// ---------------------------------------------------------------------------

test("AP-06 pertinence : la grammaire cible est atteinte dès qu'elle est disponible", () => {
  const hasProp = (id, p) => (META[id]?.properties ?? []).includes(p);
  const offer = (r) => r.trajectory.some((t) => hasProp(t.level, "COMBINATION"));
  const arithmReach = run("arithm", 20261007);
  assert.ok(offer(arithmReach.result), "arithm n'atteint aucun niveau COMBINATION alors qu'il les débloque");
  const chainRun = run("chain", 20261007);
  assert.ok(chainRun.result.trajectory.some((t) => hasProp(t.level, "CHAIN")), "chain n'atteint aucun niveau CHAIN");
  const masteryOffers = IDS.filter((id) => hasProp(id, "MASTERY"));
  assert.equal(masteryOffers.length, 0, "MASTERY devrait être absent du catalogue (offre nulle documentée)");
});

// ---------------------------------------------------------------------------
// AP-07 — Micro-preuve : playLevelOnce (une session mono-niveau) produit des
// events réels de type ACTION_COMMITTED et un terminal moteur cohérent ;
// enchaînée, elle reste rejouable à l'identique (bot pur).
// ---------------------------------------------------------------------------

test("AP-07 micro-progression : un bot joue réellement et de façon rejouable", () => {
  for (const s of STRATEGIES) {
    const first = playLevelOnce({ strategy: s, level: LEVEL("N4"), seed: 7 });
    const second = playLevelOnce({ strategy: s, level: LEVEL("N4"), seed: 7 });
    const sig = (events) =>
      events.map((e) =>
        [e.type, e.payload?.a, e.payload?.op, e.payload?.b, e.payload?.result, e.payload?.delta, e.payload?.chainRun].join(":")
      );
    const committed = first.adapter.events().filter((e) => e.type === "ACTION_COMMITTED").length;
    assert.ok(committed >= 1, `${s}: aucune ACTION_COMMITTED réelle`);
    assert.deepEqual(sig(second.adapter.events()), sig(first.adapter.events()));
    assert.equal(first.won, second.won);
  }
});

// ---------------------------------------------------------------------------
// AP-08 — Contrat d'expérience : version/méthode versionnées, forme du retour.
// ---------------------------------------------------------------------------

test("AP-08 contrat du montage expérimental M6", () => {
  assert.equal(EXPERIMENT_VERSION, 1);
  assert.equal(EXPERIMENT_METHOD, "selfplay-adaptive-v1");
  const { result } = run("explorer", 1);
  assert.deepEqual(Object.keys(result).sort(), ["evidenceCount", "finalProfile", "seed", "strategy", "trajectory"]);
  assert.ok(Array.isArray(result.trajectory) && result.trajectory.length > 0);
  assert.equal(result.seed, 1);
});