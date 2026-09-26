/**
 * MATHIC — STATE ENVELOPE
 * ============================================================================
 * Enveloppe canonique d'état. Le payload `state` reste engine-specific.
 * Fournit sérialisation, désérialisation, canonicalisation et fingerprint.
 */

import { ENGINE_TYPES } from "./envelope.mjs";

export const STATE_SCHEMA_VERSION = 1;

/**
 * Valide une enveloppe d'état.
 * @param {object} envelope
 * @returns {object} { ok: boolean, reason?: string }
 */
export function validateStateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, reason: "envelope must be an object" };
  }
  if (envelope.schemaVersion !== STATE_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${STATE_SCHEMA_VERSION}` };
  }
  if (!ENGINE_TYPES.includes(envelope.engine)) {
    return { ok: false, reason: `engine must be one of ${ENGINE_TYPES.join(", ")}` };
  }
  if (typeof envelope.contentId !== "string" || envelope.contentId.length === 0) {
    return { ok: false, reason: "contentId must be a non-empty string" };
  }
  if (!Number.isInteger(envelope.stateVersion) || envelope.stateVersion < 1) {
    return { ok: false, reason: "stateVersion must be integer >= 1" };
  }
  if (!envelope.state || typeof envelope.state !== "object") {
    return { ok: false, reason: "state must be an object" };
  }
  if (typeof envelope.stateHash !== "string" || envelope.stateHash.length === 0) {
    return { ok: false, reason: "stateHash must be a non-empty string" };
  }
  return { ok: true };
}

/**
 * Crée une enveloppe d'état valide.
 * @param {object} params
 * @returns {object} enveloppe validée et gelée
 */
export function createStateEnvelope({ engine, contentId, stateVersion = 1, state, stateHash }) {
  const envelope = {
    schemaVersion: STATE_SCHEMA_VERSION,
    engine,
    contentId,
    stateVersion,
    state,
    stateHash,
  };
  const validation = validateStateEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(`Invalid StateEnvelope: ${validation.reason}`);
  }
  return Object.freeze(envelope);
}

/**
 * Sérialise une enveloppe d'état (JSON canonique, clés triées).
 * @param {object} envelope
 * @returns {string} JSON canonique
 */
export function serializeState(envelope) {
  return JSON.stringify(envelope, (key, value) => {
    if (key === "") return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
    return value;
  });
}

/**
 * Désérialise et valide une enveloppe d'état.
 * @param {string} json
 * @returns {object} enveloppe validée
 */
export function deserializeState(json) {
  let envelope;
  try {
    envelope = JSON.parse(json);
  } catch {
    throw new Error("invalid JSON");
  }
  const validation = validateStateEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(`Invalid StateEnvelope: ${validation.reason}`);
  }
  return Object.freeze(envelope);
}

/**
 * Roundtrip test: serialize puis deserialize doit produire un équivalent canonique.
 * @param {object} envelope
 * @returns {boolean}
 */
export function testStateRoundtrip(envelope) {
  try {
    const serialized = serializeState(envelope);
    const deserialized = deserializeState(serialized);
    return JSON.stringify(envelope, Object.keys(envelope).sort()) === JSON.stringify(deserialized, Object.keys(deserialized).sort());
  } catch {
    return false;
  }
}

/**
 * Canonicalise un état natif moteur pour fingerprint (niveau racine seulement).
 * @param {object} nativeState
 * @returns {string} forme canonique string
 */
export function canonicalizeNativeState(nativeState) {
  return JSON.stringify(nativeState, (key, value) => {
    if (key === "") return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
    return value;
  });
}

/**
 * Calcule un fingerprint déterministe d'un état natif (FNV-1a 64-bit).
 * @param {object} nativeState
 * @param {string} engine
 * @param {string} rulesVersion
 * @returns {string} fingerprint hex 16 chars
 */
export function fingerprintNativeState(nativeState, engine, rulesVersion) {
  const canon = canonicalizeNativeState(nativeState);
  const payload = `${canon}|${engine}|${rulesVersion}`;
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < payload.length; i++) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Calcule le stateHash d'une enveloppe (FNV-1a 64-bit sur state + version).
 * @param {object} envelope
 * @returns {string} hash hex 16 chars
 */
export function computeStateHash(envelope) {
  const canonState = canonicalizeNativeState(envelope.state);
  const payload = `${canonState}|${envelope.engine}|${envelope.stateVersion}`;
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < payload.length; i++) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Crée une enveloppe d'état avec stateHash auto-calculé.
 * @param {object} params
 * @returns {object} enveloppe validée avec stateHash
 */
export function createStateEnvelopeWithHash({ engine, contentId, stateVersion = 1, state }) {
  const stateHash = fingerprintNativeState(state, engine, "1");
  const envelope = {
    schemaVersion: 1,
    engine,
    contentId,
    stateVersion,
    state,
    stateHash,
  };
  return Object.freeze(envelope);
}