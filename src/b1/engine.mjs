import { makeBoard, numTiles, opTiles } from "./board.mjs";
import { evalFormula } from "./formula.mjs";

export const OBJECTIVE_BONUS = 10;
export const CHAIN_BONUS = 2;

export function createSession(level) {
  const board = makeBoard(level.rows, level.cols, level.tiles);
  return {
    level: { id: level.id, target: level.target, maxMoves: level.maxMoves },
    board,
    movesLeft: level.maxMoves,
    trace: [],
    events: [],
    score: 0,
    won: false,
    nextChain: 0,
  };
}

export function evaluate(state, action) {
  const ev = evalFormula(state, action);
  if (!ev.ok) return ev;
  const ca = state.board.cells[ev.a];
  const cb = state.board.cells[ev.bCell];
  const reused = (ca !== null && ca.result) || (cb !== null && cb.result);
  const chainRun = reused ? state.nextChain + 1 : 0;
  const base = Math.floor(Math.abs(ev.result) / 10);
  const chainBonus = chainRun * CHAIN_BONUS;
  return {
    ok: true,
    a: ev.a,
    op: ev.op,
    opCell: ev.opCell,
    b: ev.b,
    bCell: ev.bCell,
    result: ev.result,
    base,
    chainRun,
    chainBonus,
    delta: base + chainBonus,
    reused,
    logText: `${ev.a}:${ev.b} → ${ev.result}`,
  };
}

export function apply(state, action) {
  const ev = evaluate(state, action);
  if (!ev.ok) return null;
  const cells = state.board.cells.map((c) => (c === null ? null : { ...c }));
  cells[ev.opCell] = null;
  cells[ev.bCell] = null;
  cells[ev.a] = { id: ev.a, kind: "num", v: ev.result, result: true };
  const event = {
    a: ev.a,
    op: ev.op,
    opCell: ev.opCell,
    b: ev.b,
    bCell: ev.bCell,
    result: ev.result,
    base: ev.base,
    chainRun: ev.chainRun,
    chainBonus: ev.chainBonus,
    delta: ev.delta,
  };
  const target = state.level.target;
  const won = !state.won && ev.result === target;
  return {
    level: state.level,
    board: { ...state.board, cells },
    movesLeft: state.movesLeft - 1,
    trace: [...state.trace, { a: ev.a, op: ev.opCell, b: ev.bCell }],
    events: [...state.events, event],
    score: state.score + ev.delta,
    won,
    nextChain: ev.reused ? state.nextChain + 1 : 0,
  };
}

export function enumerateActions(state) {
  const ops = opTiles(state.board.cells);
  const nums = numTiles(state.board.cells);
  const out = [];
  for (const o of ops) {
    for (const na of nums) {
      for (const nb of nums) {
        if (na.id === nb.id) continue;
        const ev = evaluate(state, { a: na.id, op: o.id, b: nb.id });
        if (ev.ok) out.push({ a: na.id, op: o.id, b: nb.id });
      }
    }
  }
  return out;
}

export function isBlocked(state) {
  return !state.won && state.movesLeft > 0 && enumerateActions(state).length === 0;
}

export function isWon(state) {
  return state.won;
}

export function isLost(state) {
  return !state.won && state.movesLeft === 0;
}

export function finalScore(state) {
  return state.score + (state.won ? OBJECTIVE_BONUS : 0);
}

export function cellsSnapshot(state) {
  return state.board.cells.map((c) => (c === null ? null : [c.kind, c.v, c.result ? 1 : 0])).join("|");
}