// ============================================================================
// SPIKE — PORTAGE N1..N3 (b1) → SPECS V5 (version fair-play, v2)
// ----------------------------------------------------------------------------
// Méthode (zéro modification moteur) :
//   1. VÉRITÉ b1 : BFS exhaustif sur le moteur b1 réel — toutes les issues,
//      nb de chemins gagnants, longueur minimale.
//   2. TRADUCTION fair-play : la meilleure forme candidate de chaque niveau en
//      spec V5 (A : la formule gagnante devient une ligne 1×N) ; si ops.length
//      ≠ numérateurs-1, la traduction exige une spec PAR paire gagnante
//      (« éclatement de niveau ») — démontré, pas affirmé.
//   3. PREUVE DU VERROU COLONNES : dans V5, une ligne 1×N a des colonnes à une
//      cellule dont la cible est une égalité stricte → toute cible de colonne
//      fige une valeur. Test réel sur N2 (« Deux Chemins ») : une spec qui
//      admet 2+3 exclut mécaniquement 4+1.
//   4. DELTAS : k = nombre de règles que V5 devrait gagner. Chiffré.
// ============================================================================

import { createSession as b1Session, apply as b1Apply, enumerateActions, isWon, isLost, isBlocked } from "../src/b1/engine.mjs";
import { LADDER } from "../src/b1/levels.mjs";
import { validateSpec, createSession as v5Session, apply as v5Apply, isSolved, getMoves } from "../src/v5/rules/engine.mjs";
import { certify } from "../src/v5/rules/solver.mjs";

// ---------------------------------------------------------------------------
// 1. Vérité b1 — BFS exhaustif
// ---------------------------------------------------------------------------

function b1Truth(level) {
  const start = b1Session(level);
  const q = [[start, []]];
  const seen = new Set();
  const winPaths = [];
  const outcomes = { won: 0, lost: 0, blocked: 0 };
  while (q.length) {
    const [s, path] = q.shift();
    const key = s.board.cells.map((c) => (c === null ? "-" : `${c.kind}:${c.v}:${c.result ? 1 : 0}`)).join("|") + `#${s.movesLeft}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isWon(s)) { outcomes.won++; winPaths.push(path); continue; }
    if (isLost(s)) { outcomes.lost++; continue; }
    if (isBlocked(s)) { outcomes.blocked++; continue; }
    for (const a of enumerateActions(s)) {
      const n = b1Apply(s, a);
      if (n) q.push([n, [...path, a]]);
    }
  }
  // formules gagnantes lisibles : a op b = cible
  const formulas = winPaths.map((p) => {
    const e = p[0];
    return `${level.tiles[e.a].v} ${level.tiles[e.op].v} ${level.tiles[e.b].v}`;
  });
  return { outcomes, winCount: winPaths.length, minLen: Math.min(...winPaths.map((p) => p.length)), formulas, totalStates: seen.size };
}

// ---------------------------------------------------------------------------
// 2. Traduction fair-play — la meilleure forme candidate
// ---------------------------------------------------------------------------

function reserveOf(vals) {
  const r = {};
  for (const v of vals) r[v] = (r[v] ?? 0) + 1;
  return r;
}

// A : traduire la formule [a1 op1 a2 ...] en ligne 1×N, colonnes qui figent
// chaque opérande (inéductable — V5 exige une cible par colonne).
function specFromFormula(operands, ops, target) {
  const grid = [Array(operands.length).fill(-1)];
  return {
    grid,
    rows: [{ ops: [...ops], target }],
    cols: operands.map((v) => ({ ops: [], target: v })), // FIGE chaque opérande
    reserve: reserveOf(operands),
    _operands: operands,
  };
}

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------

const report = [];
for (const id of ["N1", "N2", "N3"]) {
  const level = LADDER.find((l) => l.id === id);
  const truth = b1Truth(level);
  const nums = level.tiles.filter((t) => t.kind === "num").map((t) => t.v);
  const ops = level.tiles.filter((t) => t.kind === "op").map((t) => t.v);
  const entry = { id, name: level.name, truth, translation: null, proof: null };

  if (ops.length === nums.length - 1) {
    // N1 : la forme de la tuilerie EST une formule → traduction directe
    const spec = specFromFormula(nums, ops, level.target);
    let v5 = null;
    try {
      validateSpec(spec);
      const c = certify(spec, { maxDepth: 10, budget: 20000 });
      v5 = { valid: true, ...c };
    } catch (err) {
      v5 = { valid: false, reason: err.message.split("\n")[0] };
    }
    entry.translation = { kind: "DIRECTE (1 spec)", spec, v5 };
  } else {
    // N2/N3 : ops.length < nums-1 → il faut UNE spec PAR paire gagnante
    const perFormula = truth.formulas.map((f) => {
      const [a, op, b] = f.split(" ");
      const spec = specFromFormula([+a, +b], [op], level.target);
      try {
        validateSpec(spec);
        const c = certify(spec, { maxDepth: 10, budget: 20000 });
        return { formula: f, valid: true, solvable: c.solvable, solutions: c.solutions };
      } catch (err) {
        return { formula: f, valid: false };
      }
    });
    entry.translation = { kind: `ÉCLATÉE (${truth.formulas.length} specs pour 1 niveau)`, perFormula };
  }

  // 3. Preuve du verrou colonnes sur N2 : {2,3} vs {4,1} — exclusion mécanique
  if (id === "N2") {
    const mk = (pin) => specFromFormula(pin, ["+"], level.target);
    const spec23 = mk([2, 3]);
    const spec41 = mk([4, 1]);
    const c23 = certify(spec23, { maxDepth: 10, budget: 20000 });
    const c41 = certify(spec41, { maxDepth: 10, budget: 20000 });
    // tentative : UNE seule spec 1×2 sans figer — impossible par construction :
    // les cibles de colonnes DOIVENT être spécifiées (validateSpec l'exige).
    let unfixable = null;
    try {
      validateSpec({
        grid: [[-1, -1]],
        rows: [{ ops: ["+"], target: 5 }],
        cols: [{ ops: [] }, { ops: [] }], // cibles absentes → invalide ?
        reserve: { 2: 1, 3: 1, 4: 1, 1: 1 },
      });
      unfixable = "cols sans target ACCEPTÉES (à re-examiner)";
    } catch {
      unfixable = "cols sans target REJETÉES par validateSpec (target entier requis) → figer est OBLIGATOIRE";
    }
    entry.proof = { spec23_solutions: c23.solutions, spec41_solutions: c41.solutions, unfixable };
  }
  report.push(entry);
}

for (const r of report) {
  console.log(`\n=== ${r.id} — ${r.name} ===`);
  console.log(`b1 réel : états=${r.truth.totalStates} won=${r.truth.outcomes.won} lost=${r.truth.outcomes.lost} blocked=${r.truth.outcomes.blocked} cheminsGagnants=${r.truth.winCount} formules=[${r.truth.formulas.join(" | ")}]`);
  if (r.translation.kind.startsWith("DIRECTE")) {
    console.log(`traduction : ${r.translation.kind} → valid=${r.translation.v5.valid} solvable=${r.translation.v5.solvable} solutions=${r.translation.v5.solutions} (permutations des opérandes figés)`);
  } else {
    for (const f of r.translation.perFormula) console.log(`  spec par formule [${f.formula}] → valid=${f.valid} solvable=${f.solvable} solutions=${f.solutions}`);
    console.log(`=> ${r.translation.kind}`);
  }
  if (r.proof) {
    console.log(`preuve verrou colonnes : spec figée {2,3} → ${r.proof.spec23_solutions} solutions ; spec figée {4,1} → ${r.proof.spec41_solutions} solutions ; ${r.proof.unfixable}`);
  }
}

console.log(`
=== DELTAS NOYAU (k) — règles que V5 devrait GAGNER pour porter la campagne ===
D1  Cellule-opérateur positionnée (le geste « choisir l'op et son couple »)
D2  Fusion avec consommation + réécriture de tuiles (a⊕b→résultat, chaînes)
D3  Terminalité win/lose/blocked + budget de coups (isSolved est binaire)
D4  Score + bonus de chaîne (la pédagogie « rapide vs préparée »)
D5  Colonnes non-figées (cible de colonne = égalité stricte obligatoire)
D6  Niveaux à choix multi-formules : impossibles en 1 spec (éclatement prouvé)

k = 6, dont 2 STRUCTURELS (D1, D5) : ils ne sont pas des additions, ce sont
des changements de grammaire du noyau V5.
`);
