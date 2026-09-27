/**
 * MATHIC — REPLAY ENVELOPE
 * ============================================================================
 * Enveloppe de replay. Le replay réel est délégué au moteur d'origine.
 * Cette enveloppe ne définit QUE le format de transport et les métadonnées.
 */

import { ENGINE_TYPES } from "./envelope.mjs";

export const REPLAY_SCHEMA_VERSION = 1;

export const REPLAY_STATUS = Object.freeze({
  COMPLETE: "COMPLETE",
  TRUNCATED: "TRUNCATED",
  INVALID: "INVALID",
});

/**
 * Valide une enveloppe de replay.
 * @param {object} envelope
 * @returns {object} { ok: boolean, reason?: string }
 */
export function validateReplayEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, reason: "envelope must be an object" };
  }
  if (envelope.schemaVersion !== REPLAY_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${REPLAY_SCHEMA_VERSION}` };
  }
  if (!["v3", "b1", "v5"].includes(envelope.engine)) {
    return { ok: false, reason: "engine must be v3, b1, or v5" };
  }
  if (typeof envelope.contentId !== "string" || envelope.contentId.length === 0) {
    return { ok: false, reason: "contentId must be a non-empty string" };
  }
  if (!envelope.initialState || typeof envelope.initialState !== "object") {
    return { ok: false, reason: "initialState must be an object" };
  }
  if (!Array.isArray(envelope.events)) {
    return { ok: false, reason: "events must be an array" };
  }
  if (!envelope.finalState || typeof envelope.finalState !== "object") {
    return { ok: false, reason: "finalState must be an object" };
  }
  if (!Object.values(["COMPLETE", "TRUNCATED", "INVALID"]).includes(envelope.status)) {
    return { ok: false, reason: "status must be COMPLETE, TRUNCATED, or INVALID" };
  }
  if (typeof envelope.fingerprint !== "string" || envelope.fingerprint.length === 0) {
    return { ok: false, reason: "fingerprint must be a non-empty string" };
  }
  return { ok: true };
}

/**
 * Crée une enveloppe de replay valide.
 * @param {object} params
 * @returns {object} enveloppe validée et gelée
 */
export function createReplayEnvelope({ engine, contentId, initialState, events, finalState, status = "COMPLETE", fingerprint }) {
  const envelope = {
    schemaVersion: 1,
    engine,
    contentId,
    initialState,
    events,
    finalState,
    status,
    fingerprint,
  };
  const validation = validateReplayEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(`Invalid ReplayEnvelope: ${validation.reason}`);
  }
  return Object.freeze(envelope);
}

/**
 * Interface de replay délégué au moteur d'origine.
 * Ne fait PAS le replay lui-même — définit l'interface.
 * 
 * @param {object} params { engine, contentId, initialState, events }
 * @returns {Promise<object>} { finalState, status, fingerprint }
 */
export async function replay({ engine, contentId, initialState, events }) {
  switch (engine) {
    case "v5": {
      const { replay } = await import("../v5/rules/engine.mjs");
      const finalState = replay(initialState.spec, events);
      return { finalState: finalState[finalState.length - 1], status: "COMPLETE" };
    }
    case "b1": {
      const { replay } = await import("../b1/replay.mjs");
      // B1 replay attend level + actions
      // Pour compatibilité, on extrait level de initialState si possible
      const level = initialState.level ?? initialState;
      const finalState = replay(level, events);
      return { finalState: finalState[finalState.length - 1], status: "COMPLETE" };
    }
    case "v3":
      // V3 n'a pas de replay natif — UNSUPPORTED explicite
      return { finalState: null, status: "INVALID", reason: "V3 replay not supported" };
    default:
      throw new Error(`unsupported engine: ${engine}`);
  }
}

/**
 * Vérifie la cohérence d'un replay (roundtrip).
 * @param {object} replayEnvelope
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function verifyReplay(replayEnvelope) {
  if (!replayEnvelope || replayEnvelope.status === "INVALID") {
    return { ok: false, reason: "invalid replay envelope" };
  }
  try {
    const result = await replay({
      engine: replayEnvelope.engine,
      contentId: replayEnvelope.contentId,
      initialState: replayEnvelope.initialState,
      events: replayEnvelope.events,
    });
    if (result.status === "INVALID") {
      return { ok: false, reason: result.reason || "replay unsupported" };
    }
    // Compare finalState canoniquement
    const expectedHash = JSON.stringify(replayEnvelope.finalState, Object.keys(replayEnvelope.finalState).sort());
    const actualHash = JSON.stringify(result.finalState, Object.keys(result.finalState).sort());
    const ok = expectedHash === actualHash;
    return { ok, reason: ok ? undefined : "finalState mismatch" };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}