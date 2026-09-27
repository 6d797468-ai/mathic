/**
 * MATHIC V6 — M27 · Tests du semantic witness V5
 *
 * Ces tests n'importent AUCUN module de src/gameplay/ (W-07) : ils auditent le
 * temoin comme composant V5 autonome, avant tout couplage.
 *
 * Ils distinguent les quatre etats exiges :
 *   - synthaxe valide + transformation reellement produite  -> PROVEN
 *   - synthaxe valide + transformation NON demontree        -> UNPROVEN / UNSUPPORTED
 *   - faux temoin (reclamation contredite par la declaration)-> UNPROVEN
 *   - rejet V5 reel (jamais de PROVEN)                      -> UNPROVEN
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createSession, isSolved, apply as applyStep } from "../../src/v5/rules/engine.mjs";
import { witnessRelation, RELATION_KIND } from "../../src/v5/rules/witness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(HERE, "..", "..", "src", "v5", "rules");

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

/** Place une suite de valeurs, via l'API souveraine apply(). */
function place(spec, cells) {
  return cells.reduce(
    (s, { v, r, c }) => {
      const next = applyStep(s, { id: "PLACE", v, r, c });
      assert.ok(next, `V5 a refuse la pose ${v}@(${r},${c}) : fixture invalide`);
      return next;
    },
    createSession(spec)
  );
}

/** Ligne multiplicative 1x3 : 3 * 4 * 1 = 12. */
const MULT_SPEC = () => ({
  grid: [[-1, -1, -1]],
  rows: [{ target: 12, ops: ["*", "*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 1, ops: [] }],
  reserve: { 3: 2, 4: 2, 1: 2 },
});

/** Ligne additive 1x3 : 3 + 4 + 5 = 12. Meme cible, semantique opposee. */
const ADD_SPEC = () => ({
  grid: [[-1, -1, -1]],
  rows: [{ target: 12, ops: ["+", "+"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 5, ops: [] }],
  reserve: { 3: 2, 4: 2, 5: 1 },
});

/** 3x3 additif, pour le cas non colineaire. */
const SCATTERED_SPEC = () => ({
  grid: [[-1, -1, -1], [-1, -1, -1], [-1, -1, -1]],
  rows: [
    { target: 5, ops: ["+", "+"] },
    { target: 6, ops: ["+", "+"] },
    { target: 7, ops: ["+", "+"] },
  ],
  cols: [
    { target: 5, ops: ["+", "+"] },
    { target: 6, ops: ["+", "+"] },
    { target: 7, ops: ["+", "+"] },
  ],
  reserve: { 3: 2, 4: 2, 2: 2, 1: 4 },
});

const rel = (o) => ({ kind: RELATION_KIND, ...o });

// ---------------------------------------------------------------------------
// W-01 · Témoin valide : la transformation est RÉELLEMENT produite
// ---------------------------------------------------------------------------
test("W-01 · ligne multiplicative complète et confirmée par V5 -> PROVEN", () => {
  const s = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 1, r: 0, c: 2 },
  ]);
  assert.equal(isSolved(s), true, "la fixture doit être résolue par V5");

  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 12,
  }));

  assert.equal(v.status, "PROVEN");
  assert.equal(v.observed.engineSolved, true);
  assert.deepEqual(v.observed.declaredOps, ["*", "*"]);
  assert.deepEqual(v.checkedCells, [{ r: 0, c: 0 }, { r: 0, c: 1 }]);
  assert.ok(v.reason.includes("confirme l'etat observe comme resolu"));
});

test("W-02 · colonne (et non ligne) : la sémantique est vérifiée aussi en colonne", () => {
  const spec = {
    grid: [[-1], [-1], [-1]],
    rows: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 1, ops: [] }],
    cols: [{ target: 12, ops: ["*", "*"] }],
    reserve: { 3: 2, 4: 2, 1: 2 },
  };
  const s = place(spec, [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 1, c: 0 },
    { v: 1, r: 2, c: 0 },
  ]);
  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }],
    requiredOp: "*",
    target: 12,
  }));
  assert.equal(v.status, "PROVEN");
  assert.equal(v.observed.sharedLine.kind, "col");
});

// ---------------------------------------------------------------------------
// W-03 · Faux témoin : réclamation contredite par la déclaration de la ligne
// C'est le garde-fou central. 3 + 4 + 5 = 12 est résolu par V5, mais la
// ligne est ADDITIVE : réclamer "*" doit échouer.
// ---------------------------------------------------------------------------
test("W-03 · ligne additive résolue + réclamation '*' -> UNPROVEN (faux témoin)", () => {
  const s = place(ADD_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 5, r: 0, c: 2 },
  ]);
  assert.equal(isSolved(s), true, "V5 confirme la ligne additive : le test est bien le piège");

  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 12,
  }));

  assert.equal(v.status, "UNPROVEN", "un PROVEN ici serait un faux positif semantique");
  assert.ok(v.reason.includes("ne figure pas dans la declaration ops"));
  assert.deepEqual(v.observed.declaredOps, ["+", "+"]);
  // Et la réclamation honnête, elle, passe.
  assert.equal(
    witnessRelation(s, rel({
      values: [3, 4],
      cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
      requiredOp: "+",
      target: 12,
    })).status,
    "PROVEN",
    "la même ligne additive satisfait une réclamation '*'->'+' honnête"
  );
});

test("W-04 · cible réclamée différente de la cible déclarée -> UNPROVEN", () => {
  const s = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 1, r: 0, c: 2 },
  ]);
  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 24,
  }));
  assert.equal(v.status, "UNPROVEN");
  assert.ok(v.reason.includes("cible reclamee 24"));
  assert.equal(v.observed.declaredTarget, 12);
});

// ---------------------------------------------------------------------------
// W-05 · Transformation absente : pas de ligne commune
// ---------------------------------------------------------------------------
test("W-05 · cellules non colinéaires -> UNPROVEN", () => {
  const s = place(SCATTERED_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 2, c: 2 },
  ]);
  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 2, c: 2 }],
    requiredOp: "*",
    target: 12,
  }));
  assert.equal(v.status, "UNPROVEN");
  assert.ok(v.reason.includes("aucune ligne commune"));
  assert.equal(v.observed.sharedLine, null);
});

// ---------------------------------------------------------------------------
// W-06 · Primitive valide mais transformation non démontrée
// ---------------------------------------------------------------------------
test("W-06 · ligne incomplète -> UNSUPPORTED (V5 n'a rien évalué)", () => {
  const s = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
  ]);
  assert.equal(isSolved(s), false);
  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 12,
  }));
  assert.equal(v.status, "UNSUPPORTED");
  assert.ok(v.reason.includes("ligne incomplete"));
  assert.deepEqual(v.observed.lineValues, [3, 4, -1]);
});

test("W-07 · ligne complète mais fausse -> UNPROVEN, même si tout le reste passe", () => {
  // ops contient bien "*" et la cible est bien 12 : seul isSolved tranche.
  const s = place(
    { ...MULT_SPEC(), cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 2, ops: [] }], reserve: { 3: 2, 4: 2, 2: 2 } },
    [
      { v: 3, r: 0, c: 0 },
      { v: 4, r: 0, c: 1 },
      { v: 2, r: 0, c: 2 },
    ]
  );
  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 12,
  }));
  assert.equal(v.status, "UNPROVEN", "3*4*2=24 != 12 : isSolved doit bloquer le PROVEN");
  assert.equal(v.observed.engineSolved, false);
});

// ---------------------------------------------------------------------------
// W-08 · Rejet V5 réel : le temoin ne peut pas certifier un état rejeté
// ---------------------------------------------------------------------------
test("W-08 · état rejeté par V5 (ligne complète et fausse) -> jamais PROVEN", () => {
  const bad = createSession({
    grid: [[-1, -1]],
    rows: [{ target: 7, ops: ["+"] }],
    cols: [{ target: 4, ops: [] }, { target: 4, ops: [] }],
    reserve: { 4: 2 },
  });
  const s = place({ ...bad.spec }, [
    { v: 4, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
  ]);
  const v = witnessRelation(s, rel({
    values: [4, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "+",
    target: 7,
  }));
  assert.equal(v.status, "UNPROVEN");
  assert.equal(isSolved(s), false);
});

// ---------------------------------------------------------------------------
// W-09 · Impossibilité de satisfaire artificiellement le témoin
// ---------------------------------------------------------------------------
test("W-09 · le verdict est figé et non falsifiable en place", () => {
  const s = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 1, r: 0, c: 2 },
  ]);
  const v = witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 12,
  }));
  assert.equal(v.status, "PROVEN");
  assert.equal(Object.isFrozen(v), true);
  assert.throws(() => { "use strict"; v.status = "UNPROVEN"; }, TypeError);
  assert.equal(v.status, "PROVEN");
});

test("W-10 · usurpation de valeurs : le témoin lit le plateau, pas la réclamation", () => {
  const s = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 1, r: 0, c: 2 },
  ]);
  // On prétend 5 et 4 alors que 3 et 4 sont posés.
  const v = witnessRelation(s, rel({
    values: [5, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 12,
  }));
  assert.equal(v.status, "UNPROVEN");
  assert.ok(v.reason.includes("different de la relation reclamee"));
});

test("W-11 · aucune réclamation exploitable -> UNSUPPORTED, jamais PROVEN", () => {
  const full = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 1, r: 0, c: 2 },
  ]);
  const cases = [
    [null, "NO_RELATION"],
    [{ kind: "AUTRE_CHOSE" }, "UNKNOWN_KIND"],
    [rel({ values: [3, 4], cells: [{ r: 0, c: 0 }], requiredOp: "*", target: 12 }), "BAD_CELLS"],
    [rel({ values: [3], cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }], requiredOp: "*", target: 12 }), "BAD_VALUES"],
    [rel({ values: [3, 4], cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }], target: 12 }), "NO_OP_OR_TARGET"],
    [rel({ values: [3, 4], cells: [{ r: 9, c: 9 }, { r: 0, c: 1 }], requiredOp: "*", target: 12 }), "CELL_OUT_OF_RANGE"],
  ];
  for (const [r, tag] of cases) {
    assert.equal(witnessRelation(full, r).status, "UNSUPPORTED", `cas ${tag}`);
  }

  // CELL_EMPTY exige une cellule reellement vide : on utilise un etat partiel.
  const partial = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
  ]);
  assert.equal(
    witnessRelation(partial, rel({
      values: [3, 4],
      cells: [{ r: 0, c: 2 }, { r: 0, c: 1 }],
      requiredOp: "*",
      target: 12,
    })).status,
    "UNSUPPORTED",
    "cas CELL_EMPTY"
  );

  assert.equal(
    witnessRelation(null, rel({ values: [3, 4], cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }], requiredOp: "*", target: 12 })).status,
    "UNSUPPORTED",
    "cas NO_STATE"
  );
});

test("W-12 · le témoin ne mute pas l'état observé", () => {
  const s = place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 1, r: 0, c: 2 },
  ]);
  const before = JSON.stringify([s.grid, s.reserve, s.events, s.moves]);
  witnessRelation(s, rel({
    values: [3, 4],
    cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    requiredOp: "*",
    target: 12,
  }));
  assert.equal(JSON.stringify([s.grid, s.reserve, s.events, s.moves]), before, "le témoin doit etre en lecture seule");
});

test("W-13 · déterminisme : verdicts identiques sur executions repetées", () => {
  const build = () => place(MULT_SPEC(), [
    { v: 3, r: 0, c: 0 },
    { v: 4, r: 0, c: 1 },
    { v: 1, r: 0, c: 2 },
  ]);
  const r = rel({ values: [3, 4], cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }], requiredOp: "*", target: 12 });
  const runs = Array.from({ length: 25 }, () => JSON.stringify(witnessRelation(build(), r)));
  assert.equal(new Set(runs).size, 1, "le témoin doit etre deterministe");
});

// ---------------------------------------------------------------------------
// W-14 · Gardes structurelles sur le module V5 lui-même
// ---------------------------------------------------------------------------
function stripJs(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function ruleSources() {
  return readdirSync(RULES_DIR, { withFileTypes: true }).flatMap((e) => {
    const p = join(RULES_DIR, e.name);
    return e.isDirectory() ? ruleSources() : e.name.endsWith(".mjs") ? [p] : [];
  });
}

test("W-14 · le témoin ne duplique aucun interne de V5", () => {
  const raw = readFileSync(join(RULES_DIR, "witness.mjs"), "utf8");
  const code = stripJs(raw);
  for (const token of ["lineOk", "evalOp", "sumFeasible", "quickReject", "OPERATORS", "getMoves"]) {
    const re = new RegExp(`\\b${token}\\s*[(=]|\\bfunction\\s+${token}\\b`);
    assert.ok(!re.test(code), `interdit dans witness.mjs : ${token}`);
  }
  // Aucune table d'operateurs locale : on inspecte les litteraux, pas le code.
  const commentsOnly = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(!/"[+\-*/]"\s*:/.test(commentsOnly), "table d'operateurs locale dans witness.mjs");
});

test("W-15 · le témoin ne fait aucune recherche et n'importe aucun solveur", () => {
  const code = stripJs(readFileSync(join(RULES_DIR, "witness.mjs"), "utf8"));
  assert.ok(!/\bcertify\b|\bsolve\b|\bsearch\b|\bDFS\b|\bBFS\b|\bbacktrack\b/i.test(code), "recherche detectee");
  assert.ok(!/\bfrom\s+["'][^"']*solver[^"']*["']/.test(code), "solveur importe");
  // Un seul import depuis V5 : l'evaluateur souverain.
  const imports = [...readFileSync(join(RULES_DIR, "witness.mjs"), "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(imports, ["./engine.mjs"], "le temoin ne doit importer que l'evaluateur souverain");
});

test("W-16 · aucun module V5 ne depend de src/gameplay (dependance descendante)", () => {
  for (const f of ruleSources()) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/from\s+["'][^"']*gameplay[^"']*["']/.test(src), `dependance inverse dans ${f}`);
  }
});
