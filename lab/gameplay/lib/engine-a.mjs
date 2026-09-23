import { eval2 } from "./oprel.mjs";

export function create(spec) {
  return {
    spec,
    line: [...spec.line],
    queue: [...spec.queue],
    budget: spec.budget,
    moves: 0,
    spent: [],
    events: [],
    forbid: spec.forbid ?? [],
    require: spec.require ?? [],
    sequence: !!spec.sequence,
    preserve: spec.preserve ?? [],
    cap: spec.cap ?? Infinity,
    objective: spec.objective, // { type: "EXACT_VALUE", value }
  };
}

export function isSolved(s) {
  const hit = s.line.some((v) => v === s.objective.value);
  const reqOk = s.require.every((op) => s.spent.includes(op));
  return hit && reqOk;
}

export function getMoves(s) {
  if (isSolved(s)) return [];
  const moves = [];
  const avail = s.queue.filter((op) => !s.forbid.includes(op));
  for (const op of avail) {
    if (s.sequence && op !== s.queue[0]) continue;
    for (let i = 0; i < s.line.length - 1; i++) {
      if (s.preserve.includes(s.line[i]) || s.preserve.includes(s.line[i + 1])) continue;
      const r = eval2(s.line[i], op, s.line[i + 1]);
      if (r === null || r > s.cap) continue;
      moves.push({ op, i, r });
    }
  }
  return moves;
}

export function apply(s, mv) {
  if (s.budget <= 0) return null;
  if (s.sequence && mv.op !== s.queue[0]) return null;
  if (s.forbid.includes(mv.op)) return null;
  const a = s.line[mv.i];
  const b = s.line[mv.i + 1];
  if (s.preserve.includes(a) || s.preserve.includes(b)) return null;
  const r = eval2(a, mv.op, b);
  if (r === null || r > s.cap) return null;
  const line = [...s.line];
  line.splice(mv.i, 2, r);
  const qi = s.queue.indexOf(mv.op);
  const queue = [...s.queue];
  if (qi >= 0) queue.splice(qi, 1);
  const spent = [...s.spent, mv.op];
  const events = [...s.events, `CHAIN ${a} ${mv.op} ${b} => ${r}`];
  if (line.some((v) => v === s.objective.value)) events.push(`TARGET_REACHED ${s.objective.value}`);
  return {
    ...s,
    line,
    queue,
    spent,
    events,
    moves: s.moves + 1,
    budget: s.budget - 1,
  };
}

export function canonical(s) {
  return JSON.stringify([s.line, s.queue]);
}