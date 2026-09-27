/**
 * MATHIC V6 — M28 · TEMOIN DE SOLVABILITE · SUITE ADVERSARIALE
 *
 * Ces tests n'introduisent aucune regle de jeu. Ils verifient que le witness
 * (a) SUIT le moteur V5, (b) ne peut pas etre force a conclure, (c) refuse
 * de certifier l'inexistence d'une recherche non exhaustive.
 *
 * Les assertions les plus importantes sont en NEGATION : elles prouvent que
 * les faux certificats du legacy ne peuvent pas se reproduire ici.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  proveSolvability, verifyWitness,
  SOLVABLE, UNSOLVABLE, UNPROVEN, UNSUPPORTED,
} from "../../src/v5/rules/solvability-witness.mjs";
import { createSession, isSolved, getMoves, apply, replay, canonical } from "../../src/v5/rules/engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WITNESS_SRC = join(HERE, "..", "..", "src", "v5", "rules", "solvability-witness.mjs");

// --- fixtures -----------------------------------------------------------------
const RESOLVABLE = {
  grid: [[-1, -1]], rows: [{ target: 12, ops: ["*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 },
};
const UNRESOLVABLE = {
  grid: [[-1, -1]], rows: [{ target: 13, ops: ["*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1 },
};
/** 5 est dans la reserve mais ne peut jamais etre pose legalement (col0 = 3). */
const WITH_DECOY = {
  grid: [[-1, -1]], rows: [{ target: 7, ops: ["+"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 1, 5: 1 },
};
/** Etat initial deja resolu. */
const ALREADY_SOLVED = {
  grid: [[3, 4]], rows: [{ target: 12, ops: ["*"] }],
  cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: {},
};

// =============================================================================
// 1 · LES QUATRE VERDICTS
// =============================================================================
test("M28-01a · puzzle resolvable -> PROVEN_SOLVABLE, chemin minimal, searchComplete", () => {
  const w = proveSolvability(RESOLVABLE);
  assert.equal(w.status, SOLVABLE);
  assert.equal(w.proven, true);
  assert.equal(w.established, "EXISTS");
  assert.equal(w.goalReached, true);
  assert.equal(w.searchComplete, true);
  assert.equal(w.minMoves, 2, "BFS donne la longueur minimale");
  assert.equal(w.path.length, 2);
  // chaque pas porte son empreinte d'etat
  assert.equal(w.path.length, 2);
  for (const step of w.path) assert.ok(typeof step.stateFingerprint === "string");
  assert.equal(w.final.fingerprint, canonical(replay(RESOLVABLE, w.path.map((s) =>
    ({ type: "PLACE", value: s.move.v, r: s.move.r, c: s.move.c })))[1]));
});

test("M28-01b · puzzle insoluble explore -> PROVEN_UNSOLVABLE, searchComplete=true", () => {
  const w = proveSolvability(UNRESOLVABLE);
  assert.equal(w.status, UNSOLVABLE);
  assert.equal(w.proven, true);
  assert.equal(w.established, "NOT-EXISTS");
  assert.equal(w.searchComplete, true, "l'exhaustivite est la precondition du certificat");
  assert.equal(w.goalReached, false);
  assert.equal(w.path.length, 0);
});

test("M28-01c · etat initial deja resolu -> PROVEN_SOLVABLE de longueur 0", () => {
  const w = proveSolvability(ALREADY_SOLVED);
  assert.equal(w.status, SOLVABLE);
  assert.equal(w.minMoves, 0);
  assert.equal(w.path.length, 0, "la solution vide est un chemin");
  assert.equal(w.goalReached, true);
});

test("M28-01d · demande non couverte -> UNSUPPORTED, aucune recherche", () => {
  for (const [label, spec, opts] of [
    ["spec absente", null, {}],
    ["spec non objet", 42, {}],
    ["grid invalide", { grid: "nope" }, {}],
    ["maxDepth negatif", RESOLVABLE, { maxDepth: -1 }],
    ["maxDepth non entier", RESOLVABLE, { maxDepth: 1.5 }],
    ["budget nul", RESOLVABLE, { budget: 0 }],
    ["budget non entier", RESOLVABLE, { budget: 2.5 }],
  ]) {
    const w = proveSolvability(spec, opts);
    assert.equal(w.status, UNSUPPORTED, label);
    assert.equal(w.proven, false, label);
    assert.equal(w.established, "NOTHING", label);
    assert.equal(w.nodesExpanded, 0, label);
  }
});

// =============================================================================
// 2 · LE CŒUR : REFUS DE CERTIFIER L'INEXISTENCE D'UNE RECHERCHE NON EXHAUSTIVE
//    C'est la contrepartie directe de M28-SOLVER-001.
// =============================================================================
test("M28-02a · troncature budget -> UNPROVEN, jamais PROVEN_UNSOLVABLE", () => {
  // budget=1 : un seul noeud expandu, la solution (2 coups) reste hors d'atteinte.
  const w = proveSolvability(RESOLVABLE, { budget: 1 });
  assert.equal(w.status, UNPROVEN, "budget insuffisant : aucune conclusion");
  assert.equal(w.proven, false, "budget insuffisant : rien de prouve");
  assert.equal(w.established, "NOTHING", "budget insuffisant : RIEN n'est etabli");
  assert.equal(w.searchComplete, false, "budget insuffisant : espace non epuise");
  assert.equal(w.truncatedBy, "budget");
  assert.equal(w.nodesExpanded, 1, "la borne est respectee au nodE pres");

  // Et le seuil est exact : 2 noeuds suffisent, car la solution fait 2 coups.
  // Un budget plus large ne rend pas le verdict "moins negatif" — il le confirme.
  for (const budget of [2, 3, 10, 20000]) {
    const ok = proveSolvability(RESOLVABLE, { budget });
    assert.equal(ok.status, SOLVABLE, `budget=${budget} : la preuve existe des 2 noeuds`);
    assert.equal(ok.minMoves, 2);
    assert.equal(ok.nodesExpanded, 2, "la preuve est atteinte sans gaspillage");
  }
});

test("M28-02b · troncature PROFONDEUR -> UNPROVEN (le piege du temoin)", () => {
  // 2 cellules vides => toute solution fait exactement 2 coups. Une profondeur
  // inferieure ne peut pas certifier l'inexistence : c'est le faux certificat
  // que le legacy emettait, et que ce witness doit refuser.
  const w = proveSolvability(RESOLVABLE, { maxDepth: 0 });
  assert.equal(w.status, UNPROVEN);
  assert.equal(w.proven, false);
  assert.equal(w.searchComplete, false);
  assert.equal(w.truncatedBy, "maxDepth");
  assert.equal(w.established, "NOTHING", "une recherche bornee n'etablit rien");
  // Et la raison nomme la borne fautive et le seuil a atteindre.
  assert.match(w.reason, /maxDepth=0/);
  assert.match(w.reason, /2 cellule/);
  assert.match(w.reason, /Relancer avec maxDepth >= 2/);
});

test("M28-02c · profondeur suffisante -> l'inexistence redevient certifiable", () => {
  // Meme puzzle insoluble, meme profondeur bornee, mais >= nombre de cellules.
  const w = proveSolvability(UNRESOLVABLE, { maxDepth: 2 });
  assert.equal(w.status, UNSOLVABLE, "la borne est alors exhaustive");
  assert.equal(w.searchComplete, true);
  assert.equal(w.established, "NOT-EXISTS");
});

test("M28-02d · INVARIANT : PROVEN_UNSOLVABLE implique searchComplete=true, sur 240 cas", () => {
  // Matrice : 2 specs x depths 0..5 x budgets 1..20.
  let cases = 0;
  for (const spec of [RESOLVABLE, UNRESOLVABLE, WITH_DECOY, ALREADY_SOLVED]) {
    for (let maxDepth = 0; maxDepth <= 5; maxDepth++) {
      for (let budget = 1; budget <= 20; budget++) {
        const w = proveSolvability(spec, { maxDepth, budget });
        if (w.status === UNSOLVABLE) {
          assert.equal(w.searchComplete, true, `UNSOLVABLE sans exhaustivite : d=${maxDepth} b=${budget}`);
          assert.equal(w.proven, true);
          assert.equal(w.established, "NOT-EXISTS");
        }
        if (w.status === UNPROVEN) {
          assert.equal(w.searchComplete, false);
          assert.equal(w.proven, false);
          assert.equal(w.established, "NOTHING", "UNPROVEN n'etablit rien");
          assert.equal(w.nodesExpanded <= budget, true, "budget respecte");
        }
        if (w.status === UNSUPPORTED) assert.equal(w.nodesExpanded, 0);
        assert.equal(w.status === SOLVABLE ? w.goalReached : true, true);
        cases++;
      }
    }
  }
  assert.equal(cases, 4 * 6 * 20);
});

test("M28-02e · la garde d'emission est bien dans le source", () => {
  const src = readFileSync(WITNESS_SRC, "utf8");
  assert.ok(
    src.includes("refus d'emettre PROVEN_UNSOLVABLE sans searchComplete=true"),
    "la garde de conception doit exister dans le source"
  );
  // ET la condition doit etre VIVANTE, pas seulement presente. Cette garde est
  // une defense en profondeur : aucun chemin de code actuel ne la declenche
  // (c'est precisement le but), donc aucune assertion de comportement ne peut
  // la detecter. Elle n'est donc verifiable qu'au niveau du source — et c'est
  // ce qu'on fait ici, en exigeant la condition exacte plutot que son message.
  assert.match(
    src,
    /if \(status === UNSOLVABLE && fields\.searchComplete !== true\)/,
    "la condition de la garde doit etre reelle, pas neutralisee"
  );
  assert.equal(/if \(false\)[\s\S]{0,120}refus d'emettre/.test(src), false,
    "la garde ne doit pas etre neutralisee en `if (false)`");

  // Les deux verDICTS QUI PORTENT UN POUVOIR DE PREUVE (existence et
  // inexistence) ne doivent jamais etre ecrits en dur : ils doivent tous
  // transiter par la garde. UNPROVEN et UNSUPPORTED n'etablissent rien, donc
  // leur construction litterale est sans danger.
  const forged = src.match(/status:\s*(SOLVABLE|UNSOLVABLE)\b/g) || [];
  assert.deepEqual(forged, [],
    `aucun verdict portant preuve ne doit etre construit en dur : ${JSON.stringify(forged)}`);
  // Tous les verdicts etablissants passent par le point unique `build(...)`.
  for (const call of [/\bbuild\(SOLVABLE\b/, /\bbuild\(UNSOLVABLE\b/, /\bbuild\(UNPROVEN\b/]) {
    assert.match(src, call, "tout verdict doit passer par la garde build()");
  }
});

// =============================================================================
// 3 · LEGALITE (getMoves) vs EXECUTABILITE (apply/replay)
//    Ces deux notions sont DISTINCTES, et la distinction est obligatoire.
// =============================================================================
test("M28-03a · apply() et replay() acceptent un coup qui casse une ligne ; getMoves() non", () => {
  // Temoin de verite du piege. 5 dans la reserve, mais col0 doit valoir 3.
  const s0 = createSession(WITH_DECOY);
  const illegal = { id: "PLACE", v: 5, r: 0, c: 0 };

  assert.equal(apply(s0, illegal) !== null, true, "apply est PERMISSIF : il accepte le coup");
  assert.equal(isSolved(apply(s0, illegal)), false, "…mais la ligne est fausse");
  assert.equal(
    EQUAL5(getMoves(s0), 5), false,
    "getMoves, seul oracle de legalite, ne propose JAMAIS 5"
  );
  let replayAccepted = false;
  try { replayAccepted = replay(WITH_DECOY, [{ type: "PLACE", value: 5, r: 0, c: 0 }]).length === 1; } catch { /* refuse */ }
  assert.equal(replayAccepted, true, "replay est permissif lui aussi, puisqu'il passe par apply");
});

function EQUAL5(moves, v) { return moves.some((m) => m.v === v); }

test("M28-03b · le witness ne propose JAMAIS le coup illegal, meme en resolvant le puzzle", () => {
  const w = proveSolvability(WITH_DECOY);
  assert.equal(w.status, SOLVABLE);
  const values = w.path.map((s) => s.move.v);
  assert.equal(values.includes(5), false, "le leurre ne doit apparaitre dans aucun chemin certifie");
  assert.deepEqual(values.sort(), [3, 4]);
});

test("M28-03c · un chemin FABRIQUE, executable mais illegal, est refuse au rejeu", () => {
  // On construit a la main un chemin que apply/replay acceptent (donc
  // « executable ») mais que V5 interdit. Il doit etre rejete sur l'axe
  // LEGALITE, ce qui prouve que l'axe existe et n'est pas decoratif.
  const forged = {
    status: SOLVABLE, path: [{ move: { id: "PLACE", v: 5, r: 0, c: 0 }, stateFingerprint: "x" }],
    final: { fingerprint: "forgee" },
  };
  const r = verifyWitness(forged, WITH_DECOY);
  assert.equal(r.ok, false, "un chemin illegal ne peut pas etre valide");
  assert.equal(r.executable, true, "…et pourtant il EST executable : les deux axes sont distincts");
  assert.equal(r.legal, false, "l'axe de legalite est ce qui le refuse");
  assert.equal(r.matches, false);
});

test("M28-03d · un chemin factory dont l'empreinte finale est fausse est refuse", () => {
  const good = proveSolvability(RESOLVABLE);
  const tampered = { ...good, final: { ...good.final, fingerprint: '[[[99]]]' } };
  const r = verifyWitness(tampered, RESOLVABLE);
  assert.equal(r.legal, true);
  assert.equal(r.executable, true);
  assert.equal(r.matches, false, "l'empreinte certifiee ne correspond pas au rejeu");
  assert.equal(r.ok, false);
});

test("M28-03e · verifyWitness refuse un witness non PROVEN_SOLVABLE, ou sans spec", () => {
  assert.equal(verifyWitness(proveSolvability(UNRESOLVABLE), UNRESOLVABLE).ok, false);
  assert.equal(verifyWitness(proveSolvability(RESOLVABLE), null).ok, false);
  assert.equal(verifyWitness(null, RESOLVABLE).ok, false);
  assert.match(verifyWitness(proveSolvability(RESOLVABLE), null).reason, /jamais devinee/);
});

test("M28-03f · le chemin certifie se rejoue integralement, coup par coup", () => {
  const w = proveSolvability(RESOLVABLE);
  const r = verifyWitness(w, RESOLVABLE);
  assert.equal(r.ok, true);
  assert.equal(r.legal, true);
  assert.equal(r.executable, true);
  assert.equal(r.matches, true);
  assert.equal(r.steps, 2);
  // Rejeu manuel, coup par coup, en redemandant l'legalite a chaque etape.
  let s = createSession(RESOLVABLE);
  for (const step of w.path) {
    const offered = getMoves(s).find((m) => m.id === step.move.id && m.v === step.move.v
      && m.r === step.move.r && m.c === step.move.c);
    assert.ok(offered, `le coup ${step.move.v} doit etre offert par getMoves`);
    s = apply(s, offered);
    assert.equal(canonical(s), step.stateFingerprint, "l'empreinte intermediaire doit etre exacte");
  }
  assert.equal(isSolved(s), true);
});

// =============================================================================
// 4 · DETERMINISME
// =============================================================================
test("M28-04 · deux executions rendent un witness strictement identique", () => {
  for (const spec of [RESOLVABLE, UNRESOLVABLE, WITH_DECOY]) {
    const a = proveSolvability(spec);
    const b = proveSolvability(spec);
    assert.equal(JSON.stringify(a), JSON.stringify(b), "aucune derive : ni alea, ni horloge, ni worker");
  }
});

test("M28-04b · le witness est fige : on ne peut pas le muter apres coup", () => {
  const w = proveSolvability(RESOLVABLE);
  assert.throws(() => { "use strict"; w.status = UNSOLVABLE; }, TypeError);
  assert.throws(() => { "use strict"; w.path.push({}); }, TypeError);
});

test("M28-04c · la longueur certifiee est bien la minimale (force brute independante)", () => {
  // Reference independante du witness : recherche en largeur par niveaux,
  // ecrite ici, sans reutiliser proveSolvability.
  const bruteForceMin = (spec, cap = 6) => {
    const start = createSession(spec);
    if (isSolved(start)) return 0;
    let frontier = [start];
    for (let d = 1; d <= cap; d++) {
      const next = [];
      for (const s of frontier) {
        for (const mv of getMoves(s)) {
          const n = apply(s, mv);
          if (!n) continue;
          if (isSolved(n)) return d;
          next.push(n);
        }
      }
      if (next.length === 0) return Infinity;
      frontier = next;
    }
    return Infinity;
  };
  const w = proveSolvability(RESOLVABLE);
  assert.equal(w.minMoves, bruteForceMin(RESOLVABLE), "BFS du witness == reference par niveaux");
  assert.equal(w.minMoves, 2);
  assert.equal(bruteForceMin(UNRESOLVABLE), Infinity, "l'autre n'a aucune solution");
});

// =============================================================================
// 5 · NE PAS POUVOIR FORCER UN PROVEN
// =============================================================================
test("M28-05a · aucune spec non couverte ne renvoie PROVEN", () => {
  for (const bad of [null, 0, "", [], NaN, { grid: [[-1]], rows: "x" }, { grid: [[-1, -1]] }]) {
    for (const opts of [{}, { maxDepth: 0 }, { budget: 1 }]) {
      const w = proveSolvability(bad, opts);
      assert.equal(w.proven, false, `spec=${JSON.stringify(bad)} opts=${JSON.stringify(opts)}`);
      assert.notEqual(w.status, SOLVABLE);
    }
  }
});

test("M28-05b · un puzzle insoluble ne peut pas devenir PROVEN_SOLVABLE parosse de budget", () => {
  for (let budget = 1; budget <= 40; budget++) {
    const w = proveSolvability(UNRESOLVABLE, { budget, maxDepth: 8 });
    assert.notEqual(w.status, SOLVABLE, `budget=${budget} : aucun budget ne peut creer une solution`);
  }
});

test("M28-05c · aucun budget, aucune profondeur ne fabrique une solution inexistante", () => {
  // Croisement complet sur le puzzle insoluble.
  for (let maxDepth = 0; maxDepth <= 8; maxDepth++) {
    for (const budget of [1, 2, 5, 17, 100, 20000]) {
      const w = proveSolvability(UNRESOLVABLE, { maxDepth, budget });
      assert.notEqual(w.status, SOLVABLE, `d=${maxDepth} b=${budget}`);
    }
  }
});

test("M28-05d · le leurre ne peut pas deguiser un puzzle insoluble en solvable", () => {
  // Meme puzzle que RESOLVABLE mais avec une valeur qui ne peut pas etre posee.
  const w = proveSolvability({
    grid: [[-1, -1]], rows: [{ target: 12, ops: ["*"] }],
    cols: [{ target: 3, ops: [] }, { target: 4, ops: [] }], reserve: { 3: 1, 4: 0, 5: 1 },
  });
  assert.notEqual(w.status, SOLVABLE);
});

// =============================================================================
// 6 · SOUDAINE : AUCUNE SEMANTIQUE DUPLIQUEE
// =============================================================================
test("M28-06a · le witness n'importe QUE le moteur souverain, et rien d'autre", () => {
  const src = readFileSync(WITNESS_SRC, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(imports, ["./engine.mjs"], `imports inattendus : ${JSON.stringify(imports)}`);
  // Aucun import du legacy.
  assert.ok(!imports.some((i) => i.includes("solver")));
});

test("M28-06b · le witness ne contient aucune table d'operateurs ni regle de jeu", () => {
  const src = readFileSync(WITNESS_SRC, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const token of [
    "lineOk", "evalOp", "sumFeasible", "quickReject", "validateSpec",
    "OPERATORS", "OPS", "cellRows", "cellCols", "rows", "cols", "target", "ops",
  ]) {
    assert.ok(!new RegExp(`\\b${token}\\b`).test(code),
      `interdit dans le witness : ${token} (semantique dupliquee)`);
  }
});

test("M28-06c · le witness ne fait aucun calcul ni comparaison de jeu", () => {
  const src = readFileSync(WITNESS_SRC, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const token of ["+ -", "* -", "**", "sum"]) {
    assert.ok(!code.includes(token), `interdit : ${token}`);
  }
  // `reduce` n'est admis que pour le comptage des cellules vides, qui est un
  // fait structurel (une cellule par coup), pas une regle de jeu.
  assert.equal((code.match(/reduce\(/g) || []).length, 1, "un seul reduce, le comptage des cellules vides");
});

test("M28-06c-bis · le witness ne contient AUCUNE valeur de jeu (liste blanche de litteraux)", () => {
  // Piege eprouve : une mutation comparant une cellule a un litteral
  // (`start.grid[0][0] === 3`) echappait a une detection « nombre === nombre ».
  // On verifie donc l'INVENTAIRE COMPLET des litteraux numeriques du code.
  const src = readFileSync(WITNESS_SRC, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/`(?:[^`\\]|\\.)*`/g, " STR ")
    .replace(/'(?:[^'\\]|\\.)*'/g, " STR ")
    .replace(/"(?:[^"\\]|\\.)*"/g, " STR ");

  const found = [...new Set(code.match(/\b\d+\b/g) || [])].sort((a, b) => a - b);
  // 0 et 1 : indices et compteurs. -1 : la cellule vide (constante de structure
  // du plateau). 8 et 20000 : les bornes par defaut de DEFAULTS, declarees une
  // seule fois. Toute autre valeur serait une regle de jeu introduite dans le witness.
  assert.deepEqual(found, ["0", "1", "8", "20000"],
    `litteraux inattendus dans le witness (regle de jeu ?) : ${JSON.stringify(found)}`);

  // Et le plateau n'est lu que pour compter les cellules vides.
  const gridLines = code.split("\n").map((l) => l.trim()).filter((l) => l.includes("grid"));
  assert.equal(gridLines.length, 2, `lectures de grille inattendues : ${JSON.stringify(gridLines)}`);
  assert.ok(gridLines.some((l) => l.includes("emptyCells") && l.includes("=== -1")),
    "le comptage des cellules vides doit rester present");
  assert.ok(gridLines.every((l) => l.includes("grid.map") || l.includes("emptyCells")),
    `aucune autre lecture du plateau : ${JSON.stringify(gridLines)}`);
});

test("M28-06d · la deduction des cellules vides est un fait V5, verifie par test", () => {
  // L'invariant qui rend `canonical` (plateau seul) sound : a racine fixee,
  // le plateau determine le multiset pose, donc la reserve. Si un `apply()`
  // cessait de decrementer la reserve, cet invariant casse — voici le garde.
  for (const spec of [RESOLVABLE, UNRESOLVABLE, WITH_DECOY]) {
    const start = createSession(spec);
    const seen = new Map();
    const queue = [start];
    while (queue.length) {
      const s = queue.shift();
      const key = canonical(s);
      if (seen.has(key)) {
        assert.deepEqual(seen.get(key), s.reserve,
          "meme plateau => meme reserve (invariant de deduplication)");
        continue;
      }
      seen.set(key, { ...s.reserve });
      for (const mv of getMoves(s)) {
        const n = apply(s, mv);
        if (n) queue.push(n);
      }
    }
    assert.ok(seen.size > 1, "l'invariant doit etre exerce sur une vraie arborescence");
  }
});

// =============================================================================
// 7 · LE WITNESS NE CONNAIT PAS LE LEGACY
// =============================================================================
test("M28-07 · le witness ignore l'existence du legacy certify()", () => {
  const src = readFileSync(WITNESS_SRC, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(!/\bcertify\b/.test(code), "aucune reference a certify() dans le code du witness");
});
