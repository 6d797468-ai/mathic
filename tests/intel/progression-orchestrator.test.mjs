// MATHIC 1.0 — Progression Orchestrator (MISSION 4) — tests
//
// Couvre le pipeline d'application contrôlée de la recommandation : lecture de
// la save réelle, catalogue réel (LADDER), décision Policy, re-validation et
// application via setCurrent + saveNow (jamais unlockTo/markCompleted), boucle
// de rétroaction persistée (clé séparée, versionnée), et l'INVARIANT CENTRAL :
// aucun chemin d'échec / de repli n'écrit dans la save du jeu.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LADDER } from "../../src/b1/levels.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import { SAVE_KEY } from "../../src/b1/save.mjs";
import { POLICY_VERSION, PROFILE_SCHEMA_VERSION } from "../../src/intel/contracts.mjs";
import { policyConfiguration, recommend, isProgressionRecommendation, REASON_CODES } from "../../src/intel/progression-policy.mjs";
import {
  ORCHESTRATOR_VERSION,
  ORCHESTRATOR_ACTIONS,
  INTEL_LOOP_KEY,
  loadIntelLoop,
  applyRecommendation,
  orchestrate,
} from "../../src/intel/progression-orchestrator.mjs";

// ---------------------------------------------------------------------------
// Fixtures réelles — catalogue N1-N36 certifié + métadonnées de design (Solver)
// ---------------------------------------------------------------------------

const ANALYSIS = analyzeAll({ budget: 40000 });
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const IDS = ANALYSIS.map((a) => a.id);
const DIFFICULTY = Object.fromEntries(IDS.map((id) => [id, { index: Number(id.slice(1)) }]));

const memoryStorage = () => {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => void m.set(k, v),
    _raw: m,
  };
};

const readSource = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

// Save réaliste : N1..N6 débloqués, N1..N5 terminés, joueur sur N3.
function seedSave(storage, { current = "N3", unlockedCount = 6, completedCount = 5 } = {}) {
  const unlocked = IDS.slice(0, unlockedCount);
  const completed = Object.fromEntries(IDS.slice(0, completedCount).map((id) => [id, { wins: 1, bestScore: 10 }]));
  const save = { version: 1, unlocked, completed, current };
  storage.set(SAVE_KEY, JSON.stringify(save));
  return save;
}

const BASE = {
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
  version: PROFILE_SCHEMA_VERSION,
};
const P = (over = {}) => ({ ...BASE, ...over });

function appInputs(storage, over = {}) {
  return { storage, metadata: META, difficulty: DIFFICULTY, profile: P({ exploration: 0.9 }), ...over };
}

function expectOutcomeShape(o) {
  assert.equal(o.orchestratorVersion, ORCHESTRATOR_VERSION);
  assert.ok(ORCHESTRATOR_ACTIONS.includes(o.action), `action '${o.action}' documentée`);
  assert.ok(o.level === null || typeof o.level === "string", "level : null | string");
  assert.ok(Array.isArray(o.reasonCodes), "reasonCodes : array");
  for (const c of o.reasonCodes) assert.ok(REASON_CODES.includes(c), `reasonCode '${c}' du vocabulaire Policy`);
  assert.equal(typeof o.stateChanged, "boolean");
}

const loadStored = (st, key) => {
  const raw = st._raw.get(key);
  return raw ? JSON.parse(raw) : null;
};

// ---------------------------------------------------------------------------
// PIPELINE — application contrôleée
// ---------------------------------------------------------------------------

test("O-01 : APPLIED — setCurrent + saveNow uniquement, aucun déblocage, aucune altération", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const out = orchestrate(appInputs(st));
  expectOutcomeShape(out);
  assert.equal(out.action, "APPLIED");
  assert.equal(out.stateChanged, true);
  // Les couches coïncident : l'orchestrator applique EXACTEMENT la recommandation Policy.
  const expected = recommend({ candidates: IDS, progression: save, metadata: META, difficulty: DIFFICULTY, profile: P({ exploration: 0.9 }) });
  assert.equal(out.level, expected.recommendedLevel, "niveau appliqué == recommandation Policy");
  assert.ok(!out.reasonCodes.includes("STABILITY_HOLD"), "flux initial : pas d'hystérésis");
  // Save : current mis à jour, unlocked/completed INTACTS (pas de bypass, pas d'écritures perdues)
  const saved = loadStored(st, SAVE_KEY);
  assert.equal(saved.current, expected.recommendedLevel);
  assert.deepEqual(saved.unlocked, save.unlocked, "aucun déblocage");
  assert.deepEqual(saved.completed, save.completed, "aucune altération des complétions");
  // Boucle persistée (clé séparée), bien formée et versionnée
  const loop = loadStored(st, INTEL_LOOP_KEY);
  assert.equal(loop.version, 1);
  assert.equal(loop.policyVersion, POLICY_VERSION);
  assert.equal(loop.held, expected.recommendedLevel);
  assert.deepEqual(loop.history, [expected.candidateLevel], "historique des candidats bruts");
  assert.equal(loop.mode, expected.mode);
  assert.notEqual(INTEL_LOOP_KEY, SAVE_KEY, "la boucle n'écrit jamais dans la save du jeu");
});

test("O-02 : NO_OP idempotent — niveau déjà courant, zéro écriture de save", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const expected = recommend({ candidates: IDS, progression: save, metadata: META, difficulty: DIFFICULTY, profile: P({ exploration: 0.9 }) });
  const st2 = memoryStorage();
  seedSave(st2, { current: expected.recommendedLevel });
  const before = st2._raw.get(SAVE_KEY);
  const out = orchestrate(appInputs(st2));
  expectOutcomeShape(out);
  assert.equal(out.action, "NO_OP");
  assert.equal(out.stateChanged, false);
  assert.equal(st2._raw.get(SAVE_KEY), before, "save inchangée (idempotence §13)");
});

test("O-03 : applyRecommendation — re-validation défensive, aucun rejet n'écrit", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const snapshot = st._raw.get(SAVE_KEY);
  const valid = { policyVersion: POLICY_VERSION, policyMethod: "progression-rule-v1", mode: "ADAPTIVE", recommendedLevel: "N4", candidateLevel: "N4", reasonCodes: ["STRATEGY_MATCH"], profileConfidence: 0.8, policyConfidence: 0.7, stability: { windowSize: 3, held: false }, rankedLevels: [], eligibleLevels: ["N4"], rejectedLevels: [] };

  // La forme prime (§13) : l'incohérence d'éligibilité (niveau hors eligibleLevels)
  // est une corruption de FORME — isProgressionRecommendation l'exige (§12 §13).
  // → INVALID_RECOMMENDATION, jamais atteint LEVEL_NOT_ELIGIBLE (défense en
  //   profondeur : elle ne peut pas être déclenchée par une recommandation
  //   bien formée, seul un bogue de l'appelant l'exposerait).
  const invalid = applyRecommendation(save, { ...valid, eligibleLevels: ["N7"] }, { storage: st });
  assert.deepEqual([invalid.ok, invalid.detail], [false, "INVALID_RECOMMENDATION"]);
  const locked = applyRecommendation(save, { ...valid, recommendedLevel: "N9", eligibleLevels: ["N9"] }, { storage: st });
  assert.deepEqual([locked.ok, locked.detail], [false, "LEVEL_LOCKED"]);
  const shape = applyRecommendation(save, { ...valid, reasonCodes: ["BOGUS"] }, { storage: st });
  assert.deepEqual([shape.ok, shape.detail], [false, "INVALID_RECOMMENDATION"]);
  // "already current" : la recommandation vise LE niveau déjà courant → NO_OP,
  //   zéro écriture. (target = N3 = current de la save seedée.)
  const currentRec = { ...valid, recommendedLevel: "N3", candidateLevel: "N3", rankedLevels: [], eligibleLevels: ["N3"] };
  const nothing = applyRecommendation(save, currentRec, { storage: st });
  assert.deepEqual([nothing.ok, nothing.noop, nothing.detail], [true, true, "ALREADY_CURRENT"]);
  const nullLevel = applyRecommendation(save, { ...valid, recommendedLevel: null }, { storage: st });
  assert.deepEqual([nullLevel.ok, nullLevel.noop, nullLevel.detail], [true, true, "NOTHING_TO_APPLY"]);
  assert.equal(st._raw.get(SAVE_KEY), snapshot, "aucun rejet / noop n'a écrit la save");
});

test("O-03b : applyRecommendation — succès AP (APPLIED) uniquement via primitives autorisées", () => {
  const st = memoryStorage();
  const save = seedSave(st, { current: "N2" });
  const valid = { policyVersion: POLICY_VERSION, mode: "ADAPTIVE", recommendedLevel: "N4", candidateLevel: "N4", reasonCodes: ["STRATEGY_MATCH"], profileConfidence: 0.8, policyConfidence: 0.7, stability: { windowSize: 3, held: false }, rankedLevels: [], eligibleLevels: ["N4"], rejectedLevels: [] };
  const r = applyRecommendation(save, valid, { storage: st });
  assert.deepEqual([r.ok, r.noop], [true, false]);
  const saved = loadStored(st, SAVE_KEY);
  assert.equal(saved.current, "N4");
  assert.deepEqual(saved.unlocked, save.unlocked, "jamais de déblocage via l'orchestrator");
});

// ---------------------------------------------------------------------------
// Repli sûr et kill-switch — observateur pur
// ---------------------------------------------------------------------------

test("O-04 : kill-switch — config mode SAFE_DEFAULT, AUCUNE écriture (save ni boucle)", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const out = orchestrate(appInputs(st, { profile: P({ exploration: 0.9 }), config: { mode: "SAFE_DEFAULT" } }));
  expectOutcomeShape(out);
  assert.equal(out.action, "SAFE_DEFAULT");
  assert.equal(out.stateChanged, false);
  assert.equal(st._raw.get(SAVE_KEY), JSON.stringify(save), "save intacte");
  assert.equal(st._raw.get(INTEL_LOOP_KEY), undefined, "aucune boucle écrite");
  assert.equal(st._raw.size, 1, "aucune autre clé créée (seule la save pré-existante)");
});

test("O-09 : repli sûr (profil absent/invalide/confiance insuffisante) — observateur pur", () => {
  for (const [label, profile] of [["absent", null], ["invalide", { ...BASE, version: 1 }], ["faible", P({ confidence: 0.2 })]]) {
    const st = memoryStorage();
    const save = seedSave(st);
    const out = orchestrate(appInputs(st, { profile }));
    expectOutcomeShape(out);
    assert.equal(out.action, "SAFE_DEFAULT", `${label} : SAFE_DEFAULT`);
    assert.equal(out.stateChanged, false, `${label} : rien n'est appliqué`);
    assert.equal(out.policyMode, "SAFE_DEFAULT");
    assert.equal(st._raw.get(SAVE_KEY), JSON.stringify(save), `${label} : save intacte`);
    assert.equal(st._raw.get(INTEL_LOOP_KEY), undefined, `${label} : aucune boucle écrite`);
    assert.ok(out.reasonCodes.includes("SAFE_DEFAULT_PROGRESSION"), `${label} : raison documentée`);
  }
});

// ---------------------------------------------------------------------------
// Boucle de rétroaction (§9) — persistance, versionnage, bornage
// ---------------------------------------------------------------------------

test("O-05 : boucle persistée, bornée à maxHistory, idempotente", () => {
  const st = memoryStorage();
  seedSave(st, { current: "N2" });
  const first = orchestrate(appInputs(st));
  const loop1 = loadStored(st, INTEL_LOOP_KEY);
  assert.ok(loop1.history.length >= 1 && loop1.history.length <= 3, "historique borné");
  // Second appel à entrées identiques : NO_OP + boucle inchangée (aucune réécriture inutile)
  const beforeLoop = st._raw.get(INTEL_LOOP_KEY);
  const second = orchestrate(appInputs(st));
  assert.equal(second.action, "NO_OP");
  assert.equal(st._raw.get(INTEL_LOOP_KEY), beforeLoop, "idempotence de la boucle");
  assert.equal(first.level, loop1.held);
  assert.equal(second.level, loop1.held);
});

test("O-06 : loadIntelLoop — corruptions jetées, version/policyVersion opposables, bornage", () => {
  const mk = (value) => {
    const st = memoryStorage();
    if (value !== undefined) st.set(INTEL_LOOP_KEY, value);
    return st;
  };
  for (const bad of ["{{{{", "[]", "42", '"x"', JSON.stringify({ version: 2, held: "N5", history: ["N5"] }), JSON.stringify({ version: 1, policyVersion: 99, held: "N5", history: ["N5"] })]) {
    const loop = loadIntelLoop(mk(bad));
    assert.deepEqual(loop, { held: null, history: [], mode: null }, `corruption jetée : ${bad.slice(0, 40)}`);
  }
  const empty = loadIntelLoop(mk(undefined));
  assert.deepEqual(empty, { held: null, history: [], mode: null }, "aucune boucle → état vide");
  // Bornage de l'historique chargé
  const big = memoryStorage();
  big.set(INTEL_LOOP_KEY, JSON.stringify({ version: 1, policyVersion: POLICY_VERSION, held: "N8", history: ["N8", "N7", "N6", "N5", "N4"], mode: "ADAPTIVE" }));
  const cap = loadIntelLoop(big, { maxHistory: 3 });
  assert.equal(cap.held, "N8");
  assert.deepEqual(cap.history, ["N8", "N7", "N6"], "historique borné à 3");
  assert.equal(cap.mode, "ADAPTIVE");
});

test("O-10 : roundtrip boucle — relecture fidèle après orchestration", () => {
  const st = memoryStorage();
  seedSave(st, { current: "N2" });
  orchestrate(appInputs(st));
  const loop = loadIntelLoop(st, { maxHistory: 3 });
  const stored = loadStored(st, INTEL_LOOP_KEY);
  assert.equal(loop.held, stored.held);
  assert.deepEqual(loop.history, stored.history);
  assert.equal(loop.mode, stored.mode);
});

// ---------------------------------------------------------------------------
// Déterminisme, invariances, frontière
// ---------------------------------------------------------------------------

test("O-08 : déterminisme — mêmes entrées ⇒ même outcome et mêmes persistances", () => {
  const run = () => {
    const st = memoryStorage();
    seedSave(st, { current: "N2" });
    const out = orchestrate(appInputs(st));
    return JSON.stringify({ out, save: st._raw.get(SAVE_KEY), loop: st._raw.get(INTEL_LOOP_KEY) });
  };
  assert.equal(run(), run(), "orpipeline déterministe (pas de Date.now / random)");
});

test("O-07 : aucun bypass — le niveau appliqué existe, est admissible et débloqué", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const out = orchestrate(appInputs(st));
  const level = out.level;
  assert.ok(LADDER.some((l) => l.id === level), "niveau réel du catalogue");
  assert.ok(save.unlocked.includes(level), "niveau déjà débloqué (aucun déblocage)");
  const eligible = recommend({ candidates: IDS, progression: save, metadata: META, difficulty: DIFFICULTY, profile: P({ exploration: 0.9 }) }).eligibleLevels;
  assert.ok(eligible.includes(level), "niveau admissible pour la Policy");
});

test("O-11 : frontière — primitives autorisées uniquement, aucune interface d'autorité", () => {
  const src = readSource(`src/intel/progression-orchestrator.mjs`);
  // Seules les primitives de sauvegarde et le catalogue réel sont importés.
  for (const allowed of ["../b1/save.mjs", "../b1/levels.mjs"]) assert.ok(src.includes(allowed), `import autorisé ${allowed} présent`);
  for (const forbidden of ["engine.mjs", "kernel.mjs", "solver.mjs", "replay.mjs", "level-design.mjs", "design.mjs", "unlockTo", "markCompleted", "setGameState", "setState(", "setScore", "localStorage", "Math.random", "Date.now", "fetch(", "WebSocket", "XMLHttpRequest", "document.", "window.", "navigator", "import(", "require("]) {
    assert.ok(!src.includes(forbidden), `source sans '${forbidden}'`);
  }
  // Le Game Core et v5 ne connaissent pas l'orchestrator (frontière préservée).
  for (const f of ["src/b1/kernel.mjs", "src/b1/engine.mjs", "src/b1/solver.mjs", "src/b1/replay.mjs", "src/b1/levels.mjs", "src/b1/save.mjs", "src/b1/design.mjs", "src/b1/level-design.mjs", "src/v5/rules/index.mjs"]) {
    assert.ok(!readSource(f).includes("progression-orchestrator"), `${f} ne référence pas l'orchestrator`);
  }
});

test("O-12 : profil reçu, jamais recalculé — l'orchestrator n'importe ni profile ni evidence", () => {
  const src = readSource(`src/intel/progression-orchestrator.mjs`);
  assert.ok(!src.includes("./profile.mjs"), "aucun import du détecteur de profil");
  assert.ok(!src.includes("./evidence.mjs"), "aucun import de l'Evidence");
  assert.ok(src.includes("inputs.profile"), "le profil arrive par entrée, jamais recalculé");
});

test("O-13 : catalogue réel — les candidats sont les niveaux réellement certifiés du LADDER", () => {
  const st = memoryStorage();
  seedSave(st);
  const out = orchestrate(appInputs(st));
  assert.ok(LADDER.length >= 36, "catalogue réel non vide");
  assert.ok(IDS.every((id) => LADDER.some((l) => l.id === id)), "candidats ⊆ LADDER (aucun niveau inventé)");
  assert.ok(out.level === null || IDS.includes(out.level));
});

test("O-14 : déterminisme de Policy respecté — orchestrate s'appuie sur recommend (même contrat)", () => {
  const st = memoryStorage();
  const save = seedSave(st);
  const out = orchestrate(appInputs(st));
  const direct = recommend({ candidates: IDS, progression: save, metadata: META, difficulty: DIFFICULTY, profile: P({ exploration: 0.9 }) });
  assert.equal(out.level, direct.recommendedLevel, "pas de ré-implementation des règles : même décision que la Policy");
  assert.deepEqual(out.reasonCodes, [...new Set(direct.reasonCodes)], "mêmes raisons que la Policy");
  assert.ok(isProgressionRecommendation(direct), "la Policy produit une recommandation conforme");
});

test("O-15 : configurabilité — les seuils restent portés par PolicyConfiguration (jamais enterrés)", () => {
  const cfg = policyConfiguration();
  assert.equal(cfg.stabilityWindow, 3);
  assert.ok(cfg.confidence.gradual < cfg.confidence.adaptive && cfg.confidence.adaptive <= cfg.confidence.specific);
  const st = memoryStorage();
  seedSave(st, { current: "N2" });
  const out = orchestrate(appInputs(st, { config: cfg }));
  expectOutcomeShape(out);
  assert.ok(ORCHESTRATOR_ACTIONS.includes(out.action));
});