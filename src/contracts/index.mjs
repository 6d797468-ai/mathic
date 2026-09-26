/**
 * MATHIC CONTRACTS — ENTRY POINT
 * ============================================================================
 * Export unique de tous les contrats M30.
 */

export { CONTENT_SCHEMA_VERSION, ENGINE_TYPES, validateContentEnvelope, createContentEnvelope, extractSpec, sameContent } from "./envelope.mjs";
export { RULES_SCHEMA_VERSION, CONTRACT_IDS, validateRulesEnvelope, createRulesEnvelope, extractRules, sameRules } from "./rules.mjs";
export { STATE_SCHEMA_VERSION, validateStateEnvelope, createStateEnvelope, serializeState, deserializeState, testStateRoundtrip, canonicalizeNativeState, fingerprintNativeState, computeStateHash, createStateEnvelopeWithHash } from "./state.mjs";
export { EVENT_SCHEMA_VERSION, COMMON_EVENT_TYPES, validateEventEnvelope, createEventEnvelope, extractEventPayload, validateEventSequence, hashEvent } from "./events.mjs";
export { REPLAY_SCHEMA_VERSION, REPLAY_STATUS, validateReplayEnvelope, createReplayEnvelope, replay, verifyReplay } from "./replay.mjs";
export { PLATFORM_VERSION, ENGINE_VERSIONS, getVersionContext, getFingerprintDependencies, getRulesVersion, versionInvalidatesCache, bumpVersion } from "./versions.mjs";
export { computeV5ContentFingerprint, computeContentFingerprint, sameFingerprint, fnv1a64, fingerprintObject } from "./fingerprint.mjs";
export { ADAPTERS, getAdapter, isSupportedEngine } from "./adapters.mjs";

// Re-export types pour clarté
export const CONTRACTS = Object.freeze({
  CONTENT_SCHEMA_VERSION: 1,
  RULES_SCHEMA_VERSION: 1,
  STATE_SCHEMA_VERSION: 1,
  EVENT_SCHEMA_VERSION: 1,
  REPLAY_SCHEMA_VERSION: 1,
  ENGINE_TYPES: Object.freeze(["v3", "b1", "v5"]),
});