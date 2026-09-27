/**
 * MATHIC V6 — M28 · QUARANTAINE DU LEGACY SOLVER
 *
 * Ces tests n'AMELIORENT pas `certify()`. Ils FIGENT son etat connu afin
 * qu'il ne puisse pas etre promu, ni meme rehabilite par accident, en
 * oracle du gate V5-SOLVABILITY.
 *
 * Regle de lecture : un resultat negatif de `certify()` ne prouve rien.
 * Voir l'en-tete de `src/v5/rules/solver.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { certify } from "../../src/v5/rules/solver.mjs";
import { createSession, isSolved, getMoves, apply } from "../../src/v5/rules/engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLVER_SRC = join(HERE, "..", "..", "src", "v5", "rules", "solver.mjs");

/** Reellement resolvable en 2 coups : 3 * 4 = 12. */
const SOLVABLE_2 = {
  grid: [[-1, -1]],
  rows: [{ target: 12, ops: ["*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }],
  reserve: { 3: 1, 4: 1 },
};

/** Reellement insoluble : 3 * 4 = 13. */
const UNSOLVABLE_1 = {
  grid: [[-1, -1]],
  rows: [{ target: 13, ops: ["*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }],
  reserve: { 3: 1, 4: 1 },
};

/** Temoin de verite independant : la solution existe-t-elle reellement ? */
function solvableByExhaustiveBFS(spec, maxDepth = 8) {
  const seen = new Set();
  const start = createSession(spec);
  if (isSolved(start)) return true;
  const queue = [{ s: start, d: 0 }];
  while (queue.length) {
    const { s, d } = queue.shift();
    if (d >= maxDepth) continue;
    for (const mv of getMoves(s)) {
      const n = apply(s, mv);
      if (!n) continue;
      const key = JSON.stringify([n.grid, n.reserve]);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isSolved(n)) return true;
      queue.push({ s: n, d: d + 1 });
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// M28-SOLVER-001 · Faux UNSOLVABLE avec budgeted=false
// C'est le defaut central. Les deux moities sont verifiees separement.
// ---------------------------------------------------------------------------
test("M28-SOLVER-001a · le puzzle temoin EST reellement resolvable (temoin de verite)", () => {
  assert.equal(solvableByExhaustiveBFS(SOLVABLE_2), true, "fixture : la solution existe");
  assert.equal(solvableByExhaustiveBFS(UNSOLVABLE_1), false, "fixture : l'autre n'existe pas");
});

test("M28-SOLVER-001b · FALSE NEGATIVE : budget=1 sur un puzzle resolvable -> solvable=false", () => {
  const r = certify(SOLVABLE_2, { budget: 1, maxDepth: 8 });
  assert.equal(r.solvable, false, "le defaut doit etre toujours reproductible");
  assert.equal(solvableByExhaustiveBFS(SOLVABLE_2), true, "…et la solution existe pourtant");
});

test("M28-SOLVER-001c · FALSE EXHAUSTIVENESS : budgeted reste false malgre la troncature", () => {
  // C'est la moitie la plus grave : l'absence de solutions ETABLIT
  // l'absence de solutions, alors que la recherche s'est arretee sur une
  // borne. Un `budgeted:false` ne signifie donc PAS « espace explore ».
  const r = certify(SOLVABLE_2, { budget: 1, maxDepth: 8 });
  assert.equal(r.budgeted, false, "le drapeau d'exhaustivite ment");
  const ok = certify(SOLVABLE_2, { budget: 20000, maxDepth: 8 });
  assert.equal(ok.solvable, true, "avec un budget suffisant, la solution est vue");
  assert.equal(ok.budgeted, false, "…et le drapeau reste faux : il ne porte aucune information");
});

test("M28-SOLVER-001d · le drapeau `budgeted` est structurellement mort", () => {
  // Sur 60 budgets croissants, aucun ne peut rendre le drapeau vrai.
  let everTrue = false;
  for (let b = 1; b <= 60; b++) {
    if (certify(SOLVABLE_2, { budget: b, maxDepth: 8 }).budgeted) everTrue = true;
  }
  assert.equal(everTrue, false, "cause racine : `nodes > budget` est inatteignable dans la boucle");
});

test("M28-SOLVER-001e · la meme troncature existe par la PROFONDEUR", () => {
  const r = certify(SOLVABLE_2, { budget: 20000, maxDepth: 0 });
  assert.equal(r.solvable, false, "2 coups suffisent, maxDepth=0 les interdit");
  assert.equal(r.budgeted, false, "et la profondeur ne pose pas le drapeau non plus");
  // Le `break` abandonne la file entiere : rien n'est epuise.
  const r1 = certify(SOLVABLE_2, { budget: 20000, maxDepth: 1 });
  assert.equal(r1.solvable, true, "1 coup de profondeur, et pourtant la solution est en 2");
});

// ---------------------------------------------------------------------------
// M28-SOLVER-002 · Absence de chemin rejouable
// ---------------------------------------------------------------------------
test("M28-SOLVER-002 · certify() ne rend aucun chemin : c'est un resume, pas une preuve", () => {
  const r = certify(SOLVABLE_2, { budget: 20000, maxDepth: 8 });
  assert.equal(r.solvable, true);
  for (const k of ["path", "moves", "solution", "sequence", "events", "steps"]) {
    assert.ok(!(k in r), `aucun champ ${k} : rien n'est rejouable`);
  }
  // Consequence : un tiers ne peut pas verifier l'affirmation.
  assert.deepEqual(Object.keys(r).sort(), ["budgeted", "minMoves", "solutions", "solvable"]);
});

// ---------------------------------------------------------------------------
// M28-SOLVER-003 · Le contrat de quarantaine est porte par le source
// ---------------------------------------------------------------------------
test("M28-SOLVER-003 · le source porte le statut LEGACY et l'interdiction", () => {
  const src = readFileSync(SOLVER_SRC, "utf8");
  assert.ok(src.includes("LEGACY"), "statut LEGACY absent");
  assert.ok(src.includes("UNTRUSTED"), "statut UNTRUSTED absent");
  assert.ok(
    src.includes("MUST NOT be interpreted") && src.includes("proof of unsolvability"),
    "le contrat d'interdiction de lecture est absent"
  );
  assert.ok(src.includes("M28-SOLVER-001"), "le defaut n'est pas reference dans le source");
});

test("M28-SOLVER-004 · le legacy n'est pas importe par la chaine de preuve M28", () => {
  const witnessPath = join(HERE, "..", "..", "src", "v5", "rules", "solvability-witness.mjs");
  const witness = readFileSync(witnessPath, "utf8");
  assert.ok(
    !/from\s+["'][^"']*solver[^"']*["']/.test(witness),
    "le witness ne doit pas importer le legacy"
  );
  // Et le legacy ne doit pas importer le witness. Seule une importation
  // reelle compte : le header de quarantaine le CITE, sans l'importer.
  const src = readFileSync(SOLVER_SRC, "utf8");
  const importLines = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => /^\s*import\b/.test(l));
  assert.deepEqual(importLines, ['import { createSession, isSolved, getMoves, apply, canonical } from "./engine.mjs";'],
    "le legacy n'importe que le moteur souverain, rien d'autre");
});

test("M28-SOLVER-006 · le CONTRAT D'AUTORITE classifie les deux directions", () => {
  // Les quatre clauses du contrat doivent etre LITTERALEMENT presentes dans le
  // source, pour qu'un lecteur ne puisse pas les manquer ni les adoucir.
  const src = readFileSync(SOLVER_SRC, "utf8");
  for (const clause of [
    // 1. direction positive : sound, utilisable comme affirmation verifiable
    ["solvable: true", "direction SOUND"],
    ["affirmation positive VERIFIABLE", "portee positive explicite"],
    // 2. direction negative : non certifikative
    ["solvable: false", "direction negative"],
    ["NON CERTIFICATIF", "interdit de certifier"],
    ["NE PEUT JAMAIS fermer le gate V5-SOLVABILITY", "exclusion du gate"],
    // 3. budgeted:false n'est pas une preuve d'exhaustivite
    ["budgeted: false", "clause budgeted"],
    ["NE PEUT PAS etre interprete comme une preuve d'exhaustivite", "interdit d'exhaustivite"],
    ["ALLEGATION d'exhaustivite, non un fait", "qualification du drapeau"],
    // 4. exclusion du gate, en clair
    ["ne peut pas etre cite comme preuve", "exclusion de citation"],
    ["ne participe PAS a la fermeture de", "exclusion explicite du gate"],
  ]) {
    assert.ok(src.includes(clause[0]), `clause de contrat absente : ${clause[1]} (${clause[0]})`);
  }
  // Et la mention d'intel est interdite par INTEL-C22 : on ne l'introduit pas ici.
  assert.ok(!/intel/i.test(src), "INTEL-C22 : aucune mention interdite dans le source");
});

test("M28-SOLVER-007 · la direction positive reste sound : ce qui survit au tri", () => {
  // Le tri ne jette pas certify() : il en conserve une moitie valide. Ce test
  // verifie que cette moitie tient, afin que la reclassification ne degrade pas
  // ce qui etait exact avant M28.
  const spec = {
    grid: [[-1, -1]], rows: [{ target: 12, ops: ["*"] }],
    cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 },
  };
  const r = certify(spec, { budget: 20000, maxDepth: 8 });
  assert.equal(r.solvable, true, "la direction positive reste exacte");
  // …et elle correspond bien a une solution reelle, constatee par le moteur.
  assert.equal(solvableByExhaustiveBFS(spec), true);
  // La direction negative, elle, ne prouve rien : ni ici, ni ailleurs.
  const neg = certify({ ...spec, rows: [{ target: 13, ops: ["*"] }] }, { budget: 20000, maxDepth: 8 });
  assert.equal(neg.solvable, false);
  assert.equal(solvableByExhaustiveBFS({ ...spec, rows: [{ target: 13, ops: ["*"] }] }), false,
    "ici l'absence est reelle — mais certify() ne l'etablit pas, il la constate");
});

// ---------------------------------------------------------------------------
// M28-SOLVER-005 · Ce qui reste VALABLE dans le legacy, et doit le rester
// ---------------------------------------------------------------------------
test("M28-SOLVER-005 · le legacy ne duplique aucune semantique V5 (ses transitions sont reelles)", () => {
  // Reformee : les transitions viennent bien du moteur souverain, seul le
  // defaut de completude et l'absence de chemin sont en cause.
  const src = readFileSync(SOLVER_SRC, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const token of ["lineOk", "evalOp", "sumFeasible", "quickReject", "OPERATORS"]) {
    assert.ok(!new RegExp(`\\b${token}\\s*[(=]`).test(code), `interdit : ${token}`);
  }
  assert.ok(code.includes('from "./engine.mjs"'), "les transitions viennent du moteur souverain");
  // Et il trouve bien une solution quand la recherche n'est pas tronquee.
  assert.equal(certify(SOLVABLE_2, { budget: 20000, maxDepth: 8 }).solvable, true);
  assert.equal(certify(UNSOLVABLE_1, { budget: 20000, maxDepth: 8 }).solvable, false);
});
