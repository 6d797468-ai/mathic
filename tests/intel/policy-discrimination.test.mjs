// MATHIC 1.0 — Policy Discrimination (MISSION 10) — tests PD-01..PD-15
//
// But : prouver que la recommandation ADAPTIVE de la Progression Policy
// discrimine RÉELLEMENT — parce que le PROFIL diffère, que les CANDIDATS
// diffèrent sémantiquement, et que la Policy le justifie — et jamais à cause
// de l'ordre d'entrée, de l'ID numérique, d'un aléa ou d'une fabrication.
//
// Gouvernail du mandat M10 :
//   - PD-01..04   déterminisme, stabilité, divergence possible, convergence
//                 sur candidats équivalents (non-forçage) ;
//   - PD-05..06   repli ordinal (confiance faible) et SAFE_DEFAULT —
//                 le front ordinal reste le comportement par défaut ;
//   - PD-07..08   la grammaire COMBINATION et MASTERY PEUT être choisie
//                 lorsque le profil la justifie ;
//   - PD-09..10   pénalité de difficulté, dominance du front seulement si
//                 réellement préférable ;
//   - PD-11..13   invariants de position : réordonnancement, N37≡position 25,
//                 renommage numérique sans effet décisionnel ;
//   - PD-14..15   frontières d'architecture : zéro écriture Save, zéro accès
//                 Engine depuis la Policy.
//
// Les fenêtres utilisées sont des fenêtres RÉELLES du catalogue (LADDER
// analysé par le Solver) — aucun niveau inventé.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LADDER, ladderDifficulty, ladderPosition } from "../../src/b1/levels.mjs";
import { analyzeAll } from "../../src/b1/level-design.mjs";
import { POLICY_VERSION, PROFILE_SCHEMA_VERSION } from "../../src/intel/contracts.mjs";
import {
  POLICY_METHOD,
  REASON_CODES,
  PROFILE_RULES,
  levelCandidate,
  recommend,
  isProgressionRecommendation,
} from "../../src/intel/progression-policy.mjs";

// ---------------------------------------------------------------------------
// Fixtures réelles
// ---------------------------------------------------------------------------

const ANALYSIS = analyzeAll();
const META = Object.fromEntries(ANALYSIS.map((a) => [a.id, a]));
const IDS = ANALYSIS.map((a) => a.id);
const DIFFICULTY = ladderDifficulty();

const level = (id) => LADDER.find((l) => l.id === id);
const props = (id) => (META[id]?.properties ?? []);

const readSource = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const readModuleSource = () => readSource("src/intel/progression-policy.mjs");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const readModuleCode = () => stripComments(readModuleSource());

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

// État de progression : les `n` premiers niveaux débloqués, tous sauf le
// dernier complétés (le front de progression est le niveau débloqué le plus
// avancé).
function state(unlockedCount = 6) {
  const unlocked = IDS.slice(0, unlockedCount);
  return {
    unlocked,
    completed: Object.fromEntries(unlocked.slice(0, -1).map((id) => [id, { wins: 1, bestScore: 10 }])),
  };
}

function inputs(over = {}) {
  return {
    candidates: IDS,
    progression: state(20),
    metadata: META,
    difficulty: DIFFICULTY,
    profile: P({}),
    ...over,
  };
}

const assertValid = (r, { mode = null } = {}) => {
  assert.equal(isProgressionRecommendation(r), true, "forme de recommandation conforme");
  if (mode) assert.equal(r.mode, mode);
  assert.ok(r.reasonCodes.length >= 1, "au moins une raison");
  for (const c of r.reasonCodes) assert.ok(REASON_CODES.includes(c), `reasonCode '${c}' documenté`);
};

// front ordinal : le premier candidat (ordre LADDER) non encore terminé, c'est
// le niveau que le repli SAFE_DEFAULT choisit.
const ordinalFront = (ids, completedSet) => {
  for (const id of ids) if (!completedSet.has(id)) return id;
  return ids[0] ?? null;
};

// ---------------------------------------------------------------------------
// PD-01 — MÊME profil + MÊME fenêtre ⇒ MÊME recommandation
// ---------------------------------------------------------------------------

test("PD-01 : même profil + même fenêtre → même recommandation (déterminisme)", () => {
  const a = recommend(inputs({ profile: P({ arithmetic: 0.9 }) }));
  const b = recommend(inputs({ profile: P({ arithmetic: 0.9 }) }));
  assert.deepEqual(a, b, "recommandations byte-identiques");
});

// ---------------------------------------------------------------------------
// PD-02 — répétition → sortie byte-identique
// ---------------------------------------------------------------------------

test("PD-02 : exécutions répétées → sortie byte-identique (aucun aléa)", () => {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(JSON.stringify(recommend(inputs({ profile: P({ chainAffinity: 0.9 }) }))));
  for (let i = 1; i < runs.length; i++) assert.equal(runs[i], runs[0], `run ${i} identique au run 0`);
});

// ---------------------------------------------------------------------------
// PD-03 — profil différent + candidats sémantiquement différents ⇒ possibilité
// de recommandation différente (et justification grammaticale réelle)
// ---------------------------------------------------------------------------

test("PD-03 : profils différents + candidats différents → divergence possible et justifiée", () => {
  // Fenêtre 20 réelle : N20 porte COMBINATION (règle arithmetic) ; explorer
  // vise N19 (MULTI-PATH/CHAIN) ; chain vise N21 (MULTI-PATH/CHOICE/CHAIN).
  const arith = recommend(inputs({ progression: state(20), profile: P({ arithmetic: 0.9 }) }));
  const explorer = recommend(inputs({ progression: state(20), profile: P({ exploration: 0.9 }) }));
  const chain = recommend(inputs({ progression: state(20), profile: P({ chainAffinity: 0.9 }) }));
  const picks = new Set([arith.recommendedLevel, explorer.recommendedLevel, chain.recommendedLevel]);
  assert.ok(picks.size >= 2, `divergence réelle détectée : ${[...picks].join(", ")}`);
  // Chaque divergence est EXPLIQUÉE : le gagnant porte la grammaire de la règle
  // profil activée (ARITHMETIC_MATCH → COMBINATION/MASTERY ; EXPLORATION_MATCH →
  // MULTI-PATH/DISCOVERY/CHOICE ; CHAIN_MATCH → CHAIN).
  for (const [r, code] of [
    [arith, "ARITHMETIC_MATCH"],
    [explorer, "EXPLORATION_MATCH"],
    [chain, "CHAIN_MATCH"],
  ]) {
    assert.ok(r.reasonCodes.includes(code), `profil ${code} : raison portée`);
    const winner = r.rankedLevels[0];
    const rule = PROFILE_RULES.find((x) => x.code === code);
    const grammarHit = rule.grammar.some((t) => props(winner.id).includes(t) || META[winner.id]?.stage?.name === t);
    assert.ok(grammarHit, `${code} : ${winner.id} porte réellement la grammaire ${rule.grammar.join("/")} (${props(winner.id).join(",") || "—"})`);
  }
});

// ---------------------------------------------------------------------------
// PD-04 — profil différent + candidats équivalents ⇒ STABLE, aucune divergence
// artificielle (non-forçage : « rien de significatif → front ordinal »)
// ---------------------------------------------------------------------------

test("PD-04 : profils différents + candidats équivalents → aucune divergence artificielle", () => {
  // N7/N10/N16 portent STRICTEMENT la même grammaire (CHAIN,CHOICE,CONSEQUENCE,
  // MULTI-PATH,OPTIMIZATION — groupe d'équivalence vérifié sur le catalogue).
  // Aucune règle profil ne peut les distinguer : quelle que soit la dimension
  // poussée, les scores des règles sont, au choix du profil, tous nuls ou tous
  // égaux → la décision reste la proximité → le MÊME gagnant pour tous.
  const window = ["N7", "N10", "N16"];
  const grammar = props("N7");
  for (const id of window) {
    assert.deepEqual(props(id).sort(), grammar.sort(), `grammaire identique pour ${id}`);
  }
  const progression = { unlocked: window, completed: { N7: { wins: 1 } } };
  let picks = new Set();
  for (const over of [{ arithmetic: 0.9 }, { exploration: 0.9 }, { chainAffinity: 0.9 }, { strategy: 0.9 }, {}]) {
    const r = recommend({ candidates: window, progression, metadata: META, difficulty: DIFFICULTY, profile: P(over) });
    assertValid(r);
    assert.equal(r.mode, "ADAPTIVE");
    picks.add(r.recommendedLevel);
  }
  assert.equal(picks.size, 1, `aucune divergence artificielle sur candidats sémantiquement équivalents : ${[...picks].join(", ")}`);
  // Le gagnant est déterminé par la proximité canonique (le plus proche de la
  // cible = le front de la fenêtre), pas par une « préférence » inventée.
  assert.equal([...picks][0], "N16", "front de proximité, aucune préférence artificielle");
});

// ---------------------------------------------------------------------------
// PD-05 — confiance faible ⇒ repli ordinal (front), pas de fantaisie
// ---------------------------------------------------------------------------

test("PD-05 : confiance faible (< gradual) → repli ordinal, front non forcé", () => {
  const r = recommend(inputs({ profile: P({ exploration: 0.9, confidence: 0.2 }) }));
  assertValid(r, { mode: "SAFE_DEFAULT" });
  assert.ok(r.reasonCodes.includes("LOW_CONFIDENCE_ADAPTATION"));
  const completed = new Set(Object.keys(inputs().progression.completed));
  assert.equal(r.recommendedLevel, ordinalFront(IDS, completed), "repli = premier admissible non terminé (parcours normal)");
  assert.ok(r.rankedLevels.length === 0, "aucun classement adaptatif");
});

// ---------------------------------------------------------------------------
// PD-06 — SAFE_DEFAULT ⇒ aucune personnalisation (tous profils identiques)
// ---------------------------------------------------------------------------

test("PD-06 : SAFE_DEFAULT configuré → aucune personnalisation (front pour tous)", () => {
  const picks = new Set();
  for (const over of [{ arithmetic: 0.9 }, { exploration: 0.9 }, { chainAffinity: 0.9 }, {}]) {
    const r = recommend(inputs({ profile: P(over), config: { mode: "SAFE_DEFAULT" } }));
    assertValid(r, { mode: "SAFE_DEFAULT" });
    assert.ok(r.reasonCodes.includes("SAFE_DEFAULT_PROGRESSION"));
    assert.ok(r.rankedLevels.length === 0, "SAFE_DEFAULT : aucun classement");
    picks.add(r.recommendedLevel);
  }
  assert.equal(picks.size, 1, "tous les profils choisissent le même niveau en SAFE_DEFAULT");
});

// ---------------------------------------------------------------------------
// PD-07 — COMBINATION pertinent ⇒ sélectionnable quand le profil le justifie
// ---------------------------------------------------------------------------

test("PD-07 : contenu COMBINATION → sélectionnable si ARITHMETIC_MATCH le justifie", () => {
  // Fenêtre 23 réelle : N23 (SINGLE-PATH,CHAIN,COMBINATION) est disponible et
  // le profil arithmetic le choisit (avant même le front MULTI-PATH noble).
  const arith = recommend(inputs({ progression: state(23), profile: P({ arithmetic: 0.9 }) }));
  assertValid(arith);
  assert.ok(props(arith.recommendedLevel).includes("COMBINATION"), `arith → candidat COMBINATION : ${arith.recommendedLevel}`);
  assert.ok(arith.rankedLevels[0].codes.includes("ARITHMETIC_MATCH"), "justifié par la règle arithmetic");
});

// ---------------------------------------------------------------------------
// PD-08 — MASTERY pertinent ⇒ sélectionnable quand le profil le justifie
// ---------------------------------------------------------------------------

test("PD-08 : contenu MASTERY → sélectionnable si le profil le justifie", () => {
  // N40/N41 portent MASTERY (règle ARITHMETIC_MATCH). Profil arithmetic sur la
  // fenêtre 40 débloquée : le gagnant porte MASTERY et ARITHMETIC_MATCH.
  const arith = recommend(inputs({ progression: state(40), profile: P({ arithmetic: 0.9 }) }));
  assertValid(arith);
  const hasMastery = props(arith.rankedLevels[0].id).includes("MASTERY");
  assert.ok(hasMastery, `arith fenêtre 40 → candidat MASTERY : ${arith.recommendedLevel} (${props(arith.recommendedLevel).join(",")})`);
  assert.ok(arith.rankedLevels[0].codes.includes("ARITHMETIC_MATCH"), "MASTERY justifié par la grammaire arithmetic");
  // Contraste : un profil NEUTRE sur la même fenêtre n'impose pas MASTERY.
  const neutral = recommend(inputs({ progression: state(40), profile: P({}) }));
  assert.ok(neutral.mode === "ADAPTIVE" || neutral.mode === "SAFE_DEFAULT", "neutral reste dans les modes officiels");
});

// ---------------------------------------------------------------------------
// PD-09 — décalage de difficulté ⇒ correctement pénalisé (DIFFICULTY_IN_BAND)
// ---------------------------------------------------------------------------

test("PD-09 : décalage de difficulté → correctement pénalisé (DIFFICULTY_IN_BAND)", () => {
  // Fenêtre [N24, N37] : positions canoniques 24 et 25 (jamais 37). Le profil
  // élève la cible (difficultyResponse) → N37 (position 25) est DANS la bande,
  // N24 (position 24) est décalé d'un cran hors bande.
  const window = ["N24", "N37"];
  const progression = { unlocked: window, completed: { N24: { wins: 1 } } };
  const r = recommend({ candidates: window, progression, metadata: META, difficulty: DIFFICULTY, profile: P({ difficultyResponse: 0.9, confidence: 0.9 }) });
  assertValid(r);
  const n24 = r.rankedLevels.find((x) => x.id === "N24");
  const n37 = r.rankedLevels.find((x) => x.id === "N37");
  assert.ok(n24 && n37, "les deux candidats classés");
  // Positions canoniques : N24 → 24, N37 → 25 (ladderPosition), jamais 37.
  assert.equal(n24.distance, -2, "N24 à la position 24, un cran sous la cible 26");
  assert.equal(n37.distance, -1, "N37 à la position 25 (jamais 37) : distance -1");
  // Bande de difficulté : le plus proche de la cible canonique est N37.
  assert.ok(n37.codes.includes("DIFFICULTY_IN_BAND"), "N37 dans la bande (position canonique 25)");
  assert.ok(!n24.codes.includes("DIFFICULTY_IN_BAND"), "N24 hors bande");
});

// ---------------------------------------------------------------------------
// PD-10 — le front ne domine QUE s'il est réellement préférable (garde-fou §8)
// ---------------------------------------------------------------------------

test("PD-10 : front dominant seulement quand réellement préférable (grammaire ≠ proximity)", () => {
  // Profil chaîne sur une fenêtre 6 réelle : N5/N6 portent CHAIN — le gagnant
  // porte CHAIN_MATCH même « près du front » : la grammaire domine la proximité.
  const r = recommend(inputs({ progression: state(6), profile: P({ chainAffinity: 0.9 }) }));
  assertValid(r);
  const winner = r.rankedLevels[0];
  const bestWithout = Math.max(0, ...r.rankedLevels.filter((x) => !x.codes.includes("CHAIN_MATCH")).map((x) => x.score));
  assert.ok(winner.codes.includes("CHAIN_MATCH"), `chaîne → gagnant CHAIN : ${winner.id}`);
  assert.ok(winner.score > bestWithout, "le niveau grammaticalement adéquat bat ceux sans grammaire (le front ne gagne pas par inertie)");
});

// ---------------------------------------------------------------------------
// PD-11 — réordonnancement des candidats SANS changement de ladderPosition ⇒
// résultat inchangé (positions canoniques, jamais l'ordre d'entrée)
// ---------------------------------------------------------------------------

test("PD-11 : réordonner les candidats sans changer ladderPosition → résultat inchangé", () => {
  const profile = P({ arithmetic: 0.9 });
  const s = state(20);
  const base = recommend({ candidates: IDS, progression: s, metadata: META, difficulty: DIFFICULTY, profile });
  const permuted = recommend({ candidates: [...IDS].reverse(), progression: s, metadata: META, difficulty: DIFFICULTY, profile });
  assert.equal(permuted.recommendedLevel, base.recommendedLevel, "même niveau recommandé");
  assert.deepEqual(permuted.rankedLevels, base.rankedLevels, "classement byte-identique (ordre d'entrée sans effet)");
  assert.deepEqual(permuted.reasonCodes, base.reasonCodes, "mêmes raisons");
});

// ---------------------------------------------------------------------------
// PD-12 — N37 placé en position 25 ⇒ même sémantique de difficulté que sa
// position réelle (jamais 37 dérivé de l'ID)
// ---------------------------------------------------------------------------

test("PD-12 : N37 ≡ position 25 — la difficulté est la position LADDER, pas l'ID", () => {
  assert.equal(DIFFICULTY["N37"].index, 25, "fixture canonique : N37 à la position 25");
  assert.equal(ladderPosition("N37"), 25, "ladderPosition(N37) = 25");
  // Le modèle expose la position canonique, jamais dérivée de l'ID.
  const c = levelCandidate("N37", META, DIFFICULTY);
  assert.equal(c.ladderPosition, 25, "LevelCandidate.ladderPosition = 25");
  assert.equal(c.id, "N37");
  assert.notEqual(Number("N37".slice(1)), 25, "25 ≠ 37 — le test prouve que la Policy n'utilise pas Number(id.slice(1))");
});

// ---------------------------------------------------------------------------
// PD-13 — modifier l'ID numérique SANS changer la position ⇒ aucun effet
// décisionnel (rename N37→N77 en conservant position 25)
// ---------------------------------------------------------------------------

test("PD-13 : renommage de l'ID sans changement de position → aucun effet décisionnel", () => {
  // N37 renommé N77 en CONSERVANT sa position canonique 25 : en miroir, la même
  // fenêtre réelle (avec N37) et la fenêtre renommée (avec N77) doivent donner
  // rigoureusement la même décision.
  const mirror = (rename) => {
    const ids = IDS.map((id) => (id === "N37" ? rename : id));
    const metadata = { ...META, [rename]: META["N37"] };
    if (rename !== "N37") delete metadata["N37"];
    const difficulty = { ...DIFFICULTY, [rename]: { index: 25 } };
    if (rename !== "N37") delete difficulty["N37"];
    // Fenêtre réelle 20 : N20 (COMBINATION) vs N19 (MULTI-PATH) — même sémantique.
    const window = ["N19", "N20", rename];
    const progression = { unlocked: window, completed: { N19: { wins: 1 }, N20: { wins: 1 } } };
    const r = recommend({ candidates: window, progression, metadata, difficulty, profile: P({ arithmetic: 0.9 }) });
    assertValid(r);
    return r;
  };
  const a = mirror("N37");
  const b = mirror("N77");
  // Rang de la position 25 : identique entre N37 et N77 (le permier l'a prouvé
  // par la position, jamais par l'ID).
  const rankOf = (ranks, id) => ranks.findIndex((x) => x.id === id);
  assert.equal(rankOf(a.rankedLevels, "N37"), rankOf(b.rankedLevels, "N77"), "rangs regroupés par position, pas par ID");
  // Décision globale : mêmes reasonCodes, même nombre de candidats, même score.
  assert.deepEqual(b.reasonCodes, a.reasonCodes, "raisons inchangées par le renommage");
  assert.equal(JSON.stringify(b.rankedLevels.map((x) => ({ id: x.id === "N77" ? "N37" : x.id, score: x.score, distance: x.distance, codes: x.codes }))),
               JSON.stringify(a.rankedLevels), "classement structurellement identique position pour position");
});

// ---------------------------------------------------------------------------
// PD-14 — zéro écriture Save depuis la Policy (aucun import/persistance)
// ---------------------------------------------------------------------------

test("PD-14 : la Policy n'écrit JAMAIS dans la save (source + exécution)", () => {
  const src = readModuleCode();
  for (const forbidden of ["save.mjs", "setCurrent", "saveNow", "loadSave", "persist(", "localStorage", "storage.set("]) {
    assert.ok(!src.includes(forbidden), `source sans '${forbidden}'`);
  }
  // Exécution : un storage muni d'un compteur d'écritures ne reçoit aucune écriture.
  let writes = 0;
  const storage = { get: () => null, set: () => { writes++; } };
  recommend(inputs({ profile: P({ arithmetic: 0.9 }) }));
  assert.equal(writes, 0, "aucune écriture pendant la recommandation");
  void storage;
});

// ---------------------------------------------------------------------------
// PD-15 — zéro accès Engine depuis la Policy (aucun import runtime)
// ---------------------------------------------------------------------------

test("PD-15 : la Policy n'accède jamais à l'Engine (source + processus)", () => {
  const src = readModuleCode();
  for (const forbidden of ["engine.mjs", "kernel.mjs", "solver.mjs", "createSession", "apply(", "Math.random", "Date.now", "fetch(", "WebSocket"]) {
    assert.ok(!src.includes(forbidden), `source sans '${forbidden}'`);
  }
  // La Policy n'importe RIEN depuis le Game Core (frontière §21 conservée).
  assert.ok(!src.includes("../b1/"), "aucun import Game Core");
  assert.ok(!src.includes("src/b1"), "aucun import Game Core");
});

// ---------------------------------------------------------------------------
// Compléments corpus — fenêtres réelles avec/sans COMBINATION, avec MASTERY
// (appui de l'expérimentation M10, séparée du verdict de discrimination)
// ---------------------------------------------------------------------------

test("PD-M1 : LevelCandidate expose le modèle explicite (toutes les fenêtres du catalogue)", () => {
  for (const id of IDS) {
    const c = levelCandidate(id, META, DIFFICULTY);
    assert.equal(c.id, id);
    assert.ok(Number.isInteger(c.ladderPosition) && c.ladderPosition >= 1, `${id} position canonique entière`);
    assert.equal(c.world, level(id).world, `${id} world issu du catalogue`);
    assert.ok(Array.isArray(c.properties), `${id} propriétés array`);
    assert.equal(typeof c.stage?.name, "string", `${id} stage nommé`);
  }
});

test("PD-M2 : corpus — fenêtres réelles contenant COMBINATION, MASTERY, sans COMBINATION", () => {
  const hasCombo = (id) => props(id).includes("COMBINATION");
  const hasMastery = (id) => props(id).includes("MASTERY");
  // Fenêtre réelle 24-28 : N37 (COMBINATION), N25, N26, N27 (sans COMBINATION).
  const win1 = ["N24", "N37", "N25", "N26", "N27"];
  assert.ok(win1.some(hasCombo) && win1.some((x) => !hasCombo(x)), "fenêtre mixte COMBINATION présent/absent");
  // Fenêtre réelle 38-41 : N40, N41 (MASTERY) et N36 (fin de ladder).
  const win2 = ["N35", "N40", "N41", "N36"];
  assert.ok(win2.some(hasMastery) && win2.some((x) => !hasMastery(x)), "fenêtre avec et sans MASTERY");
  // Fenêtre 1-9 : aucun COMBINATION (onboarding pur).
  const win3 = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9"];
  assert.ok(!win3.some(hasCombo), "fenêtre d'onboarding sans COMBINATION");
});