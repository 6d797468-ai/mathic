import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  INTEL_PLANE_VERSION,
  PROFILE_SCHEMA_VERSION,
  POLICY_VERSION,
  EVIDENCE_TYPES,
  FORBIDDEN_EVIDENCE_FIELDS,
  isEvidence,
  validateEvidence,
  PROFILE_DIMENSIONS,
  DEFAULT_PROFILE,
  defaultProfile,
  isProfileShape,
  validateProfile,
  PROVIDER_METHODS,
  isIntelligenceProvider,
  validateIntelligenceProvider,
  hasWriteCapability,
  isRecommendation,
  validateRecommendation,
  isLevelState,
  isAvailableLevels,
  validateProgressionInput,
  isProgressionDecision,
  validateProgressionDecision,
  deterministicDefaultPolicy,
  COACH_METHODS,
  isCoach,
  validateCoach,
  INTEL_PROHIBITIONS,
  validateProhibitionCompliance,
  PROVIDER_CAPABILITIES,
} from "../../src/intel/contracts.mjs";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const DOCS = {
  arch: "docs/design/MATHIC-1-0-INTELLIGENCE-ARCHITECTURE.md",
  evidence: "docs/design/MATHIC-1-0-EVIDENCE-CONTRACT.md",
  profile: "docs/design/MATHIC-1-0-PLAYER-PROFILE-CONTRACT.md",
  provider: "docs/design/MATHIC-1-0-INTELLIGENCE-PROVIDER-CONTRACT.md",
  policy: "docs/design/MATHIC-1-0-PROGRESSION-POLICY-CONTRACT.md",
  coach: "docs/design/MATHIC-1-0-COACH-CONTRACT.md",
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validProfile = () => ({ ...defaultProfile(), strategyTendency: 0.7, confidence: 0.9, evidenceWindow: 12 });

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    for (const k of Object.keys(o)) deepFreeze(o[k]);
    Object.freeze(o);
  }
  return o;
};

const levelState = () => deepFreeze({ unlocked: ["N1", "N2", "N3"], completed: { N1: { wins: 1, bestScore: 10 } } });
const availableLevels = () => deepFreeze([{ id: "N1", world: "W1" }, { id: "N2", world: "W1" }, { id: "N3", world: "W1" }]);

// Un provider conforme au contrat (exemplaire, réutilisé par les tests).
const deterministicStubProvider = (over = {}) => ({
  info: () => ({ providerId: "test-deterministic", capability: "profile", available: true }),
  isAvailable: () => true,
  analyze: (ev) => (Array.isArray(ev) && ev.length ? { kind: "profile", confidence: 0.5, rationale: [`${ev.length} evid.`], providerId: "test-deterministic" } : null),
  recommend: () => ({ kind: "progression", levelIds: [], confidence: 0.5, rationale: ["stub"] }),
  explain: () => ({ kind: "explanation", text: "stub" }),
  ...over,
});

const deterministicStubCoach = (over = {}) => ({
  explain: () => ({ kind: "assistance", text: "pourquoi cette action n'est pas valide" }),
  hint: () => ({ kind: "assistance", lines: ["regarde les opérateurs disponibles"] }),
  encourage: () => ({ kind: "assistance", text: "l'échec est une information" }),
  summarize: () => ({ kind: "assistance", lines: ["3 actions", "1 chaîne"] }),
  recommend: () => ({ kind: "assistance", targets: ["N4"], confidence: 0.4, rationale: ["stub"] }),
  ...over,
});

// ---------------------------------------------------------------------------
// Documentation — marqueurs de contrat
// ---------------------------------------------------------------------------

test("INTEL-C1 : documents de contrat présents et complets (marqueurs)", () => {
  const txts = Object.fromEntries(Object.entries(DOCS).map(([k, rel]) => [k, read(rel)]));
  for (const [k, txt] of Object.entries(txts)) {
    assert.ok(txt.startsWith("# MATHIC 1.0 —"), `${DOCS[k]} : titre du contrat`);
    assert.ok(txt.includes("**Référence**"), `${DOCS[k]} : en-tête de référence`);
    assert.ok(txt.includes("Opposables"), `${DOCS[k]} : décisions opposables`);
  }
  assert.ok(txts.evidence.includes("LEVEL_STARTED") && txts.evidence.includes("RETRY_COUNT"), "evidence : liste d'événements complète");
  assert.ok(txts.evidence.includes("age") && txts.evidence.includes("iq"), "evidence : anti-collecte documentée");
  assert.ok(txts.profile.includes("arithmeticAffinity") && txts.profile.includes("evidenceWindow"), "profile : dimensions documentées");
  assert.ok(txts.profile.includes("confidence"), "profile : confiance documentée");
  assert.ok(txts.provider.includes("DeterministicProvider") && txts.provider.includes("LocalModelProvider"), "provider : implémentations documentées");
  assert.ok(txts.provider.includes("CloudModelProvider") && txts.provider.includes("FutureProvider"), "provider : implémentations documentées");
  assert.ok(txts.policy.includes("DETERMINISTIC DEFAULT POLICY"), "policy : fail-safe documenté");
  assert.ok(txts.coach.includes("explain") && txts.coach.includes("hint") && txts.coach.includes("recommend"), "coach : interface documentée");
  assert.ok(txts.arch.includes("AUCUNE IA DIRECTE"), "architecture : interdiction documentée");
});

// ---------------------------------------------------------------------------
// A. Player Evidence
// ---------------------------------------------------------------------------

test("INTEL-C2 : la liste EVIDENCE_TYPES fige la norme de la feuille de route", () => {
  assert.deepEqual(EVIDENCE_TYPES, [
    "LEVEL_STARTED",
    "LEVEL_COMPLETED",
    "LEVEL_FAILED",
    "ACTION_PREVIEWED",
    "ACTION_COMMITTED",
    "ACTION_INVALID",
    "HINT_REQUESTED",
    "HINT_USED",
    "UNDO_USED",
    "CHAIN_STARTED",
    "CHAIN_BROKEN",
    "TIME_TO_FIRST_ACTION",
    "TIME_TO_SOLUTION",
    "SOLUTION_DEPTH",
    "SOLUTION_SCORE",
    "RETRY_COUNT",
  ]);
});

test("INTEL-C3 : évidence valide acceptée, payload optionnel", () => {
  const ev = { type: "LEVEL_COMPLETED", levelId: "N7", atMs: 12408, payload: { score: 19, movesLeft: 1 } };
  assert.equal(isEvidence(ev), true);
  assert.deepEqual(validateEvidence(ev), []);
  assert.equal(isEvidence({ type: "LEVEL_STARTED", levelId: "N1", atMs: 0 }), true);
});

test("INTEL-C4 : évidence corrompue rejetée (type, levelId, atMs, payload)", () => {
  const cases = [
    { type: "LEVELS_COMPLETED", levelId: "N7", atMs: 1 },
    { type: "LEVEL_COMPLETED", levelId: "", atMs: 1 },
    { type: "LEVEL_COMPLETED", levelId: "N7", atMs: -1 },
    { type: "LEVEL_COMPLETED", levelId: "N7", atMs: Number.NaN },
    { type: "LEVEL_COMPLETED", levelId: "N7", atMs: 1, payload: [1, 2] },
    { type: "LEVEL_COMPLETED", levelId: "N7", atMs: 1, payload: null },
  ];
  for (const c of cases) {
    assert.equal(isEvidence(c), false, JSON.stringify(c));
    assert.ok(validateEvidence(c).length > 0, JSON.stringify(c));
  }
  assert.ok(validateEvidence(null).length > 0, "null : rejeté");
});

test("INTEL-C5 : anti-collecte — aucun champ psychologique ou identifiant", () => {
  assert.ok(FORBIDDEN_EVIDENCE_FIELDS.includes("age"));
  assert.ok(FORBIDDEN_EVIDENCE_FIELDS.includes("iq"));
  assert.ok(FORBIDDEN_EVIDENCE_FIELDS.includes("personality"));
  assert.equal(isEvidence({ type: "LEVEL_COMPLETED", levelId: "N7", atMs: 1, age: 42 }), false);
  assert.equal(isEvidence({ type: "LEVEL_STARTED", levelId: "N1", atMs: 1, personality: "x" }), false);
  const e = validateEvidence({ type: "LEVEL_STARTED", levelId: "N1", atMs: 1, deviceId: "abc" });
  assert.ok(e.some((msg) => msg.includes("champ interdit")), "deviceId rejeté explicitement");
});

// ---------------------------------------------------------------------------
// B. Player Profile
// ---------------------------------------------------------------------------

test("INTEL-C6 : profil par défaut — neutre, complet, figé, déterministe", () => {
  assert.equal(Object.isFrozen(DEFAULT_PROFILE), true, "profil par défaut figé");
  assert.equal(DEFAULT_PROFILE.version, PROFILE_SCHEMA_VERSION);
  assert.equal(isProfileShape(DEFAULT_PROFILE), true);
  assert.deepEqual(validateProfile(DEFAULT_PROFILE), []);
  for (const [k, v] of Object.entries(DEFAULT_PROFILE)) {
    if (k === "version") continue;
    assert.equal(v, 0, `${k} : dimension neutre à 0`);
  }
  assert.equal(JSON.stringify(defaultProfile()), JSON.stringify(defaultProfile()), "construction déterministe (JSON identique)");
  assert.deepEqual(defaultProfile(), { ...DEFAULT_PROFILE }, "représentation stable (ordre figé)");
});

test("INTEL-C7 : profil valide accepté ; corruption rejetée", () => {
  assert.equal(isProfileShape(validProfile()), true);
  assert.deepEqual(validateProfile(validProfile()), []);
  const bad = [
    { ...defaultProfile(), strategyTendency: 1.5 },
    { ...defaultProfile(), explorationTendency: -0.1 },
    { ...defaultProfile(), confidence: 2 },
    { ...defaultProfile(), evidenceWindow: -3 },
    { ...defaultProfile(), chainAffinity: Number.NaN },
    { ...defaultProfile(), version: PROFILE_SCHEMA_VERSION + 1 },
    { ...defaultProfile(), extraKey: 0.5 },
    { ...defaultProfile(), age: 42 },
  ];
  bad.push({ ...validProfile(), version: undefined });
  bad.push(null);
  for (const p of bad) {
    assert.equal(isProfileShape(p), false, JSON.stringify(p));
    assert.ok(validateProfile(p).length > 0, JSON.stringify(p));
  }
});

test("INTEL-C8 : versionnage — version ancienne rejetée, pas de mutation ou d'interprétation silencieuse", () => {
  const old = { ...defaultProfile(), version: PROFILE_SCHEMA_VERSION - 1 };
  assert.equal(isProfileShape(old), false, "version ancienne ≠ profil courant");
  assert.ok(validateProfile(old).some((m) => m.includes("migration")), "message de révision = migration requise");
});

// ---------------------------------------------------------------------------
// C. PlayerIntelligenceProvider
// ---------------------------------------------------------------------------

test("INTEL-C9 : provider conforme accepté, sans capacité d'écriture", () => {
  const p = deterministicStubProvider();
  assert.equal(isIntelligenceProvider(p), true);
  assert.deepEqual(validateIntelligenceProvider(p), []);
  assert.equal(hasWriteCapability(p), false);
  assert.deepEqual(validateProhibitionCompliance(p), []);
  for (const m of PROVIDER_METHODS) assert.equal(typeof p[m], "function", m);
});

test("INTEL-C10 : provider invalide rejeté (méthode manquante, info levée, capability inconnue)", () => {
  const missing = deterministicStubProvider({ explain: undefined });
  assert.deepEqual(validateIntelligenceProvider(missing), ["méthode requise 'explain' manquante"]);
  const throwing = deterministicStubProvider({ info: () => { throw new Error("boom"); } });
  assert.equal(isIntelligenceProvider(throwing), false);
  const badCap = deterministicStubProvider({ info: () => ({ providerId: "x", capability: "telepathy" }) });
  assert.equal(isIntelligenceProvider(badCap), false);
  assert.ok(validateIntelligenceProvider(badCap).some((m) => m.includes("capability")));
  for (const cap of PROVIDER_CAPABILITIES) assert.ok(typeof cap === "string");
});

test("INTEL-C11 : INTEL-PROHIBITION-001/004 — un provider ne possède jamais le GameState", () => {
  const rogue = deterministicStubProvider({ apply: (s, a) => ({ ...s }) });
  assert.equal(hasWriteCapability(rogue), true);
  assert.deepEqual(validateProhibitionCompliance(rogue), [
    "provider : capacité d'écriture interdite (INTEL-PROHIBITION-001/004)",
  ]);
  assert.equal(isIntelligenceProvider(rogue), true, "forme valide malgré la méthode — la conformité à l'interdiction est vérifiée séparément");
  const rogue2 = deterministicStubProvider({ setScore: () => 99, setBoard: () => null });
  assert.equal(hasWriteCapability(rogue2), true);
});

test("INTEL-C12 : les recommandations sont déclaratives — jamais score/board/state/mutation", () => {
  assert.equal(isRecommendation({ kind: "progression", levelIds: ["N7"], confidence: 0.4, rationale: ["x"] }), true);
  assert.equal(isRecommendation({ kind: "explanation", text: "..." }), true);
  assert.equal(isRecommendation({ kind: "assistance", lines: ["..."], confidence: 0.5 }), true);
  const forbidden = [
    { kind: "progression", score: 99 },
    { kind: "progression", board: [1, 2] },
    { kind: "progression", state: {} },
    { kind: "progression", apply: () => {} },
    { kind: "mutation", levelId: "N7" },
    { kind: "progression", mutate: 1 },
  ];
  for (const r of forbidden) {
    assert.equal(isRecommendation(r), false, JSON.stringify(r));
    assert.ok(validateRecommendation(r).length > 0, JSON.stringify(r));
  }
});

// ---------------------------------------------------------------------------
// D. Progression Policy
// ---------------------------------------------------------------------------

test("INTEL-C13 : policy déterministe de repli — allowed ⊆ available, joueur jamais bloqué", () => {
  const st = levelState();
  const avail = availableLevels();
  const d = deterministicDefaultPolicy({ profile: validProfile(), levelState: st, availableLevels: avail });
  assert.ok(d, "décision rendue");
  assert.deepEqual(d.allowedLevels, ["N1", "N2", "N3"], "tous les niveaux disponibles restent proposés");
  assert.deepEqual(d.blockedLevels, [], "aucun débloqué hors périmètre");
  assert.equal(d.confidence, 0.5);
  assert.equal(d.policyVersion, POLICY_VERSION);
  assert.ok(Array.isArray(d.rationale) && d.rationale.length > 0);
  assert.equal(isProgressionDecision(d), true);
  assert.deepEqual(validateProgressionDecision(d), []);
});

test("INTEL-C14 : la policy ne sort jamais du Level System", () => {
  const st = levelState();
  const avail = availableLevels();
  const d = deterministicDefaultPolicy({ profile: validProfile(), levelState: st, availableLevels: avail });
  for (const id of d.allowedLevels) assert.ok(avail.some((l) => l.id === id), `${id} ∈ available`);
  const extra = { ...st, unlocked: ["N1", "N2", "N3", "N99"] };
  const d2 = deterministicDefaultPolicy({ profile: validProfile(), levelState: extra, availableLevels: avail });
  assert.deepEqual(d2.blockedLevels, ["N99"], "le hors-catalogue est signalé bloqué, jamais proposé");
});

test("INTEL-C15 : déterminisme + immutabilité des entrées", () => {
  const inputs = { profile: validProfile(), levelState: levelState(), availableLevels: availableLevels() };
  deepFreeze(inputs);
  const a = deterministicDefaultPolicy(inputs);
  const b = deterministicDefaultPolicy(inputs);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "déterministe (JSON identique)");
  assert.deepEqual(inputs.profile, validProfile(), "profil non muté");
  assert.deepEqual(inputs.levelState.unlocked, ["N1", "N2", "N3"], "levelState non muté");
  assert.deepEqual(inputs.availableLevels, [{ id: "N1", world: "W1" }, { id: "N2", world: "W1" }, { id: "N3", world: "W1" }], "catalogue non muté");
});

test("INTEL-C16 : fail-safe — entrées invalides ⇒ repli nul (jamais de blocage par le contrat)", () => {
  assert.equal(deterministicDefaultPolicy({ profile: { ...defaultProfile(), version: 0 }, levelState: levelState(), availableLevels: availableLevels() }), null);
  assert.equal(deterministicDefaultPolicy({ profile: validProfile(), levelState: { unlocked: "N1" }, availableLevels: availableLevels() }), null);
  assert.equal(deterministicDefaultPolicy({ profile: validProfile(), levelState: levelState(), availableLevels: [] }), null);
  assert.equal(deterministicDefaultPolicy(), null);
  assert.ok(validateProgressionInput({ profile: validProfile(), levelState: levelState(), availableLevels: availableLevels() }) === 0 || validateProgressionInput({ profile: validProfile(), levelState: levelState(), availableLevels: availableLevels() }).length === 0);
  assert.ok(validateProgressionInput({ profile: { ...defaultProfile() }, levelState: { unlocked: [] }, availableLevels: [] }).length > 0);
});

test("INTEL-C17 : décisions corrompues rejetées (validité)", () => {
  const st = levelState();
  const avail = availableLevels();
  const d = deterministicDefaultPolicy({ profile: validProfile(), levelState: st, availableLevels: avail });
  const bad = [
    { ...d, allowedLevels: "N1" },
    { ...d, confidence: 1.5 },
    { ...d, policyVersion: 0 },
    { ...d, rationale: "x" },
    null,
  ];
  for (const x of bad) {
    assert.equal(isProgressionDecision(x), false, JSON.stringify(x));
    assert.ok(validateProgressionDecision(x).length > 0, JSON.stringify(x));
  }
});

// ---------------------------------------------------------------------------
// E. Coach Contract
// ---------------------------------------------------------------------------

test("INTEL-C18 : coach conforme accepté, aucune capacité d'écriture", () => {
  const c = deterministicStubCoach();
  assert.equal(isCoach(c), true);
  assert.deepEqual(validateCoach(c), []);
  for (const m of COACH_METHODS) assert.equal(typeof c[m], "function", m);
});

test("INTEL-C19 : coach invalide rejeté — méthode manquante ou capacité d'écriture", () => {
  const missing = deterministicStubCoach({ recommend: undefined });
  assert.equal(isCoach(missing), false);
  assert.ok(validateCoach(missing).some((m) => m.includes("recommend")));
  const rogue = deterministicStubCoach({ apply: () => {} });
  assert.equal(isCoach(rogue), false);
  assert.ok(validateCoach(rogue).some((m) => m.includes("écriture")));
});

test("INTEL-C20 : le coach ne modifie jamais le contexte (lecture seule) et rend des assistances", () => {
  const ctx = deepFreeze({ currentLevel: { id: "N7" }, kind: "level", score: 19 });
  const c = deterministicStubCoach();
  const before = JSON.stringify(ctx);
  const out = c.recommend(ctx);
  assert.equal(JSON.stringify(ctx), before, "contexte inchangé");
  assert.equal(isRecommendation(out), true, "sortie = assistance déclarative");
  c.summarize(ctx);
  assert.equal(JSON.stringify(ctx), before, "summarize ne touche pas au contexte");
});

// ---------------------------------------------------------------------------
// Frontière architecturale
// ---------------------------------------------------------------------------

test("INTEL-C21 : le plan de contrat ne dépend pas du Game Core (zéro import b1/v5)", () => {
  const src = read("src/intel/contracts.mjs");
  assert.ok(!src.includes('from "./'), "aucun import relatif dans src/intel/contracts.mjs");
  const re = /from\s+["'](\.\.\/)/;
  assert.ok(!re.test(src), "aucun import vers le Game Core");
});

test("INTEL-C22 : pas d'inversion — le Game Core n'importe jamais l'intelligence", () => {
  for (const rel of [
    "src/b1/engine.mjs",
    "src/b1/solver.mjs",
    "src/b1/replay.mjs",
    "src/b1/levels.mjs",
    "src/b1/save.mjs",
    "src/v5/rules/engine.mjs",
    "src/v5/rules/solver.mjs",
  ]) {
    const src = read(rel);
    assert.ok(!src.includes("intel"), `${rel} : aucune référence au plan d'intelligence`);
  }
});

test("INTEL-C23 : les quatre interdictions PORTENT le contrat", () => {
  assert.deepEqual(
    INTEL_PROHIBITIONS.map((p) => p.id),
    ["INTEL-PROHIBITION-001", "INTEL-PROHIBITION-002", "INTEL-PROHIBITION-003", "INTEL-PROHIBITION-004"]
  );
  for (const p of INTEL_PROHIBITIONS) {
    assert.ok(p.rule.includes("jamais"), `${p.id} : règle absolue`);
    assert.ok(typeof p.guard === "string" && p.guard.length > 20, `${p.id} : garde-fou documenté`);
  }
  const txt = read(DOCS.arch);
  assert.ok(txt.includes("AI → GameState") && txt.includes("AI → score"), "interdictions dans l'architecture");
  assert.equal(INTEL_PLANE_VERSION, 1);
});