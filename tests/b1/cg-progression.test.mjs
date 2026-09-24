import { test } from "node:test";
import assert from "node:assert/strict";
import { WORLDS, worldOf, levelsInWorld, nextLevel, prevLevel, firstLevelOf, lastLevelOf } from "../../src/b1/levels.mjs";
import { LADDER } from "../../src/b1/levels.mjs";
import {
  blankSave,
  loadSave,
  saveNow,
  isUnlocked,
  setCurrent,
  unlockTo,
  markCompleted,
  replayable,
  hasWon,
  bestScore,
  completedCount,
  worldProgress,
  normalized,
  SAVE_KEY,
  setStorage,
} from "../../src/b1/save.mjs";

const memory = () => {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => void m.set(k, v), size: () => m.size };
};

test("CG — mondes : chaque niveau rattaché, ordre mondial progressif, chaînage inter-mondes", () => {
  assert.equal(WORLDS.length, 6);
  assert.deepEqual(
    WORLDS.map((w) => w.id),
    ["W1", "W2", "W3", "W4", "W5", "W6"]
  );
  const worlds = new Map();
  for (const l of LADDER) {
    const w = worldOf(l.id);
    assert.ok(w, `${l.id} a un monde`);
    worlds.set(w, (worlds.get(w) ?? 0) + 1);
  }
  for (const [id, count] of worlds) assert.ok(count >= 3, `${id} : au moins 3 niveaux (en a ${count})`);
  // chaînage linéaire inter-mondes : nextLevel traverse les frontières
  assert.equal(nextLevel("N3").id, "N4");
  assert.equal(nextLevel("N18").id, "N19");
  assert.equal(nextLevel("N21").id, "N22");
  assert.equal(nextLevel("N30").id, "N31");
  assert.equal(nextLevel("N36"), null, "fin du LADDER");
  assert.equal(prevLevel("N1"), null);
  assert.equal(prevLevel("N4").id, "N3");
  assert.equal(firstLevelOf("W1").id, "N1");
  assert.equal(lastLevelOf("W1").id, "N18");
  assert.deepEqual(levelsInWorld("W1").map((l) => l.id), ["N1", "N2", "N3", "N17", "N18"]);
});

test("CG — save : sauvegarde vierge, écriture, relecture, corruption tolérée", () => {
  const st = memory();
  setStorage(st);
  const fresh = loadSave(st);
  assert.deepEqual(fresh.unlocked, ["N1"]);
  assert.equal(fresh.current, "N1");
  assert.equal(hasWon(fresh, "N4"), false);
  saveNow({ ...fresh, current: "N7" }, st);
  assert.equal(loadSave(st).current, "N7", "relu après écriture");
  st.set(SAVE_KEY, "{pas du json");
  assert.deepEqual(loadSave(st), blankSave(), "sauvegarde corrompue → vierge, jamais de crash");
  st.set(SAVE_KEY, JSON.stringify({ version: 2, unlocked: ["N5"] }));
  assert.deepEqual(loadSave(st), blankSave(), "version inconnue → vierge");
});

test("CG — progression : terminer débloque le suivant (markCompleted), pas de saut, score conservé", () => {
  const st = memory();
  setStorage(st);
  let s = loadSave(st);
  assert.equal(isUnlocked(s, "N2"), false, "N2 fermé au départ");
  s = markCompleted(s, "N1", { score: 10, movesLeft: 1 });
  s = saveNow(s, st);
  assert.equal(isUnlocked(s, "N2"), true, "N1 réussie → N2 ouverte");
  assert.equal(isUnlocked(s, "N5"), false, "pas de saut : N5 reste fermée");
  assert.equal(hasWon(s, "N1"), true);
  assert.equal(bestScore(s, "N1"), 10);
  assert.equal(completedCount(s), 1);
  // meilleur score conservé (ne régresse pas)
  s = markCompleted(s, "N1", { score: 6, movesLeft: 1 });
  assert.equal(bestScore(s, "N1"), 10, "le meilleur score tient");
  s = markCompleted(s, "N1", { score: 14, movesLeft: 1 });
  assert.equal(bestScore(s, "N1"), 14, "amélioration retenue");
  // rejouable : vaincu OU débloqué
  assert.equal(replayable(s, "N1"), true);
  assert.equal(replayable(s, "N2"), true);
  assert.equal(replayable(s, "N9"), false, "N9 ni vaincu ni débloqué");
  assert.equal(replayable(s, "XX"), false, "id inconnu refusé");
  s = markCompleted(s, "N2", { score: 15, movesLeft: 2 });
  assert.equal(completedCount(s), 2);
});

test("CG — unlockTo / setCurrent / normalized : garde-fous", () => {
  const st = memory();
  setStorage(st);
  let s = blankSave();
  s = unlockTo(s, "N5");
  assert.deepEqual(s.unlocked, ["N1", "N2", "N3", "N4", "N5"]);
  s = unlockTo(s, "N3"); // ne régresse jamais
  assert.deepEqual(s.unlocked, ["N1", "N2", "N3", "N4", "N5"]);
  s = setCurrent(s, "N12");
  assert.equal(s.current, "N12");
  const bad = { version: 1, unlocked: ["BOGUS"], completed: { N1: { wins: 1, bestScore: 12 } }, current: "NOPE" };
  st.set(SAVE_KEY, JSON.stringify(bad));
  const nrm = normalized(bad, st);
  assert.equal(nrm.current, "N1", "current invalide → N1");
  assert.deepEqual(nrm.unlocked, ["N1"], "ids inconnus filtrés, N1 toujours présent");
  assert.equal(hasWon(nrm, "N1"), true, "complétion valide conservée");
});

test("CG — mondes : worldProgress compte les débloqués et réussis", () => {
  const st = memory();
  setStorage(st);
  let s = loadSave(st);
  assert.deepEqual(worldProgress(s, "W1"), { total: 5, unlocked: 1, done: 0 });
  s = markCompleted(s, "N1", { score: 10, movesLeft: 1 });
  s = markCompleted(s, "N2", { score: 10, movesLeft: 1 });
  const p = worldProgress(s, "W1");
  assert.equal(p.done, 2);
  assert.ok(p.unlocked >= 3, `W1 : ${p.unlocked} ouverts au moins ${2} + N3`);
});