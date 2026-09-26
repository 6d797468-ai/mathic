import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { LADDER, WORLDS, levelsInWorld } from "../../src/b1/levels.mjs";
import { solve } from "../../src/b1/solver.mjs";
import { blankSave, markCompleted, loadSave } from "../../src/b1/save.mjs";
import {
  starsOf,
  chapterThreshold,
  createSaga,
} from "../../src/grimoire/saga.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAGA_SRC = join(HERE, "../../src/grimoire/saga.mjs");

// Mémoïsation locale des enveloppes réelles : le solveur tourne UNE fois par
// niveau pour toute la suite (~0,5 s au total, mesuré). C'est le solveur RÉEL,
// aucune copie de ses résultats dans les sources du test.
const ENV = new Map();
const envOf = (id) => {
  if (!ENV.has(id)) ENV.set(id, solve(LADDER.find((l) => l.id === id)));
  return ENV.get(id);
};

// Fabricant d'enregistrements completed : victoire avec movesLeft donné.
const win = (maxMoves, movesLeft) => ({ wins: 1, bestScore: 100, bestMovesLeft: movesLeft });

// ===========================================================================
// SG-01 · Seuils de chapitre DÉRIVÉS (contrat §4) — jamais inventés par niveau
// ===========================================================================

test("SG-01 : seuil dérivé — min(6, 2 × nbNiveaux), sur des cas réels et limites", () => {
  assert.equal(chapterThreshold(1), 2);
  assert.equal(chapterThreshold(2), 4);
  assert.equal(chapterThreshold(3), 6);
  assert.equal(chapterThreshold(4), 6); // cap atteint
  assert.equal(chapterThreshold(10), 6);
  assert.equal(chapterThreshold(0), 0);
  assert.equal(chapterThreshold(-1), 0);
  // Les chapitres réels W1..W6 : tailles issues de levelsInWorld.
  for (const w of WORLDS) {
    const n = levelsInWorld(w.id).length;
    assert.equal(chapterThreshold(n), Math.min(6, 2 * n));
  }
});

// ===========================================================================
// SG-02..05 · Étoiles N1..N3 (geste unique) + N4 (gradient) — LE défaut v1.0
// ===========================================================================

test("SG-02 : N1 (maxMoves=1) — une victoire accorde ⭐3 directement (congruence, v1.1)", () => {
  const L = LADDER.find((l) => l.id === "N1");
  assert.equal(L.maxMoves, 1);
  const env = envOf("N1");
  assert.equal(env.minMoves, 1); // certifié solveur réel
  // Victoire = le seul coup consommé : used=1=minMoves → les trois étoiles.
  const s = starsOf(win(1, 0), L, env);
  assert.deepEqual([s.s1, s.s2, s.s3], [true, true, true]);
  assert.equal(s.count, 3);
  assert.equal(s.congruent, true);
  // La v1.0 (⭐2 = bestMovesLeft ≥ 1) donnait ici ⭐3 sans ⭐2 : hors d'ordre.
});

test("SG-03 : N1 sans victoire — zéro étoile, aucun état intermédiaire inventé", () => {
  const L = LADDER.find((l) => l.id === "N1");
  const s = starsOf(null, L, envOf("N1"));
  assert.deepEqual([s.s1, s.s2, s.s3], [false, false, false]);
  assert.equal(s.count, 0);
});

test("SG-04 : N4 (maxMoves=3, minMoves=2) — le gradient d'étoiles existe", () => {
  const L = LADDER.find((l) => l.id === "N4");
  const env = envOf("N4");
  assert.equal(env.minMoves, 2);
  // victoire au 3e coup (movesLeft=0) → used=3 : ⭐1 seul
  const loose = starsOf(win(3, 0), L, env);
  assert.deepEqual([loose.s1, loose.s2, loose.s3], [true, false, false]);
  // écart maxMoves−minMoves = 1 sur N4 : toute victoire avec un coup d'avance
  // (used=2) est DÉJÀ à l'optimum → ⭐3 d'un coup. Propriété déduite : la bande
  // ⭐2 stricte sans ⭐3 exige un écart ≥ 2 (réel sur N6, N11, N12, N30...).
  const perfect = starsOf(win(3, 1), L, env);
  assert.equal(perfect.used, env.minMoves);
  assert.deepEqual([perfect.s1, perfect.s2, perfect.s3], [true, true, true]);
});

test("SG-04b : N11 (maxMoves=3, minMoves=1) — bande médiane ⭐2 sans ⭐3 (écart ≥ 2)", () => {
  const L = LADDER.find((l) => l.id === "N11");
  const env = envOf("N11");
  assert.equal(env.minMoves, 1);
  // used=2 : un coup d'avance sur le budget (⭐2) mais pas l'optimum (pas ⭐3)
  const mid = starsOf(win(3, 1), L, env);
  assert.deepEqual([mid.s1, mid.s2, mid.s3], [true, true, false]);
  // used=3 : victoire au budget exact, sans avance ni optimum
  const slow = starsOf(win(3, 0), L, env);
  assert.deepEqual([slow.s1, slow.s2, slow.s3], [true, false, false]);
  // used=1 : optimum certifié → ⭐3
  const fast = starsOf(win(3, 2), L, env);
  assert.deepEqual([fast.s1, fast.s2, fast.s3], [true, true, true]);
});

test("SG-05 : N6 (maxMoves=2, minMoves=1) — victoire lente sans ⭐2, optimum ⭐3", () => {
  const L = LADDER.find((l) => l.id === "N6");
  const env = envOf("N6");
  assert.equal(env.minMoves, 1);
  const slow = starsOf(win(2, 0), L, env); // used=2 : ni avance ni optimum
  assert.deepEqual([slow.s1, slow.s2, slow.s3], [true, false, false]);
  const fast = starsOf(win(2, 1), L, env); // used=1=minMoves
  assert.deepEqual([fast.s1, fast.s2, fast.s3], [true, true, true]);
  assert.equal(fast.congruent, false); // gradient RÉEL ici (pas la clause)
});

// ===========================================================================
// SG-06 · P-ORDRE — ⭐3 ⇒ ⭐2 ⇒ ⭐1 sur l'INTÉGRALITÉ du LADDER (N1..N41)
// ===========================================================================

test("SG-06 : P-ordre exhaustif — aucun état de save ne produit ⭐3 sans ⭐2 (41 niveaux)", () => {
  assert.equal(LADDER.length, 41);
  let checked = 0;
  for (const L of LADDER) {
    const env = envOf(L.id);
    assert.equal(env.solvable, true, `${L.id} doit être solvable (pré-requis du LADDER)`);
    // balayage de TOUS les états de victoire possibles pour ce niveau
    for (let left = 0; left <= L.maxMoves; left++) {
      const s = starsOf(win(L.maxMoves, left), L, env);
      assert.equal(s.count, (s.s1 ? 1 : 0) + (s.s2 ? 1 : 0) + (s.s3 ? 1 : 0));
      if (s.s3) assert.equal(s.s2, true, `${L.id} movesLeft=${left} : ⭐3 sans ⭐2`);
      if (s.s2) assert.equal(s.s1, true, `${L.id} movesLeft=${left} : ⭐2 sans ⭐1`);
      checked++;
    }
    // états dégénérés : enregistrements corrompus — toujours dans l'ordre
    for (const rec of [null, {}, { wins: 1 }, { wins: 1, bestMovesLeft: null }, { wins: 1, bestMovesLeft: 99 }, { wins: 1, bestMovesLeft: -7 }]) {
      const s = starsOf(rec, L, env);
      if (s.s3) assert.equal(s.s2, true, `${L.id} rec=${JSON.stringify(rec)} : ⭐3 sans ⭐2`);
      if (s.s2) assert.equal(s.s1, true, `${L.id} rec=${JSON.stringify(rec)} : ⭐2 sans ⭐1`);
      checked++;
    }
    // enveloppe absente : ⭐3 inaccordable, ⭐1/⭐2 restent calculables
    const degraded = starsOf(win(L.maxMoves, 1), L, null);
    assert.equal(degraded.s3, false, `${L.id} : ⭐3 accordée sans enveloppe (interdit I-5)`);
    assert.equal(degraded.s1, true);
    checked++;
  }
  assert.ok(checked >= 41 * 9, `couverture insuffisante : ${checked} états`);
});

// ===========================================================================
// SG-07 · P-CONGRUENCE — minMoves === maxMoves ⇒ une victoire = trois étoiles
// ===========================================================================

test("SG-07 : P-congruence exhaustive — les 17 niveaux CONGRUENTS (minMoves === maxMoves), dont N1..N3 à geste unique", () => {
  // Terminologie (audit M18 §7) : la propriété est minMoves === maxMoves.
  // Ce sont 17 niveaux congruents ; seuls ceux à maxMoves=1 (N1..N3) sont
  // des niveaux à geste unique — d'autres (N39, N41...) sont congruents
  // avec PLUSIEURS gestes, et la clause de congruence s'applique à eux aussi.
  const congruentLevels = LADDER.filter((L) => envOf(L.id).minMoves === L.maxMoves);
  assert.ok(congruentLevels.length >= 17, `${congruentLevels.length} niveaux congruents (attendu ≥ 17, N1..N3 inclus)`);
  for (const id of ["N1", "N2", "N3"]) {
    assert.ok(congruentLevels.some((L) => L.id === id), `${id} doit être congruent`);
  }
  for (const L of congruentLevels) {
    const s = starsOf(win(L.maxMoves, 0), L, envOf(L.id));
    assert.deepEqual([s.s1, s.s2, s.s3], [true, true, true], `${L.id} : victoire ⇒ 3 étoiles`);
    assert.equal(s.congruent, true);
  }
});

test("SG-07c : congruent + save corrompu → ⭐1 seule — la congruence ne contourne jamais usedOk", () => {
  // Audit M18 §5 : sur un niveau congruent, la clause ne doit pas accorder
  // ⭐2 à partir d'un enregistrement incohérent (used=0 ou hors bornes).
  const N1 = LADDER.find((l) => l.id === "N1");
  const env = envOf("N1");
  assert.equal(env.minMoves === N1.maxMoves, true); // pré-requis : congruent
  const corrupt = starsOf({ wins: 1, bestScore: 5, bestMovesLeft: 1 }, N1, env); // used=0 : impossible
  assert.deepEqual([corrupt.s1, corrupt.s2, corrupt.s3], [true, false, false]);
  assert.equal(corrupt.used, null);
  // même verdict sur un congruent à plusieurs gestes (N41 : minMoves=maxMoves=3)
  const N41 = LADDER.find((l) => l.id === "N41");
  const env41 = envOf("N41");
  assert.equal(env41.minMoves === N41.maxMoves, true);
  const corrupt41 = starsOf({ wins: 1, bestMovesLeft: 77 }, N41, env41);
  assert.deepEqual([corrupt41.s1, corrupt41.s2, corrupt41.s3], [true, false, false]);
  // et la contre-épreuve : une victoire valide sur N41 garde les trois étoiles
  const valid41 = starsOf(win(3, 0), N41, env41);
  assert.deepEqual([valid41.s1, valid41.s2, valid41.s3], [true, true, true]);
});

test("SG-07b : non-congruents — la clause ne fuit pas sur les niveaux à gradient", () => {
  const gradientLevels = LADDER.filter((L) => envOf(L.id).minMoves < L.maxMoves);
  assert.ok(gradientLevels.length >= 24);
  for (const L of gradientLevels) {
    const s = starsOf(win(L.maxMoves, 0), L, envOf(L.id)); // victoire la plus lente
    assert.equal(s.congruent, false, `${L.id} : congruence indue`);
    if (L.maxMoves - 0 > envOf(L.id).minMoves) {
      assert.equal(s.s3, false, `${L.id} : ⭐3 sur victoire non optimale`);
    }
  }
});

// ===========================================================================
// SG-08..10 · Pureté, monotonie, dégradation (I-3, I-4, I-5)
// ===========================================================================

test("SG-08 : pureté — même entrée → mêmes étoiles (F(rec,L,env) déterministe)", () => {
  const L = LADDER.find((l) => l.id === "N5");
  const env = envOf("N5");
  const a = starsOf(win(3, 1), L, env);
  const b = starsOf(win(3, 1), L, env);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("SG-09 : monotonie — bestMovesLeft ne décroît jamais (garantie markCompleted), l'étoile non plus", () => {
  let st = blankSave();
  // première victoire lente sur N5 (movesLeft=0 → used=3, ⭐1)
  st = markCompleted(st, "N5", { score: 30, movesLeft: 0 });
  const env = envOf("N5");
  const first = starsOf(st.completed.N5, LADDER.find((l) => l.id === "N5"), env);
  assert.deepEqual([first.s1, first.s2, first.s3], [true, false, false]);
  // re-victoire meilleure (movesLeft=1 → used=2 = minMoves → ⭐3)
  st = markCompleted(st, "N5", { score: 40, movesLeft: 1 });
  assert.equal(st.completed.N5.bestMovesLeft, 1); // conservé, jamais régressé
  const second = starsOf(st.completed.N5, LADDER.find((l) => l.id === "N5"), env);
  assert.deepEqual([second.s1, second.s2, second.s3], [true, true, true]);
  // re-victoire PIRE (movesLeft=0) : l'enregistrement garde le meilleur profil
  st = markCompleted(st, "N5", { score: 20, movesLeft: 0 });
  const third = starsOf(st.completed.N5, LADDER.find((l) => l.id === "N5"), env);
  assert.deepEqual([third.s1, third.s2, third.s3], [true, true, true], "une étoile acquise ne se perd pas");
});

test("SG-10 : dégradation propre — save corrompu / enveloppe absente / niveau inconnu", () => {
  const L = LADDER.find((l) => l.id === "N7");
  // save corrompu : enregistrements aberrants → étoiles dégradées, pas de crash
  assert.equal(starsOf({ wins: "oui" }, L, envOf("N7")).count, 0);
  assert.equal(starsOf({ wins: 1, bestMovesLeft: "trois" }, L, envOf("N7")).s3, false);
  assert.equal(starsOf({ wins: 1, bestMovesLeft: 99 }, L, envOf("N7")).s3, false);
  assert.equal(starsOf({ wins: -4, bestMovesLeft: 2 }, L, envOf("N7")).s1, false);
  // objet niveau malformé (sans maxMoves) : ⭐1 ne dépend QUE du save
  // (contrat §3) — elle tient ; ⭐2/⭐3 (dépendantes de l'enveloppe) non.
  const malformed = starsOf(win(1, 0), { id: "X" }, envOf("N7"));
  assert.equal(malformed.s1, true);
  assert.deepEqual([malformed.s2, malformed.s3], [false, false]);
  // enveloppe insolvable (ne devrait pas exister dans le LADDER) : ⭐3 seule
  // inaccordable — ⭐1/⭐2 restent calculables depuis le save (contrat §3)
  const insoluble = { solvable: false, minMoves: null };
  const s = starsOf(win(3, 1), L, insoluble); // used=2 < maxMoves=3 → ⭐2 tient
  assert.deepEqual([s.s1, s.s2, s.s3], [true, true, false]);
  assert.equal(s.envelopeMissing, true);
  assert.equal(s.minMoves, null);
  // createSaga : dépendance manquante → fail-fast par contrat
  assert.throws(() => createSaga({}), TypeError);
  assert.throws(() => createSaga({ save: 42 }), TypeError);
});

// ===========================================================================
// SG-11 · Scan de pureté du module (I-4) — style GR-14/SYM-12
// ===========================================================================

test("SG-11 : module pur — aucun aléa, horloge, DOM, réseau, storage, écriture", () => {
  const src = readFileSync(SAGA_SRC, "utf8");
  for (const bad of ["Math.random", "Date.now", "document", "window", "localStorage", "navigator", "fetch(", "XMLHttpRequest", "WebSocket", "setItem", "import("]) {
    assert.ok(!src.includes(bad), `interdit présent dans saga.mjs : ${bad}`);
  }
});

// ===========================================================================
// SG-12..15 · Vue Saga (chapitres, seuils affichés, lab hors hiérarchie, I-2)
// ===========================================================================

const memoryStorage = () => {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => void m.set(k, v),
    _raw: m,
  };
};

// Solveur réel memoïsé PARTAGÉ entre les instances createSaga des tests de vue :
// une seule exécution par niveau pour toute la suite (le solveur est réel,
// seuls ses résultats sont mémoïsés — même contrat que la memoïsation interne).
const sharedSolve = (() => {
  const m = new Map();
  return (level) => {
    if (!m.has(level.id)) m.set(level.id, solve(level));
    return m.get(level.id);
  };
})();

test("SG-12 : vue Saga sur save vierge — chapitres dérivés, tout verrouillé sauf N1, 0 étoile", () => {
  const storage = memoryStorage();
  const saga = createSaga({ save: () => loadSave(storage), solve: sharedSolve });
  const v = saga.view();
  assert.equal(v.chapters.length, WORLDS.length);
  assert.deepEqual(v.totals, { starsEarned: 0, starsPossible: 41 * 3, completed: 0, levelsTotal: 41 });
  const w1 = v.chapters.find((c) => c.id === "W1");
  assert.equal(w1.levels[0].id, "N1");
  assert.equal(w1.levels[0].state, "OPEN");
  assert.ok(w1.levels.slice(1).every((r) => r.state === "LOCKED"));
  assert.equal(w1.threshold, chapterThreshold(w1.levels.length));
  assert.equal(w1.thresholdMet, false);
  assert.equal(v.lab.stars, null); // hors hiérarchie
  assert.equal(v.knowledge, null); // knowledge non injectée
});

test("SG-13 : vue Saga après victoires réelles (markCompleted) — étoiles et états dérivés", () => {
  const storage = memoryStorage();
  let st = loadSave(storage);
  // N1 : geste unique → ⭐3 ; N2 débloqué puis gagné au premier coup offert (⭐3 aussi)
  st = markCompleted(st, "N1", { score: 20, movesLeft: 0 });
  st = markCompleted(st, "N2", { score: 30, movesLeft: 0 });
  st = markCompleted(st, "N4", { score: 40, movesLeft: 0 }); // victoire lente → ⭐1
  storage.set("mathic.save.v1", JSON.stringify(st));
  const saga = createSaga({ save: () => loadSave(storage), solve: sharedSolve });
  const v = saga.view();
  const row = (id) => v.chapters.flatMap((c) => c.levels).find((r) => r.id === id);
  assert.equal(row("N1").stars, 3);
  assert.equal(row("N1").state, "MASTERED");
  assert.equal(row("N2").stars, 3);
  assert.equal(row("N3").state, "OPEN"); // débloqué par la fenêtre M8 (marque N1)
  assert.equal(row("N3").stars, 0);
  assert.equal(row("N4").stars, 1); // gradient réel : victoire au budget exact
  assert.equal(row("N4").used, 3);
  assert.equal(row("N4").minMoves, 2);
  assert.equal(v.totals.starsEarned, 7);
  // seuil de chapitre AFFICHÉ, jamais verrou : W1 a ses étoiles, W2 reste lu
  // depuis la progression (état de N7 = LOCKED, dérivé de save.unlocked seul)
  const w1 = v.chapters.find((c) => c.id === "W1");
  assert.ok(w1.thresholdMet);
  assert.equal(v.chapters.find((c) => c.id === "W2").levels.some((r) => r.state === "LOCKED"), true);
});

test("SG-14 : knowledge injecté — lecture seule, fragments comptés, format aberrant dégradé", () => {
  const storage = memoryStorage();
  const saga = createSaga({
    save: () => loadSave(storage),
    knowledge: () => ({ unlockedFragments: ["F1", "F2"] }),
    solve: sharedSolve,
  });
  const v = saga.view();
  assert.deepEqual(v.knowledge, { fragments: 2 });
  // état knowledge non conforme : compté 0, jamais de crash (I-5)
  const saga2 = createSaga({ save: () => loadSave(storage), knowledge: () => null, solve: sharedSolve });
  assert.deepEqual(saga2.view().knowledge, { fragments: 0 });
  const saga3 = createSaga({ save: () => loadSave(storage), knowledge: () => ({ unlockedFragments: "pas une liste" }), solve: sharedSolve });
  assert.deepEqual(saga3.view().knowledge, { fragments: 0 });
});

test("SG-15 : I-2 — la Saga n'écrit RIEN (storage inchangé avant/après views répétées)", () => {
  const storage = memoryStorage();
  storage.set("mathic.save.v1", JSON.stringify(markCompleted(loadSave(storage), "N1", { score: 20, movesLeft: 0 })));
  const before = new Map(storage._raw);
  const saga = createSaga({ save: () => loadSave(storage), knowledge: () => ({ unlockedFragments: [] }), solve: sharedSolve });
  saga.view();
  saga.view();
  saga.starsFor("N1");
  saga.starsFor("N2");
  assert.equal(storage._raw.size, before.size);
  for (const [k, val] of before) assert.equal(storage._raw.get(k), val);
});

// ===========================================================================
// SG-16 · Intégration solveur RÉEL via l'usine — memoïsation et cohérence
// ===========================================================================

test("SG-16 : createSaga avec solveur réel — enveloppes memoïsées, cohérentes avec solve()", () => {
  const calls = [];
  const countingSolve = (level) => {
    calls.push(level.id);
    return solve(level);
  };
  const storage = memoryStorage();
  const saga = createSaga({ save: () => loadSave(storage), solve: countingSolve });
  const e1 = saga.envelope("N1");
  const e2 = saga.envelope("N1"); // second appel : memoïsé
  assert.equal(e1, e2);
  assert.deepEqual(calls, ["N1"]); // UNE seule exécution du solveur
  const s = saga.starsFor("N1");
  assert.equal(s.minMoves, 1);
  assert.equal(calls.filter((x) => x === "N1").length, 1);
});

// ===========================================================================
// SG-17 · Invariant de cache : level.id UNIQUE dans LADDER (audit M18 §11)
// — la memoïsation des enveloppes et levelById indexent par id.
// ===========================================================================

test("SG-17 : unicité des level.id — pré-requis absolu du cache solveur et de la vue", () => {
  const ids = LADDER.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, "doublon d'id dans LADDER : la memoïsation serait fausse");
  const wids = WORLDS.map((w) => w.id);
  assert.equal(new Set(wids).size, wids.length, "doublon d'id dans WORLDS");
  // cohérence : chaque niveau référence un monde existant
  for (const L of LADDER) assert.ok(wids.includes(L.world), `${L.id} : monde inconnu ${L.world}`);
});
