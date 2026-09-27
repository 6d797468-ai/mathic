import { renderGrid } from "./board.mjs";

export function describe(level, state) {
  const allowed = new Set();
  for (const c of state.board.cells) if (c !== null && c.kind === "op") allowed.add(c.v);
  return (
    `NIVEAU ${state.level.id} « ${level.name} »    OBJECTIF : ${state.level.target}    COUPS : ${state.movesLeft}/${state.level.maxMoves}    SCORE : ${state.score}\n` +
    `${renderGrid(state.board)}\n` +
    `Opérateurs autorisés (tuiles) : ${[...allowed].join(" ")} — chaque tuile opérateur est CONSOMMÉE quand utilisée`
  );
}