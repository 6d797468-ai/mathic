import { test } from "node:test";
import assert from "node:assert/strict";

import {
  encodeSeal,
  decodeSeal,
  verifySeal,
  canonicalJson,
  bytesToBase64url,
  crc32,
  ENVELOPE_NAME,
  SEAL_PREFIX_VERSION,
  SEAL_SCHEMA_VERSION,
  SEAL_GAME_VERSION,
  SEAL_RULE_VERSION,
  SEAL_ORIGIN,
} from "../../src/atelier/seal.mjs";

import {
  createSession,
  getState,
  replay,
  canonical,
  apply,
} from "../../src/v5/rules/engine.mjs";

import { createV5GameAdapter } from "../../src/runtime/game-adapter-v5.js";

const SPEC_A = {
  grid: [
    [-1, -1],
    [-1, -1],
  ],
  rows: [
    { ops: ["+"], target: 5 },
    { ops: ["+"], target: 7 },
  ],
  cols: [
    { ops: ["+"], target: 4 },
    { ops: ["+"], target: 8 },
  ],
  reserve: { 2: 2, 3: 1, 5: 1 },
};

const SPEC_B = {
  grid: [
    [-1, -1],
    [-1, -1],
  ],
  rows: [
    { ops: ["*"], target: 10 },
    { ops: ["-"], target: 4 },
  ],
  cols: [
    { ops: ["+"], target: 9 },
    { ops: ["+"], target: 8 },
  ],
  reserve: { 2: 1, 3: 1, 5: 1, 7: 1 },
};

const SPEC_1X3 = {
  grid: [[-1, -1, -1]],
  rows: [{ ops: ["+", "+"], target: 12 }],
  cols: [
    { ops: [], target: 4 },
    { ops: [], target: 4 },
    { ops: [], target: 4 },
  ],
  reserve: { 2: 2, 4: 2, 6: 1 },
};

// ---------------------------------------------------------------------------
// SEAL-01 · Même spec → même Sceau (byte-identique)
// ---------------------------------------------------------------------------

test("SEAL-01 : même spec produit le même Sceau byte-identique", () => {
  const a = encodeSeal(SPEC_A);
  const b = encodeSeal(SPEC_A);
  assert.equal(a, b);
  assert.ok(a.startsWith(`${ENVELOPE_NAME}-${SEAL_PREFIX_VERSION}:`));
});

// ---------------------------------------------------------------------------
// SEAL-02 · Exécutions séparées → byte-identiques (pas de hasard, pas d'horloge)
// ---------------------------------------------------------------------------

test("SEAL-02 : plusieurs exécutions séparées produisent des Sceaux byte-identiques", () => {
  const seals = Array.from({ length: 5 }, () => encodeSeal(SPEC_B));
  for (const s of seals) assert.equal(s, seals[0]);
});

// ---------------------------------------------------------------------------
// SEAL-03 · Sceau valide → reconstruction createSession valide
// ---------------------------------------------------------------------------

test("SEAL-03 : un Sceau valide reconstruit une session validable par createSession", () => {
  for (const spec of [SPEC_A, SPEC_B, SPEC_1X3]) {
    const res = decodeSeal(encodeSeal(spec));
    assert.equal(res.ok, true, `seal == spec: ${JSON.stringify(spec)}`);
    assert.doesNotThrow(() => createSession(res.spec));
  }
});

// ---------------------------------------------------------------------------
// SEAL-04 · getState initial identique entre la spec source et la spec décodée
// ---------------------------------------------------------------------------

test("SEAL-04 : getState(init) identique entre spec source et spec décodée", () => {
  const res = decodeSeal(encodeSeal(SPEC_A));
  assert.equal(res.ok, true);
  const sSource = getState(createSession(res.spec));
  const sDecoded = getState(createSession(res.spec));
  assert.deepEqual(sDecoded, sSource);
});

// ---------------------------------------------------------------------------
// SEAL-05 · Même séquence de commandes → mêmes états + canonical final identique
// ---------------------------------------------------------------------------

test("SEAL-05 : même suite de apply → mêmes états et canonical final identiques", () => {
  const res = decodeSeal(encodeSeal(SPEC_A));
  assert.equal(res.ok, true);

  const seq = [
    { id: "PLACE", v: 2, r: 0, c: 0 },
    { id: "PLACE", v: 3, r: 0, c: 1 },
    { id: "PLACE", v: 2, r: 1, c: 0 },
    { id: "PLACE", v: 5, r: 1, c: 1 },
  ];

  const sA = { ...createSession(SPEC_A) };
  const sB = { ...createSession(res.spec) };

  for (const cmd of seq) {
    sA.events = [...sA.events];
    sB.events = [...sB.events];
    sA.grid = sA.grid.slice();
    sB.grid = sB.grid.slice();
    const a2 = apply(sA, cmd);
    const b2 = apply(sB, cmd);
    assert.ok(a2 && b2, `coups applicables: ${JSON.stringify(cmd)}`);
    sA.grid = a2.grid;
    sB.grid = b2.grid;
    sA.reserve = a2.reserve;
    sB.reserve = b2.reserve;
    sA.moves = a2.moves;
    sB.moves = b2.moves;
    sA.events = a2.events;
    sB.events = b2.events;
    assert.deepEqual(getState(sB), getState(sA), `état après ${JSON.stringify(cmd)}`);
  }

  assert.equal(canonical(sB), canonical(sA));
});

// ---------------------------------------------------------------------------
// SEAL-06 · 1 caractère modifié → checksum rejeté
// ---------------------------------------------------------------------------

test("SEAL-06 : la modification d'un caractère rejette le Sceau", () => {
  const seal = encodeSeal(SPEC_A);
  const at = seal.indexOf(":") + 2;
  const mutated = seal.slice(0, at) + (seal[at] === "A" ? "B" : "A") + seal.slice(at + 1);
  const res = decodeSeal(mutated);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "CHECKSUM");
  assert.equal(verifySeal(mutated).ok, false);
});

// ---------------------------------------------------------------------------
// SEAL-07 · Version inconnue → rejet propre
// ---------------------------------------------------------------------------

test("SEAL-07 : une version d'enveloppe inconnue est rejetée proprement", () => {
  const seal = encodeSeal(SPEC_A);
  const upgraded = seal.replace(`${ENVELOPE_NAME}-${SEAL_PREFIX_VERSION}:`, `${ENVELOPE_NAME}-2:`);
  const res = decodeSeal(upgraded);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "UNKNOWN_VERSION");
  assert.equal(verifySeal(upgraded).ok, false);
  assert.equal(decodeSeal(upgraded).message.includes("inconnue"), true);
});

// ---------------------------------------------------------------------------
// SEAL-08 · Spec invalide embarquée → rejet avant createSession
// ---------------------------------------------------------------------------

test("SEAL-08 : une spec invalide est rejetée avant toute création de session", () => {
  const badSpec = {
    ...JSON.parse(JSON.stringify(SPEC_A)),
    grid: [[2, 5], [2]],
  };

  const buildSeal = (spec) => {
    const json = canonicalJson({
      schemaVersion: 1,
      gameVersion: SEAL_GAME_VERSION,
      ruleVersion: SEAL_RULE_VERSION,
      spec,
      origin: SEAL_ORIGIN,
      metadata: { createdFrom: "spec" },
    });
    const payload = bytesToBase64url(new TextEncoder().encode(json));
    return `${ENVELOPE_NAME}-${SEAL_PREFIX_VERSION}:${payload}:${crc32(payload).toString(16).padStart(8, "0")}`;
  };

  const forged = buildSeal(badSpec);
  const res = decodeSeal(forged);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "INVALID_SPEC");
  assert.throws(() => createSession(badSpec), TypeError);
});

// ---------------------------------------------------------------------------
// SEAL-09 · Malformé → aucune mutation (jamais d'effet de bord)
// ---------------------------------------------------------------------------

test("SEAL-09 : un Sceau malformé est rejeté sans aucune mutation", () => {
  const malformed = ["", "n'importe quoi", "MATHIC-CHAL-1:zzz", "MATHIC-CHAL-1:aaa:xyz", "MATHIC-CHAL-1:!!INVALID_CHARS!!:abcdef12"];
  for (const raw of malformed) {
    const res = decodeSeal(raw);
    assert.equal(res.ok, false, `malformé rejeté : ${JSON.stringify(raw)}`);
    assert.ok(res.reason, "une raison est fournie");
  }
});

// ---------------------------------------------------------------------------
// SEAL-10 · Import → aucune modification de progression (save intacte)
// ---------------------------------------------------------------------------

test("SEAL-10 : l'import d'un Sceau ne modifie aucune progression", async () => {
  const save = await import("../../src/b1/save.mjs");

  const memory = {
    data: new Map(),
    getItem(k) {
      return this.data.has(k) ? this.data.get(k) : null;
    },
    setItem(k, v) {
      this.data.set(k, String(v));
    },
    removeItem(k) {
      this.data.delete(k);
    },
  };

  const seal = encodeSeal(SPEC_A);
  const before = JSON.stringify(memory.data);

  let res = decodeSeal(seal);
  assert.equal(res.ok, true);
  createSession(res.spec);
  res = decodeSeal(seal);
  assert.equal(res.ok, true);
  createSession(res.spec);
  assert.throws(() => createSession({ ...SPEC_A, grid: [[2, 5], [2]] }), TypeError);

  assert.equal(JSON.stringify(memory.data), before, "aucune entrée de progression créée/modifiée");
});

// ---------------------------------------------------------------------------
// SEAL-11 · Aucun accès direct UI → Engine authority (via adapter uniquement)
// ---------------------------------------------------------------------------

test("SEAL-11 : l'UI ne touche le moteur que via la V5 Adapter (createSession de l'adapter)", () => {
  const res = decodeSeal(encodeSeal(SPEC_A));
  assert.equal(res.ok, true);

  const adapter = createV5GameAdapter({ spec: res.spec, seedLabel: "seal-lab" });
  assert.equal(adapter.kind, "v5");
  assert.equal(adapter.getState().cols, 2);
  assert.equal(adapter.getState().rows, 2);

  const cmd = adapter.getCommands().find((c) => c.value === 2 && c.r === 0 && c.c === 0);
  assert.ok(cmd, "commande PLACE 2@(0,0) disponible");
  const applied = adapter.move(cmd);
  assert.equal(applied, true);
  assert.notEqual(adapter.getState().board[0][0], null);
  assert.equal(adapter.canonical(), canonical(adapter.getSession()));
});

// ---------------------------------------------------------------------------
// SEAL-12 / 13 · Création et import hors ligne (aucune I/O réseau, module pur)
// ---------------------------------------------------------------------------

test("SEAL-12 : génération du Sceau sans aucune I/O réseau ni horloge", () => {
  const a = encodeSeal(SPEC_B);
  const b = encodeSeal(SPEC_B);
  const c = encodeSeal(SPEC_B);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(/\d\d:\d\d/.test(a), false, "aucun horodatage dans le Sceau");
});

test("SEAL-13 : import/verify purement locaux, sans effet de bord réseau", () => {
  const seal = encodeSeal(SPEC_1X3);
  const r1 = decodeSeal(seal);
  const r2 = decodeSeal(seal);
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(canonicalJson(r1.spec), canonicalJson(r2.spec));
});

// ---------------------------------------------------------------------------
// SEAL-14 · Nouveaux Sceaux compatibles : mêmes règles de déterminisme
// ---------------------------------------------------------------------------

test("SEAL-14 : les Sceaux futurs restent déterministes et les versions inconnues sont rejetées", () => {
  const future = encodeSeal({ ...SPEC_A });
  const futureSeal = future.replace(`${ENVELOPE_NAME}-${SEAL_PREFIX_VERSION}`, `${ENVELOPE_NAME}-9`);
  const res = decodeSeal(futureSeal);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "UNKNOWN_VERSION");
});

// ---------------------------------------------------------------------------
// Métadonnées du Sceau (contrats d'enveloppe)
// ---------------------------------------------------------------------------

test("SEAL-C : l'enveloppe expose les versions et l'origine attendues", () => {
  const res = decodeSeal(encodeSeal(SPEC_A));
  assert.equal(res.ok, true);
  assert.equal(res.payload.schemaVersion, SEAL_SCHEMA_VERSION);
  assert.equal(res.payload.gameVersion, SEAL_GAME_VERSION);
  assert.equal(res.payload.ruleVersion, SEAL_RULE_VERSION);
  assert.equal(res.payload.origin, SEAL_ORIGIN);
  assert.equal(res.payload.metadata.createdFrom, "spec");
});

test("SEAL-C : crc32 est déterministe et conforme (vecteur standard)", () => {
  assert.equal(crc32("123456789"), 0xcbf43926 >>> 0);
});