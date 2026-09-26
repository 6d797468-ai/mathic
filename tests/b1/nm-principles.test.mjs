import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LADDER } from "../../src/b1/levels.mjs";
import { nmFacts, nmStage, NM_DESIGN_BUDGET } from "../../src/b1/design.mjs";
import { isWon, finalScore } from "../../src/b1/engine.mjs";
import { replay } from "../../src/b1/replay.mjs";

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const PRINCIPLES = "docs/design/MATHIC-BRAND-GAMEPLAY-PRINCIPLES.md";
const INVARIANT = { finals: 1, legal: 2, routes: 1 };

test("NM — document transversal présent et complet (identité + 10 règles + gouvernance)", () => {
  const txt = read(PRINCIPLES);
  for (const marker of [
    "MATHIC-BRAND-GAMEPLAY-PRINCIPLES",
    "Mathic",
    "Les nombres sont magiques.",
    "Number Magic",
    "MATHIC-PRINCIPLE-001",
    "5. Gameplay interpretation",
    "6. Level Design implications",
    "7. UX implications",
    "8. Momo implications",
    "9. Score implications",
    "10. Anti-patterns",
    "11. Examples",
    "12. Certification criteria",
    ...Array.from({ length: 10 }, (_, i) => `MATHIC-${i < 9 ? `00${i + 1}` : "010"}`),
  ]) {
    assert.ok(txt.includes(marker), `doc contient le marqueur « ${marker} »`);
  }
  for (const axis of ["PRESERVE", "ADD", "CHANGE", "DO NOT DO", "EVIDENCE", "INTEGRATION"]) {
    assert.ok(txt.includes(`**${axis}**`), `gouvernance : axe ${axis} présent`);
  }
  assert.ok(txt.includes("Annexe B"), "inventaire NM présent");
});

test("NM — promesse vérifiable : le noyau reste mathématiquement pur", () => {
  for (const rel of ["src/b1/engine.mjs", "src/b1/solver.mjs", "src/b1/replay.mjs"]) {
    const src = read(rel).toLowerCase();
    assert.ok(!src.includes("magique"), `${rel} : aucune référence au concept de magie`);
    assert.ok(!src.includes("nmf"), `${rel} : aucun couplage à la métrique interne`);
  }
});

test("NM — intégration produit : la tagline est dans l'écran de lancement réel", () => {
  const html = read("src/b1/web/index.html");
  assert.ok(html.includes("Les nombres sont magiques."), "tagline dans index.html");
  assert.ok(/<p class="tagline">/.test(html), "tagline dans un élément dédié classe tagline");
});

test("NM — invariants d'inventaire sur les 41 niveaux (Solver+Engine+Replay)", () => {
  const stages = {};
  for (const lvl of LADDER) {
    const f = nmFacts(lvl, { budget: NM_DESIGN_BUDGET });
    assert.equal(f.solvable, true, `${f.id} solvable`);
    assert.ok(f.finals >= INVARIANT.finals, `${f.id} : au moins un final (` + f.finals + `)`);
    assert.ok(f.legalFirstActs >= INVARIANT.legal, `${f.id} : au moins 2 premiers coups légaux`);
    assert.ok(f.minimalRoutes >= INVARIANT.routes, `${f.id} : au moins une route minimale`);
    assert.equal(nmStage(f) !== "unsolvable", true, `${f.id} : étage valide`);
    stages[nmStage(f)] = (stages[nmStage(f)] ?? 0) + 1;
    // Solver = Engine = Replay : la première route minimale rejouée vainc
    if (f.samplePaths.length) {
      const r = replay(lvl, f.samplePaths[0]);
      assert.equal(r.final.won, true, `${f.id} : replay converge vers la victoire`);
    }
  }
  assert.deepEqual(stages, { choice: 14, consequence: 19, single: 7, direct: 1 }, "distribution des profils NM figée (Annexe B, enrichie M9)");
});

test("NM — faits enregistrés : flagships certifiés (Annexe B)", () => {
  const run = (id) => nmFacts(LADDER.find((l) => l.id === id), { budget: NM_DESIGN_BUDGET });
  const n1 = run("N1");
  assert.equal(n1.finals, 1);
  assert.equal(n1.minimalRoutes, 2);
  assert.equal(n1.directWin, true);
  assert.equal(nmStage(n1), "choice");
  const n17 = run("N17");
  assert.equal(n17.finals, 11, "N17 : 11 finals — croise la certification CG (finals 11)");
  assert.equal(n17.minimalRoutes, 4, "N17 : routes 4 — croise la certification CG (routes 4)");
  const n15 = run("N15");
  assert.equal(n15.finals, 19);
  assert.equal(n15.minimalRoutes, 1);
  assert.equal(n15.minimalRuns, 1);
  assert.equal(nmStage(n15), "direct", "N15 : le niveau à « une seule route » assumé (précision)");
  const n20 = run("N20");
  assert.equal(n20.minMoves, 3);
  assert.equal(n20.minimalRuns, 4);
  assert.equal(n20.consequences.chainPaths, 4);
  assert.equal(n20.consequences.bestScore, 20);
  const n22 = run("N22");
  assert.equal(n22.minimalRoutes, 3);
  assert.equal(n22.consequences.distinctScores, 2);
  assert.equal(nmStage(n22), "consequence", "N22 : deux chemins non équivalents (chaînes ×2)");
  const n27 = run("N27");
  assert.equal(n27.consequences.distinctScores, 2);
  assert.equal(n27.consequences.chainPaths, 8);
  assert.equal(n27.consequences.bestScore, 66);
  const n36 = run("N36");
  assert.equal(n36.minMoves, 2, "N36 : le Maître se gagne en 2 coups (certifié)");
  assert.equal(n36.consequences.bestScore, 49);
  assert.equal(nmStage(n36), "single");
});

test("NM — choice vs consequence : des routes mathématiquement correctes et des états différents", () => {
  const lvl = LADDER.find((l) => l.id === "N22");
  const f = nmFacts(lvl);
  assert.equal(f.minimalRoutes >= 2, true);
  assert.equal(f.consequences.distinctScores >= 2, true);
  const paths = f.samplePaths.slice(0, f.samplePaths.length);
  assert.ok(paths.length >= 2, "deux routes minimales disponibles");
  const byScore = new Map();
  for (const p of paths) {
    const sc = finalScore(replay(lvl, p).final);
    if (!byScore.has(sc)) byScore.set(sc, p);
  }
  assert.ok(byScore.size >= 2, `au moins deux scores distincts dans l'échantillon (${[...byScore.keys()]})`);
  const [pa, pb] = [...byScore.values()];
  const states = [pa, pb].map((p) => replay(lvl, p).final);
  assert.equal(states.every((s) => isWon(s)), true, "les deux routes gagnent (Solver=Replay)");
  const scores = states.map((s) => finalScore(s));
  assert.ok(scores[0] !== scores[1], `scores distincts ${scores[0]} ≠ ${scores[1]} : la décision change la conséquence`);
});