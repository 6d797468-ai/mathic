/**
 * MATHIC — ENGINE ADAPTERS
 * ============================================================================
 * Adapters structurels pour convertir les formats natifs vers l'enveloppe commune.
 * Traduction STRUCTURELLE uniquement — PAS de réimplémentation de règles.
 */

import { ENGINE_TYPES } from "./envelope.mjs";
import { validateContentEnvelope, createContentEnvelope } from "./envelope.mjs";
import { validateRulesEnvelope, createRulesEnvelope } from "./rules.mjs";
import { createStateEnvelope, fingerprintNativeState, computeStateHash } from "./state.mjs";
import { createEventEnvelope } from "./events.mjs";

/**
 * Interface d'adapter commune.
 * @typedef {object} EngineAdapter
 * @property {"v3"|"b1"|"v5"} engine
 * @property {function(object):object} toContentEnvelope
 * @property {function(object):object} toRulesEnvelope
 * @property {function(object, string):object} toStateEnvelope
 * @property {function(object, string, object, string):object} toEventEnvelope
 * @property {function(object):object} extractNativeSpec
 * @property {function(object):object} extractNativeState
 * @property {function(object):string} getContentId
 */

/**
 * Adapter V3 — traduction structurelle depuis main.js / board.js
 */
export const v3Adapter = {
  engine: "v3",

  toContentEnvelope({ level, spec: providedSpec, seed }) {
    // level = { target, moves, label } ou spec = board/target
    const spec = providedSpec ?? { board: level?.board, target: level?.target };
    return createContentEnvelope({
      engine: "v3",
      contentId: `v3-level-${Date.now()}`,
      rulesVersion: "v3-classic",
      spec,
      seed,
    });
  },

  toRulesEnvelope({ rulesVersion = "v3-classic", rules = {} }) {
    return createRulesEnvelope({
      engine: "v3",
      rulesVersion,
      rules: { target: 24, ...rules },
      completionContract: "completion-contract",
      moveContract: "move-contract",
    });
  },

  toStateEnvelope(nativeState, contentId) {
    // nativeState = { board, score, target, movesLeft, ... }
    const state = {
      board: nativeState.board,
      score: nativeState.score,
      target: nativeState.target,
      movesLeft: nativeState.movesLeft,
      mode: nativeState.mode,
    };
    return {
      engine: "v3",
      contentId,
      stateVersion: 1,
      state,
      stateHash: "", // à calculer
    };
  },

  toEventEnvelope({ engine = "v3", contentId, sequence, type, payload, stateHash }) {
    return {
      schemaVersion: 1,
      engine,
      contentId,
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sequence,
      type,
      payload,
      stateHash,
      timestamp: Date.now(),
    };
  },

  extractNativeSpec(envelope) {
    return envelope.spec;
  },

  extractNativeState(envelope) {
    return envelope.state;
  },

  getContentId(envelope) {
    return envelope.contentId;
  },
};

/**
 * Adapter B1 — traduction structurelle depuis b1/engine.mjs + levels.mjs
 */
export const b1Adapter = {
  engine: "b1",

  toContentEnvelope({ level, seed }) {
    // level = { id, target, maxMoves, rows, cols, tiles[] }
    const spec = {
      id: level.id,
      target: level.target,
      maxMoves: level.maxMoves,
      rows: level.rows,
      cols: level.cols,
      tiles: level.tiles,
    };
    return createContentEnvelope({
      engine: "b1",
      contentId: level.id ?? `b1-${Date.now()}`,
      rulesVersion: "b1-ladder",
      spec,
      seed,
    });
  },

  toRulesEnvelope({ rulesVersion = "b1-ladder", rules = {} }) {
    return createRulesEnvelope({
      engine: "b1",
      rulesVersion,
      rules: { maxMoves: rules.maxMoves, target: rules.target },
      completionContract: "completion-contract",
      moveContract: "move-contract",
    });
  },

  toStateEnvelope(nativeState, contentId) {
    // nativeState = session B1 { level, board, movesLeft, trace, events, score, won, nextChain }
    const state = {
      level: nativeState.level,
      board: nativeState.board,
      movesLeft: nativeState.movesLeft,
      trace: nativeState.trace,
      events: nativeState.events,
      score: nativeState.score,
      won: nativeState.won,
      nextChain: nativeState.nextChain,
    };
    return {
      engine: "b1",
      contentId,
      stateVersion: 1,
      state,
      stateHash: "", // à calculer
    };
  },

  toEventEnvelope({ engine = "b1", contentId, sequence, type, payload, stateHash }) {
    return {
      schemaVersion: 1,
      engine,
      contentId,
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sequence,
      type,
      payload,
      stateHash,
      timestamp: Date.now(),
    };
  },

  extractNativeSpec(envelope) {
    return envelope.spec;
  },

  extractNativeState(envelope) {
    return envelope.state;
  },

  getContentId(envelope) {
    return envelope.contentId;
  },
};

/**
 * Adapter V5 — traduction structurelle depuis v5/rules/engine.mjs
 */
export const v5Adapter = {
  engine: "v5",

  toContentEnvelope({ spec, seed }) {
    // spec = { grid, rows[], cols[], reserve }
    return createContentEnvelope({
      engine: "v5",
      contentId: `v5-${spec.grid?.[0]?.length || 0}x${spec.grid?.length || 0}-${Date.now()}`,
      rulesVersion: "v5-engine",
      spec,
      seed,
    });
  },

  toRulesEnvelope({ rulesVersion = "v5-engine", rules = {} }) {
    return createRulesEnvelope({
      engine: "v5",
      rulesVersion,
      rules: { operators: ["+", "-", "*", "/"] },
      completionContract: "completion-contract",
      moveContract: "move-contract",
      validationContract: "validation-contract",
    });
  },

  toStateEnvelope(nativeState, contentId) {
    // nativeState = session V5 { spec, grid, reserve, moves, events }
    const state = {
      spec: nativeState.spec,
      grid: nativeState.grid,
      reserve: nativeState.reserve,
      moves: nativeState.moves,
      events: nativeState.events,
    };
    return {
      engine: "v5",
      contentId,
      stateVersion: 1,
      state,
      stateHash: "", // à calculer
    };
  },

  toEventEnvelope({ engine = "v5", contentId, sequence, type, payload, stateHash }) {
    return {
      schemaVersion: 1,
      engine,
      contentId,
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sequence,
      type,
      payload,
      stateHash,
      timestamp: Date.now(),
    };
  },

  extractNativeSpec(envelope) {
    return envelope.spec;
  },

  extractNativeState(envelope) {
    return envelope.state;
  },

  getContentId(envelope) {
    return envelope.contentId;
  },
};

/**
 * Map des adapters par moteur
 */
export const ADAPTERS = Object.freeze({
  v3: v3Adapter,
  b1: b1Adapter,
  v5: v5Adapter,
});

/**
 * Récupère l'adapter pour un moteur.
 * @param {"v3"|"b1"|"v5"} engine
 * @returns {EngineAdapter}
 */
export function getAdapter(engine) {
  const adapter = ADAPTERS[engine];
  if (!adapter) throw new Error(`no adapter for engine: ${engine}`);
  return adapter;
}

/**
 * Vérifie qu'un moteur est supporté.
 * @param {string} engine
 * @returns {boolean}
 */
export function isSupportedEngine(engine) {
  return ENGINE_TYPES.includes(engine);
}