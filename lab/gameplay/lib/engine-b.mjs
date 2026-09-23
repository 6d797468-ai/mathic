import { eval2 } from "./oprel.mjs";

// Grilles rectangulaires : rows == grid.length, cols == grid[0].length.
// Case vide = -1. reserve = multiset {valeur: nbDisponibles}.

function def(s, idx, kind) {
  return kind === "row" ? s.spec.rows[idx] : s.spec.cols[idx];
}

function rowLen(s) {
  return s.spec.grid[0].length;
}

function colLen(s) {
  return s.spec.grid.length;
}

function lineOk(s, idx, kind) {
  const d = def(s, idx, kind);
  const len = kind === "row" ? rowLen(s) : colLen(s);
  const vals = [];
  for (let k = 0; k < len; k++) {
    const v = kind === "row" ? s.grid[idx][k] : s.grid[k][idx];
    if (v === -1) return true; // ligne incomplète : non encore décidable
    vals.push(v);
  }
  let acc = vals[0];
  for (let k = 0; k < d.ops.length; k++) {
    const r = eval2(acc, d.ops[k], vals[k + 1]);
    if (r === null) return false;
    acc = r;
  }
  return acc === d.target;
}

// Prune saine : lignes/colonnes purement '+' : une somme partielle déjà > target => état infaisable.
function sumFeasible(s) {
  const check = (idx, kind) => {
    const d = def(s, idx, kind);
    if (!d.ops.every((op) => op === "+")) return true;
    const len = kind === "row" ? rowLen(s) : colLen(s);
    let sum = 0;
    for (let k = 0; k < len; k++) {
      const v = kind === "row" ? s.grid[idx][k] : s.grid[k][idx];
      if (v !== -1) sum += v;
    }
    return sum <= d.target;
  };
  const rowsN = colLen(s);
  const colsN = rowLen(s);
  for (let i = 0; i < rowsN; i++) if (!check(i, "row")) return false;
  for (let i = 0; i < colsN; i++) if (!check(i, "col")) return false;
  return true;
}

function lineTargets(s) {
  let t = 0;
  for (const r of s.spec.rows) t += r.target;
  for (const c of s.spec.cols) t += c.target;
  return t;
}

export function create(spec) {
  return {
    spec,
    grid: spec.grid.map((row) => [...row]),
    reserve: { ...spec.reserve },
    moves: 0,
    events: [],
  };
}

export function isSolved(s) {
  const rowsN = colLen(s);
  const colsN = rowLen(s);
  for (let r = 0; r < rowsN; r++) {
    if (s.grid[r].some((c) => c === -1)) return false;
    if (!lineOk(s, r, "row")) return false;
  }
  for (let c = 0; c < colsN; c++) {
    if (!lineOk(s, c, "col")) return false;
  }
  return true;
}

export function getMoves(s) {
  if (isSolved(s)) return [];
  const moves = [];
  const values = Object.keys(s.reserve).filter((v) => s.reserve[v] > 0);
  const rowsN = colLen(s);
  const colsN = rowLen(s);
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < colsN; c++) {
      if (s.grid[r][c] !== -1) continue;
      for (const raw of values) {
        const v = +raw;
        const grid = s.grid.map((row) => [...row]);
        grid[r][c] = v;
        const t = { ...s, grid };
        if (lineOk(t, r, "row") && lineOk(t, c, "col") && sumFeasible(t)) {
          moves.push({ r, c, v });
        }
      }
    }
  }
  return moves;
}

export function apply(s, mv) {
  if (s.grid[mv.r][mv.c] !== -1) return null;
  if ((s.reserve[mv.v] ?? 0) <= 0) return null;
  const grid = s.grid.map((row) => [...row]);
  grid[mv.r][mv.c] = mv.v;
  const reserve = { ...s.reserve };
  reserve[mv.v] -= 1;
  const events = [...s.events, `PLACE ${mv.v}@(${mv.r},${mv.c})`];
  return { ...s, grid, reserve, events, moves: s.moves + 1 };
}

export function canonical(s) {
  return JSON.stringify([s.grid]);
}

// Vérification arithmétique rapide (refus immédiat si impossible), valable uniquement grilles tout-'+'.
// Chaque cellule appartient à une ligne ET une colonne : les deux partitions doivent totaliser pareil,
// et la réserve doit fournir exactement ce total.
export function quickReject(s) {
  const rows = s.spec.rows;
  const cols = s.spec.cols;
  if (![...rows, ...cols].every((l) => l.ops.every((op) => op === "+"))) return false;
  const rowSum = rows.reduce((a, l) => a + l.target, 0);
  const colSum = cols.reduce((a, l) => a + l.target, 0);
  if (rowSum !== colSum) return true;
  const alloc = Object.entries(s.reserve).reduce((a, [v, n]) => a + +v * n, 0);
  return alloc !== rowSum;
}