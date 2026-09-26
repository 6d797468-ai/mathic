import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { LADDER, WORLDS, worldOf } from "../../src/b1/levels.mjs";
import { createSaga } from "../../src/grimoire/saga.mjs";
import { solve as solveB1 } from "../../src/b1/solver.mjs";
import { blankSave, markCompleted, saveNow, loadSave, SAVE_KEY } from "../../src/b1/save.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAGA_SRC = join(HERE, "../../src/grimoire/saga.mjs");

const memoryStorage = () => {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => void m.set(k, v),
    _raw: m,
  };
};

function wireSaga(storage) {
  return createSaga({
    save: () => loadSave(storage),
    solve: solveB1,
  });
}

test("S-01 : déterminisme de createSaga (wiring production — solveur réel par défaut)", () => {
  const saga = wireSaga(memoryStorage());
  const a = JSON.stringify(saga.view());
  const b = JSON.stringify(saga.view());
  assert.equal(a, b, "createSaga est déterministe : même entrée → même projection");
});

test("S-02 : absence de mutation / appels interdits (storage inchangé, projection pure)", () => {
  const storage = memoryStorage();
  saveNow(markCompleted(blankSave(), "N1", { score: 20, movesLeft: 0 }), storage);
  const before = storage._raw.get(SAVE_KEY);
  const saga = wireSaga(storage);
  saga.view();
  saga.view();
  saga.starsFor("N1");
  saga.starsFor("N5");
  saga.envelope("N1");
  const after = storage._raw.get(SAVE_KEY);
  assert.equal(after, before, "la projection n'écrit jamais dans le storage (I-2)");
});

test("S-03 : cohérence des étoiles sur save réel (N1 = ⭐3, totaux cohérents)", () => {
  const storage = memoryStorage();
  let st = blankSave();
  st = markCompleted(st, "N1", { score: 20, movesLeft: 0 });
  st = markCompleted(st, "N4", { score: 40, movesLeft: 0 });
  saveNow(st, storage);
  const v = wireSaga(storage).view();
  const row = (id) => v.chapters.flatMap((c) => c.levels).find((r) => r.id === id);
  assert.equal(row("N1").stars, 3);
  assert.equal(row("N1").state, "MASTERED");
  assert.equal(row("N4").stars, 1);
  assert.equal(v.totals.starsEarned, 4);
  assert.equal(v.totals.completed, 2);
});

test("S-04 : chapitres complets — W1..W6 (et uniquement eux)", () => {
  const v = wireSaga(memoryStorage()).view();
  assert.equal(v.chapters.length, WORLDS.length);
  assert.deepEqual(
    v.chapters.map((c) => c.id),
    WORLDS.map((w) => w.id)
  );
  const allIds = v.chapters.flatMap((c) => c.levels.map((l) => l.id));
  assert.equal(allIds.length, LADDER.length);
  assert.deepEqual([...new Set(allIds)].sort(), [...new Set(LADDER.map((l) => l.id))].sort());
});

test("S-05 : projection du niveau courant (save.current → view.current)", () => {
  const storage = memoryStorage();
  let st = markCompleted(blankSave(), "N1", { score: 20, movesLeft: 0 });
  st = { ...st, current: "N5" };
  saveNow(st, storage);
  const v = wireSaga(storage).view();
  assert.equal(v.current.levelId, "N5");
  assert.equal(v.current.worldId, worldOf("N5"));
});

test("S-06 : non-régression M17 + M18 — toute la LADDER solvable par le solveur réel", () => {
  const storage = memoryStorage();
  const saga = wireSaga(storage);
  const v = saga.view();
  assert.equal(v.totals.levelsTotal, LADDER.length);
  assert.equal(v.totals.starsPossible, LADDER.length * 3);
  let ok = 0;
  for (const L of LADDER) {
    const env = saga.envelope(L);
    assert.equal(env.solvable, true, `${L.id} doit rester solvable`);
    ok++;
  }
  assert.equal(ok, LADDER.length, "couverture intégrale du LADDER");
});

test("S-07 : aucune duplication d'autorité — saga.mjs ne lit que LADDER/WORLDS/solve, n'écrit rien", () => {
  const src = readFileSync(SAGA_SRC, "utf8");
  const imports = src.split("\n").filter((l) => l.startsWith("import "));
  assert.ok(
    !imports.some((l) => l.includes("save.mjs") || l.includes("knowledge.mjs")),
    "saga.mjs n'importe aucune autorité d'écriture (save/knowledge) — source unique préservée"
  );
  for (const forb of ["Math.random", "Date.now", "localStorage", "setItem", "window.", "document.", "fetch(", "XMLHttpRequest", "WebSocket"]) {
    assert.ok(!src.includes(forb), `interdit dans saga.mjs : ${forb}`);
  }
  assert.ok(src.includes("LADDER"), "saga.mjs consomme la géographie LADDER (source unique)");
});
