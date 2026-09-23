const OPERATORS = {
  "+": (a, b) => a + b,
  "-": (a, b) => (a - b >= 0 ? a - b : null),
  "*": (a, b) => a * b,
  "/": (a, b) => (b !== 0 && a % b === 0 ? a / b : null),
};

export const OPS = Object.keys(OPERATORS);

function evalOp(a, op, b) {
  return OPERATORS[op](a, b);
}

export function validateSpec(spec) {
  const errs = [];
  const { grid, rows, cols, reserve } = spec ?? {};
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
    errs.push("grid : tableau rectangulaire non vide requis");
  } else {
    const width = grid[0].length;
    grid.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== width) errs.push(`grid[${i}] : ${row?.length} cases ≠ ${width} (rectangle requis)`);
      row.forEach((cell, j) => {
        if (!Number.isInteger(cell)) errs.push(`grid[${i}][${j}] : case '${cell}' non entière`);
      });
    });
    if (!Array.isArray(rows) || rows.length !== grid.length) errs.push(`rows : ${rows?.length ?? "∅"} vs ${grid.length} lignes attendues`);
    if (!Array.isArray(cols) || cols.length !== width) errs.push(`cols : ${cols?.length ?? "∅"} vs ${width} colonnes attendues`);
    const line = (l, kind, i, nVals) => {
      if (!Number.isInteger(l?.target)) return errs.push(`${kind}[${i}].target : entier requis`);
      if (!Array.isArray(l?.ops)) return errs.push(`${kind}[${i}].ops : requis`);
      if (l.ops.length !== nVals - 1) errs.push(`${kind}[${i}].ops : ${l.ops.length} ≠ ${nVals - 1} opérateurs pour ${nVals} valeurs`);
      l.ops.forEach((op, k) => {
        if (!OPS.includes(op)) errs.push(`${kind}[${i}].ops[${k}] : opérateur inconnu '${op}'`);
      });
    };
    (rows ?? []).forEach((l, i) => line(l, "row", i, width));
    (cols ?? []).forEach((l, i) => line(l, "col", i, grid.length));
  }
  for (const [k, n] of Object.entries(reserve ?? {})) {
    if (!Number.isInteger(+k) || +k <= 0) errs.push(`reserve '${k}' : valeur positive entière requise`);
    if (!Number.isInteger(n) || n < 0) errs.push(`reserve[${k}] : quantité ${n} invalide`);
  }
  if (errs.length) throw new TypeError("rule-engine-v5 : spec invalide\n - " + errs.join("\n - "));
  return spec;
}

function cellRows(s) {
  return s.spec.grid.length;
}

function cellCols(s) {
  return s.spec.grid[0].length;
}

function lineDef(s, idx, kind) {
  return kind === "row" ? s.spec.rows[idx] : s.spec.cols[idx];
}

function lineOk(s, idx, kind) {
  const def = lineDef(s, idx, kind);
  const n = kind === "row" ? cellCols(s) : cellRows(s);
  const vals = [];
  for (let k = 0; k < n; k++) {
    const v = kind === "row" ? s.grid[idx][k] : s.grid[k][idx];
    if (v === -1) return true;
    vals.push(v);
  }
  let acc = vals[0];
  for (let k = 0; k < def.ops.length; k++) {
    const r = evalOp(acc, def.ops[k], vals[k + 1]);
    if (r === null) return false;
    acc = r;
  }
  return acc === def.target;
}

function sumFeasible(s) {
  const check = (idx, kind) => {
    const def = lineDef(s, idx, kind);
    if (!def.ops.every((op) => op === "+")) return true;
    const n = kind === "row" ? cellCols(s) : cellRows(s);
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const v = kind === "row" ? s.grid[idx][k] : s.grid[k][idx];
      if (v !== -1) sum += v;
    }
    return sum <= def.target;
  };
  for (let i = 0; i < cellRows(s); i++) if (!check(i, "row")) return false;
  for (let i = 0; i < cellCols(s); i++) if (!check(i, "col")) return false;
  return true;
}

export function quickReject(spec) {
  const rows = spec.rows;
  const cols = spec.cols;
  if (![...rows, ...cols].every((l) => l.ops.every((op) => op === "+"))) return false;
  const rowSum = rows.reduce((a, l) => a + l.target, 0);
  const colSum = cols.reduce((a, l) => a + l.target, 0);
  if (rowSum !== colSum) return true;
  const alloc = Object.entries(spec.reserve).reduce((a, [v, n]) => a + +v * n, 0);
  return alloc !== rowSum;
}

export function createSession(spec) {
  validateSpec(spec);
  return {
    spec,
    grid: spec.grid.map((row) => [...row]),
    reserve: { ...spec.reserve },
    moves: 0,
    events: [],
  };
}

export function isSolved(s) {
  for (let r = 0; r < cellRows(s); r++) {
    if (s.grid[r].some((c) => c === -1)) return false;
    if (!lineOk(s, r, "row")) return false;
  }
  for (let c = 0; c < cellCols(s); c++) {
    if (!lineOk(s, c, "col")) return false;
  }
  return true;
}

export function getMoves(s) {
  if (isSolved(s)) return [];
  const moves = [];
  const values = Object.keys(s.reserve).filter((v) => s.reserve[v] > 0);
  for (let r = 0; r < cellRows(s); r++) {
    for (let c = 0; c < cellCols(s); c++) {
      if (s.grid[r][c] !== -1) continue;
      for (const raw of values) {
        const v = +raw;
        const grid = s.grid.map((row) => [...row]);
        grid[r][c] = v;
        const t = { ...s, grid };
        if (lineOk(t, r, "row") && lineOk(t, c, "col") && sumFeasible(t)) {
          moves.push({ id: "PLACE", v, r, c, label: `PLACE ${v}@(${r},${c})` });
        }
      }
    }
  }
  return moves;
}

export function apply(s, cmd) {
  if (cmd.id !== "PLACE") return null;
  if (s.grid[cmd.r][cmd.c] !== -1) return null;
  if ((s.reserve[cmd.v] ?? 0) <= 0) return null;
  const grid = s.grid.map((row) => [...row]);
  grid[cmd.r][cmd.c] = cmd.v;
  const reserve = { ...s.reserve };
  reserve[cmd.v] -= 1;
  const event = { type: "PLACE", value: cmd.v, r: cmd.r, c: cmd.c };
  return {
    ...s,
    grid,
    reserve,
    events: [...s.events, event],
    moves: s.moves + 1,
  };
}

export function getState(s) {
  return {
    grid: s.grid.map((row) => [...row]),
    reserve: { ...s.reserve },
    solved: isSolved(s),
    moves: s.moves,
  };
}

export function canonical(s) {
  return JSON.stringify([s.grid]);
}

export function replay(spec, events) {
  const out = [];
  let s = createSession(spec);
  for (const ev of events) {
    if (ev.type !== "PLACE") throw new TypeError(`rule-engine-v5 : événement replay illisible ${JSON.stringify(ev)}`);
    s = apply(s, { id: "PLACE", v: ev.value, r: ev.r, c: ev.c });
    if (!s) throw new TypeError(`rule-engine-v5 : replay rejeté à ${JSON.stringify(ev)}`);
    out.push(s);
  }
  return out;
}