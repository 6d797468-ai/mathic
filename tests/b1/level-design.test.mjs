import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LADDER, WORLDS } from "../../src/b1/levels.mjs";
import {
  analyzeLevel,
  analyzeAll,
  curriculumStage,
  classifyLevel,
  DECLARED_INTENT,
  STAGE_NAMES,
  WORLD_STAGE_CAPS,
  NM_DESIGN_BUDGET,
} from "../../src/b1/level-design.mjs";
import { createSession, apply, isWon, finalScore } from "../../src/b1/engine.mjs";
import { replay } from "../../src/b1/replay.mjs";

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const FACTS_KEYS = [
  "minMoves", "routeCount", "runs", "distinctFinalStates", "scoreRange",
  "operatorDiversity", "chainDepth", "uniqueSolution", "multiPath",
  "consequenceEvidence", "finalValues", "legalFirstActs", "bestScore", "maxDistinctOpsInPath",
];

test("LD — invariants structurels de la couche", () => {
  assert.equal(STAGE_NAMES.length, 9);
  assert.deepEqual(STAGE_NAMES.slice(1), ["DISCOVERY", "POSSIBILITY", "CHOICE", "CONSEQUENCE", "CHAIN", "OPTIMIZATION", "COMBINATION", "MASTERY"]);
  for (const w of WORLDS) assert.ok(WORLD_STAGE_CAPS[w.id] >= 1 && WORLD_STAGE_CAPS[w.id] <= 8, `${w.id} cap défini`);
  const VOCAB = new Set(STAGE_NAMES.slice(1).concat(["MULTI-PATH", "SINGLE-PATH"]));
  for (const [id, intent] of Object.entries(DECLARED_INTENT)) {
    for (const t of intent.tokens) assert.ok(VOCAB.has(t), `intent ${id} : token « ${t} » connu`);
  }
});

test("LD — analyse dérivée du Solver/Engine/Replay, aucune donnée inventée (métriques minimales)", () => {
  for (const lvl of LADDER) {
    const a = classifyLevel(lvl);
    for (const k of FACTS_KEYS) assert.ok(k in a.facts, `${a.id} : métrique ${k} présente`);
    const f = a.facts;
    assert.ok(f.minMoves >= 1 && f.minMoves <= lvl.maxMoves, `${a.id} minMoves dans l'enveloppe`);
    assert.ok(f.routeCount >= 1, `${a.id} au moins une route optimale`);
    assert.ok(f.distinctFinalStates >= 1, `${a.id} états finaux distincts`);
    assert.ok(f.scoreRange.length === 2 && f.scoreRange[0] <= f.scoreRange[1], `${a.id} scoreRange ordonné`);
    assert.equal(f.uniqueSolution, f.routeCount === 1 && f.runs === 1, `${a.id} uniqueSolution cohérente`);
    assert.equal(f.multiPath, f.routeCount >= 2, `${a.id} multiPath cohérente`);
    assert.ok(a.stage.stage >= 1 && a.stage.stage <= a.stage.cap && a.stage.stage <= 8, `${a.id} stage borné`);
    assert.ok(a.properties.length >= 1, `${a.id} au moins une propriété`);
  }
});

test("LD — concordance Solver=Engine=Replay sur les flagships (routes rejouées == faits)", () => {
  for (const id of ["N15", "N17", "N22", "N36"]) {
    const lvl = LADDER.find((l) => l.id === id);
    const a = analyzeLevel(lvl);
    const chains = [];
    const scoresReplay = [];
    for (const { final, path } of replayAll(lvl, a.samplePaths)) {
      assert.equal(isWon(final), true, `${id} : chemin rejoué victorieux`);
      scoresReplay.push(finalScore(final));
      chains.push(final.events.reduce((t, e) => t + e.chainBonus, 0));
      assert.equal(path.length, a.facts.minMoves, `${id} : profondeur du chemin == minMoves`);
    }
    assert.ok(
      a.facts.scoreRange[0] <= Math.max(...scoresReplay) && Math.max(...scoresReplay) <= a.facts.scoreRange[1],
      `${id} : score rejoué dans l'intervalle analysé`
    );
    const maxChain = chains.length ? Math.max(...chains) : 0;
    assert.equal(a.facts.chainDepth, maxChain, `${id} : chainDepth == somme de chaine max rejouée`);
  }
});

test("LD — multi-path ≠ conséquence significative : N1 (équivalent) vs N22 (divergent)", () => {
  const n1 = classifyLevel(LADDER.find((l) => l.id === "N1"));
  assert.equal(n1.facts.multiPath, true, "N1 : plusieurs routes");
  assert.equal(n1.facts.consequenceEvidence, false, "N1 : pas de conséquence observée (routes équivalentes)");
  assert.equal(n1.equivalentRoutes, true, "N1 : routes strictement équivalentes");
  assert.ok(n1.properties.includes("MULTI-PATH") && !n1.properties.includes("CHOICE"), "N1 : MULTI-PATH mais PAS CHOICE");
  assert.ok(n1.properties.includes("DISCOVERY"), "N1 : propriété DISCOVERY (intention onboarding)");

  const n22 = classifyLevel(LADDER.find((l) => l.id === "N22"));
  assert.equal(n22.facts.multiPath, true, "N22 : plusieurs routes");
  assert.equal(n22.facts.consequenceEvidence, true, "N22 : conséquence observée (scores 19 vs 27)");
  assert.ok(n22.properties.includes("CHOICE") && n22.properties.includes("CONSEQUENCE"), "N22 : CHOICE + CONSEQUENCE");
  assert.deepEqual(n22.declared, ["CHOICE", "CONSEQUENCE"], "N22 : flagships déclarés");
});

test("LD — flagships de référence (N15, N17, N36)", () => {
  const n15 = classifyLevel(LADDER.find((l) => l.id === "N15"));
  assert.equal(n15.facts.uniqueSolution, true, "N15 : solution strictement unique (précision)");
  assert.equal(n15.facts.multiPath, false);
  assert.ok(n15.properties.includes("SINGLE-PATH") && !n15.properties.includes("MULTI-PATH"), "N15 : SINGLE-PATH dominant");
  assert.deepEqual(n15.declared, ["SINGLE-PATH"], "N15 : précision déclarée (flagship)");

  const n17 = classifyLevel(LADDER.find((l) => l.id === "N17"));
  assert.equal(n17.facts.multiPath, true, "N17 : multi-path (les quatre chemins)");
  assert.equal(n17.facts.routeCount, 4);
  assert.deepEqual(n17.declared, ["MULTI-PATH"]);

  const n36 = classifyLevel(LADDER.find((l) => l.id === "N36"));
  assert.equal(n36.facts.minMoves, 2, "N36 : le Maître en 2 coups (certifié)");
  assert.equal(n36.facts.routeCount, 1, "N36 : route optimale unique");
  assert.equal(n36.stage.stage, 8, "N36 : stage MASTERY (intention déclarée, cap W6)");
  assert.equal(n36.stage.name, "MASTERY");
  assert.deepEqual(n36.declared, ["MASTERY", "COMBINATION"]);
});

test("LD — invariants N1–N41 : couverture et distribution figées", () => {
  const all = analyzeAll();
  assert.equal(all.length, 41);
  const tot = {
    multiPath: all.filter((a) => a.facts.multiPath).length,
    consequence: all.filter((a) => a.facts.consequenceEvidence).length,
    equivalent: all.filter((a) => a.equivalentRoutes).length,
    uniqueSol: all.filter((a) => a.facts.uniqueSolution).length,
    singlePath: all.filter((a) => a.properties.includes("SINGLE-PATH")).length,
    choice: all.filter((a) => a.properties.includes("CHOICE")).length,
    chain: all.filter((a) => a.properties.includes("CHAIN")).length,
    optimisation: all.filter((a) => a.properties.includes("OPTIMIZATION")).length,
    combination: all.filter((a) => a.properties.includes("COMBINATION")).length,
    mastery: all.filter((a) => a.properties.includes("MASTERY")).length,
  };
  assert.deepEqual(tot, { multiPath: 31, consequence: 23, equivalent: 10, uniqueSol: 1, singlePath: 10, choice: 21, chain: 32, optimisation: 19, combination: 12, mastery: 2 },
    "distribution N1–N41 (enrichissement M9 : +5 niveaux des mondes ÷/budget/synthèse)");
  for (const a of all) assert.equal(a.ambiguity.some((x) => x.startsWith("multi-path technique")), a.equivalentRoutes, `${a.id} : ambig prévient quand routes équivalentes`);
});

test("LD — reproductibilité : deux analyses identiques, budget documenté", () => {
  const lvl = LADDER.find((l) => l.id === "N22");
  const a1 = classifyLevel(lvl, { budget: NM_DESIGN_BUDGET });
  const a2 = classifyLevel(lvl, { budget: NM_DESIGN_BUDGET });
  assert.deepEqual(a1, a2, "N22 : résultat déterministe");
  const l34 = classifyLevel(LADDER.find((l) => l.id === "N34"));
  assert.deepEqual(l34, classifyLevel(LADDER.find((l) => l.id === "N34")), "N34 : résultat déterministe");
});

test("LD — audit : le noyau n'est pas muté ni inversé", () => {
  for (const rel of ["src/b1/engine.mjs", "src/b1/solver.mjs", "src/b1/replay.mjs"]) {
    const src = read(rel);
    for (const needle of ["level-design", "analyzeLevel", "classifyLevel", "nmFacts", "analyse"]) {
      assert.ok(!src.includes(needle), `${rel} : ne doit pas contenir « ${needle} »`);
    }
  }
  for (const rel of ["src/b1/engine.mjs", "src/b1/solver.mjs", "src/b1/replay.mjs", "src/b1/levels.mjs", "src/b1/save.mjs"]) {
    assert.ok(!read(rel).includes('from "./level-design.mjs"'), `${rel} : jamais d'import inversé`);
  }
});

test("LD — curriculum : la difficulté vient des décisions, pas du crash métrique (MATHIC-008)", () => {
  const all = analyzeAll();
  const maxBudgets = {};
  for (const a of all) {
    if (a.facts.scoreRange) {
      const span = a.facts.scoreRange[1] - a.facts.scoreRange[0];
      maxBudgets[a.id] = span;
    }
  }
  const biggest = Object.entries(maxBudgets).sort((x, y) => y[1] - x[1])[0];
  assert.ok(biggest[1] <= 72, `la plus grande divergence de score reste bornée (${biggest[0]}: +${biggest[1]})`);
  for (const a of all) assert.ok(a.facts.scoreRange[1] < 1000, `${a.id} : pas de nombres arbitrairement énormes`);
});

function replayAll(level, paths) {
  return (paths ?? []).map((p) => ({ path: p, final: replay(level, p).final }));
}

void createSession;
void apply;
void curriculumStage;
void DECLARED_INTENT;
void WORLD_STAGE_CAPS;