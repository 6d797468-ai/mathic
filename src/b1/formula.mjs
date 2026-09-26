import { apply2, reason as kernelReason } from "./kernel.mjs";

export function cellRef(cells, id) {
  if (!Number.isInteger(id) || id < 0 || id >= cells.length) return null;
  return cells[id];
}

export function evalFormula(state, action) {
  const { a, op, b } = action;
  const len = state.board.cells.length;
  if (![a, op, b].every((id) => Number.isInteger(id) && id >= 0 && id < len)) {
    return { ok: false, reason: "référence de cellule invalide" };
  }
  if (a === op || a === b || op === b) {
    return { ok: false, reason: "il faut 3 cellules distinctes (A, opérateur, B)" };
  }
  const ca = cellRef(state.board.cells, a);
  const co = cellRef(state.board.cells, op);
  const cb = cellRef(state.board.cells, b);
  if (!ca || !co || !cb || ca.kind !== "num" || cb.kind !== "num" || co.kind !== "op") {
    return { ok: false, reason: "cellules incohérentes (opérateur sur op, nombres sur num)" };
  }
  const result = apply2(ca.v, co.v, cb.v);
  if (result === null) {
    return { ok: false, reason: kernelReason(ca.v, co.v, cb.v) };
  }
  return { ok: true, a, op: co.v, opCell: op, b: cb.v, bCell: b, result };
}