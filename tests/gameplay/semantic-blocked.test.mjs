/**
 * @file semantic-blocked.test.mjs
 * MATHIC V6 - M26 · Non-regression du blocage semantique
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE
 * ---------------------------------------------------------------------------
 * L'audit maitre a etabli trois contre-exemples : le Proof Engine certifie
 * aujourd'hui des Methodes sur des structures V5 semantiquement incompatibles.
 *
 *   1. METHOD_FACTORIZE(12 = 3 x 4) pose 3 et 4 sur une ligne ADDITIVE
 *      (row.ops = ["+","+"])                                             -> valid = true
 *   2. METHOD_DECOMPOSE(7 = 3 + 4) pose 3 et 4 sur une ligne MULTIPLICATIVE
 *      (row.ops = ["*","*"])                                              -> valid = true
 *   3. METHOD_FACTORIZE(12 = 3 x 4) pose 3@(0,0) et 4@(2,2) : les deux
 *      cellules ne partagent NI ligne NI colonne                          -> valid = true
 *
 * Aucun de ces trois cas n'accomplit la transformation demandee.
 *
 * Ces tests ne font pas echouer la suite et ne pretendent pas corriger le
 * defaut. Ils echouent si l'absence de preuve disparait silencieusement, c'est-
 * a-dire si un `valid: true` est presente comme un certificat de Methode.
 * C'est le garde-fou exige par le gate M26.
 *
 * Regle de reouverture : M26 ne peut passer PROVEN que si ces trois cas
 * basculent sur un statut semantique PROVEN appuye sur un temoin V5, via le
 * gate V5-SEMANTIC-WITNESS. Jamais par un elargissement de `valid`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createSession, isSolved, canonical } from "../../src/v5/rules/engine.mjs";
import { createIntent } from "../../src/gameplay/methods/intent.mjs";
import { MethodRegistry } from "../../src/gameplay/methods/registry.mjs";
import { registerFoundingMethods, methodRelation, METHOD_FACTORIZE } from "../../src/gameplay/methods/catalog.mjs";
import { preview } from "../../src/gameplay/session/preview.mjs";
import {
  prove,
  isSemanticallyProven,
  PROOF_SCOPE_PRIMITIVE_ONLY,
  SEMANTIC_PROOF_UNPROVEN,
  SEMANTIC_STATUS_BLOCKED,
  SEMANTIC_STATUS_UNPROVEN,
  SEMANTIC_PROOF_BLOCKED,
} from "../../src/gameplay/proof/proof-engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GAMEPLAY_DIR = join(HERE, "..", "..", "src", "gameplay");

function registry() {
  const reg = new MethodRegistry();
  registerFoundingMethods(reg);
  return reg;
}

// ---------------------------------------------------------------------------
// Specs de contre-exemple. Chacune est un V5 parfaitement LEGITIME : le
// defaut n'est pas dans la spec, il est dans l'absence de postcondition.
// ---------------------------------------------------------------------------

/** Ligne 0 purement additive : 3 + 4 + _ = 12. Aucune multiplication ici. */
function additiveSpec() {
  return {
    grid: [[-1, -1, -1]],
    rows: [{ target: 12, ops: ["+", "+"] }],
    cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 5, ops: [] }],
    reserve: { 3: 2, 4: 2, 5: 1 },
  };
}

/** Ligne 0 uniquement multiplicative : 3 * 4 * _ = 12. Aucune addition ici. */
function multiplicativeSpec() {
  return {
    grid: [[-1, -1, -1]],
    rows: [{ target: 12, ops: ["*", "*"] }],
    cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }, { target: 1, ops: [] }],
    reserve: { 3: 2, 4: 2, 1: 2 },
  };
}

/** 3x3, toutes lignes additives. (0,0) et (2,2) ne partagent aucune ligne. */
function scatteredSpec() {
  return {
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
}

/**
 * M27 a fait evoluer le statut : le temoin V5 statue désormais sur chaque cas
 * au lieu de renvoyer un BLOCKED global. Les trois faux positifs du §3 de
 * MATHIC-V6-M26-REPORT.md tombent tous en UNPROVEN, chacun avec une raison
 * DIAGNOSTIQUE. C'est plus fort que le BLOCKED d'origine, et c'est verifie ici.
 */
function assertBlocked(res, label, reasonFragment) {
  assert.equal(res.valid, true, `${label} : la legalite primitive V5 doit rester acceptee`);
  assert.equal(
    res.methodSemanticsCertified,
    false,
    `${label} : NE DOIT PAS etre presente comme un certificat de Methode`
  );
  assert.equal(res.semantic.proven, false, `${label} : la postcondition ne doit pas etre declaree prouvee`);
  assert.equal(res.semantic.status, SEMANTIC_STATUS_UNPROVEN, `${label} : statut semantique attendu = UNPROVEN`);
  assert.equal(res.proofScope, PROOF_SCOPE_PRIMITIVE_ONLY, `${label} : portee attendue = primitive seulement`);
  assert.equal(isSemanticallyProven(res.proof), false, `${label} : isSemanticallyProven() doit rester false`);
  assert.ok(
    res.semantic.reason.includes(reasonFragment),
    `${label} : raison attendue contenant ${JSON.stringify(reasonFragment)}, obtenue ${JSON.stringify(res.semantic.reason)}`
  );
}

// ---------------------------------------------------------------------------
// SB-01 · Contre-exemple 1 — FACTORIZE sur une ligne additive
// ---------------------------------------------------------------------------
test("SB-01 · FACTORIZE(12 = 3 x 4) sur une ligne additive : pas de preuve semantique", () => {
  const spec = additiveSpec();
  const s0 = createSession(spec);
  const intent = createIntent({
    methodId: "METHOD_FACTORIZE",
    targets: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    values: [3, 4],
    parameters: { target: 12 },
  });

  const res = preview(s0, intent, registry());

  // La ligne porte "+", pas "*" : la factorisation n'a pas eu lieu.
  assert.deepEqual(spec.rows[0].ops, ["+", "+"], "la spec doit rester additive");
  assertBlocked(res, "SB-01", "ne figure pas dans la declaration ops");

  // Et la grille proposee n'est meme pas resolue.
  assert.equal(isSolved(res.proposedState), false, "SB-01 : la grille proposee n'est pas resolue");
  assert.deepEqual(res.proposedState.grid, [[3, 4, -1]]);
});

// ---------------------------------------------------------------------------
// SB-02 · Contre-exemple 2 — DECOMPOSE sur une ligne multiplicative
// ---------------------------------------------------------------------------
test("SB-02 · DECOMPOSE(7 = 3 + 4) sur une ligne multiplicative : pas de preuve semantique", () => {
  const spec = multiplicativeSpec();
  const s0 = createSession(spec);
  const intent = createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    values: [3, 4],
    parameters: { target: 7 },
  });

  const res = preview(s0, intent, registry());

  // La ligne porte "*", pas "+" : la decomposition additive n'a pas eu lieu.
  assert.deepEqual(spec.rows[0].ops, ["*", "*"], "la spec doit rester multiplicative");
  assertBlocked(res, "SB-02", "ne figure pas dans la declaration ops");
  assert.equal(isSolved(res.proposedState), false, "SB-02 : la grille proposee n'est pas resolue");
});

// ---------------------------------------------------------------------------
// SB-03 · Contre-exemple 3 — facteurs non colineaires
// ---------------------------------------------------------------------------
test("SB-03 · FACTORIZE avec 3@(0,0) et 4@(2,2) (aucune ligne commune) : pas de preuve semantique", () => {
  const s0 = createSession(scatteredSpec());
  const intent = createIntent({
    methodId: "METHOD_FACTORIZE",
    targets: [{ r: 0, c: 0 }, { r: 2, c: 2 }],
    values: [3, 4],
    parameters: { target: 12 },
  });

  const res = preview(s0, intent, registry());

  // (0,0) et (2,2) ne partagent ni ligne ni colonne.
  assert.notEqual(0, 2);
  assertBlocked(res, "SB-03", "aucune ligne commune");
});

// ---------------------------------------------------------------------------
// SB-04 · Les trois faux positifs restent distincts d'un rejet V5 reel.
// Ce ne sont pas des erreurs : ce sont des faux positifs de PORTEE.
// ---------------------------------------------------------------------------
test("SB-04 · les trois faux positifs restent distincts d'un rejet V5", () => {
  // Rejet V5 authentique : la ligne devient complete et fausse (4+4=8 != 7).
  const rejected = prove(createSession({
    grid: [[-1, -1]],
    rows: [{ target: 7, ops: ["+"] }],
    cols: [{ target: 4, ops: [] }, { target: 4, ops: [] }],
    reserve: { 4: 2 },
  }), [
    { id: "PLACE", v: 4, r: 0, c: 0 },
    { id: "PLACE", v: 4, r: 0, c: 1 },
  ]);
  assert.equal(rejected.valid, false, "SB-04 : un rejet V5 doit rester valid=false");

  // Faux positif de portee : accepte par V5, NON certifie comme Methode.
  // La reclamation FACTORIZE est fournie pour que le temoin statue vraiment.
  const fpRelation = methodRelation(METHOD_FACTORIZE, {
    targets: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    values: [3, 4],
    parameters: { target: 12 },
  });
  assert.equal(fpRelation.requiredOp, "*", "FACTORIZE revendique la multiplication");
  const falsePositive = prove(createSession(additiveSpec()), [
    { id: "PLACE", v: 3, r: 0, c: 0 },
    { id: "PLACE", v: 4, r: 0, c: 1 },
  ], fpRelation);
  assert.equal(falsePositive.valid, true, "SB-04 : la legalite primitive doit rester acceptee");
  assert.equal(isSemanticallyProven(falsePositive), false, "SB-04 : ... sans jamais certifier la Methode");

  // Les deux sont non certifies, mais pour deux raisons distinctes : le rejet
  // V5 n'a pas d'etat resultant, le faux positif en a un mais non conforme.
  assert.equal(rejected.semantic.status, SEMANTIC_STATUS_UNPROVEN);
  assert.equal(falsePositive.semantic.status, SEMANTIC_STATUS_UNPROVEN);
  assert.equal(isSemanticallyProven(rejected), false);
  assert.equal(isSemanticallyProven(falsePositive), false);
});

// ---------------------------------------------------------------------------
// SB-05 · Aucune branche du Proof Engine ne certifie la semantique.
// ---------------------------------------------------------------------------
test("SB-05 · isSemanticallyProven() est false sur TOUTES les formes de retour", () => {
  const cases = [
    prove(null, []),
    prove(createSession(additiveSpec()), "pas-un-tableau"),
    prove(createSession(additiveSpec()), [
      { id: "PLACE", v: 3, r: 0, c: 0 },
      { id: "PLACE", v: 4, r: 0, c: 1 },
    ]),
    prove(createSession(additiveSpec()), [
      { id: "PLACE", v: 3, r: 0, c: 0 },
      { id: "PLACE", v: 4, r: 0, c: 1 },
      { id: "PLACE", v: 99, r: 0, c: 2 },
    ]),
  ];
  for (const c of cases) {
    assert.equal(isSemanticallyProven(c), false, "SB-05 : aucune branche ne peut certifier la semantique");
    assert.equal(c.semantic.proven, false);
    assert.equal(c.scope, PROOF_SCOPE_PRIMITIVE_ONLY);
  }
  // Sans reclamation, le volet semantique reste BLOCKED : rien n'est statue.
  assert.equal(cases[2].semantic.status, SEMANTIC_STATUS_BLOCKED);
  assert.ok(cases[2].semantic.reason.includes("Aucune reclamation semantique"));

  // Les retours precoces de preview() exposent la meme forme.
  const early = preview(createSession(additiveSpec()), createIntent({
    methodId: "METHOD_FACTORIZE",
    targets: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    values: [3, 3],
    parameters: { target: 99 },
  }), registry());
  assert.equal(early.semantic.proven, false, "SB-05 : un retour precoce ne cache pas le statut");
  assert.equal(early.methodSemanticsCertified, false);
  assert.equal(early.proofScope, PROOF_SCOPE_PRIMITIVE_ONLY);
});

// ---------------------------------------------------------------------------
// SB-06 · Le verdict bloque est fige : on ne peut pas le basculer a la main.
// ---------------------------------------------------------------------------
test("SB-06 · les verdicts figes sont non falsifiables en place", () => {
  for (const v of [SEMANTIC_PROOF_BLOCKED, SEMANTIC_PROOF_UNPROVEN]) {
    assert.equal(Object.isFrozen(v), true);
    assert.throws(() => { "use strict"; v.proven = true; }, TypeError);
    assert.throws(() => { "use strict"; v.status = "PROVEN"; }, TypeError);
    assert.equal(v.proven, false);
  }
  assert.equal(SEMANTIC_PROOF_BLOCKED.status, SEMANTIC_STATUS_BLOCKED);
  assert.equal(SEMANTIC_PROOF_UNPROVEN.status, SEMANTIC_STATUS_UNPROVEN);
});

// ---------------------------------------------------------------------------
// SB-07 a SB-10 · Gardes structurelles sur toute la couche src/gameplay.
// Ces regles doivent survivre a toute evolution du module.
// ---------------------------------------------------------------------------
/**
 * Retire les commentaires. Les littéraux de chaine sont conserves : c'est
 * eux qui revelent une table d'operateurs reecrite localement (SB-10).
 */
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * Retire commentaires ET litteraux. Sert aux gardes qui cherchent un
 * INTERNE DE V5 reimplemente ou un effet de bord : citer `lineOk()` dans une
 * raison d'erreur ou nommer `localStorage` dans un message est legitime et ne
 * doit pas faire echouer la garde. Seul du code reellement execute compte.
 */
function stripJsCode(src) {
  return stripJsComments(src)
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function gameplaySources(dir = GAMEPLAY_DIR) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return gameplaySources(p);
    return e.name.endsWith(".mjs") ? [p] : [];
  });
}

test("SB-07 · src/gameplay ne duplique aucun interne de V5", () => {
  const forbidden = ["lineOk", "evalOp", "sumFeasible", "quickReject", "OPERATORS", "validateSpec"];
  for (const file of gameplaySources()) {
    const code = stripJsCode(readFileSync(file, "utf8"));
    for (const token of forbidden) {
      const re = new RegExp(`\\b${token}\\s*[(=]|\\bfunction\\s+${token}\\b`);
      assert.ok(!re.test(code), `interdit dans ${file} : ${token} (V5 doit rester l'unique autorite)`);
    }
  }
});

test("SB-08 · src/gameplay reste pur : ni aleatoire, ni horloge, ni reseau, ni UI, ni stockage", () => {
  for (const file of gameplaySources()) {
    const code = stripJsCode(readFileSync(file, "utf8"));
    for (const bad of ["Math.random", "Date.now", "document", "window", "localStorage", "navigator", "fetch(", "XMLHttpRequest", "WebSocket", "require("]) {
      assert.ok(!code.includes(bad), `interdit dans ${file} : ${bad}`);
    }
  }
});

test("SB-09 · M26 n'importe aucun solveur et ne fait aucune recherche", () => {
  for (const file of gameplaySources()) {
    const code = stripJsCode(readFileSync(file, "utf8"));
    assert.ok(!/\bfrom\s+["'][^"']*solver[^"']*["']/.test(code), `solveur importe dans ${file}`);
    assert.ok(!/\bcertify\b|\bsolve\b|\bDFS\b|\bBFS\b/.test(code), `recherche.executee dans ${file}`);
  }
});

test("SB-10 · M26 ne redéclare pas la table des opérateurs V5", () => {
  for (const file of gameplaySources()) {
    const code = stripJsComments(readFileSync(file, "utf8"));
    assert.ok(!/"[+\-*/]"\s*:/.test(code), `table d'operateurs locale dans ${file}`);
  }
});

// ---------------------------------------------------------------------------
// SB-11 · Une divergence d'etats reste non probante.
// Deux certifications sont distinctes, donc rien n'est prouve sur le fond.
// ---------------------------------------------------------------------------
test("SB-11 · deux strategies valides ne produisent AUCUNE preuve de Methode", () => {
  const s0 = createSession({
    grid: [[-1, -1], [-1, -1]],
    rows: [{ target: 7, ops: ["+"] }, { target: 12, ops: ["*"] }],
    cols: [{ target: 6, ops: ["+"] }, { target: 8, ops: ["+"] }],
    reserve: { 3: 2, 4: 2 },
  });

  const a = preview(s0, createIntent({
    methodId: "METHOD_DECOMPOSE",
    targets: [{ r: 0, c: 0 }, { r: 0, c: 1 }],
    values: [3, 4],
    parameters: { target: 7 },
  }), registry());
  const b = preview(s0, createIntent({
    methodId: "METHOD_FACTORIZE",
    targets: [{ r: 1, c: 0 }, { r: 1, c: 1 }],
    values: [3, 4],
    parameters: { target: 12 },
  }), registry());

  // Les deux jeux de commandes et les deux etats different bien...
  assert.notDeepEqual(a.commands, b.commands);
  assert.notEqual(canonical(a.proposedState), canonical(b.proposedState));

  // ...mais AUCUNE des deux branches ne certifie une Methode.
  assert.equal(a.methodSemanticsCertified, false);
  assert.equal(b.methodSemanticsCertified, false);
  assert.equal(a.semantic.proven, false);
  assert.equal(b.semantic.proven, false);
});
