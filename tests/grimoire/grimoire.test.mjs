import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GRIMOIRE_SCREENS,
  createGrimoire,
} from "../../src/grimoire/grimoire.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = join(HERE, "../../src/grimoire/grimoire.mjs");

// ---------------------------------------------------------------------------
// Fakes conformes aux contrats injectés (aucun moteur réel ici : c'est le but)
// ---------------------------------------------------------------------------

const makeSeam = (overrides = {}) => {
  const { winAt = 2, ...rest } = overrides; // winAt = paramètre de CLOSURE, pas d'état
  return {
    catalog: () => [
      { id: "L1", title: "Niveau Un", playable: true, level: { id: "L1" } },
      { id: "L2", title: "Niveau Deux", playable: true, level: { id: "L2" } },
      { id: "LX", title: "Non jouable", playable: false, level: { id: "LX" } },
    ],
    mount: (entry) => ({ session: { levelId: entry.id, n: 0 } }),
    apply: (state, move) => (move?.illegal ? null : { ...state, n: state.n + 1, last: move }),
    legal: () => [{ id: "MOVE_A" }, { id: "MOVE_B" }],
    isTerminal: (state) => state.n >= winAt,
    outcome: (state) => (state.lose ? "LOST" : "WON"),
    expose: (state) => ({ n: state.n, last: state.last ?? null }),
    finalize: (state) => state.n * 10,
    nextLevel: (id) => (id === "L1" ? { id: "L2" } : null),
    ...rest,
  };
};

const makeProgression = (state = { unlocked: ["L1"], won: {} }) => {
  let writes = 0;
  const facade = {
    key: "mathic.save.v1",
    read: () => JSON.parse(JSON.stringify(state)),
    isUnlocked: (id) => state.unlocked.includes(id),
    hasWon: (id) => (state.won[id] ?? 0) > 0,
    recordCompletion: (id, payload) => {
      writes += 1;
      facade.lastRecord = { id, payload };
      state = { ...state, won: { ...state.won, [id]: 1 }, unlocked: [...new Set([...state.unlocked, "L2"])] };
      return state;
    },
    writes: () => writes,
  };
  return facade;
};

// Seam b1-like : délégation de récompense câblée sur la façade (miroir de la
// vraie seam b1 de engines.mjs — diff de déblocage calculé côté seam).
const makeB1Seam = (prog, overrides = {}) =>
  makeSeam({
    winAt: 1,
    finalizeProgression: (state, id, terminal) => {
      if (terminal?.outcome !== "WON") return { progression: null, knowledge: [] };
      const before = prog.read().unlocked.slice();
      const next = prog.recordCompletion(id, { score: terminal.finalScore, movesLeft: 0 });
      return { progression: { unlocked: next.unlocked.filter((x) => !before.includes(x)) }, knowledge: [] };
    },
    ...overrides,
  });

const makeKnowledge = () => {
  const recorded = [];
  return {
    key: "mathic.knowledge.v1",
    mode: "memory",
    recordAll: async ({ sequence }) => {
      recorded.push(...sequence);
      return { newlyUnlocked: sequence.length ? ["FRAG_TEST"] : [], noop: sequence.length === 0 };
    },
    listFragments: () => [{ id: "FRAG_TEST" }],
    recorded,
  };
};

// ---------------------------------------------------------------------------
// GR-01..02 · Construction et ouverture
// ---------------------------------------------------------------------------

test("GR-01 : construction — contrat des dépendances (fail-fast)", () => {
  assert.throws(() => createGrimoire({}), TypeError);
  assert.throws(() => createGrimoire({ engines: {} }), TypeError);
  assert.throws(() => createGrimoire({ engines: { b1: makeSeam() } }), TypeError);
  assert.throws(() => createGrimoire({ engines: { b1: { mount: () => {} } }, progression: makeProgression() }), TypeError);
  const g = createGrimoire({ engines: { b1: makeSeam() }, progression: makeProgression() });
  assert.deepEqual(g.snapshot().screen, "CLOSED");
});

test("GR-02 : open/close — machine d'écrans, events consommables une seule fois", () => {
  const prog = makeProgression();
  const g = createGrimoire({ engines: { b1: makeSeam() }, progression: prog });
  g.open();
  g.open(); // idempotent
  assert.equal(g.snapshot().screen, "INDEX");
  assert.deepEqual(g.takeEvents(), [{ t: "GRIMOIRE_OPENED" }]);
  assert.deepEqual(g.takeEvents(), []);
  g.close();
  assert.equal(g.snapshot().screen, "CLOSED");
});

// ---------------------------------------------------------------------------
// GR-03..05 · INDEX : lecture pure, verrouillage, non-jouable
// ---------------------------------------------------------------------------

test("GR-03 : listLevels — états OPEN/LOCKED/MASTERED dérivés de la progression", () => {
  const prog = makeProgression({ unlocked: ["L1"], won: { L1: 1 } });
  const g = createGrimoire({ engines: { b1: makeSeam() }, progression: prog });
  g.open();
  const levels = g.listLevels();
  assert.deepEqual(
    levels.map((l) => [l.id, l.state]),
    [
      ["L1", "MASTERED"],
      ["L2", "LOCKED"],
      ["LX", "LOCKED"], // non débloqué : verrouillé, même si non jouable
    ]
  );
  assert.equal(g.canPlay("b1", "L2"), false);
  assert.equal(g.canPlay("b1", "L1"), true);
  assert.equal(g.canPlay("b1", "LX"), false); // playable:false
  assert.equal(g.canPlay("ghost", "L1"), false);
});

test("GR-04 : start — rejets par contrat (moteur, niveau, verrou, non-jouable, écran)", () => {
  const g = createGrimoire({ engines: { b1: makeSeam() }, progression: makeProgression() });
  assert.equal(g.start("b1", "L1").reason, "CLOSED_OR_BUSY"); // pas ouvert
  g.open();
  assert.equal(g.start("ghost", "L1").reason, "ENGINE_UNKNOWN");
  assert.equal(g.start("b1", "GHOST").reason, "LEVEL_UNKNOWN");
  assert.equal(g.start("b1", "L2").reason, "LEVEL_LOCKED");
  assert.equal(g.start("b1", "LX").reason, "LEVEL_NOT_PLAYABLE");
  assert.equal(g.snapshot().screen, "INDEX"); // aucun montage sur rejet
  const r = g.start("b1", "L1");
  assert.equal(r.ok, true);
  assert.equal(r.status.screen, "PLAYING");
  assert.equal(g.start("b1", "L1").reason, "CLOSED_OR_BUSY"); // déjà en session
});

test("GR-05b : toIndex — abandon de session propre, session non adressable ensuite", () => {
  const g = createGrimoire({ engines: { b1: makeSeam({ winAt: 5 }) }, progression: makeProgression() });
  g.open();
  g.start("b1", "L1");
  const sid = g.status().sessionId;
  g.play({ id: "MOVE_A" });
  g.toIndex();
  assert.equal(g.snapshot().screen, "INDEX");
  assert.ok(g.takeEvents().some((e) => e.t === "SESSION_ABANDONED"));
  // plus de session : play/next/reward refusent, l'ancienne sessionId est morte
  assert.equal(g.play({ id: "MOVE_A" }).reason, "NOT_PLAYING");
  assert.equal(g.status().session, undefined);
  assert.notEqual(g.status().sessionId, sid);
  // depuis INDEX : no-op propre (pas d'event parasite)
  const evs = g.takeEvents().length;
  g.toIndex();
  assert.equal(g.takeEvents().length, evs);
});

test("GR-05 : listLevels ne mute jamais la progression (lecture pure)", () => {
  const prog = makeProgression();
  const g = createGrimoire({ engines: { b1: makeSeam() }, progression: prog });
  g.open();
  g.listLevels();
  g.listLevels();
  g.canPlay("b1", "L1");
  assert.equal(prog.writes(), 0);
});

// ---------------------------------------------------------------------------
// GR-06..08 · PLAYING : coups, rejets, terminalité
// ---------------------------------------------------------------------------

test("GR-06 : play — transition réelle via la seam, rejet sans mutation", () => {
  const g = createGrimoire({ engines: { b1: makeSeam({ winAt: 99 }) }, progression: makeProgression() });
  g.open();
  g.start("b1", "L1");
  const before = JSON.stringify(g.status().session);
  const bad = g.play({ illegal: true });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "MOVE_ILLEGAL");
  assert.equal(JSON.stringify(g.status().session), before); // état inchangé
  assert.ok(g.takeEvents().some((e) => e.t === "MOVE_REJECTED"));
  const ok = g.play({ id: "MOVE_A" });
  assert.equal(ok.ok, true);
  assert.equal(g.status().session.n, 1);
  assert.ok(g.takeEvents().some((e) => e.t === "MOVE_APPLIED"));
  assert.deepEqual(g.legalMoves(), [{ id: "MOVE_A" }, { id: "MOVE_B" }]);
});

test("GR-07 : play hors session → NOT_PLAYING", () => {
  const g = createGrimoire({ engines: { b1: makeSeam() }, progression: makeProgression() });
  assert.equal(g.play({}).reason, "NOT_PLAYING");
  g.open();
  assert.equal(g.play({}).reason, "NOT_PLAYING");
});

test("GR-08 : terminalité — WON → RESOLVED, LOST → FAILED, event correct", () => {
  const winSeam = makeSeam({ winAt: 2 });
  const g = createGrimoire({ engines: { b1: winSeam }, progression: makeProgression() });
  g.open();
  g.start("b1", "L1");
  g.play({ id: "MOVE_A" });
  assert.equal(g.snapshot().screen, "PLAYING");
  g.play({ id: "MOVE_B" });
  assert.equal(g.snapshot().screen, "RESOLVED");
  assert.equal(g.status().terminal.outcome, "WON");
  assert.equal(g.status().terminal.finalScore, 20);
  const evs = g.takeEvents();
  assert.ok(evs.some((e) => e.t === "CHALLENGE_COMPLETED" && e.levelId === "L1"));

  // chemin FAILED : une session qui se termine est perdue si outcome() dit LOST
  const loseSeam = makeSeam({ winAt: 1, outcome: () => "LOST" });
  const g2 = createGrimoire({ engines: { b1: loseSeam }, progression: makeProgression() });
  g2.open();
  g2.start("b1", "L1");
  g2.play({ id: "MOVE_A" }); // terminal immédiat → LOST
  assert.equal(g2.snapshot().screen, "FAILED");
  assert.equal(g2.status().terminal.outcome, "LOST");
  assert.ok(g2.takeEvents().some((e) => e.t === "LEVEL_FAILED"));
});

// ---------------------------------------------------------------------------
// GR-09..10 · Récompense : délégation pure, frontières I-5
// ---------------------------------------------------------------------------

test("GR-09 : reward — délégation progression (b1), diff de déblocage, idempotence", () => {
  const prog = makeProgression();
  const g = createGrimoire({ engines: { b1: makeB1Seam(prog, { winAt: 1 }) }, progression: prog });
  g.open();
  g.start("b1", "L1");
  g.play({ id: "MOVE_A" }); // WON → RESOLVED
  const r = g.reward();
  assert.equal(r.ok, true);
  assert.equal(r.won, true);
  assert.equal(r.finalScore, 10);
  assert.deepEqual(r.progression.unlocked, ["L2"]);
  assert.deepEqual(r.next, { id: "L2" });
  assert.equal(prog.writes(), 1); // UNE écriture, déléguée
  assert.equal(prog.lastRecord.id, "L1");
  assert.ok(g.takeEvents().some((e) => e.t === "PROGRESSION_ADVANCED"));
  // idempotence : un second appel ne réécrit PAS la progression
  assert.equal(g.reward().reason, "ALREADY_REWARDED");
  assert.equal(prog.writes(), 1);
});

test("GR-10 : reward — savoir (v5-like) nourrit knowledge, JAMAIS la progression", async () => {
  const prog = makeProgression();
  const know = makeKnowledge();
  const labSeam = makeSeam({
    catalog: () => [{ id: "LAB1", title: "Lab", playable: true, spec: {} }],
    mount: (e) => ({ session: { levelId: e.id, n: 0 } }),
    nextLevel: () => null,
    finalizeProgression: () => ({ progression: null, knowledge: [{ t: "CHALLENGE_COMPLETED" }] }),
  });
  const g = createGrimoire({ engines: { v5: labSeam }, progression: prog, knowledge: know });
  g.open();
  g.start("v5", "LAB1");
  g.play({ id: "MOVE_A" });
  g.play({ id: "MOVE_B" }); // n=2 → WON
  const r = g.reward();
  assert.equal(r.ok, true);
  assert.equal(r.progression, null); // aucun déblocage de campagne
  assert.equal(prog.writes(), 0); // mathic.save.v1 INTACT
  const f = await g.flushKnowledge();
  assert.equal(f.flushed, 1);
  assert.deepEqual(f.newlyUnlocked, ["FRAG_TEST"]);
  assert.deepEqual(know.recorded, [{ t: "CHALLENGE_COMPLETED" }]);
  const f2 = await g.flushKnowledge();
  assert.equal(f2.flushed, 0); // file vide → NO_OP
});

// ---------------------------------------------------------------------------
// GR-11..13 · next, snapshot/restore, déterminisme
// ---------------------------------------------------------------------------

test("GR-11 : next — avance au niveau suivant, rejets propres", () => {
  const prog = makeProgression();
  const g = createGrimoire({ engines: { b1: makeB1Seam(prog, { winAt: 1 }) }, progression: prog });
  g.open();
  assert.equal(g.next().reason, "NOT_RESOLVED");
  g.start("b1", "L1");
  g.play({ id: "MOVE_A" });
  const before = JSON.stringify(g.status().session);
  g.reward();
  const r = g.next();
  assert.equal(r.ok, true);
  assert.equal(r.status.levelId, "L2");
  assert.ok(g.takeEvents().some((e) => e.t === "LEVEL_ADVANCED"));
  // L2 est maintenant débloqué par la récompense → la session suivante est montée
  assert.equal(JSON.stringify(g.status().session) === before, false);
  // fin d'échelle → rejet propre
  const g2 = createGrimoire({ engines: { b1: makeB1Seam(prog, { winAt: 1, nextLevel: () => null }) }, progression: prog });
  g2.open();
  g2.start("b1", "L1");
  g2.play({ id: "MOVE_A" });
  assert.equal(g2.reward().ok, true);
  assert.equal(g2.next().reason, "END_OF_LADDER");
});

test("GR-12 : snapshot/restore — round-trip byte-identique, rejets propres", () => {
  const g = createGrimoire({ engines: { b1: makeSeam({ winAt: 3 }) }, progression: makeProgression() });
  g.open();
  g.start("b1", "L1");
  g.play({ id: "MOVE_A" });
  const snap = g.snapshot();
  const g2 = createGrimoire({ engines: { b1: makeSeam({ winAt: 3 }) }, progression: makeProgression() });
  assert.equal(g2.restore({ v: 2 }).ok, false);
  assert.equal(g2.restore({ v: 1, screen: "MARS" }).ok, false);
  assert.equal(g2.restore({ v: 1, screen: "PLAYING", engine: "ghost" }).ok, false);
  assert.equal(g2.restore(JSON.parse(JSON.stringify(snap))).ok, true);
  assert.equal(JSON.stringify(g2.snapshot()), JSON.stringify(snap));
  // la session restaurée continue exactement là où elle était
  g.play({ id: "MOVE_B" });
  g2.play({ id: "MOVE_B" });
  assert.equal(JSON.stringify(g2.status().session), JSON.stringify(g.status().session));
});

test("GR-13 : F(G,I)=F(G,I) — même scénario → même trace d'événements et même état", () => {
  const run = () => {
    const g = createGrimoire({ engines: { b1: makeSeam({ winAt: 2 }) }, progression: makeProgression() });
    g.open();
    g.start("b1", "L1");
    g.play({ id: "MOVE_A" });
    g.play({ id: "MOVE_B" });
    g.reward();
    return { snap: JSON.parse(JSON.stringify(g.snapshot())), evs: g.takeEvents() };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b);
  assert.ok(GRIMOIRE_SCREENS.includes(a.snap.screen));
});

// ---------------------------------------------------------------------------
// GR-14 · Pureté du module (I-4) — aucun DOM/aléa/horloge/réseau/storage direct
// ---------------------------------------------------------------------------

test("GR-14 : cœur pur — aucun Math.random/Date.now/DOM/réseau/localStorage direct", () => {
  const src = readFileSync(CORE_SRC, "utf8");
  for (const bad of ["Math.random", "Date.now", "document", "window", "localStorage", "navigator", "fetch(", "XMLHttpRequest", "WebSocket", "import("]) {
    assert.ok(!src.includes(bad), `interdit présent : ${bad}`);
  }
});
