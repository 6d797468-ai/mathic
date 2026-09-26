/**
 * MATHIC — GAME RULES ENVELOPE
 * ============================================================================
 * Contrat de règles partagé. Le payload `rules` reste engine-specific.
 * Le noyau commun ne définit QUE les propriétés réellement partagées.
 */

import { ENGINE_TYPES } from "./envelope.mjs";

export const RULES_SCHEMA_VERSION = 1;

/**
 * Identifiants de contrats partagés (identifient le type de contrat sans l'exécuter).
 */
export const CONTRACT_IDS = Object.freeze({
  COMPLETION: "completion-contract",
  MOVE: "move-contract",
  SERIALIZATION: "serialization-contract",
  VALIDATION: "validation-contract",
});

/**
 * Valide une enveloppe de règles.
 * @param {object} envelope
 * @returns {object} { ok: boolean, reason?: string }
 */
export function validateRulesEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, reason: "envelope must be an object" };
  }
  if (envelope.schemaVersion !== RULES_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${RULES_SCHEMA_VERSION}` };
  }
  if (!ENGINE_TYPES.includes(envelope.engine)) {
    return { ok: false, reason: `engine must be one of ${ENGINE_TYPES.join(", ")}` };
  }
  if (typeof envelope.rulesVersion !== "string" || envelope.rulesVersion.length === 0) {
    return { ok: false, reason: "rulesVersion must be a non-empty string" };
  }
  if (!envelope.rules || typeof envelope.rules !== "object") {
    return { ok: false, reason: "rules must be an object" };
  }
  // Identifiants de contrats optionnels mais s'ils existent, doivent être valides
  if (envelope.completionContract && !Object.values(CONTRACT_IDS).includes(envelope.completionContract)) {
    return { ok: false, reason: `invalid completionContract` };
  }
  if (envelope.moveContract && !Object.values(CONTRACT_IDS).includes(envelope.moveContract)) {
    return { ok: false, reason: `invalid moveContract` };
  }
  return { ok: true };
}

/**
 * Crée une enveloppe de règles valide.
 * @param {object} params
 * @returns {object} enveloppe validée et gelée
 */
export function createRulesEnvelope({ engine, rulesVersion, rules, completionContract, moveContract, serializationContract }) {
  const envelope = {
    schemaVersion: RULES_SCHEMA_VERSION,
    engine,
    rulesVersion,
    rules,
    completionContract,
    moveContract,
    serializationContract,
  };
  const validation = validateRulesEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(`Invalid GameRulesEnvelope: ${validation.reason}`);
  }
  return Object.freeze(envelope);
}

/**
 * Extrait le payload de règles natif pour le moteur.
 * @param {object} envelope
 * @returns {object} rules natives
 */
export function extractRules(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("envelope required");
  }
  if (!ENGINE_TYPES.includes(envelope.engine)) {
    throw new Error(`unsupported engine: ${envelope.engine}`);
  }
  return envelope.rules;
}

/**
 * Vérifie si deux enveloppes de règles sont équivalentes (même moteur, version, règles).
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function sameRules(a, b) {
  return a.engine === b.engine
    && a.rulesVersion === b.rulesVersion
    && JSON.stringify(a.rules, Object.keys(a.rules).sort()) === JSON.stringify(b.rules, Object.keys(b.rules).sort());
}