/**
 * K1 — RUNTIME ADAPTER (Équipe Kali, brique Runtime/Mobile/Delivery)
 *
 * Frontière explicite :  UI → GameAdapter → (GameSession V3 aujourd'hui, Core V4 demain)
 *
 * Le runtime/UI ne connaît JAMAIS les détails internes du moteur : il parle
 * uniquement le contrat GameAdapter ci-dessous et reçoit des événements POJO
 * (GAME-EVENTS-V1) + un GameState sérialisable (GAME-STATE-V1).
 *
 * Deux implémentations derrière la même interface :
 *   - createAdapter('v3')   → pont réel sur le socle V3 (slideBoard/Calvados/effondrement)
 *   - createAdapter('mock') → variant déterministe seedé, pour développer la
 *     runtime sans dépendre du GameCore lkaddafi tant que l'intégration réelle
 *     n'est pas effectuée (feuille de route §3).
 *
 * Périmètre Kali respecté : ce module n'implémente AUCUNE règle mathématique —
 * il orchestre les fonctions du moteur et traduit les résultats en événements.
 */

import { slideBoard, hasAnyMove } from '../board.js';

// ---------------------------------------------------------------------------
// Contrat (documentation exécutable)
// ---------------------------------------------------------------------------

/**
 * interface GameAdapter {
 *   start(): void;
 *   move(dir: 'up'|'down'|'left'|'right', op: 'add'|'sub'|'mul'|'div'): boolean;
 *   undo(): boolean;
 *   restart(): void;
 *   getState(): GameState;
 *   subscribe(listener: (event: GameEvent) => void): () => void;
 * }
 *
 * type GameState = {            // sérialisable (JSON.stringify sans perte)
 *   board: (number|null)[][], rows, cols, target,
 *   score, moveIndex, movesLeft?, isGameOver, victory
 * }
 *
 * Événements émis (POJO, horodatés, aucun DOM) :
 *   GAME_STARTED · MOVE_APPLIED · MOVE_REJECTED · MERGE_OCCURRED ·
 *   TARGET_COLLAPSED · UNDO_APPLIED · GAME_OVER
 */

// ---------------------------------------------------------------------------
// Fabrique d'événements (pure, réutilisable par les deux implémentations)
// ---------------------------------------------------------------------------

export function makeEvent(type, fields = {}) {
  return { type, timestamp: Date.now(), ...fields };
}

// ---------------------------------------------------------------------------
// Fabrique d'état
// ---------------------------------------------------------------------------

export function makeState({ rows, cols, target, seedLabel = '' }) {
  return {
    board: Array.from({ length: rows }, () => Array(cols).fill(null)),
    rows,
    cols,
    target,
    score: 0,
    moveIndex: 0,
    movesLeft: null,
    isGameOver: false,
    victory: false,
    seedLabel,
  };
}

// ---------------------------------------------------------------------------
// Implémentation MOCK — déterministe, seedée (xorshift32 interne)
// ---------------------------------------------------------------------------

export function createMockAdapter({ rows = 4, cols = 4, target = 24, seed = 42, initialTiles = 8 } = {}) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));

  let state = makeState({ rows, cols, target, seedLabel: `mock:${seed}` });
  const listeners = new Set();
  const emit = (e) => { for (const l of listeners) l(e); };
  const clone = () => JSON.parse(JSON.stringify(state));

  const spawnMock = () => {
    const empty = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (state.board[r][c] === null) empty.push([r, c]);
    if (!empty.length) return null;
    const [row, col] = empty[int(0, empty.length - 1)];
    state.board[row][col] = int(1, 5);
    return { row, col, value: state.board[row][col] };
  };

  // Glissement générique mock : compacte chaque ligne vers `dir` puis fusionne
  // les paires VALIDES selon l'opérateur (règles V3, strictes, hors VALUE_CAP
  // volontairement simplifiée côté mock — le mock n'est pas une autorité).
  const OPS = {
    add:  (a, b) => ({ ok: true, v: a + b }),
    sub:  (a, b) => (a > b ? { ok: true, v: a - b } : { ok: false }),
    mul:  (a, b) => ({ ok: true, v: a * b }),
    div:  (a, b) => (b !== 0 && a % b === 0 ? { ok: true, v: a / b } : { ok: false }),
  };

  const slideMock = (dir, op) => {
    const fn = OPS[op];
    if (!fn) return { moved: false };
    let moved = false, gained = 0;
    const merges = [];
    const lineIdx = dir === 'left' || dir === 'right' ? 'row' : 'col';
    for (let i = 0; i < (lineIdx === 'row' ? rows : cols); i++) {
      const cells = [];
      for (let j = 0; j < (lineIdx === 'row' ? cols : rows); j++) {
        const r = lineIdx === 'row' ? i : j;
        const c = lineIdx === 'row' ? j : i;
        cells.push({ r, c, v: state.board[r][c] });
      }
      if (dir === 'right' || dir === 'down') cells.reverse();
      const vals = cells.filter((x) => x.v !== null);
      const out = [];
      for (let k = 0; k < vals.length; k++) {
        const a = vals[k], b = vals[k + 1];
        if (b !== undefined) {
          const res = fn(a.v, b.v);
          if (res.ok) {
            out.push({ r: b.r, c: b.c, v: res.v, from: [a, b] });
            gained += res.v;
            merges.push({ at: { row: b.r, col: b.c }, value: res.v, operands: [a, b].map((o) => ({ row: o.r, col: o.c, value: o.v })) });
            k++; // deux tuiles consommées
            continue;
          }
        }
        out.push({ r: a.r, c: a.c, v: a.v, from: [a] });
      }
      // réécrit la ligne (positions recalculées dans le sens du swipe)
      for (let j = 0; j < cells.length; j++) {
        const slot = cells[j];
        const val = out[j] ? out[j].v : null;
        if (state.board[slot.r][slot.c] !== val) moved = true;
        state.board[slot.r][slot.c] = val;
      }
    }
    return { moved, gained, merges };
  };

  const adapter = {
    start() {
      state = makeState({ rows, cols, target, seedLabel: `mock:${seed}` });
      for (let i = 0; i < initialTiles; i++) spawnMock();
      state.isGameOver = false;
      state.victory = false;
      emit(makeEvent('GAME_STARTED', { mode: 'mock', target }));
    },

    move(dir, op) {
      if (state.isGameOver) { emit(makeEvent('MOVE_REJECTED', { reason: 'game_over', dir, op })); return false; }
      const before = clone();
      const res = slideMock(dir, op);
      if (!res.moved) { emit(makeEvent('MOVE_REJECTED', { reason: 'no_move', dir, op })); return false; }
      state.moveIndex += 1;
      state.score += res.gained;
      const spawn = spawnMock();
      emit(makeEvent('MOVE_APPLIED', { moveIndex: state.moveIndex, dir, op, gained: res.gained }));
      for (const m of res.merges) emit(makeEvent('MERGE_OCCURRED', { moveIndex: state.moveIndex, op, cells: m.operands, gained: m.value }));
      if (spawn) emit(makeEvent('TILE_SPAWNED', { moveIndex: state.moveIndex, cell: spawn }));
      // effondrement cible (mock : toute tuile === target explose et score bonus)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (state.board[r][c] === target) {
          state.board[r][c] = null;
          state.score += target;
          emit(makeEvent('TARGET_COLLAPSED', { cells: [{ row: r, col: c }], bonus: target, isCombo: false }));
          state.victory = true;
        }
      }
      if (state.victory) emit(makeEvent('GAME_OVER', { victory: true, score: state.score }));
      return true;
    },

    undo() {
      // Le mock ne conserve pas d'historique riche : il s'appuie sur le
      // snapshot `before` du dernier coup rejeté — hors contrat V4 réel,
      // l'undo sera délégué à la session (Calvados/undo V4). On refuse donc
      // proprement plutôt que d'imiter une logique de sauvegarde interdite (K5).
      emit(makeEvent('MOVE_REJECTED', { reason: 'undo_unsupported_in_mock' }));
      return false;
    },

    restart() { this.start(); },

    getState() { return clone(); },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return adapter;
}

// ---------------------------------------------------------------------------
// Implémentation V3 — pont réel sur le socle actuel de main (ba6d2e7)
// ---------------------------------------------------------------------------

export function createV3Adapter({ rows = 4, cols = 4, target = 24, initialTiles = 8, movesLeft = null } = {}) {
  const state = makeState({ rows, cols, target, seedLabel: 'v3' });
  state.movesLeft = movesLeft;
  const listeners = new Set();
  const emit = (e) => { for (const l of listeners) l(e); };
  const clone = () => JSON.parse(JSON.stringify(state));
  const calvados = []; // pile undo locale à la session (contenu = faits du moteur)

  const spawn = (maxValue = 5) => {
    const empty = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (state.board[r][c] === null) empty.push([r, c]);
    if (!empty.length) return null;
    const [row, col] = empty[Math.floor(Math.random() * empty.length)];
    state.board[row][col] = 1 + Math.floor(Math.random() * maxValue);
    return { row, col, value: state.board[row][col] };
  };

  const adapter = {
    start() {
      state.board = Array.from({ length: rows }, () => Array(cols).fill(null));
      state.score = 0; state.moveIndex = 0; state.isGameOver = false; state.victory = false;
      calvados.length = 0;
      for (let i = 0; i < initialTiles; i++) spawn();
      emit(makeEvent('GAME_STARTED', { mode: 'v3', target }));
    },

    move(dir, op) {
      if (state.isGameOver) { emit(makeEvent('MOVE_REJECTED', { reason: 'game_over', dir, op })); return false; }
      const result = slideBoard(state.board, dir, op);
      if (!result.moved) { emit(makeEvent('MOVE_REJECTED', { reason: 'no_move', dir, op, invalidCells: result.invalidCells })); return false; }

      // Effondrement cible : logique V3 (main.js:327) reformulée ici en lecture
      // pure du résultat moteur — le résultat reste celui du moteur, l'adapter
      // ne réécrit aucune règle (les tuiles === target sont consommées).
      const exploded = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (result.board[r][c] === state.target) exploded.push({ row: r, col: c, value: state.target });
      }

      calvados.push({ before: clone(), afterFacts: { dir, op }, at: state.moveIndex });
      state.board = result.board;
      state.moveIndex += 1;
      state.score += result.gained;
      if (state.movesLeft !== null) state.movesLeft = Math.max(0, state.movesLeft - 1);

      emit(makeEvent('MOVE_APPLIED', { moveIndex: state.moveIndex, dir, op, gained: result.gained }));
      for (const m of result.mergedCells) {
        emit(makeEvent('MERGE_OCCURRED', { moveIndex: state.moveIndex, op, cells: [{ row: m.row, col: m.col, value: m.value }], gained: m.value }));
      }
      for (const e of exploded) emit(makeEvent('TARGET_COLLAPSED', { cells: [{ row: e.row, col: e.col }], bonus: state.target, isCombo: false }));
      state.score += exploded.length * state.target;

      const spawnInfo = spawn();
      if (spawnInfo) emit(makeEvent('TILE_SPAWNED', { moveIndex: state.moveIndex, cell: spawnInfo }));

      if (exploded.length > 0) { state.victory = true; }
      const blocked = !['add', 'sub', 'mul', 'div'].some((o) => hasAnyMove(state.board, o));
      if (state.victory || state.movesLeft === 0 || blocked) {
        state.isGameOver = true;
        emit(makeEvent('GAME_OVER', { victory: state.victory, score: state.score }));
      }
      return true;
    },

    undo() {
      const entry = calvados.pop();
      if (!entry) { emit(makeEvent('MOVE_REJECTED', { reason: 'nothing_to_undo' })); return false; }
      const before = entry.before;
      state.board = before.board; state.score = before.score; state.moveIndex = before.moveIndex;
      state.movesLeft = before.movesLeft; state.isGameOver = false; state.victory = false;
      emit(makeEvent('UNDO_APPLIED', { restoredMoveIndex: state.moveIndex }));
      return true;
    },

    restart() { this.start(); },

    getState() { return clone(); },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return adapter;
}

/**
 * Fabrique publique — un seul point d'entrée pour la runtime.
 * @param {'v3'|'mock'} kind
 */
export function createAdapter(kind = 'v3', options = {}) {
  if (kind === 'mock') return createMockAdapter(options);
  if (kind === 'v3') return createV3Adapter(options);
  throw new Error(`GameAdapter inconnu : ${kind} (attendu 'v3' | 'mock')`);
}
