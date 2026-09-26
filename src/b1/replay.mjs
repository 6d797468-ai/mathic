import { createSession, apply, cellsSnapshot } from "./engine.mjs";

export function replay(level, actions) {
  let state = createSession(level);
  const steps = [
    { action: null, event: null, snapshot: cellsSnapshot(state) },
  ];
  for (const act of actions) {
    const nxt = apply(state, act);
    if (!nxt) {
      return { ok: false, step: steps.length - 1, reason: "action invalide dans la trace" };
    }
    steps.push({
      action: act,
      event: nxt.events[nxt.events.length - 1],
      snapshot: cellsSnapshot(nxt),
    });
    state = nxt;
  }
  return { ok: true, steps, final: state };
}

export function sameFinalState(a, b) {
  return cellsSnapshot(a) === cellsSnapshot(b) && a.score === b.score && a.won === b.won;
}