import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LADDER } from "../../src/b1/levels.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import {
  POLICY_VERSION,
  PROFILE_SCHEMA_VERSION,
  validateProfile,
  isLevelState,
  deterministicDefaultPolicy,
} from "../../src/intel/contracts.mjs";
import {
  POLICY_METHOD,
  POLICY_MODES,
  REASON_CODES,
  PROPERTY_VOCAB,
  PROFILE_RULES,
  policyConfiguration,
  DEFAULT_POLICY_CONFIGURATION,
  eligibility,
  recommend,
  isProgressionRecommendation,
} from "../../src/intel/progression-policy.mjs";

// ---------------------------------------------------------------------------
// Catalogue réel N1-N36 (aucun niveau inventé) + métadonnées de design réelles
// ---------------------------------------------------------------------------

const ANALYSIS = analyzeAll();
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const IDS = ANALYSIS.map((a) => a.id);
const DIFFICULTY = Object.fromEntries(IDS.map((id) => [id, { index: Number(id.slice(1)) }]));

const level = (id) => LADDER.find((l) => l.id === id);
const readSource = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const readModuleSource = () => readSource("src/intel/progression-policy.mjs");
// Le contrat est vérifié sur le CODE, jamais sur la documentation : les
// commentaires décrivent les interdictions et peuvent les nommer.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const readModuleCode = () => stripComments(readModuleSource());

function state(unlockedCount = 6) {
  const unlocked = IDS.slice(0, unlockedCount);
  return {
    unlocked,
    completed: Object.fromEntries(unlocked.slice(0, -1).map((id) => [id, { wins: 1, bestScore: 10 }])),
  };
}

// Profil synthétique — dimensions hors schéma ignorées : le corpus fixe tout,
// le scénario ne surcharge que ce qu'il étudie.
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

// Corpus synthétique de profils (mandat §17)
const PROFILE_EXPLORER = P({ exploration: 0.9 });
const PROFILE_STRATEGIST = P({ strategy: 0.9 });
const PROFILE_EFFICIENT = P({ efficiency: 0.9 });
const PROFILE_CHAIN = P({ chainAffinity: 0.9 });
const PROFILE_LOW_CONFIDENCE = P({ exploration: 0.9, confidence: 0.45 });
const PROFILE_UNSTABLE = P({ exploration: 0.9, strategy: 0.9, confidence: 0.65 });
const PROFILE_NEUTRAL = P({});

const INPUTS = (over = {}) => ({
  candidates: IDS,
  progression: state(6),
  metadata: META,
  difficulty: DIFFICULTY,
  profile: PROFILE_NEUTRAL,
  ...over,
});

const assertValidRecommendation = (r, { mode = null, hasLevel = true } = {}) => {
  assert.equal(isProgressionRecommendation(r), true, "forme de recommandation conforme");
  assert.equal(r.policyVersion, POLICY_VERSION);
  assert.equal(r.policyMethod, POLICY_METHOD);
  if (mode) assert.equal(r.mode, mode);
  if (hasLevel) {
    assert.equal(typeof r.recommendedLevel, "string", "niveau recommandé présent");
    assert.ok(r.eligibleLevels.includes(r.recommendedLevel), "niveau recommandé admissible");
  }
  assert.ok(r.reasonCodes.length >= 1, "raison au moins une");
  for (const c of r.reasonCodes) assert.ok(REASON_CODES.includes(c), `reasonCode '${c}' documenté`);
};

// ---------------------------------------------------------------------------
// PP-01 → PP-09 : adaptation par profil (mandat §8, §10)
// ---------------------------------------------------------------------------

test("PP-01 : profil faible confiance (gradual ≤ conf < adaptive) — tier light, poids réduit", () => {
  const r = recommend(INPUTS({ profile: PROFILE_LOW_CONFIDENCE }));
  assertValidRecommendation(r, { hasLevel: false });
  assert.equal(r.profileConfidence, 0.45);
  assert.ok(r.reasonCodes.includes("LOW_CONFIDENCE_ADAPTATION"), "adaptation faible signalée");
  assert.ok(!r.reasonCodes.includes("HIGH_CONFIDENCE_SPECIFIC"), "pas d'adaptation spécifique");
  assert.ok(r.policyConfidence > 0.5 && r.policyConfidence < 0.85, "confiance de policy moyenne");
});

test("PP-02 : profil complet confiant — tier specific, adaptation plein volume", () => {
  const r = recommend(INPUTS({ profile: PROFILE_STRATEGIST }));
  assertValidRecommendation(r);
  assert.equal(r.profileConfidence, 0.85);
  assert.ok(r.reasonCodes.includes("HIGH_CONFIDENCE_SPECIFIC"), "adaptation spécifique signalée");
  assert.ok(r.policyConfidence > 0.8, "confiance de policy haute");
});

test("PP-03 : profil exploration — contenus MULTI-PATH / DISCOVERY / CHOICE privilégiés", () => {
  const r = recommend(INPUTS({ profile: PROFILE_EXPLORER }));
  assertValidRecommendation(r);
  assert.ok(r.reasonCodes.includes("EXPLORATION_MATCH"), "règle exploration réellement exécutée");
  const top = r.rankedLevels[0];
  assert.ok(top.codes.includes("EXPLORATION_MATCH"), "le gagnant porte la règle exploration");
});

test("PP-04 : profil stratégie — contenus CHOICE / CONSEQUENCE privilégiés", () => {
  // Fenêtre large : aucun niveau CHOICE/CONSEQUENCE n'existe dans W1 (N1-N6).
  const wide = state(14);
  const r = recommend(INPUTS({ progression: wide, profile: PROFILE_STRATEGIST }));
  assertValidRecommendation(r);
  assert.ok(r.reasonCodes.includes("STRATEGY_MATCH"), "règle stratégie réellement exécutée");
  // Preuve de dominance §8 : le gagnant du stratège porte la règle et bat tout
  // niveau sans grammaire stratégie (garde-fou : la grammaire domine la
  // proximité).
  const rw = recommend(INPUTS({ progression: wide, profile: PROFILE_STRATEGIST }));
  assert.ok(rw.rankedLevels[0].codes.includes("STRATEGY_MATCH"), "au large : le gagnant porte STRATEGY_MATCH");
  const bestWithout = Math.max(0, ...rw.rankedLevels.filter((x) => !x.codes.includes("STRATEGY_MATCH")).map((x) => x.score));
  assert.ok(rw.rankedLevels[0].score > bestWithout, "un niveau CHOICE/CONSEQUENCE bat tout niveau sans grammaire stratégie");
});

test("PP-05 : profil efficacité — contenus OPTIMIZATION privilégiés", () => {
  const wide = state(14);
  const r = recommend(INPUTS({ progression: wide, profile: PROFILE_EFFICIENT }));
  assertValidRecommendation(r);
  assert.ok(r.reasonCodes.includes("EFFICIENCY_MATCH"), "règle efficacité réellement exécutée");
  const withOpt = r.rankedLevels.filter((x) => x.codes.includes("EFFICIENCY_MATCH"));
  assert.ok(withOpt.length >= 1, "au moins un niveau OPTIMIZATION classé");
});

test("PP-06 : profil chaîne — contenus CHAIN privilégiés", () => {
  const r = recommend(INPUTS({ profile: PROFILE_CHAIN }));
  assertValidRecommendation(r);
  assert.ok(r.reasonCodes.includes("CHAIN_MATCH"), "règle chaîne réellement exécutée");
  assert.ok(r.rankedLevels[0].codes.includes("CHAIN_MATCH"), "le gagnant porte la règle chaîne");
});

test("PP-07 : profil dépendance aux indices — progression plus graduelle (GRADUAL_RAMP)", () => {
  const wide = state(14);
  const r = recommend(INPUTS({ progression: wide, profile: P({ exploration: 0.2, hintDependency: 0.9 }) }));
  assertValidRecommendation(r);
  assert.ok(r.reasonCodes.includes("GRADUAL_RAMP"), "rampe douce signalée");
  // Comparaison de cible de progression SIVE grammaire : profils ne différant
  // que par hintDependency / difficultyResponse (aucune dimension de grammaire).
  const grad = recommend(INPUTS({ progression: state(20), profile: P({ hintDependency: 0.9 }) }));
  const bold = recommend(INPUTS({ progression: state(20), profile: P({ difficultyResponse: 0.9 }) }));
  const gradIdx = grad.eligibleLevels.indexOf(grad.recommendedLevel);
  const boldIdx = bold.eligibleLevels.indexOf(bold.recommendedLevel);
  assert.ok(gradIdx < boldIdx, "rampe douce vise moins loin que la réponse difficile favorable");
});

test("PP-08 : profil réponse difficulté favorable — progression vers difficulté supérieure (DIFFICULTY_MATCH)", () => {
  const r = recommend(INPUTS({ profile: P({ difficultyResponse: 0.9 }) }));
  assertValidRecommendation(r);
  assert.ok(r.reasonCodes.includes("DIFFICULTY_MATCH"), "bump de difficulté signalé");
  // La cible est décalée AU-DESSUS du front : le gagnant est le niveau
  // admissible le plus avancé (reach.bump = 1 par défaut de configuration).
  assert.equal(r.eligibleLevels.indexOf(r.recommendedLevel), r.eligibleLevels.length - 1, "niveau le plus avancé recommandé");
});

test("PP-09 : profil contradictoire — rester déterministe, aucune erreur, explication cohérente", () => {
  const r1 = recommend(INPUTS({ profile: PROFILE_UNSTABLE }));
  const r2 = recommend(INPUTS({ profile: PROFILE_UNSTABLE }));
  assertValidRecommendation(r1);
  assert.deepEqual(r1, r2, "déterministe sur profil contradictoire");
  // Chaque code de grammaire apparu est bien une règle au-dessus du seuil pour
  // ce profil (pas de justification inventée) — la présence dépend des
  // métadonnées des niveaux admissibles.
  const expectedRules = PROFILE_RULES.filter((rule) => PROFILE_UNSTABLE[rule.dimension] >= 0.6).map((rule) => rule.code);
  const grammarCodes = r1.reasonCodes.filter((c) => c.endsWith("_MATCH"));
  assert.ok(grammarCodes.every((c) => expectedRules.includes(c)), "codes de grammaire ⊆ règles réellement au-dessus du seuil");
  assert.ok(expectedRules.length >= 2, "le profil contradictoire active au moins deux règles");
});

// ---------------------------------------------------------------------------
// PP-10 → PP-15 : replis sûrs (mandat §9, §15) et validité des entrées
// ---------------------------------------------------------------------------

test("PP-10 : profil absent — SAFE_DEFAULT, NO_PROFILE, progression normale", () => {
  const r = recommend(INPUTS({ profile: null }));
  assertValidRecommendation(r, { mode: "SAFE_DEFAULT" });
  assert.ok(r.reasonCodes.includes("NO_PROFILE"));
  assert.ok(r.reasonCodes.includes("SAFE_DEFAULT_PROGRESSION"));
  assert.equal(r.candidateLevel, null, "aucun candidat adaptatif");
  assert.ok(r.rankedLevels.length === 0, "aucun classement adaptatif");
  const rec = r.recommendedLevel;
  assert.ok(level(rec) !== undefined, "niveau recommandé existe réellement");
  assert.ok(r.eligibleLevels.includes(rec), "premier admissible non terminé (progression normale)");
});

test("PP-11 : profil corrompu — SAFE_DEFAULT, INVALID_PROFILE, jamais d'exception", () => {
  for (const bad of [null, undefined]) {
    const r = recommend(INPUTS({ profile: bad }));
    assertValidRecommendation(r, { mode: "SAFE_DEFAULT", hasLevel: false });
    assert.ok(r.reasonCodes.includes("NO_PROFILE"), `profil absent traité comme absent : ${JSON.stringify(bad)}`);
  }
  for (const bad of [
    "profil",
    42,
    [],
    { ...BASE, confidence: 1.5 },
    { ...BASE, exploration: "haute" },
    { ...BASE, version: 1 },
    { ...BASE, extra: true },
    { ...BASE, arithmetic: Number.NaN },
  ]) {
    const r = recommend(INPUTS({ profile: bad }));
    assertValidRecommendation(r, { mode: "SAFE_DEFAULT", hasLevel: false });
    assert.ok(r.reasonCodes.includes("INVALID_PROFILE"), `profil corrompu rejeté : ${JSON.stringify(bad)}`);
    assert.equal(r.profileConfidence, 0, "confiance de profil corrompu = 0");
  }
});

test("PP-12 : niveau verrouillé — rejeté (LOCKED), jamais recommandé, aucun bypass", () => {
  const s = state(6);
  const r = recommend(INPUTS({ progression: s }));
  assert.ok(!r.eligibleLevels.includes("N36"), "N36 non admissible");
  const lockedRejected = r.rejectedLevels.filter((x) => x.reason === "LOCKED").map((x) => x.id).sort();
  assert.deepEqual(lockedRejected, [...IDS.slice(6)].sort(), "tous les non-débloqués rejetés LOCKED");
  assert.ok(!r.reasonCodes.includes("LOCKED"), "LOCKED est un motif de rejet, pas un reasonCode de recommandation");
});

test("PP-13 : niveau inexistant — ignoré silencieusement, aucune fabrication", () => {
  const r = recommend(INPUTS({ candidates: ["N1", "N999", "N2"] }));
  assert.ok(!r.eligibleLevels.includes("N999"), "N999 jamais recommandé");
  assert.ok(r.rejectedLevels.some((x) => x.id === "N999" && x.reason === "NOT_CERTIFIED"), "niveau inexistant : rejeté comme non certifié (aucune fabrication)");
  assert.deepEqual(r.eligibleLevels, ["N1", "N2"]);
});

test("PP-14 : niveau non certifié — rejeté (NOT_CERTIFIED), jamais recommandé", () => {
  const tampered = { ...META };
  delete tampered["N2"];
  const r = recommend(INPUTS({ metadata: tampered }));
  assert.ok(r.rejectedLevels.some((x) => x.id === "N2" && x.reason === "NOT_CERTIFIED"), "N2 non certifié rejeté");
  assert.ok(!r.eligibleLevels.includes("N2"), "N2 jamais recommandé");
});

test("PP-15 : recommandation reproductible — mêmes entrées, même sortie (déterminisme)", () => {
  const a = recommend(INPUTS({ profile: PROFILE_EXPLORER }));
  const b = recommend(INPUTS({ profile: PROFILE_EXPLORER }));
  assert.deepEqual(a, b, "same profile + progression + candidates + version = same recommendation");
  // Stabilité structurante : sous-ensembles d'entrées indépendants → sous-résultats identiques
  const c = recommend(INPUTS({ profile: PROFILE_EXPLORER, difficulty: undefined }));
  assert.equal(c.recommendedLevel, a.recommendedLevel, "le niveau recommandé ne dépend pas de métadonnées optionnelles");
});

// ---------------------------------------------------------------------------
// PP-16 → PP-18 : explication, stabilité, mode sûr
// ---------------------------------------------------------------------------

test("PP-16 : reasonCodes cohérents — toute grammaire exécutée est traçable", () => {
  for (const [pid, prof] of Object.entries({ PROFILE_EXPLORER, PROFILE_STRATEGIST, PROFILE_EFFICIENT, PROFILE_CHAIN, PROFILE_NEUTRAL })) {
    const r = recommend(INPUTS({ profile: prof, progression: state(14) }));
    const executedRules = PROFILE_RULES.filter((rule) => prof[rule.dimension] >= 0.6);
    const expected = executedRules.filter((rule) => r.rankedLevels.some((x) => x.codes.includes(rule.code)));
    for (const rule of expected) {
      assert.ok(r.reasonCodes.includes(rule.code), `${pid} : ${rule.code} traçable`);
      // la grammaire correspond vraiment aux métadonnées du niveau gagnant
      const winner = r.rankedLevels.find((x) => x.codes.includes(rule.code));
      const meta = META[winner.id];
      const grammarHit = rule.grammar.some((t) => meta.properties.includes(t) || meta.stage?.name === t);
      assert.ok(grammarHit, `${pid} : ${winner.id} porte bien une grammaire de ${rule.code}`);
    }
    if (expected.length === 0) assert.ok(!r.reasonCodes.some((c) => c.endsWith("_MATCH")), `${pid} : aucun code de grammaire inventé`);
  }
});

test("PP-17 : hystérésis — changement seulement après fenêtre stable, sortie possible, repli immédiat", () => {
  // Fenêtre 14 : explorateur → N13 (MULTI-PATH), stratege → N14 (CHOICE/CONSEQUENCE)
  const pe = recommend(INPUTS({ progression: state(14), profile: PROFILE_EXPLORER }));
  const held = pe.recommendedLevel;
  assert.notEqual(held, recommend(INPUTS({ progression: state(14), profile: PROFILE_STRATEGIST })).recommendedLevel, "précondition : les deux profils visent des niveaux différents");
  // Bascule explorateur → stratege : HOLD pendant la fenêtre, BREAK ensuite
  const s1 = recommend(INPUTS({ progression: state(14), profile: PROFILE_STRATEGIST, held, history: [] }));
  assert.equal(s1.recommendedLevel, held, "cycle 1 : branche tenue conservée");
  assert.ok(s1.reasonCodes.includes("STABILITY_HOLD"));
  assert.ok(s1.candidateLevel && s1.candidateLevel !== held, "le candidat diffère du niveau tenu");
  const s2 = recommend(INPUTS({ progression: state(14), profile: PROFILE_STRATEGIST, held: s1.recommendedLevel, history: [s1.candidateLevel] }));
  assert.equal(s2.recommendedLevel, held, "cycle 2 : encore HOLD (fenêtre 3)");
  const s3 = recommend(INPUTS({ progression: state(14), profile: PROFILE_STRATEGIST, held: s2.recommendedLevel, history: [s2.candidateLevel, s1.candidateLevel] }));
  assert.equal(s3.recommendedLevel, s3.candidateLevel, "cycle 3 : série stable complète → changement confirmé");
  assert.notEqual(s3.recommendedLevel, held);
  assert.ok(s3.reasonCodes.includes("STABILITY_BREAK"));
  // Symétrique : retour au profil initial, même amortissement
  const b1 = recommend(INPUTS({ progression: state(14), profile: PROFILE_EXPLORER, held: s3.recommendedLevel, history: [] }));
  assert.equal(b1.recommendedLevel, s3.recommendedLevel, "retour : HOLD (pas d'oscillation)");
  // Repli immédiat si la branche tenue devient inadmissible
  const lost = recommend(INPUTS({ profile: PROFILE_STRATEGIST, held: "N999", history: ["N999"], progression: state(6) }));
  assert.equal(lost.recommendedLevel, lost.candidateLevel, "branche tenue perdue → bascule immédiate");
  // Aucune hystérésis si la branche tenue reste le gagnant
  const same = recommend(INPUTS({ progression: state(14), profile: PROFILE_EXPLORER, held, history: [] }));
  assert.equal(same.recommendedLevel, held);
  assert.ok(!same.reasonCodes.includes("STABILITY_HOLD"), "pas de HOLD lorsque rien ne change");
});

test("PP-18 : safe default — mode SAFE_DEFAULT explicite, parcours linéaire cohérent", () => {
  const r = recommend(INPUTS({ profile: PROFILE_EXPLORER, config: { mode: "SAFE_DEFAULT" } }));
  assertValidRecommendation(r, { mode: "SAFE_DEFAULT" });
  assert.ok(r.reasonCodes.includes("SAFE_DEFAULT_PROGRESSION"));
  const s = state(6);
  assert.equal(r.recommendedLevel, s.unlocked[s.unlocked.length - 1], "reprend au premier admissible non terminé (front de progression)");
  // Tous les profils donnent le même parcours en SAFE_DEFAULT : l'adaptation n'est jamais imposée
  for (const prof of [PROFILE_EXPLORER, PROFILE_STRATEGIST, PROFILE_CHAIN, PROFILE_UNSTABLE]) {
    const x = recommend(INPUTS({ profile: prof, config: { mode: "SAFE_DEFAULT" } }));
    assert.equal(x.recommendedLevel, r.recommendedLevel, "SAFE_DEFAULT indépendant du profil");
  }
});

// ---------------------------------------------------------------------------
// PP-19 → PP-21 : sécurité d'architecture et de progression
// ---------------------------------------------------------------------------

test("PP-19 : aucune écriture GameState — le module ne touche ni la sauvegarde ni l'état", () => {
  const src = readModuleCode();
  for (const forbidden of ["save.mjs", "engine.mjs", "kernel.mjs", "setGameState", "apply(", "unlock(", "save(", "persist(", "localStorage", "Math.random", "Date.now", "fetch(", "XMLHttpRequest", "WebSocket", "import(", "require("]) {
    assert.ok(!src.includes(forbidden), `source sans '${forbidden}'`);
  }
  // Immutabilité vérifiable : recommander ne mute aucune entrée
  const s = state(6);
  const sSnapshot = JSON.stringify(s);
  const prof = P({ exploration: 0.9 });
  const profSnapshot = JSON.stringify(prof);
  const metaSnapshot = JSON.stringify(META);
  recommend(INPUTS({ progression: s, profile: prof }));
  assert.equal(JSON.stringify(s), sSnapshot, "progression non mutée");
  assert.equal(JSON.stringify(prof), profSnapshot, "profil non muté");
  assert.equal(JSON.stringify(META), metaSnapshot, "métadonnées non mutées");
});

test("PP-20 : aucun accès réseau — aucune API distante, aucune dépendance dynamique", () => {
  const src = readModuleCode();
  for (const forbidden of ["http", "WebSocket", "fetch", "XMLHttpRequest", "navigator", "window.", "document.", "process.env", "globalThis", "import(", "require(", "wllama", "llama", "gguf", "document.createElement"]) {
    assert.ok(!src.includes(forbidden), `source sans '${forbidden}'`);
  }
});

test("PP-21 : non-régression — Game Core intact, contrat intel respecté, façade G2 cohérente", () => {
  // Preserved : le Game Core ne connaît pas la policy
  const core = ["src/b1/kernel.mjs", "src/b1/engine.mjs", "src/b1/solver.mjs", "src/b1/replay.mjs", "src/b1/levels.mjs", "src/b1/save.mjs", "src/b1/design.mjs", "src/b1/level-design.mjs"];
  for (const f of core) {
    const src = readSource(f);
    assert.ok(!src.includes("progression-policy"), `${f} n'importe pas la policy (frontière préservée)`);
  }
  // La policy reste dans le plan intelligence : aucun import depuis le Game Core
  const src = readModuleSource();
  assert.ok(!src.includes("../b1/"), "la policy n'importe rien du Game Core");
  assert.ok(!src.includes("src/b1"), "la policy n'importe rien du Game Core");
  // Cohérence avec la façade G2 (deterministicDefaultPolicy) : confiance 0.5
  const r = recommend(INPUTS({ profile: null }));
  assert.equal(r.policyConfidence, 0.5, "repli sûr aligné sur le contrat de repli G2");
  const d = deterministicDefaultPolicy({
    profile: PROFILE_NEUTRAL,
    levelState: { unlocked: state(6).unlocked, completed: state(6).completed },
    availableLevels: state(6).unlocked.map((id) => ({ id, world: level(id).world })),
  });
  assert.ok(isLevelState({ unlocked: state(6).unlocked, completed: state(6).completed }));
  assert.equal(d.policyVersion, POLICY_VERSION);
  assert.equal(d.confidence, 0.5);
  // Configuration : les seuils sont portés par la config, jamais enterrés
  const cfg = policyConfiguration();
  assert.ok(DEFAULT_POLICY_CONFIGURATION === cfg || JSON.stringify(DEFAULT_POLICY_CONFIGURATION) === JSON.stringify(cfg));
  assert.equal(cfg.stabilityWindow, 3);
  assert.ok(cfg.confidence.gradual < cfg.confidence.adaptive && cfg.confidence.adaptive < cfg.confidence.specific);
  assert.ok(POLICY_MODES.includes("ADAPTIVE") && POLICY_MODES.includes("SAFE_DEFAULT"));
  // Vocabulaire : les règles profil ne référencent que des tokens réels de la grammaire
  for (const rule of PROFILE_RULES) {
    for (const g of rule.grammar) assert.ok(PROPERTY_VOCAB.includes(g), `token '${g}' ∈ grammaire réelle`);
    assert.ok(typeof BASE[rule.dimension] === "number", `dimension '${rule.dimension}' ∈ schéma profil`);
  }
  // validateProfile (G2) rejette bien les corruptions utilisées par la policy
  assert.ok(validateProfile({ ...BASE, confidence: 7 }).length > 0);
  assert.ok(validateProfile(PROFILE_NEUTRAL).length === 0);
});

// ---------------------------------------------------------------------------
// Compléments — éligibilité, garde-fous de scoring, entrées dégénérées
// ---------------------------------------------------------------------------

test("Éligibilité : catalogue réel ordonné, rejets motivés, candidates préservés", () => {
  const s = state(6);
  const e = eligibility({ candidates: ["N1", "N7", "N2", "N1", "N999"], progression: s, metadata: META });
  assert.deepEqual(e.eligible, ["N1", "N2"], "ordre du catalogue, doublons et inconnus ignorés");
  assert.deepEqual(e.rejected.map((x) => [x.id, x.reason]), [["N7", "LOCKED"], ["N999", "NOT_CERTIFIED"]], "rejets motivés");
  assert.deepEqual(e.candidates, ["N1", "N7", "N2", "N999"], "candidates normalisés (dédupliqués, ordre préservé), entrée jamais mutée");
});

test("Scoring : le front sans grammaire ne bat jamais un niveau grammaticalement adéquat (garde-fou §8)", () => {
  // Profil chaîne sur une fenêtre où un niveau CHAIN est accessible : le gagnant
  // porte la règle même si le front est à distance minimale.
  for (const win of [6, 10, 14, 20, 30]) {
    const r = recommend(INPUTS({ progression: state(win), profile: PROFILE_CHAIN }));
    assert.ok(r.rankedLevels[0].codes.includes("CHAIN_MATCH") || !r.eligibleLevels.some((id) => (META[id].properties ?? []).includes("CHAIN")), `fenêtre ${win} : front CHAIN ou aucun CHAIN admissible`);
  }
});

test("Entrées dégénérées : aucune exception, replis déterministes", () => {
  const empty = recommend({});
  assert.equal(empty.mode, "SAFE_DEFAULT");
  assert.ok(empty.reasonCodes.includes("NO_CANDIDATES"));
  assert.equal(empty.recommendedLevel, null);
  const noUnlock = recommend(INPUTS({ progression: {} }));
  assert.ok(noUnlock.recommendedLevel === null || typeof noUnlock.recommendedLevel === "string", "progression malformée : jamais d'exception");
  const garbage = recommend({ candidates: [null, 42, {}, "N1", { id: "N2" }], progression: state(6), metadata: META, profile: PROFILE_NEUTRAL });
  assert.deepEqual(garbage.eligibleLevels, ["N1", "N2"], "entrées hétérogènes : seuls les ids valides comptent");
  const rec = recommend(INPUTS({ profile: PROFILE_EXPLORER, held: "N999", history: ["N999"] }));
  assert.ok(rec.recommendedLevel !== "N999", "branche tenue inadmissible : jamais recommandée");
});

test("Mode SAFE_DEFAULT configuré : l'adaptation n'est jamais obligatoire (mandat §15)", () => {
  const cfg = policyConfiguration({ mode: "SAFE_DEFAULT" });
  assert.equal(cfg.mode, "SAFE_DEFAULT");
  assert.equal(cfg.confidence.adaptive, DEFAULT_POLICY_CONFIGURATION.confidence.adaptive, "les autres seuils restent intacts");
  const r = recommend(INPUTS({ profile: PROFILE_EXPLORER, config: { mode: "SAFE_DEFAULT" } }));
  assert.equal(r.mode, "SAFE_DEFAULT");
  assert.ok(r.rankedLevels.length === 0, "aucun classement adaptatif en mode sûr");
});

test("Corpus multi-profils (§17) : recommandations différenciées, comportements cohérents", () => {
  const wide = state(14);
  const corpus = {
    PROFILE_EXPLORER,
    PROFILE_STRATEGIST,
    PROFILE_EFFICIENT,
    PROFILE_CHAIN,
    PROFILE_LOW_CONFIDENCE,
    PROFILE_UNSTABLE,
    PROFILE_NEUTRAL,
  };
  const picks = new Map();
  for (const [pid, prof] of Object.entries(corpus)) {
    const r = recommend(INPUTS({ progression: wide, profile: prof }));
    assertValidRecommendation(r, { hasLevel: false });
    picks.set(pid, { level: r.recommendedLevel, codes: r.reasonCodes });
  }
  // Différenciation quand les règles le prévoient : les profils à affinité
  // distincte visent des gagnants porteurs de leur grammaire respective.
  const byGrammar = (code) => [...picks.entries()].filter(([, v]) => v.codes.includes(code)).map(([k]) => k);
  assert.ok(byGrammar("EXPLORATION_MATCH").includes("PROFILE_EXPLORER"));
  assert.ok(byGrammar("STRATEGY_MATCH").includes("PROFILE_STRATEGIST"));
  assert.ok(byGrammar("EFFICIENCY_MATCH").includes("PROFILE_EFFICIENT"));
  assert.ok(byGrammar("CHAIN_MATCH").includes("PROFILE_CHAIN"));
  // Sans incohérence : chaque gagnant est admissible, jamais de niveau hors catalogue
  for (const [, v] of picks) assert.ok(typeof v.level === "string" && wide.unlocked.includes(v.level), "gagnant admissible");
  // Le profil à faible confiance reste adaptatif mais amorti (tier light)
  assert.ok(picks.get("PROFILE_LOW_CONFIDENCE").codes.includes("LOW_CONFIDENCE_ADAPTATION"));
});

test("POLICY_VERSION : la recommandation porte la version du contrat intel", () => {
  const r = recommend(INPUTS({ profile: PROFILE_EXPLORER }));
  assert.equal(r.policyVersion, POLICY_VERSION);
  assert.equal(POLICY_VERSION, 1, "version figée au contrat actuel");
});

test("Simulation de masse : la campagne seedée reste verte (légalité, déterminisme, replis)", () => {
  // Petit N pour CI ; la campagne complète (5000 + 500 corrompus) est documentée
  // dans docs/design/MATHIC-1-0-PROGRESSION-POLICY-SIMULATION.md.
  const out = execSync("node scripts/simulate-policy.mjs --n 400", { encoding: "utf8", cwd: fileURLToPath(new URL("../..", import.meta.url)) });
  assert.ok(out.includes("AUCUNE VIOLATION"), "verdict simulation vert");
  assert.ok(out.includes("violations               : 0"), "zéro bypass");
  assert.ok(out.includes("divergences ✅") || out.includes("divergences \u2705"), "déterminisme confirmé");
});
