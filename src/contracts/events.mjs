/**
 * MATHIC — EVENTS ENVELOPE
 * ============================================================================
 * Enveloppe d'événement commune. Le payload reste engine-specific.
 * Types communs minimaux + payload extensible.
 */

import { ENGINE_TYPES } from "./envelope.mjs";

export const EVENT_SCHEMA_VERSION = 1;

/**
 * Types d'événements communs à tous les moteurs.
 * Les moteurs peuvent émettre des types additionnels dans payload.type.
 */
export const COMMON_EVENT_TYPES = Object.freeze([
  "LEVEL_STARTED",
  "MOVE_ATTEMPTED",
  "MOVE_APPLIED",
  "MOVE_REJECTED",
  "UNDO_USED",
  "LEVEL_COMPLETED",
  "LEVEL_FAILED",
]);

/**
 * Valide une enveloppe d'événement.
 * @param {object} envelope
 * @returns {object} { ok: boolean, reason?: string }
 */
export function validateEventEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, reason: "envelope must be an object" };
  }
  if (envelope.schemaVersion !== EVENT_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${EVENT_SCHEMA_VERSION}` };
  }
  if (!ENGINE_TYPES.includes(envelope.engine)) {
    return { ok: false, reason: `engine must be one of v3, b1, v5` };
  }
  if (typeof envelope.contentId !== "string" || envelope.contentId.length === 0) {
    return { ok: false, reason: "contentId must be a non-empty string" };
  }
  if (typeof envelope.eventId !== "string" || envelope.eventId.length === 0) {
    return { ok: false, reason: "eventId must be a non-empty string" };
  }
  if (!Number.isInteger(envelope.sequence) || envelope.sequence < 0) {
    return { ok: false, reason: "sequence must be integer >= 0" };
  }
  if (typeof envelope.type !== "string" || envelope.type.length === 0) {
    return { ok: false, reason: "type must be a non-empty string" };
  }
  if (!envelope.payload || typeof envelope.payload !== "object") {
    return { ok: false, reason: "payload must be an object" };
  }
  if (typeof envelope.stateHash !== "string" || envelope.stateHash.length === 0) {
    return { ok: false, reason: "stateHash must be a non-empty string" };
  }
  if (typeof envelope.timestamp !== "number" || envelope.timestamp < 0) {
    return { ok: false, reason: "timestamp must be non-negative number" };
  }
  return { ok: true };
}

/**
 * Crée une enveloppe d'événement valide.
 * @param {object} params
 * @returns {object} enveloppe validée et gelée
 */
export function createEventEnvelope({ engine, contentId, eventId, sequence, type, payload, stateHash, timestamp = Date.now() }) {
  const envelope = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    engine,
    contentId,
    eventId,
    sequence,
    type,
    payload,
    stateHash,
    timestamp,
  };
  const validation = validateEventEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(`Invalid EventEnvelope: ${validation.reason}`);
  }
  return Object.freeze(envelope);
}

/**
 * Extrait le payload natif.
 * @param {object} envelope
 * @returns {object} payload natif
 */
export function extractEventPayload(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("envelope required");
  }
  return envelope.payload;
}

/**
 * Vérifie l'ordre de séquence d'une liste d'événements.
 * @param {object[]} events
 * @returns {boolean}
 */
export function validateEventSequence(events) {
  if (!Array.isArray(events) || events.length === 0) return false;
  for (let i = 1; i < events.length; i++) {
    if (events[i].sequence <= events[i - 1].sequence) return false;
    if (events[i].contentId !== events[0].contentId) return false;
    if (events[i].engine !== events[0].engine) return false;
  }
  return true;
}

/**
 * Calcule un hash déterministe d'un événement (FNV-1a 64-bit).
 * @param {object} envelope
 * @returns {string} hash hex 16 chars
 */
export function hashEvent(envelope) {
  const payload = `${envelope.engine}|${envelope.contentId}|${envelope.sequence}|${envelope.type}|${JSON.stringify(envelope.payload)}`;
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < payload.length; i++) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}