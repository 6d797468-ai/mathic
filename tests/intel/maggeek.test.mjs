import { test } from "node:test";
import assert from "node:assert/strict";

import { LADDER, ladderBy } from "../../src/b1/levels.mjs";
import { createSession, evaluate, apply, isWon, isLost, finalScore, cellsSnapshot } from "../../src/b1/engine.mjs";
import { loadSave, blankSave, markCompleted, saveNow, SAVE_KEY } from "../../src/b1/save.mjs";
import { isCoach, hasWriteCapability, isRecommendation, validateRecommendation, validateCoach, DEFAULT_PROFILE } from "../../src/intel/contracts.mjs";
import { FACT_ID, solverFacts } from "../../src/intel/facts.mjs";
import { createMaggeek } from "../../src/intel/maggeek.mjs";
import { createMomo } from "../../src/intel/momo.mjs";

const memoryStorage = () => {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => void m.set(k, v), _raw: m };
};

function buildCoach() {
  return createMaggeek();
}
function levelOf(id) {
  return ladderBy(id);
}
function recordOf(storage, id) {
  const s = loadSave(storage);
  return s.completed[id] ?? null;
}

const FACT = (reg, id) => (reg && reg.facts ? reg.facts.get(id) : null);

test("MOMO-01 : hint valide (N1 = victoire directe, fait traçable)", () => {
  const coach = buildCoach();
  const level = levelOf("N1");
  const reg = solverFacts(level);
  const h = coach.hint({ levelId: "N1", level, record: null });
  assert.equal(h.type, "hint");
  assert.equal(h.confidence, "verified");
  assert.equal(h.abstain, false);
  assert.ok(h.solverFactId.includes(FACT_ID.FIRST_MOVE));
  assert.ok(h.lines.length >= 1);
  assert.ok(h.text.includes("2") && h.text.includes("3") && h.text.includes("5"));
  assert.ok(FACT(reg, FACT_ID.FIRST_MOVE) !== null);
});

test("MOMO-02 : fact inexistant / niveau non solvable → abstention (jamais d'invention)", () => {
  const coach = buildCoach();
  const unknown = coach.hint({ levelId: "ZZZ-NON-EXISTENT", level: null, record: null });
  assert.equal(unknown.abstain, true);
  assert.ok(!unknown.solverFactId.includes(FACT_ID.FIRST_MOVE));
  assert.ok(unknown.text.includes("inconnu") || unknown.text.includes("aucun"));

  const unsolvable = { id: "X-UNSOLVABLE", tiles: [{ kind: "op", v: "+" }], rows: 1, cols: 1, target: 5, maxMoves: 2 };
  const unsolv = coach.hint({ levelId: "X-UNSOLVABLE", level: unsolvable, record: null });
  assert.equal(unsolv.abstain, true);
  assert.ok(unsolv.text.includes("solution certifiée"));
  assert.ok(!unsolv.text.match(/=\s*\d/));
});

test("M19 MOMO-03 : fallback (provider=null, mode=deterministic) = coach déterministe", () => {
  const base = buildCoach();
  const momo = createMomo({ coach: base, provider: null, mode: "deterministic" });
  assert.equal(momo.isLLM(), false);
  const level = levelOf("N1");
  const a = momo.hint({ levelId: "N1", level, record: null });
  const b = base.hint({ levelId: "N1", level, record: null });
  assert.deepEqual(a, b);
});

test("MOMO-04 : timeout (provider qui ne répond jamais) → repli déterministe", async () => {
  const hanging = {
    info: () => ({ capability: "none", providerId: "hang" }),
    isAvailable: () => true,
    analyze: () => new Promise(() => {}),
    recommend: () => new Promise(() => {}),
    explain: () => new Promise(() => {}),
  };
  const momo = createMomo({ coach: buildCoach(), provider: hanging, mode: "local-llm", timeoutMs: 200 });
  assert.equal(momo.isLLM(), true);
  const level = levelOf("N1");
  const t0 = Date.now();
  const enriched = await momo.hintAsync({ levelId: "N1", level, record: null });
  const dt = Date.now() - t0;
  assert.ok(dt < 1200, `timeout doit tomber rapidement (<1200ms), observé ${dt}ms`);
  assert.equal(enriched.confidence, "verified");
  assert.equal(enriched.level, "L1");
});

test("MOMO-05 : modèle absent (isAvailable()=false) → jamais d'LLM, deterministic", () => {
  const absent = {
    info: () => ({ capability: "none", providerId: "absent" }),
    isAvailable: () => false,
    analyze: () => ({ ok: false }),
    recommend: () => ({ ok: false }),
    explain: () => ({ ok: false }),
  };
  const momo = createMomo({ coach: buildCoach(), provider: absent, mode: "local-llm" });
  assert.equal(momo.isLLM(), false);
  const level = levelOf("N1");
  const h = momo.hint({ levelId: "N1", level, record: null });
  assert.equal(h.confidence, "verified");
});

test("MOMO-06 : réponse invalide (clé interdite 'score') → repli déterministe", async () => {
  const bad = {
    info: () => ({ capability: "explanation", providerId: "bad" }),
    isAvailable: () => true,
    analyze: () => ({ ok: true }),
    recommend: () => ({ kind: "assistance", text: "x", score: 999 }),
    explain: () => ({ ok: true }),
  };
  const momo = createMomo({ coach: buildCoach(), provider: bad, mode: "local-llm", timeoutMs: 200 });
  assert.equal(momo.isLLM(), true);
  const level = levelOf("N1");
  const enriched = await momo.hintAsync({ levelId: "N1", level, record: null });
  assert.equal(enriched.confidence, "verified");
});

test("MOMO-07 : aucune mutation du GameState moteur (hint/explain/recommend/summarize)", () => {
  const coach = buildCoach();
  const level = levelOf("N3");
  const state = createSession(level);
  const snap = cellsSnapshot(state);
  const before = finalScore(state);

  coach.hint({ levelId: "N3", level, record: null });
  coach.explain({ levelId: "N3", level, action: { a: 0, op: 1, b: 1 }, state: createSession(level) });
  coach.recommend({ levelId: "N3", level, profile: DEFAULT_PROFILE });
  coach.summarize({ levelId: "N3", record: { wins: 0, bestScore: null } });

  const after = finalScore(state);
  assert.equal(cellsSnapshot(state), snap, "GameState inchangé");
  assert.equal(before, after, "score inchangé");
  assert.equal(isWon(state), false);
});

test("MOMO-08 : aucune mutation du score", () => {
  const coach = buildCoach();
  const level = levelOf("N1");
  const state = createSession(level);
  const before = finalScore(state);
  const rec = { wins: 2, bestScore: 12, bestMovesLeft: 0 };
  coach.hint({ levelId: "N1", level, record: rec });
  coach.encourage({ record: rec });
  assert.equal(finalScore(state), before, "score de session inchangé par le coach");
  assert.deepEqual(rec, { wins: 2, bestScore: 12, bestMovesLeft: 0 }, "record non muté");
});

test("M19 MOMO-09 : aucune mutation de la progression (save)", () => {
  const storage = memoryStorage();
  const st = markCompleted(blankSave(), "N1", { score: 20, movesLeft: 0 });
  saveNow(st, storage);
  const before = storage._raw.get(SAVE_KEY);
  const coach = buildCoach();
  const level = levelOf("N1");
  const rec = recordOf(storage, "N1");
  coach.hint({ levelId: "N1", level, record: rec });
  coach.recommend({ levelId: "N1", level, profile: DEFAULT_PROFILE });
  const after = storage._raw.get(SAVE_KEY);
  assert.equal(after, before, "mathic.save.v1 inchangé par le coach");
});

test("MOMO-10 : aucune mutation de la save (storage brut identique)", () => {
  const storage = memoryStorage();
  saveNow(blankSave(), storage);
  const before = storage._raw.get(SAVE_KEY);
  const coach = buildCoach();
  coach.hint({ levelId: "N1", level: levelOf("N1"), record: recordOf(storage, "N1") });
  coach.hint({ levelId: "N4", level: levelOf("N4"), record: recordOf(storage, "N4") });
  coach.explain({ levelId: "N1", level: levelOf("N1"), action: { a: 0, op: 1, b: 2 }, state: createSession(levelOf("N1")) });
  assert.equal(storage._raw.get(SAVE_KEY), before, "storage brut inchangé");
});

test("MOMO-11 : déterminisme (même entrée → même sortie) couche déterministe", () => {
  const coach = buildCoach();
  const level = levelOf("N5");
  const rec = recordOf(memoryStorage(), "N5");
  const ctx = { levelId: "N5", level, record: rec };
  const a = JSON.stringify(coach.hint(ctx));
  const b = JSON.stringify(coach.hint(ctx));
  assert.equal(a, b, "hint déterministe");
  const c = JSON.stringify(coach.hint(ctx));
  assert.equal(a, c, "hint idempotent");
});

test("MOMO-12 : validateur de Coach (isCoach + validateCoach + zéro capacité d'écriture)", () => {
  const coach = buildCoach();
  assert.equal(isCoach(coach), true);
  assert.deepEqual(validateCoach(coach), []);
  assert.equal(hasWriteCapability(coach), false);
});

test("MOMO-13 : Momo est un Coach valide sans capacité d'écriture", () => {
  const momo = createMomo({ coach: buildCoach(), provider: null, mode: "deterministic" });
  assert.equal(isCoach(momo), true);
  assert.deepEqual(validateCoach(momo), []);
  assert.equal(hasWriteCapability(momo), false);
});

test("MOMO-14 : recommend produce une recommandation valide (clés autorisées, pas de score/board/state)", () => {
  const coach = buildCoach();
  const r = coach.recommend({ levelId: "N1", level: levelOf("N1"), profile: DEFAULT_PROFILE });
  assert.equal(isRecommendation(r), true);
  assert.deepEqual(validateRecommendation(r), []);
  for (const forbidden of ["score", "board", "state", "apply", "setScore", "save"]) {
    assert.ok(!(forbidden in r), `clé interdite '${forbidden}' absente`);
  }
});

test("MOMO-15 : non-régression — toute la LADDER reste solvable (coach ne casse rien)", () => {
  const coach = buildCoach();
  let ok = 0;
  for (const L of LADDER) {
    const reg = solverFacts(L);
    assert.equal(reg.solvable, true, `${L.id} doit rester solvable`);
    const h = coach.hint({ levelId: L.id, level: L, record: recordOf(memoryStorage(), L.id) });
    assert.equal(h.confidence, "verified");
    ok++;
  }
  assert.equal(ok, LADDER.length);
});

test("MOMO-16 : hint sur N16 (synthèse, chaine+multi) donne un fait traceable L2 avec record de victoire", () => {
  const coach = buildCoach();
  const level = levelOf("N16");
  const rec = { wins: 1, bestScore: 50, bestMovesLeft: 2 };
  const h = coach.hint({ levelId: "N16", level, record: rec });
  assert.equal(h.abstain, false);
  assert.ok(h.solverFactId.length >= 1);
  assert.equal(h.confidence, "verified");
});

test("MOMO-17 : explain d'un coup illégal (division non exacte) → fait vérifié, message sans invention", () => {
  const coach = buildCoach();
  const level = levelOf("N15");
  const state = createSession(level);
  const e = coach.explain({ levelId: "N15", level, action: { a: 0, op: 6, b: 1 }, state });
  assert.equal(e.confidence, "verified");
  assert.equal(e.solverFactId, FACT_ID.MOVE_VALIDITY);
  assert.ok(e.text.length > 0);
});

test("MOMO-18 : coach abstient proprement si evaluate indisponible (explain safe)", () => {
  const coach = createMaggeek({ evaluate: null });
  const level = levelOf("N1");
  const e = coach.explain({ levelId: "N1", level, action: { a: 0, op: 1, b: 2 }, state: createSession(level) });
  assert.equal(e.confidence, "verified");
  assert.equal(e.solverFactId, FACT_ID.MOVE_VALIDITY);
  assert.ok(e.text.includes("non analysable"));
});
