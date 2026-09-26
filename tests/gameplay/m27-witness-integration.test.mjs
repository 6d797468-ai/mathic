/**
 * MATHIC V6 — M27 · Intégration du semantic witness dans le pipeline M26
 *
 * Verifie la chaine complete exigee par le gate V5-SEMANTIC-WITNESS :
 *
 *   primitives executees -> etat reellement obtenu -> verdict du temoin
 *
 * Ces tests ne substituent PAS les tests V5 (tests/v5/semantic-witness.test.mjs)
 * ni les tests M26 (tests/gameplay/semantic-blocked.test.mjs). Ils verifient
 * uniquement que l'information circule correctement entre les deux, et que le
 * game layer ne peut pas maquiller un verdict.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createSession, apply, isSolved } from "../../src/v5/rules/engine.mjs";
import { witnessRelation } from "../../src/v5/rules/witness.mjs";
import { createIntent } from "../../src/gameplay/methods/intent.mjs";
import { MethodRegistry } from "../../src/gameplay/methods/registry.mjs";
import {
  registerFoundingMethods,
  methodRelation,
  METHOD_FUSE,
  METHOD_DECOMPOSE,
  METHOD_FACTORIZE,
} from "../../src/gameplay/methods/catalog.mjs";
import { preview } from "../../src/gameplay/session/preview.mjs";
import {
  prove,
  isSemanticallyProven,
  SEMANTIC_STATUS_PROVEN,
  SEMANTIC_STATUS_UNPROVEN,
  SEMANTIC_STATUS_UNSUPPORTED,
} from "../../src/gameplay/proof/proof-engine.mjs";

function registry() {
  const reg = new MethodRegistry();
  registerFoundingMethods(reg);
  return reg;
}

const intent = (methodId, targets, values, target) =>
  createIntent({ methodId, targets, values, parameters: { target } });

/** Ligne multiplicative 1x3 : 3 * 4 * _ = 12. */
const MULT = () => ({
  grid: [[-1, -1, -1]],
  rows: [{ target: 12, ops: ["*", "*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 1, ops: [] }],
  reserve: { 3: 2, 4: 2, 1: 2 },
});

/** Même cible, sémantique opposée : 3 + 4 + 5 = 12. */
const ADD = () => ({
  grid: [[-1, -1, -1]],
  rows: [{ target: 12, ops: ["+", "+"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 5, ops: [] }],
  reserve: { 3: 2, 4: 2, 5: 1 },
});

const withCell = (spec, v, r, c) => apply(createSession(spec), { id: "PLACE", v, r, c });

// ---------------------------------------------------------------------------
// M27-01 · La chaîne complète aboutit : PROVEN et certifié
// ---------------------------------------------------------------------------
test("M27-01 · FACTORIZE sur une multiplication reellement produite -> PROVEN, certified", () => {
  // Le joueur a deja pose 1 en (0,2) : la ligne se completera par 3 et 4.
  const s0 = withCell(MULT(), 1, 0, 2);
  const res = preview(s0, intent("METHOD_FACTORIZE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [3, 4], 12), registry());

  assert.equal(res.valid, true, "la legalite primitive doit rester verifiee");
  assert.equal(res.semantic.status, SEMANTIC_STATUS_PROVEN);
  assert.equal(res.semantic.proven, true);
  assert.equal(res.methodSemanticsCertified, true, "la chaine doit aboutir a une certification");
  assert.equal(isSemanticallyProven(res.proof), true);
  assert.equal(isSolved(res.proposedState), true, "V5 confirme lui-meme l'etat final");
  // La preuve concrete est transportee jusqu'au consommateur.
  assert.equal(res.semantic.observed.engineSolved, true);
  assert.deepEqual(res.semantic.observed.declaredOps, ["*", "*"]);
  assert.deepEqual(res.semantic.observed.lineValues, [3, 4, 1]);
  assert.equal(res.semanticRelation.requiredOp, "*");
});

/** Ligne additive a 2 cases : 4 + 8 = 12. */
const ADD2 = () => ({
  grid: [[-1, -1]],
  rows: [{ target: 12, ops: ["+"] }],
  cols: [{ target: 4, ops: [] }, { target: 8, ops: [] }],
  reserve: { 4: 2, 8: 2 },
});

test("M27-02 · DECOMPOSE sur une addition reellement produite -> PROVEN, certified", () => {
  const res = preview(createSession(ADD2()), intent("METHOD_DECOMPOSE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [4, 8], 12), registry());
  assert.equal(res.valid, true);
  assert.equal(res.semantic.status, SEMANTIC_STATUS_PROVEN);
  assert.equal(res.methodSemanticsCertified, true);
  assert.equal(res.semanticRelation.requiredOp, "+");
  assert.deepEqual(res.semantic.observed.lineValues, [4, 8]);
});

test("M27-03 · FUSE sur une addition reellement produite -> PROVEN, certified", () => {
  const res = preview(createSession(ADD2()), intent("METHOD_FUSE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [4, 8], 12), registry());
  assert.equal(res.valid, true);
  assert.equal(res.semantic.status, SEMANTIC_STATUS_PROVEN);
  assert.equal(res.methodSemanticsCertified, true);
});

// ---------------------------------------------------------------------------
// M27-04 · Les trois faux positifs de M26 obtiennent un verdict SPÉCIFIQUE
// ---------------------------------------------------------------------------
test("M27-04 · contre-exemple M26 #1 (multiplication reclamee sur ligne additive) -> UNPROVEN diagnostic", () => {
  const s0 = withCell(ADD(), 5, 0, 2); // la ligne additive est completable
  const res = preview(s0, intent("METHOD_FACTORIZE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [3, 4], 12), registry());

  assert.equal(res.valid, true, "la primitive reste legale : c'est bien un faux positif");
  assert.equal(res.semantic.status, SEMANTIC_STATUS_UNPROVEN);
  assert.equal(res.methodSemanticsCertified, false);
  assert.ok(res.semantic.reason.includes("ne figure pas dans la declaration ops"));
  assert.deepEqual(res.semantic.observed.declaredOps, ["+", "+"]);
});

test("M27-05 · contre-exemple M26 #2 (addition reclamee sur ligne multiplicative) -> UNPROVEN diagnostic", () => {
  const s0 = withCell(MULT(), 1, 0, 2);
  const res = preview(s0, intent("METHOD_DECOMPOSE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [3, 4], 7), registry());
  assert.equal(res.semantic.status, SEMANTIC_STATUS_UNPROVEN);
  assert.ok(res.semantic.reason.includes("ne figure pas dans la declaration ops"));
});

test("M27-06 · contre-exemple M26 #3 (facteurs non colineaires) -> UNPROVEN diagnostic", () => {
  const spec = {
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
  };
  const res = preview(createSession(spec), intent("METHOD_FACTORIZE",
    [{ r: 0, c: 0 }, { r: 2, c: 2 }], [3, 4], 12), registry());
  assert.equal(res.semantic.status, SEMANTIC_STATUS_UNPROVEN);
  assert.equal(res.semantic.observed.sharedLine, null);
  assert.ok(res.semantic.reason.includes("aucune ligne commune"));
});

test("M27-07 · ligne incomplete -> UNSUPPORTED : V5 n'a rien evalue", () => {
  // La ligne multiplicative reste a -1 : aucune conclusion n'est possible.
  const res = preview(createSession(MULT()), intent("METHOD_FACTORIZE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [3, 4], 12), registry());
  assert.equal(res.semantic.status, SEMANTIC_STATUS_UNSUPPORTED);
  assert.equal(res.methodSemanticsCertified, false);
  assert.ok(res.semantic.reason.includes("ligne incomplete"));
});

// ---------------------------------------------------------------------------
// M27-08 · Rejet V5 réel : jamais de PROVEN
// ---------------------------------------------------------------------------
test("M27-08 · sequence rejetee par V5 -> UNPROVEN, jamais PROVEN", () => {
  const relation = methodRelation(METHOD_DECOMPOSE, {
    targets: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    values: [4, 4],
    parameters: { target: 7 },
  });
  const s = createSession({
    grid: [[-1, -1]],
    rows: [{ target: 7, ops: ["+"] }],
    cols: [{ target: 4, ops: [] }, { target: 4, ops: [] }],
    reserve: { 4: 2 },
  });
  const res = prove(s, [
    { id: "PLACE", v: 4, r: 0, c: 0 },
    { id: "PLACE", v: 4, r: 0, c: 1 },
  ], relation);

  assert.equal(res.valid, false, "V5 refuse : la ligne vaut 8, pas 7");
  assert.equal(res.semantic.status, SEMANTIC_STATUS_UNPROVEN);
  assert.equal(res.semantic.proven, false);
  assert.equal(res.finalState, null);
});

test("M27-09 · la certification exige un V5 conf resolu, pas seulement une declaration", () => {
  // La ligne 0 sera PARFAITE (3 * 4 = 12, ops contient "*", cible 12), mais la
  // ligne 1 restera incomplete : isSolved doit donc refuser la certification.
  const spec = {
    grid: [[-1, -1], [-1, -1]],
    rows: [{ target: 12, ops: ["*"] }, { target: 7, ops: ["+"] }],
    cols: [{ target: 5, ops: ["+"] }, { target: 6, ops: ["+"] }],
    reserve: { 3: 2, 4: 2 },
  };
  const res = preview(createSession(spec), intent("METHOD_FACTORIZE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [3, 4], 12), registry());

  assert.equal(res.valid, true, "les deux poses sont legales");
  assert.equal(res.semantic.status, SEMANTIC_STATUS_UNPROVEN, "isSolved doit bloquer le PROVEN");
  assert.deepEqual(res.semantic.observed.declaredOps, ["*"], "la declaration est pourtant conforme");
  assert.equal(res.semantic.observed.declaredTarget, 12);
  assert.deepEqual(res.semantic.observed.lineValues, [3, 4], "la ligne porte bien 3 * 4");
  assert.equal(res.semantic.observed.engineSolved, false, "et pourtant V5 refuse l'etat");
  assert.equal(res.methodSemanticsCertified, false);
});

// ---------------------------------------------------------------------------
// M27-10 · Le game layer ne peut pas maquiller un verdict
// ---------------------------------------------------------------------------
test("M27-10 · le verdict transmis est celui du temoin, sans reinterpretation", () => {
  const s0 = withCell(ADD(), 5, 0, 2);
  const res = preview(s0, intent("METHOD_FACTORIZE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [3, 4], 12), registry());
  // Recalcule independamment via le temoin V5, hors du pipeline M26.
  const direct = witnessRelation(res.proof.finalState, res.semanticRelation);
  assert.equal(res.semantic.status, direct.status, "meme statut par les deux chemins");
  assert.equal(res.semantic.reason, direct.reason, "meme raison, non retouchee");
  assert.equal(res.semantic.proven, direct.proven);
});

test("M27-11 · une relation inexploitable ne peut pas produire un PROVEN", () => {
  const s = createSession(MULT());
  // Cible absente -> methodRelation renvoie null -> aucun temoin sollicite.
  assert.equal(methodRelation(METHOD_FACTORIZE, { targets: [], values: [], parameters: {} }), null);
  const res = prove(s, [{ id: "PLACE", v: 3, r: 0, c: 0 }], null);
  assert.equal(res.valid, true);
  assert.equal(res.semantic.proven, false);
  assert.equal(isSemanticallyProven(res), false);
});

test("M27-12 · le game layer ne duplique pas la semantique V5", () => {
  // Le seul calcul arithmetique autorise reste dans les preconditions de
  // catalogue.mjs (contrat de la Methode), jamais dans la chaine de preuve.
  const s0 = withCell(MULT(), 1, 0, 2);
  const res = preview(s0, intent("METHOD_FACTORIZE",
    [{ r: 0, c: 0 }, { r: 0, c: 1 }], [3, 4], 12), registry());
  // La certification provient de isSolved(), observe:true est trace par V5.
  assert.equal(res.semantic.observed.engineSolved, true);
  assert.equal(res.semantic.kind, "LINE_SATISFACTION");
  assert.equal(res.semanticRelation.kind, "LINE_SATISFACTION");
});
