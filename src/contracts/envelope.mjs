/**
 * MATHIC — CONTENT ENVELOPE
 * ============================================================================
 * Enveloppe canonique pour tout contenu jouable, quel que soit le moteur.
 *
 * Principe : engine = "v3" | "b1" | "v5" détermine UNIQUEMENT l'interpréteur
 * du champ `spec`. Aucune conversion silencieuse, aucun fallback.
 */

export const CONTENT_SCHEMA_VERSION = 1;

export const ENGINE_TYPES = Object.freeze(["v3", "b1", "v5"]);

/**
 * Valide une enveloppe de contenu.
 * @param {object} envelope
 * @returns {object} { ok: boolean, reason?: string }
 */
export function validateContentEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, reason: "envelope must be an object" };
  }
  if (envelope.schemaVersion !== CONTENT_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${CONTENT_SCHEMA_VERSION}` };
  }
  if (!ENGINE_TYPES.includes(envelope.engine)) {
    return { ok: false, reason: `engine must be one of ${ENGINE_TYPES.join(", ")}` };
  }
  if (typeof envelope.contentId !== "string" || envelope.contentId.length === 0) {
    return { ok: false, reason: "contentId must be a non-empty string" };
  }
  if (!Number.isInteger(envelope.contentVersion) || envelope.contentVersion < 1) {
    return { ok: false, reason: "contentVersion must be integer >= 1" };
  }
  if (typeof envelope.rulesVersion !== "string" || envelope.rulesVersion.length === 0) {
    return { ok: false, reason: "rulesVersion must be a non-empty string" };
  }
  if (!envelope.spec || typeof envelope.spec !== "object") {
    return { ok: false, reason: "spec must be an object" };
  }
  if (envelope.seed !== undefined && envelope.seed !== null && typeof envelope.seed !== "string" && typeof envelope.seed !== "number") {
    return { ok: false, reason: "seed must be string, number, or omitted" };
  }
  return { ok: true };
}

/**
 * Crée une enveloppe de contenu valide.
 * @param {object} params
 * @returns {object} enveloppe validée
 */
export function createContentEnvelope({ engine, contentId, contentVersion = 1, rulesVersion, spec, seed }) {
  const envelope = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    engine,
    contentId,
    contentVersion,
    rulesVersion,
    spec,
    seed,
  };
  const validation = validateContentEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(`Invalid ContentEnvelope: ${validation.reason}`);
  }
  return Object.freeze(envelope);
}

/**
 * Extrait la spec native pour le moteur donné.
 * @param {object} envelope
 * @returns {object} spec native
 */
export function extractSpec(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("envelope required");
  }
  if (!ENGINE_TYPES.includes(envelope.engine)) {
    throw new Error(`unsupported engine: ${envelope.engine}`);
  }
  return envelope.spec;
}

/**
 * Vérifie si deux enveloppes représentent le même contenu logique.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function sameContent(a, b) {
  return a.contentId === b.contentId
    && a.engine === b.engine
    && a.contentVersion === b.contentVersion
    && a.rulesVersion === b.rulesVersion;
}