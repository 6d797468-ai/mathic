import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSession, apply, evaluate, isWon, finalScore } from "../../src/b1/engine.mjs";
import { LADDER } from "../../src/b1/levels.mjs";
import {
  PROFILE_SCHEMA_VERSION,
  DETECTOR_VERSION,
  PROFILE_DIMENSIONS,
  DEFAULT_PROFILE,
  isProfileShape,
  validateProfile,
  FORBIDDEN_EVIDENCE_FIELDS,
} from "../../src/intel/contracts.mjs";
import { createEvidenceRecorder, createClock } from "../../src/intel/evidence.mjs";
import {
  DETECTION_METHOD,
  SUFFICIENT_EVIDENCE_MIN,
  HIGH_CONFIDENCE_MIN,
  HIGH_CONFIDENCE_THRESHOLD,
  PROFILE_STATES,
  createProfileDetector,
  detectProfile,
  profileState,
} from "../../src/intel/profile.mjs";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const level = (id) => LADDER.find((l) => l.id === id);
const DIMENSION_KEYS = PROFILE_DIMENSIONS.filter((k) => k !== "confidence" && k !== "evidenceWindow");

// Évidence valide de test (forme contractuelle minimale).
const E = (type, payload = {}, levelId = "N7") => ({ type, levelId, atMs: 0, payload });
const win = () => E("LEVEL_COMPLETED", { score: 15, movesLeft: 1 });
const fail = () => E("LEVEL_FAILED", { reason: "move_limit" });
const preview = (chainRun = 0) => E("ACTION_PREVIEWED", { a: 0, op: 1, b: 2, result: 6, delta: 1, chainRun });
const commit = (chainRun = 0) => E("ACTION_COMMITTED", { a: 0, op: 1, b: 2, result: 6, delta: 1, chainRun });

const chainSession = () => [E("LEVEL_STARTED"), preview(0), commit(0), preview(1), commit(1), E("CHAIN_STARTED", { run: 1 }), win()];
const plainSession = () => [E("LEVEL_STARTED"), preview(0), commit(0), win()];

function assertValidProfile(p) {
  assert.equal(isProfileShape(p), true, "forme de profil conforme");
  assert.deepEqual(validateProfile(p), [], "profil valide");
  assert.equal(p.version, PROFILE_SCHEMA_VERSION);
  for (const dim of DIMENSION_KEYS) {
    assert.ok(p[dim] >= 0 && p[dim] <= 1 && Number.isFinite(p[dim]), `${dim} ∈ [0,1]`);
  }
  assert.ok(p.confidence >= 0 && p.confidence <= 1, "confidence ∈ [0,1]");
  assert.ok(Number.isInteger(p.evidenceWindow) && p.evidenceWindow >= 0, "evidenceWindow ≥ 0");
}

// ---------------------------------------------------------------------------
// P-01 → P-16 (mandat) + intégration réelle
// ---------------------------------------------------------------------------

test("P-01 : profil vide — NO EVIDENCE, dimensions neutres, confidence 0 (≠ comportement faible)", () => {
  const r = detectProfile([]);
  assertValidProfile(r.profile);
  for (const dim of DIMENSION_KEYS) assert.equal(r.profile[dim], 0, `${dim} neutre sans information`);
  assert.equal(r.profile.confidence, 0);
  assert.equal(r.profile.evidenceWindow, 0);
  assert.equal(r.state, "NO EVIDENCE");
  assert.equal(r.accepted, 0);
  assert.equal(r.rejected, 0);
  assert.equal(r.version, PROFILE_SCHEMA_VERSION);
  assert.equal(r.method, DETECTION_METHOD);
  const det = createProfileDetector();
  assert.deepEqual(det.profile(), { ...DEFAULT_PROFILE, version: PROFILE_SCHEMA_VERSION });
  assert.equal(det.state(), "NO EVIDENCE");
  assert.equal(det.window(), 0);
});

test("P-02 : une seule évidence — fenêtre 1, LOW EVIDENCE, seules les dimensions touchées bougent", () => {
  const r = detectProfile([commit(0)]);
  assertValidProfile(r.profile);
  assert.equal(r.profile.evidenceWindow, 1);
  assert.equal(r.state, "LOW EVIDENCE");
  assert.equal(r.accepted, 1);
  assert.ok(r.profile.arithmetic > 0 && r.profile.strategy > 0 && r.profile.chainAffinity > 0 && r.profile.efficiency > 0);
  assert.equal(r.profile.hintDependency, 0, "absence d'indice ≠ dépendance nulle évaluée");
  assert.equal(r.profile.retryTolerance, 0);
  const e = r.explanations.find((x) => x.dimension === "efficiency");
  assert.deepEqual(e.evidence, ["ACTION_COMMITTED"]);
  assert.equal(e.evidenceCount, 1);
});

test("P-03 : Evidence suffisantes — SUFFICIENT EVIDENCE puis HIGH CONFIDENCE", () => {
  const sufficient = detectProfile(Array.from({ length: SUFFICIENT_EVIDENCE_MIN }, win));
  assert.equal(sufficient.profile.evidenceWindow, SUFFICIENT_EVIDENCE_MIN);
  assert.equal(sufficient.state, "SUFFICIENT EVIDENCE");
  const rising = detectProfile(Array.from({ length: SUFFICIENT_EVIDENCE_MIN + 4 }, win));
  assert.ok(rising.profile.confidence > 0, "confiance non nulle dès que la fenêtre dépasse le seuil suffisant");
  assert.equal(rising.state, "SUFFICIENT EVIDENCE");

  const eight = [];
  for (let i = 0; i < HIGH_CONFIDENCE_MIN; i++) {
    eight.push(preview(i % 2), commit(i % 2), E("LEVEL_RESTARTED"), E("HINT_REQUESTED"), E("HINT_USED"), E("CHAIN_STARTED", { run: 1 }), fail(), win());
  }
  const high = detectProfile(eight);
  assert.equal(high.profile.evidenceWindow, eight.length);
  assert.ok(high.profile.confidence >= HIGH_CONFIDENCE_THRESHOLD, "confiance haute atteinte");
  assert.equal(high.state, "HIGH CONFIDENCE");
});

test("P-04 : accumulation — fenêtre croissante, incrémental == rejeu pur", () => {
  const det = createProfileDetector();
  const seq = [...chainSession(), ...plainSession(), ...chainSession()];
  const batches = [[...chainSession()], [...plainSession()], [...chainSession()]];
  let last = null;
  for (const b of batches) last = det.update(b);
  assert.equal(det.window(), seq.length, "fenêtre = évidence validées cumulées");
  const pure = detectProfile(seq);
  assert.equal(JSON.stringify(pure.profile), JSON.stringify(last.profile), "incrémental == rejeu depuis zéro");
  assert.deepEqual(last.profile, det.profile());
});

test("P-05 : évolution dynamique — le profil n'est jamais figé après 3 niveaux", () => {
  const det = createProfileDetector();
  // Phase A : exploration griffonnée (invalides, previews, undos).
  det.update([...Array.from({ length: 6 }, () => [E("ACTION_PREVIEWED", { a: 1, op: 1, b: 1, result: 0, delta: 0, chainRun: 0 }), E("ACTION_INVALID", { a: 1, op: 1, b: 1, reason: "cellules incohérentes" })]).flat(), ...Array.from({ length: 3 }, () => E("UNDO_USED", {}))]);
  const afterA = det.profile();
  // Phase B : sessions en chaîne maîtrisées.
  det.update([...chainSession(), ...chainSession(), ...chainSession()]);
  const afterB = det.profile();

  assert.equal(det.window(), afterA.evidenceWindow + chainSession().length * 3, "fenêtre continue de croître");
  assert.ok(afterB.chainAffinity > afterA.chainAffinity + 0.05, "chainAffinity évolue vers le comportement récent");
  assert.ok(afterB.strategy > afterA.strategy + 0.05, "strategy évolue avec la phase récente");
  assert.ok(afterB.retryTolerance === afterA.retryTolerance, "aucun signal de retry en phase B : dimension stable");
  assert.ok(afterB.confidence >= afterA.confidence, "la confiance croît avec la fenêtre");
  assert.notEqual(JSON.stringify(afterA), JSON.stringify(afterB), "profil dynamique (pas figé)");
  assertValidProfile(afterB);
});

test("P-06 : comportement contradictoire — aucun écrasement, bornes respectées", () => {
  // Indices + chaînes + erreurs + retries coexistent sans zéroriser une dimension.
  const stream = [
    ...Array.from({ length: 8 }, () => E("HINT_USED", {})),
    ...Array.from({ length: 8 }, () => E("CHAIN_STARTED", { run: 1 })),
    ...Array.from({ length: 8 }, () => E("ACTION_INVALID", { a: 1, op: 1, b: 1, reason: "x" })),
    ...Array.from({ length: 8 }, () => E("LEVEL_RESTARTED", {})),
    win(), win(), win(), win(),
  ];
  const r = detectProfile(stream);
  assertValidProfile(r.profile);
  assert.ok(r.profile.hintDependency > 0.5, "dépendance aux indices mesurée");
  assert.ok(r.profile.chainAffinity > 0.5, "affinité chaîne mesurée");
  assert.ok(r.profile.difficultyResponse > 0.5, "réponse à la difficulté mesurée");
  assert.ok(r.profile.retryTolerance > 0.5, "tolérance à la reprise mesurée");
  for (const dim of DIMENSION_KEYS) assert.ok(r.profile[dim] < 1, `${dim} bornée à < 1`);
  // Une erreur unique ne zérorise pas exploration : elle la porte à un signal fini.
  const oneError = detectProfile([E("ACTION_INVALID", { a: 1, op: 1, b: 1, reason: "x" })]);
  assert.ok(oneError.profile.exploration > 0 && oneError.profile.exploration < 0.5, "1 erreur ⇒ exploration ∈ (0,0.5)");
});

test("P-07 : profil borné 0..1 sur grand volume", () => {
  const big = [];
  for (let i = 0; i < 40; i++) {
    big.push(
      preview(i % 2), commit(i % 2),
      E("ACTION_INVALID", { a: i, op: i + 1, b: i + 1, reason: "x" }),
      E("HINT_REQUESTED", {}), E("HINT_USED", {}),
      E("LEVEL_RESTARTED", {}),
      E("CHAIN_STARTED", { run: 1 }),
      E("CHAIN_BROKEN", { prevRun: 1 }),
      fail(), win(),
    );
  }
  const r = detectProfile(big);
  assertValidProfile(r.profile);
  assert.equal(r.profile.evidenceWindow, big.length);
  for (const dim of DIMENSION_KEYS) assert.ok(r.profile[dim] > 0 && r.profile[dim] < 1, `${dim} strictement dans ]0,1[`);
});

test("P-08 : confidence bornée et monotone avec la fenêtre", () => {
  const probe = [];
  for (let i = 0; i < HIGH_CONFIDENCE_MIN + 10; i++) probe.push(preview(i % 2), commit(i % 2), win());
  let prev = 0;
  for (let n = 0; n < probe.length; n += 5) {
    const r = detectProfile(probe.slice(0, n));
    assert.ok(r.profile.confidence >= 0 && r.profile.confidence <= 1, `confidence ∈ [0,1] à n=${n}`);
    assert.ok(PROFILE_STATES.includes(r.state), `état connu à n=${n}`);
    assert.ok(r.profile.confidence >= prev - 1e-9, "confidence non décroissante (même composition)");
    prev = r.profile.confidence;
  }
  assert.equal(detectProfile([]).profile.confidence, 0);
  const full = [];
  for (let i = 0; i < HIGH_CONFIDENCE_MIN; i++) full.push(preview(i % 2), commit(i % 2), E("LEVEL_RESTARTED"), E("HINT_USED"), E("CHAIN_STARTED", { run: 1 }), fail(), win());
  const high = detectProfile(full);
  assert.ok(high.profile.confidence <= 1 && high.profile.confidence >= HIGH_CONFIDENCE_THRESHOLD);
});

test("P-09 : reproductibilité — même évidence + même version + même config = même profil", () => {
  const seq = [...chainSession(), ...plainSession(), ...Array.from({ length: 5 }, () => E("HINT_USED", {}))];
  const a = detectProfile(seq);
  const b = detectProfile(seq);
  assert.equal(JSON.stringify(a.profile), JSON.stringify(b.profile), "JSON identique (ordre de propriété indifférent)");
  const det1 = createProfileDetector();
  const det2 = createProfileDetector();
  const r1 = det1.update(seq);
  const r2 = det2.update(seq);
  assert.equal(JSON.stringify(r1.profile), JSON.stringify(r2.profile));
  assert.equal(JSON.stringify(r1.profile), JSON.stringify(a.profile), "détecteur incrémental == fonction pure");
  assert.equal(a.detectorVersion, DETECTOR_VERSION);
  // Pas de dépendance à Date.now/Math.random : le rejeu différé est identique.
  const later = detectProfile(seq);
  assert.equal(JSON.stringify(later.profile), JSON.stringify(a.profile));
});

test("P-10 : fenêtre déterministe — le comportement récent domine (poids décroissants)", () => {
  const lowThenHigh = [
    ...Array.from({ length: 20 }, () => [preview(0), commit(0)]).flat(),
    ...Array.from({ length: 20 }, () => [preview(1), commit(1)]).flat(),
  ];
  const highThenLow = [
    ...Array.from({ length: 20 }, () => [preview(1), commit(1)]).flat(),
    ...Array.from({ length: 20 }, () => [preview(0), commit(0)]).flat(),
  ];
  const a = detectProfile(lowThenHigh);
  const b = detectProfile(highThenLow);
  assert.equal(a.profile.evidenceWindow, b.profile.evidenceWindow, "même fenêtre");
  assert.ok(a.profile.strategy > b.profile.strategy + 0.01, "récent high > ancien high (décroissance pondérée)");
  assert.equal(JSON.stringify(detectProfile(lowThenHigh).profile), JSON.stringify(a.profile), "fenêtre reproductible");
});

test("P-11 : données interdites — rejetées, jamais réfléchies dans le profil", () => {
  const rogue = { ...win(), age: 42, iq: 99, deviceId: "x", personality: "t" };
  const r = detectProfile([rogue, null, "x", { type: "BOGUS", levelId: "N7", atMs: 0 }]);
  assert.equal(r.rejected, 4, "4 évidences rejetées (invalides)");
  assert.equal(r.accepted, 0);
  assert.deepEqual(r.profile, { ...DEFAULT_PROFILE, version: PROFILE_SCHEMA_VERSION }, "profil sûr par défaut");
  const serialized = JSON.stringify(r.profile);
  for (const f of FORBIDDEN_EVIDENCE_FIELDS) assert.ok(!serialized.includes(`"${f}"`), `pas de champ interdit ${f}`);
  const valid = detectProfile([win()]);
  assert.ok(valid.profile.arithmetic > 0);
  const stream = [...Array.from({ length: 30 }, () => [preview(0), commit(0), win(), fail()]).flat(), rogue];
  const out = detectProfile(stream);
  assert.equal(out.rejected, 1);
  assert.equal(Object.keys(out.profile).every((k) => PROFILE_DIMENSIONS.includes(k) || k === "version"), true);
});

test("P-12 : corruption — l'émission invalide n'altère pas le profil valide", () => {
  const clean = detectProfile([win(), preview(0), commit(0)]);
  const mixed = detectProfile([win(), { bogus: true }, preview(0), { type: "LEVEL_STARTED", levelId: "", atMs: 0 }, commit(0), -1]);
  assert.equal(mixed.rejected, 3);
  assert.equal(mixed.accepted, 3);
  assert.equal(JSON.stringify(mixed.profile), JSON.stringify(clean.profile), "profil identique au flux pur");
  assertValidProfile(mixed.profile);
});

test("P-13 : version de schéma — v2 active, version ancienne rejetée sans migration silencieuse", () => {
  assert.equal(PROFILE_SCHEMA_VERSION, 2, "migration v1→v2 documentée");
  assert.equal(DETECTOR_VERSION, 1, "méthode de détection v1");
  const r = detectProfile(chainSession());
  assert.equal(r.profile.version, PROFILE_SCHEMA_VERSION);
  assert.equal(r.version, PROFILE_SCHEMA_VERSION);
  const old = { ...DEFAULT_PROFILE, version: PROFILE_SCHEMA_VERSION - 1 };
  assert.equal(isProfileShape(old), false, "ancienne version non conforme au schéma courant");
  const withOld = detectProfile(chainSession(), { previous: old });
  assert.equal(withOld.profile.version, PROFILE_SCHEMA_VERSION, "le détecteur reste sur la version courante");
  for (const dim of DIMENSION_KEYS) assert.ok(dim in withOld.delta, `delta documenté pour ${dim}`);
});

test("P-14 : frontière — le détecteur n'importe jamais le Game Core, ni l'inverse", () => {
  const src = read("src/intel/profile.mjs");
  assert.ok(src.includes('from "./contracts.mjs"'), "s'appuie uniquement sur le plan de contrat");
  assert.ok(!/from\s+["']\.\.\//.test(src), "aucun import vers le Game Core dans profile.mjs");
  assert.ok(!src.includes("document.") && !src.includes("window.") && !src.includes("localStorage"), "aucun accès DOM/runtime");
  for (const rel of ["src/b1/engine.mjs", "src/b1/solver.mjs", "src/b1/levels.mjs"]) {
    assert.ok(!read(rel).includes("intel"), `${rel} : aucune référence à l'intelligence`);
  }
});

test("P-15 : fail-safe — entrées absentes/corrompues ⇒ profil sûr, le jeu continue", () => {
  for (const bad of [null, undefined, "nope", 42]) {
    const r = detectProfile(bad);
    assert.equal(r.state, "NO EVIDENCE");
    assert.equal(r.profile.confidence, 0);
    assert.deepEqual(r.profile, { ...DEFAULT_PROFILE, version: PROFILE_SCHEMA_VERSION });
  }
  const det = createProfileDetector({ windowSize: 0 });
  assert.equal(det.config().windowSize, 20, "config aberrante ⇒ repli sur le défaut");
  const upd = det.update(null);
  assert.equal(upd.profile.evidenceWindow, 0);
  assert.equal(upd.rejected, 0);
  assert.equal(typeof upd.explanations, "object");
  // Aucun profil ne peut bloquer un joueur : confidence 0 → état NO EVIDENCE (repli policy doc).
  assert.equal(profileState(detectProfile([]).profile), "NO EVIDENCE");
});

test("P-16 : aucune mutation — l'évidence et l'état réel restent intacts", () => {
  const evidence = Object.freeze(chainSession().map((e) => Object.freeze(e)));
  const before = JSON.stringify(evidence);
  const r = detectProfile(evidence);
  assert.equal(JSON.stringify(evidence), before, "entrée non mutée");
  assertValidProfile(r.profile);
  // Le détecteur ne possède aucune capacité d'écriture sur le GameState.
  for (const cap of ["apply", "mutate", "setBoard", "setState", "setScore", "commit"]) {
    assert.equal(typeof createProfileDetector()[cap], "undefined", `aucune capacité ${cap}`);
  }
  // Un appel répété ne dépend pas d'un état global externe.
  const s0 = createSession(level("N7"));
  const frozen = JSON.stringify(s0);
  detectProfile(chainSession());
  assert.equal(JSON.stringify(s0), frozen, "GameState intact");
});

test("P-17 : intégration réelle — Engine réel → Evidence réelle → profil valide", () => {
  const collect = (levelId, path, sessionId) => {
    const recorder = createEvidenceRecorder({ levelId, sessionId, clock: createClock({ now: (() => { let t = 0; return () => (t += 3); })() }) });
    let s = createSession(level(levelId));
    recorder.started();
    for (const act of path) {
      const ev = evaluate(s, act);
      recorder.previewed(ev);
      const nxt = apply(s, act);
      recorder.committed(nxt.events[nxt.events.length - 1]);
      s = nxt;
    }
    if (isWon(s)) recorder.completed({ score: finalScore(s), movesLeft: s.movesLeft });
    return recorder.events();
  };

  const n7 = collect("N7", [{ a: 0, op: 4, b: 1 }, { a: 0, op: 5, b: 2 }], "sess-P17-a");
  const n13 = collect("N13", [{ a: 0, op: 5, b: 1 }, { a: 0, op: 6, b: 2 }, { a: 4, op: 7, b: 3 }], "sess-P17-b");
  assert.ok(n7.length > 0 && n13.length > 0, "évidence réelle produite");
  for (const ev of [...n7, ...n13]) assert.ok(validateProfileEvidence(ev));

  const r = detectProfile([...n7, ...n13]);
  assertValidProfile(r.profile);
  assert.equal(r.profile.evidenceWindow, n7.length + n13.length, "toute évidence réelle est consommée");
  assert.equal(r.rejected, 0);
  assert.ok(r.profile.arithmetic > 0, "victoire réelle → arithmetic > 0");
  assert.ok(r.profile.chainAffinity > 0, "chaîne réelle N13 → chainAffinity > 0");
  assert.ok(r.profile.strategy > 0);
  assert.ok(r.explanations.length > 0, "explications traçables vers des types d'évidence réels");
  for (const e of r.explanations) assert.ok(Array.isArray(e.evidence) && e.evidence.length > 0);
});

function validateProfileEvidence(ev) {
  return typeof ev.type === "string" && ev.type.length > 0 && ev.atMs >= 0 && ev.levelId.length > 0;
}

// ---------------------------------------------------------------------------
// Dimension par dimension (mandat §14)
// ---------------------------------------------------------------------------

const dimOf = (stream, dim) => detectProfile(stream).profile[dim];

test("DIM arithmetic : victoires réelles > échecs", () => {
  const wins = dimOf([...Array.from({ length: 12 }, () => win())], "arithmetic");
  const fails = dimOf([...Array.from({ length: 12 }, () => fail())], "arithmetic");
  assert.ok(wins > fails + 0.3, `wins=${wins} > fails=${fails}`);
  assert.ok(wins > 0 && wins < 1);
});

test("DIM exploration : exploration griffonnée > flux minimal", () => {
  const scratch = dimOf([...Array.from({ length: 12 }, () => [preview(0), E("ACTION_INVALID", { a: 1, op: 1, b: 1, reason: "x" }), E("UNDO_USED", {})]).flat()], "exploration");
  const minimal = dimOf([...Array.from({ length: 12 }, () => win())], "exploration");
  assert.ok(scratch > minimal + 0.1, `scratch=${scratch} > minimal=${minimal}`);
});

test("DIM strategy : chaînes planifiées > coups isolés", () => {
  const planned = dimOf([...Array.from({ length: 12 }, () => chainSession()).flat()], "strategy");
  const isolated = dimOf([...Array.from({ length: 12 }, () => plainSession()).flat()], "strategy");
  assert.ok(planned > isolated + 0.05, `planned=${planned} > isolated=${isolated}`);
});

test("DIM efficiency : victoires nettes + chaînes > chemin long", () => {
  const sharp = dimOf([E("LEVEL_COMPLETED", { score: 20, movesLeft: 1 }), commit(1), E("CHAIN_STARTED", { run: 1 })], "efficiency");
  const grind = dimOf([E("LEVEL_COMPLETED", { score: 5, movesLeft: 0 }), commit(0), E("ACTION_INVALID", { a: 1, op: 1, b: 1, reason: "x" })], "efficiency");
  assert.ok(sharp > grind + 0.15, `sharp=${sharp} > grind=${grind}`);
});

test("DIM chainAffinity : sessions chaînées > sans aucune chaîne", () => {
  const chained = dimOf([...Array.from({ length: 8 }, () => chainSession()).flat()], "chainAffinity");
  const flat = dimOf([...Array.from({ length: 8 }, () => win())], "chainAffinity");
  assert.ok(chained > flat + 0.3, `chained=${chained} > flat=${flat}`);
  assert.equal(flat, 0, "aucun signal chaîne ⇒ 0 (neutre, pas jugement)");
});

test("DIM hintDependency : indices utilisés > aucun indice", () => {
  const withHints = dimOf([...Array.from({ length: 10 }, () => E("HINT_USED", {}))], "hintDependency");
  const noHints = dimOf([...Array.from({ length: 10 }, () => win())], "hintDependency");
  assert.ok(withHints > 0.5 && noHints === 0, `withHints=${withHints} > 0, noHints=${noHints} = 0`);
});

test("DIM retryTolerance : reprises répétées > flux sans reprise", () => {
  const retriers = dimOf([...Array.from({ length: 10 }, () => E("LEVEL_RESTARTED", {}))], "retryTolerance");
  const calm = dimOf([...Array.from({ length: 10 }, () => win())], "retryTolerance");
  assert.ok(retriers > 0.5 && calm === 0, `retriers=${retriers}, calm=${calm}`);
});

test("DIM difficultyResponse : difficulté affrontée > victoires faciles", () => {
  const hard = dimOf([...Array.from({ length: 12 }, () => E("ACTION_INVALID", { a: 1, op: 1, b: 1, reason: "x" }))], "difficultyResponse");
  const easy = dimOf([...Array.from({ length: 12 }, () => win())], "difficultyResponse");
  assert.ok(hard > easy + 0.1, `hard=${hard} > easy=${easy}`);
});