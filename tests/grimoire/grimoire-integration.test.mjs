import { test } from "node:test";
import assert from "node:assert/strict";

import { createGrimoire } from "../../src/grimoire/grimoire.mjs";
import {
  createProgressionFacade,
  createB1Seam,
  createV5Seam,
  createGrimoireAssembly,
} from "../../src/grimoire/engines.mjs";
import { createKnowledgeStore } from "../../src/atelier/knowledge.mjs";

// Backends mémoire — les modules réels (save.mjs, knowledge.mjs) tournent dessus.
const memoryStorage = () => {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), _raw: m };
};
const memoryBackend = () => {
  const m = new Map();
  return { get: (k) => m.get(k), set: (k, v) => m.set(k, v) };
};

// B1 réel : une action valide = formule (a, op, b) par ids de tuiles.
// Découverte déterministe : on lit la première formule légale énumérée par le
// moteur (aucune heuristique, aucune copie de règle — enumerateActions est LA loi).
function playB1ToTerminal(g) {
  let guard = 0;
  while (guard++ < 20) {
    const legal = g.legalMoves();
    if (legal.length === 0) break;
    const r = g.play(legal[0]);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.status.screen !== "PLAYING") return { ok: true, status: r.status };
  }
  return { ok: false, reason: "NO_TERMINAL" };
}

// ---------------------------------------------------------------------------
// GR-R1 · Vraie façade progression : lecture, verrouillage, délégation
// ---------------------------------------------------------------------------

test("GR-R1 : progression réelle (save.mjs) — N1 ouvert, N2 verrouillé, délégation markCompleted", () => {
  const storage = memoryStorage();
  const prog = createProgressionFacade({ storage });
  assert.equal(prog.key, "mathic.save.v1");
  const g = createGrimoire({
    engines: { b1: createB1Seam({ progression: prog }), v5: createV5Seam() },
    progression: prog,
  });
  g.open();
  const levels = g.listLevels().filter((l) => l.engine === "b1");
  assert.equal(levels[0].id, "N1");
  assert.equal(levels[0].state, "OPEN");
  assert.equal(levels[1].state, "LOCKED");
  assert.equal(g.canPlay("b1", "N1"), true);
  assert.equal(g.canPlay("b1", "N2"), false);
  // délégation réelle : markCompleted débloque la fenêtre N2.. (règle de save.mjs)
  const next = prog.recordCompletion("N1", { score: 20, movesLeft: 0 });
  assert.equal(next.unlocked.includes("N2"), true);
  const levels2 = g.listLevels().filter((l) => l.engine === "b1");
  assert.equal(levels2[1].state, "OPEN"); // le Grimoire reflète la progression réelle
});

// ---------------------------------------------------------------------------
// GR-R2 · Boucle b1 complète : jouer → terminal → récompense → suivant
// ---------------------------------------------------------------------------

test("GR-R2 : boucle b1 réelle — N1 joué via enumerateActions, WON, progression, N2 monté", () => {
  const storage = memoryStorage();
  const prog = createProgressionFacade({ storage });
  const g = createGrimoire({
    engines: { b1: createB1Seam({ progression: prog }), v5: createV5Seam() },
    progression: prog,
  });
  g.open();
  assert.equal(g.start("b1", "N1").ok, true);
  const status = g.status();
  assert.equal(status.engine, "b1");
  assert.equal(status.session.target, 5); // N1 : 2 + 3 = 5 (vue exposée par la seam)
  assert.ok(status.session.cells.filter((c) => c !== null).length >= 3);

  const r = playB1ToTerminal(g);
  assert.equal(r.ok, true, "le premier coup énuméré atteint la terminalité sur N1");
  assert.equal(r.status.screen, "RESOLVED"); // N1 est gagné par la première formule légale
  assert.equal(r.status.terminal.outcome, "WON");
  assert.equal(typeof r.status.terminal.finalScore, "number");

  // récompense → mathic.save.v1 réellement écrit (clé visible, N2 débloqué)
  const rw = g.reward();
  assert.equal(rw.ok, true);
  assert.equal(rw.next.id, "N2"); // l'échelle retourne l'entrée LADDER complète
  const saved = JSON.parse(storage._raw.get("mathic.save.v1"));
  assert.equal(saved.unlocked.includes("N2"), true);
  assert.equal(saved.completed.N1.wins, 1);

  // événements de boucle = source d'évidence
  const evs = g.takeEvents();
  assert.ok(evs.some((e) => e.t === "CHALLENGE_COMPLETED" && e.levelId === "N1"));
  assert.ok(evs.some((e) => e.t === "PROGRESSION_ADVANCED"));

  // niveau suivant monté depuis la résolution
  const adv = g.next();
  assert.equal(adv.ok, true);
  assert.equal(adv.status.levelId, "N2");
});

// ---------------------------------------------------------------------------
// GR-R3 · Boucle v5 réelle : jouer → solved → savoir, progression INTACTE
// ---------------------------------------------------------------------------

test("GR-R3 : boucle v5 réelle — session V5 montée, résolue, savoir nourri, save jamais écrit", async () => {
  const storage = memoryStorage();
  const backend = memoryBackend();
  const prog = createProgressionFacade({ storage });
  const know = createKnowledgeStore(backend);
  const g = createGrimoire({
    engines: { b1: createB1Seam({ progression: prog }), v5: createV5Seam() },
    progression: prog,
    knowledge: know,
  });
  g.open();
  assert.equal(g.start("v5", "LAB_SUM_2X2").ok, true);
  const status = g.status();
  assert.equal(status.session.grid.flat().every((v) => v === -1), true); // jamais la solution

  // coups V5 réels offerts par le moteur (getMoves), jusqu'à isSolved
  let guard = 0;
  let last = null;
  while (guard++ < 10) {
    const legal = g.legalMoves();
    assert.ok(legal.length > 0, "le lab 2×2 offre toujours un coup avant résolution");
    const r = g.play(legal[0]);
    assert.equal(r.ok, true);
    last = r.status;
    if (last.screen !== "PLAYING") break;
  }
  assert.equal(last.screen, "RESOLVED"); // le 1er coup offert est-il suffisant ? non → boucle

  const rw = g.reward();
  assert.equal(rw.ok, true);
  assert.equal(rw.progression, null);
  assert.equal(rw.next, null);
  const f = await g.flushKnowledge();
  assert.equal(f.flushed, 1);
  const st = await know.load();
  assert.ok(st.unlockedFragments.includes("LORE_ATELIER_001")); // CHALLENGE_COMPLETED réel

  // mathic.save.v1 n'a JAMAIS été écrit par le chemin lab
  assert.equal(storage._raw.has("mathic.save.v1"), false);
});

// ---------------------------------------------------------------------------
// GR-R4 · Vue Grimoire à deux moteurs, séparation des familles
// ---------------------------------------------------------------------------

test("GR-R4 : catalogue double famille — campagne verrouillée, lab ouvert", () => {
  const prog = createProgressionFacade({ storage: memoryStorage() });
  const g = createGrimoire({
    engines: { b1: createB1Seam({ progression: prog }), v5: createV5Seam() },
    progression: prog,
  });
  g.open();
  const all = g.listLevels();
  const camp = all.filter((l) => l.engine === "b1");
  const lab = all.filter((l) => l.engine === "v5");
  assert.equal(camp.length >= 2, true);
  assert.equal(camp[0].state, "OPEN");
  assert.equal(camp[1].state, "LOCKED");
  assert.ok(lab.length >= 2);
  assert.ok(lab.every((l) => l.state === "OPEN")); // le lab n'est jamais verrouillé
});

// ---------------------------------------------------------------------------
// GR-R5 · Assemblage officiel + snapshot/restore sur moteur réel
// ---------------------------------------------------------------------------

test("GR-R5 : assemblage officiel — fail-fast sans knowledgeStore, round-trip session réelle", () => {
  assert.throws(() => createGrimoireAssembly({ storage: memoryStorage() }), TypeError);
  const asm = createGrimoireAssembly({
    storage: memoryStorage(),
    knowledgeStore: createKnowledgeStore(memoryBackend()),
  });
  const g = createGrimoire(asm);
  g.open();
  g.start("v5", "LAB_SUM_2X2");
  g.play(g.legalMoves()[0]);
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const g2 = createGrimoire(asm);
  assert.equal(g2.restore(snap).ok, true);
  assert.equal(JSON.stringify(g2.snapshot()), JSON.stringify(g.snapshot()));
  // la session V5 restaurée rejoue exactement le même coup suivant
  const m1 = g.legalMoves();
  const m2 = g2.legalMoves();
  assert.deepEqual(m2, m1);
  const r1 = g.play(m1[0]);
  const r2 = g2.play(m2[0]);
  assert.deepEqual(r2.status.session.grid, r1.status.session.grid);
});
