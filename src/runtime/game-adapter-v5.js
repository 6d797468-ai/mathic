import { makeEvent } from './game-adapter.js';
import {
  createSession,
  getMoves,
  apply,
  isSolved,
  getState,
  canonical,
} from '../v5/rules/engine.mjs';

// Interface (mêmes noms que GameAdapter V4, commandes V5) :
//   start() · move({value,r,c}) · undo() · restart()
//   getState() · getCommands() · subscribe(listener) · getSession()
// GameState-V5 (sérialisable) : { board: (number|null)[][], reserve, solved,
//   victory, isGameOver, rows, cols, moveIndex, movesLeft, seedLabel, spec }

export function createV5GameAdapter({ spec, seedLabel = 'lab-v5' } = {}) {
  if (!spec) throw new TypeError('createV5GameAdapter : spec requis');

  let session = createSession(spec);
  let history = [];
  const listeners = new Set();
  const emit = (e) => { for (const l of listeners) l(e); };

  const board = (s) => s.grid.map((row) => row.map((v) => (v === -1 ? null : v)));

  const snapshot = () => ({
    board: board(session),
    reserve: { ...session.reserve },
    solved: isSolved(session),
    victory: isSolved(session),
    isGameOver: isSolved(session),
    rows: session.spec.grid.length,
    cols: session.spec.grid[0].length,
    moveIndex: session.moves,
    movesLeft: null,
    seedLabel,
    spec: session.spec,
  });

  return {
    kind: 'v5',

    start() {
      session = createSession(spec);
      history = [];
      emit(makeEvent('GAME_STARTED', { seedLabel }));
    },

    move(cmd) {
      const payload = {
        id: cmd?.id ?? 'PLACE',
        v: cmd?.value ?? cmd?.v,
        r: cmd?.r,
        c: cmd?.c,
      };
      const next = apply(session, payload);
      if (!next) {
        emit(makeEvent('MOVE_REJECTED', { reason: 'ILLIGAL_PLACE', cmd }));
        return false;
      }
      history.push(session);
      session = next;
      const solved = isSolved(session);
      emit(makeEvent('PLACE_APPLIED', { value: payload.v, r: payload.r, c: payload.c, solved }));
      if (solved) emit(makeEvent('TARGET_COLLAPSED', { moves: session.moves }));
      if (solved) emit(makeEvent('GAME_OVER', { victory: true }));
      return true;
    },

    undo() {
      if (!history.length) return false;
      session = history.pop();
      emit(makeEvent('UNDO_APPLIED', { moveIndex: session.moves }));
      return true;
    },

    restart() {
      this.start();
    },

    getState() {
      return snapshot();
    },

    getCommands() {
      return getMoves(session).map((m) => ({ value: m.v, r: m.r, c: m.c, id: m.id }));
    },

    getSession() {
      return session;
    },

    canonical() {
      return canonical(session);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}