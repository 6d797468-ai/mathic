import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSession, apply, evaluate, isWon, isLost, finalScore } from "../../src/b1/engine.mjs";
import { LADDER } from "../../src/b1/levels.mjs";
import {
  EVIDENCE_TYPES,
  FORBIDDEN_EVIDENCE_FIELDS,
  validateEvidence,
} from "../../src/intel/contracts.mjs";
import {
  EVIDENCE_SCHEMA_VERSION,
  createClock,
  createMonotonicClock,
  createSessionId,
  createEvidenceRecorder,
  deriveMetrics,
} from "../../src/intel/evidence.mjs";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const level = (id) => LADDER.find((l) => l.id === id);

// Horloge déterministe de test : chaque lecteur tire la valeur suivante d'un
// programme fixe ; le premier tic sert d'origine (elapsed = v - v0).
function scheduleClock(values) {
  let i = 0;
  return createClock({
    now: () => {
      const v = values[Math.min(i, values.length - 1)];
      i += 1;
      return v;
    },
  });
}

// Joue une partie réelle et enregistre l'évidence, comme le fera le runtime.
// `attempts` : liste ordonnée de { a, op, b } (tests d'éligibilité → preview /
// invalide) puis commits. Un commit gagnant termine proprement.
function play(recorder, levelId, attempts) {
  let s = createSession(level(levelId));
  recorder.started();
  for (const act of attempts) {
    const ev = evaluate(s, act);
    if (!ev.ok) {
      recorder.invalid({ a: act.a, op: act.op, b: act.b, reason: ev.reason });
      continue;
    }
    recorder.previewed(ev);
    const nxt = apply(s, act);
    const committedEv = nxt.events[nxt.events.length - 1];
    recorder.committed(committedEv);
    s = nxt;
  }
  if (isWon(s)) recorder.completed({ score: finalScore(s), movesLeft: s.movesLeft });
  else if (isLost(s)) recorder.failed("move_limit");
  return s;
}

function assertValidEvidence(evs) {
  for (const ev of evs) {
    assert.deepEqual(validateEvidence(ev), [], `évidence hors contrat : ${JSON.stringify(ev)}`);
    for (const forbidden of FORBIDDEN_EVIDENCE_FIELDS) {
      assert.ok(!(forbidden in ev), `champ interdit présent : ${forbidden}`);
      if (ev.payload) assert.ok(!(forbidden in ev.payload), `champ interdit dans payload : ${forbidden}`);
    }
  }
}

// Les métriques TIME_TO_* / SOLUTION_* / RETRY_COUNT sont dérivées, JAMAIS émises.
function assertNoDerivedEmitted(evs) {
  for (const t of ["TIME_TO_FIRST_ACTION", "TIME_TO_SOLUTION", "SOLUTION_DEPTH", "SOLUTION_SCORE", "RETRY_COUNT"]) {
    assert.ok(!evs.some((e) => e.type === t), `${t} ne doit jamais être émis comme événement`);
  }
}

const typesOf = (evs) => evs.map((e) => e.type);
const seqsOf = (evs) => evs.map((e) => e.seq);

// ---------------------------------------------------------------------------
// E. Player Evidence — Brique 2
// ---------------------------------------------------------------------------

test("E-01 : émission correcte — victoire N1 (fait réel), enveloppe versionnée", () => {
  const recorder = createEvidenceRecorder({ levelId: "N1", sessionId: "sess-E01", clock: scheduleClock([0, 10, 20, 30]) });
  const s = play(recorder, "N1", [{ a: 0, op: 1, b: 2 }]);
  assert.equal(isWon(s), true);
  const evs = recorder.events();

  assert.deepEqual(typesOf(evs), ["LEVEL_STARTED", "ACTION_PREVIEWED", "ACTION_COMMITTED", "LEVEL_COMPLETED"]);
  assert.deepEqual(seqsOf(evs), [1, 2, 3, 4], "seq strictement croissant");
  for (const ev of evs) {
    assert.equal(ev.schemaVersion, EVIDENCE_SCHEMA_VERSION);
    assert.equal(ev.sessionId, "sess-E01");
    assert.equal(ev.levelId, "N1");
    assert.equal(ev.levelVersion, 1);
    assert.equal(ev.ruleVersion, "b1");
    assert.equal(ev.provider, "engine");
    assert.ok(Number.isFinite(ev.atMs) && ev.atMs >= 0);
  }
  assert.equal(evs[1].payload.result, 5, "preview = fait de transformation");
  assert.equal(evs[2].payload.chainRun, 0);
  assert.equal(evs[3].payload.score, 10, "finalScore = 0 + bonus objectif 10");
  assert.equal(evs[3].payload.movesLeft, 0);
  assertValidEvidence(evs);
});

test("E-02 : ordre de séquence strict — mix complet de types (N7, avec invalide)", () => {
  const recorder = createEvidenceRecorder({ levelId: "N7", sessionId: "sess-E02", clock: scheduleClock([0, 1, 2, 3, 4, 5, 6, 7]) });
  const s0 = createSession(level("N7"));
  recorder.started();
  recorder.previewed(evaluate(s0, { a: 0, op: 4, b: 1 }));
  recorder.invalid({ a: 1, op: 5, b: 1, reason: "il faut 3 cellules distinctes" });
  let s = apply(s0, { a: 0, op: 4, b: 1 });
  recorder.committed(s.events[s.events.length - 1]);
  recorder.undone({ a: 0, op: 4, b: 1 });

  const evs = recorder.events();
  assert.deepEqual(typesOf(evs), ["LEVEL_STARTED", "ACTION_PREVIEWED", "ACTION_INVALID", "ACTION_COMMITTED", "UNDO_USED"]);
  assert.deepEqual(seqsOf(evs), [1, 2, 3, 4, 5]);
  assert.ok(evs.every((e, i) => i + 1 === e.seq), "seq = position dans la session");
  assertValidEvidence(evs);
});

test("E-03 : terminal unique — une session, un seul destin", () => {
  const recorder = createEvidenceRecorder({ levelId: "N1", sessionId: "sess-E03", clock: scheduleClock([0, 1, 2, 3]) });
  play(recorder, "N1", [{ a: 0, op: 1, b: 2 }]);
  const before = JSON.stringify(recorder.events());

  // Après le terminal, toute émission est silencieusement refusée (null).
  assert.equal(recorder.completed({ score: 99 }), null);
  assert.equal(recorder.failed("move_limit"), null);
  assert.equal(recorder.abandoned(), null);
  assert.equal(recorder.committed({ result: 5 }), null);
  assert.equal(recorder.terminal(), "LEVEL_COMPLETED");
  assert.equal(JSON.stringify(recorder.events()), before, "aucune évidence après terminal");
  assertValidEvidence(recorder.events());
});

test("E-04 : sérialisation stable — JSON round-trip, intégrité préservée", () => {
  const recorder = createEvidenceRecorder({ levelId: "N7", sessionId: "sess-E04", clock: scheduleClock([0, 5, 6, 11, 12, 17]) });
  play(recorder, "N7", [{ a: 0, op: 4, b: 1 }, { a: 0, op: 5, b: 2 }]);
  const evs = recorder.events();
  const round = JSON.parse(JSON.stringify(evs));
  assert.deepEqual(round, evs, "round-trip JSON sans perte");
  assertValidEvidence(round);
  assert.equal(round.length, evs.length);
});

test("E-05 : déterminisme — mêmes faits, même horloge ⇒ même évidence", () => {
  const run = (sessionId) => {
    const r = createEvidenceRecorder({ levelId: "N7", sessionId, clock: scheduleClock([0, 3, 3, 7, 9, 12]) });
    play(r, "N7", [{ a: 0, op: 4, b: 1 }, { a: 0, op: 5, b: 2 }]);
    return r.events();
  };
  const a = run("sess-E05");
  const b = run("sess-E05");
  assert.equal(JSON.stringify(a), JSON.stringify(b), "JSON identique pour la même session");
  assert.equal(JSON.stringify(a), JSON.stringify(run("sess-E05")), "rejouable à l'identique");
  // L'identité de session est une entrée : des sessions différentes diffèrent (par conception).
  assert.notEqual(JSON.stringify(run("sess-E05-a")), JSON.stringify(run("sess-E05-b")));
  assertValidEvidence(a);
});

test("E-06 : reprise de niveau — LEVEL_RESTARTED = fait, retryCount = métrique dérivée", () => {
  const recorder = createEvidenceRecorder({ levelId: "N1", sessionId: "sess-E06", clock: scheduleClock([0, 1, 2, 3, 4, 5, 6, 7]) });
  recorder.started();
  recorder.restarted();
  recorder.started();
  recorder.previewed(evaluate(createSession(level("N1")), { a: 0, op: 1, b: 2 }));
  let s = apply(createSession(level("N1")), { a: 0, op: 1, b: 2 });
  recorder.committed(s.events[s.events.length - 1]);
  recorder.completed({ score: finalScore(s), movesLeft: s.movesLeft });

  const evs = recorder.events();
  assert.deepEqual(typesOf(evs), ["LEVEL_STARTED", "LEVEL_RESTARTED", "LEVEL_STARTED", "ACTION_PREVIEWED", "ACTION_COMMITTED", "LEVEL_COMPLETED"]);
  assert.equal(recorder.retryCount(), 1, "retryCount = nb de LEVEL_RESTARTED");
  assert.deepEqual(deriveMetrics(evs, { objectiveBonus: 10 }), {
    retryCount: 1,
    timeToFirstAction: evs[4].atMs - evs[0].atMs,
    timeToSolution: evs[5].atMs - evs[0].atMs,
    solutionDepth: 1,
    solutionScore: 10,
  });
  assertValidEvidence(evs);
  assertNoDerivedEmitted(evs);
});

test("E-07 : abandon ≠ échec — LEVEL_ABANDONED, jamais LEVEL_FAILED", () => {
  const recorder = createEvidenceRecorder({ levelId: "N1", sessionId: "sess-E07", clock: scheduleClock([0, 1, 2]) });
  recorder.started();
  recorder.previewed(evaluate(createSession(level("N1")), { a: 0, op: 1, b: 2 }));
  recorder.abandoned("quit");

  const evs = recorder.events();
  assert.deepEqual(typesOf(evs), ["LEVEL_STARTED", "ACTION_PREVIEWED", "LEVEL_ABANDONED"]);
  assert.ok(!evs.some((e) => e.type === "LEVEL_FAILED"), "quitter ≠ échouer");
  assert.equal(recorder.terminal(), "LEVEL_ABANDONED");
  assert.equal(recorder.failed("move_limit"), null, "terminal acquis : plus d'échec ensuite");
  assert.equal(evs[2].payload.reason, "quit");
  assertValidEvidence(evs);
});

test("E-08 : victoire en chaîne réelle (N7, parcours du Solver) — CHAIN_STARTED avant LEVEL_COMPLETED", () => {
  const recorder = createEvidenceRecorder({ levelId: "N7", sessionId: "sess-E08", clock: scheduleClock([0, 1, 1, 2, 3, 4]) });
  const s = play(recorder, "N7", [{ a: 0, op: 4, b: 1 }, { a: 0, op: 5, b: 2 }]);
  assert.equal(isWon(s), true, "la partie réelle est gagnée");
  assert.equal(isLost(s), false);

  const evs = recorder.events();
  assert.deepEqual(typesOf(evs), [
    "LEVEL_STARTED",
    "ACTION_PREVIEWED",
    "ACTION_COMMITTED",
    "ACTION_PREVIEWED",
    "ACTION_COMMITTED",
    "CHAIN_STARTED",
    "LEVEL_COMPLETED",
  ]);
  const chains = evs.filter((e) => e.type === "CHAIN_STARTED");
  assert.equal(chains.length, 1);
  assert.equal(chains[0].payload.run, 1);
  assert.equal(evs[4].payload.chainRun, 1, "le commit gagnant réutilise un résultat (run 1)");
  assert.equal(evs[5].seq, evs[4].seq + 1, "CHAIN_STARTED suit immédiatement le commit");
  assert.equal(evs[6].seq, evs[5].seq + 1, "puis LEVEL_COMPLETED");
  assert.ok(!evs.some((e) => e.type === "CHAIN_BROKEN"), "victoire : chaîne jamais brisée");
  assert.ok(!evs.some((e) => e.type === "LEVEL_FAILED"));
  assert.equal(evs[6].payload.score, 15, "finalScore = 0 + 5 + bonus objectif 10");
  assertValidEvidence(evs);
});

test("E-09 : échec réel du niveau — LEVEL_FAILED reason move_limit, chaîne démarrée mais non aboutie", () => {
  const recorder = createEvidenceRecorder({ levelId: "N7", sessionId: "sess-E09", clock: scheduleClock([0, 1, 2, 3, 4, 5, 6, 7]) });
  const s = play(recorder, "N7", [{ a: 0, op: 4, b: 1 }, { a: 2, op: 6, b: 3 }, { a: 0, op: 5, b: 2 }]);
  assert.equal(isLost(s), true, "mouvements épuisés sans atteindre la cible");
  assert.equal(isWon(s), false);

  const evs = recorder.events();
  const failed = evs.filter((e) => e.type === "LEVEL_FAILED");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].payload.reason, "move_limit");
  assert.ok(!evs.some((e) => e.type === "LEVEL_COMPLETED"), "échec ≠ victoire");
  assert.ok(!evs.some((e) => e.type === "LEVEL_ABANDONED"), "échec ≠ abandon");
  assert.ok(evs.some((e) => e.type === "CHAIN_STARTED"), "la chaîne a réellement commencé");
  assert.equal(recorder.terminal(), "LEVEL_FAILED");
  assertValidEvidence(evs);
});

test("E-10 : undo réel — UNDO_USED porte le fait annulé, la partie continue", () => {
  const recorder = createEvidenceRecorder({ levelId: "N7", sessionId: "sess-E10", clock: scheduleClock([0, 1, 2, 3, 4, 5, 6, 7, 8]) });
  const s0 = createSession(level("N7"));
  recorder.started();

  const ev1 = evaluate(s0, { a: 0, op: 4, b: 1 });
  recorder.previewed(ev1);
  const s1 = apply(s0, { a: 0, op: 4, b: 1 });
  recorder.committed(s1.events[s1.events.length - 1]);
  recorder.undone({ a: 0, op: 4, b: 1 });

  // La partie retourne à l'état initial puis rejoue jusqu'à la victoire.
  const ev2 = evaluate(s0, { a: 0, op: 4, b: 1 });
  recorder.previewed(ev2);
  const s2 = apply(s0, { a: 0, op: 4, b: 1 });
  recorder.committed(s2.events[s2.events.length - 1]);
  const ev3 = evaluate(s2, { a: 0, op: 5, b: 2 });
  recorder.previewed(ev3);
  const s3 = apply(s2, { a: 0, op: 5, b: 2 });
  recorder.committed(s3.events[s3.events.length - 1]);
  recorder.completed({ score: finalScore(s3), movesLeft: s3.movesLeft });

  const evs = recorder.events();
  const undo = evs.find((e) => e.type === "UNDO_USED");
  assert.ok(undo, "UNDO_USED émis");
  assert.deepEqual(undo.payload.undone, { a: 0, op: 4, b: 1 });
  assert.equal(evs[evs.length - 1].type, "LEVEL_COMPLETED");
  assertValidEvidence(evs);
  assertNoDerivedEmitted(evs);
});

test("E-11 : anti-collecte + dérivés non émis — preuve par la sortie du recorder", () => {
  const recorder = createEvidenceRecorder({ levelId: "N7", sessionId: "sess-E11", clock: scheduleClock([0, 1, 2, 3, 4, 5, 6]) });
  play(recorder, "N7", [{ a: 0, op: 4, b: 1 }, { a: 0, op: 5, b: 2 }]);
  const evs = recorder.events();

  assertValidEvidence(evs);
  const serialized = JSON.stringify(evs);
  for (const forbidden of FORBIDDEN_EVIDENCE_FIELDS) {
    assert.ok(!serialized.includes(`"${forbidden}"`), `aucun champ interdit dans la sérialisation : ${forbidden}`);
  }
  assertNoDerivedEmitted(evs);
  // Seuls des faits : les payloads n'exposent que des ids/faits de transformation.
  const payloadKeys = new Set(evs.flatMap((e) => (e.payload ? Object.keys(e.payload) : [])));
  for (const k of payloadKeys) {
    assert.ok(!["age", "iq", "personality", "deviceId"].includes(k), `clé d'emission interdite : ${k}`);
  }
  assert.equal(recorder.previewed({ ok: false }), null, "preview non éligible ⇒ pas d'évidence");
});

test("E-12 : chaîne réelle — CHAIN_STARTED puis CHAIN_BROKEN (N13, 0→1→0)", () => {
  const recorder = createEvidenceRecorder({ levelId: "N13", sessionId: "sess-E12", clock: scheduleClock([0, 1, 1, 2, 2, 3, 4]) });
  const s = play(recorder, "N13", [
    { a: 0, op: 5, b: 1 },
    { a: 0, op: 6, b: 2 },
    { a: 4, op: 7, b: 3 },
  ]);
  assert.equal(isLost(s), false);

  const evs = recorder.events();
  const committed = evs.filter((e) => e.type === "ACTION_COMMITTED");
  assert.deepEqual(committed.map((e) => e.payload.chainRun), [0, 1, 0], "runs réels observés");

  const started = evs.filter((e) => e.type === "CHAIN_STARTED");
  const broken = evs.filter((e) => e.type === "CHAIN_BROKEN");
  assert.equal(started.length, 1);
  assert.equal(started[0].payload.run, 1);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].payload.prevRun, 1);
  assert.ok(broken[0].seq > started[0].seq, "CHAIN_BROKEN après CHAIN_STARTED");
  assert.equal(committed[2].payload.chainRun, 0, "le 3e commit est bien un 0 (rupture)");
  assertValidEvidence(evs);
});

test("E-13 : non-régression — frontière d'architecture et déterminisme non altéré", () => {
  // L'émetteur ne référence jamais le Game Core (imports droites GPS limités au
  // plan de contrat) et les modules d'émission upstream restent tiers.
  const src = read("src/intel/evidence.mjs");
  assert.ok(src.includes('from "./contracts.mjs"'), "évidence s'appuie uniquement sur le plan de contrat");
  assert.ok(!/from\s+["']\.\.\//.test(src), "aucun import vers le Game Core dans evidence.mjs");
  assert.equal(EVIDENCE_SCHEMA_VERSION, 1);
  assert.equal(typeof createMonotonicClock().now, "function");
  assert.ok(typeof createSessionId() === "string" && createSessionId().length > 0);

  // L'émetteur ne mute jamais les faits qu'il observe.
  const s0 = createSession(level("N1"));
  Object.freeze(s0.board.cells);
  const ev = evaluate(createSession(level("N1")), { a: 0, op: 1, b: 2 });
  Object.freeze(ev);
  const before = JSON.stringify(s0);
  const r = createEvidenceRecorder({ levelId: "N1", sessionId: "sess-E13", clock: scheduleClock([0, 1, 2]) });
  r.started();
  r.previewed(ev);
  r.committed(ev);
  assert.equal(JSON.stringify(s0), before, "état réel immuable (inputs non mutés)");
  assert.ok(ev, "events Engine réutilisés tels quels");
});

test("E-14 : intégration réelle d'une session complète (N7) — preview, invalide, commit, undo, chaîne, victoire", () => {
  const recorder = createEvidenceRecorder({ levelId: "N7", sessionId: "sess-E14", clock: scheduleClock([0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7]) });

  let s = createSession(level("N7"));
  recorder.started();
  const commit = (act) => {
    const ev = evaluate(s, act);
    recorder.previewed(ev);
    const nxt = apply(s, act);
    recorder.committed(nxt.events[nxt.events.length - 1]);
    s = nxt;
    return ev;
  };

  recorder.previewed(evaluate(s, { a: 0, op: 4, b: 1 })); // preview consultée sans suite
  recorder.invalid({ a: 1, op: 5, b: 1, reason: "il faut 3 cellules distinctes" });
  commit({ a: 0, op: 4, b: 1 }); // 3 × 2 = 6
  recorder.undone({ a: 0, op: 4, b: 1 }); // la partie retourne à l'état initial
  s = createSession(level("N7"));
  commit({ a: 0, op: 4, b: 1 }); // 3 × 2 = 6 (reprise)
  commit({ a: 0, op: 5, b: 2 }); // 6 + 24 = 30 → chaîne + victoire
  assert.equal(isWon(s), true, "victoire réelle du gameplay");
  recorder.completed({ score: finalScore(s), movesLeft: s.movesLeft });

  const evs = recorder.events();
  const expectedTypes = [
    "LEVEL_STARTED",
    "ACTION_PREVIEWED",
    "ACTION_INVALID",
    "ACTION_PREVIEWED",
    "ACTION_COMMITTED",
    "UNDO_USED",
    "ACTION_PREVIEWED",
    "ACTION_COMMITTED",
    "ACTION_PREVIEWED",
    "ACTION_COMMITTED",
    "CHAIN_STARTED",
    "LEVEL_COMPLETED",
  ];
  assert.deepEqual(typesOf(evs), expectedTypes);
  assert.deepEqual(seqsOf(evs), evs.map((_, i) => i + 1), "seq continu de bout en bout");
  assertValidEvidence(evs);
  assertNoDerivedEmitted(evs);
  const invalidEv = evs.find((e) => e.type === "ACTION_INVALID");
  assert.equal(invalidEv.payload.reason, "il faut 3 cellules distinctes");
  assert.equal(evs[evs.length - 1].payload.score, 15, "0 + 5 + 10 (objectif)");
  assert.deepEqual(deriveMetrics(evs, { objectiveBonus: 10 }), {
    retryCount: 0,
    timeToFirstAction: evs[4].atMs - evs[0].atMs,
    timeToSolution: evs[11].atMs - evs[0].atMs,
    solutionDepth: 3,
    solutionScore: 15,
  });
});

test("E-15 : CHAIN_BROKEN ≠ ACTION_INVALID — une action invalide ne casse jamais une chaîne", () => {
  const recorder = createEvidenceRecorder({ levelId: "N13", sessionId: "sess-E15", clock: scheduleClock([0, 1, 1, 2, 2, 3, 3, 4, 5]) });
  let s = createSession(level("N13"));
  recorder.started();

  const commitSeq = (act) => {
    const nxt = apply(s, act);
    recorder.committed(nxt.events[nxt.events.length - 1]);
    s = nxt;
  };

  commitSeq({ a: 0, op: 5, b: 1 }); // run 0
  commitSeq({ a: 0, op: 6, b: 2 }); // run 1 → CHAIN_STARTED

  // Tentative invalide au cœur de la chaîne : elle n'émet qu'ACTION_INVALID.
  recorder.invalid({ a: 1, op: 5, b: 1, reason: "il faut 3 cellules distinctes (A, opérateur, B)" });

  commitSeq({ a: 4, op: 7, b: 3 }); // run 0 → CHAIN_BROKEN (vraie transition validée)

  const evs = recorder.events();
  const broken = evs.filter((e) => e.type === "CHAIN_BROKEN");
  const invalid = evs.filter((e) => e.type === "ACTION_INVALID");
  assert.equal(broken.length, 1, "une seule rupture, la vraie");
  assert.equal(invalid.length, 1);
  assert.ok(broken[0].seq > invalid[0].seq, "la rupture vient du commit valide, pas de l'invalide");
  assert.equal(broken[0].seq, invalid[0].seq + 2, "après l'invalide : commit + rupture (l'invalide ne casse rien)");
  assertValidEvidence(evs);
});