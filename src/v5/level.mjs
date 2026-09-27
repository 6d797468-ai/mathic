/**
 * MATHIC V5 — LEVEL DEFINITION
 * ============================================================================
 * Définition déclarative d'un niveau V5.
 * Source de vérité unique pour le contenu V5.
 * Le compilateur produit la spec V5 canonique consommée par le moteur.
 */

import { CONTENT_SCHEMA_VERSION, ENGINE_TYPES, validateContentEnvelope } from "../contracts/envelope.mjs";
import { validateSpec } from "../v5/rules/engine.mjs";
import { computeV5ContentFingerprint } from "../contracts/fingerprint.mjs";
import { SEAL_RULE_VERSION } from "../atelier/seal.mjs";
import { WITNESS_VERSION } from "../v5/rules/solvability-witness.mjs";

export const LEVEL_SCHEMA_VERSION = 1;

/**
 * Schéma d'un LevelDefinition V5.
 * @typedef {object} LevelDefinition
 * @property {number} schemaVersion - doit être 1
 * @property {"v5"} engine - doit être "v5"
 * @property {string} contentId - identifiant stable lisible par humain
 * @property {number} contentVersion - version du contenu (>= 1)
 * @property {string} rulesVersion - version des règles (ex: "v5-engine")
 * @property {string|number} [seed] - seed optionnelle pour génération future
 * @property {V5Spec} spec - spec V5 brute
 * @property {object} [metadata] - métadonnées non-sémantiques (label, difficulty, etc.)
 */

/**
 * Valide un LevelDefinition V5.
 * Ne vérifie QUE la forme — pas la sémantique de jeu (laissé au moteur V5).
 * @param {object} level
 * @returns {object} { ok: boolean, reason?: string }
 */
export function validateLevelDefinition(level) {
  if (!level || typeof level !== "object") {
    return { ok: false, reason: "level must be an object" };
  }
  if (level.schemaVersion !== LEVEL_SCHEMA_VERSION) {
    return { ok: false, reason: `schemaVersion must be ${LEVEL_SCHEMA_VERSION}` };
  }
  if (level.engine !== "v5") {
    return { ok: false, reason: "engine must be 'v5'" };
  }
  if (typeof level.contentId !== "string" || level.contentId.length === 0) {
    return { ok: false, reason: "contentId must be a non-empty string" };
  }
  if (!Number.isInteger(level.contentVersion) || level.contentVersion < 1) {
    return { ok: false, reason: "contentVersion must be integer >= 1" };
  }
  if (typeof level.rulesVersion !== "string" || level.rulesVersion.length === 0) {
    return { ok: false, reason: "rulesVersion must be a non-empty string" };
  }
  if (!level.spec || typeof level.spec !== "object") {
    return { ok: false, reason: "spec must be an object" };
  }

  // Validation structurelle V5 (déléguer au moteur souverain)
  try {
    validateSpec(level.spec);
  } catch (err) {
    return { ok: false, reason: `invalid V5 spec: ${err.message}` };
  }

  // Règles de cohérence rulesVersion
  if (level.rulesVersion !== "v5-engine") {
    return { ok: false, reason: `rulesVersion must be "v5-engine" (got "${level.rulesVersion}")` };
  }

  // Metadata optionnelle mais si présente, doit être objet
  if (level.metadata !== undefined && (level.metadata === null || typeof level.metadata !== "object")) {
    return { ok: false, reason: "metadata must be an object if present" };
  }

  return { ok: true };
}

/**
 * Crée un LevelDefinition V5 valide.
 * @param {object} params
 * @returns {object} LevelDefinition validé et gelé
 */
export function createLevelDefinition({ contentId, contentVersion = 1, rulesVersion = "v5-engine", spec, seed, metadata }) {
  const level = {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    engine: "v5",
    contentId,
    contentVersion,
    rulesVersion,
    spec,
    seed,
    metadata,
  };
  const validation = validateLevelDefinition(level);
  if (!validation.ok) {
    throw new Error(`Invalid LevelDefinition: ${validation.reason}`);
  }
  return Object.freeze(level);
}

/**
 * Compile un LevelDefinition vers la spec V5 canonique consommée par le moteur.
 * Transformation de données PURE — aucune logique de jeu.
 * 
 * @param {object} levelDefinition - LevelDefinition validé
 * @returns {object} Canonical V5 Spec (identique à ce que consomme engine.mjs)
 */
export function compileV5Level(levelDefinition) {
  const validation = validateLevelDefinition(levelDefinition);
  if (!validation.ok) {
    throw new Error(`Cannot compile invalid LevelDefinition: ${validation.reason}`);
  }

  const { spec } = levelDefinition;

  // Le spec V5 est déjà dans la forme canonique attendue par engine.mjs
  // On ne fait qu'une validation de structure et on renvoie la forme canonique
  // (clés triées pour stabilité, mais les objets sont déjà gelés par Object.freeze dans les définitions)
  return Object.freeze({
    grid: spec.grid.map(row => [...row]),
    rows: spec.rows.map(r => ({ target: r.target, ops: [...r.ops] })),
    cols: spec.cols.map(c => ({ target: c.target, ops: [...c.ops] })),
    reserve: { ...spec.reserve },
  });
}

/**
 * Calcule le fingerprint M29 d'un LevelDefinition (via sa spec compilée).
 * Identique à l'admission M29 : canonicalSpec | SEAL_RULE_VERSION | WITNESS_VERSION
 * 
 * @param {object} levelDefinition
 * @returns {string} fingerprint hex 16 chars
 */
export function computeLevelFingerprint(levelDefinition) {
  const compiledSpec = compileV5Level(levelDefinition);
  return computeV5ContentFingerprint(compiledSpec);
}

/**
 * Tente d'extraire un LevelDefinition depuis une ancienne spec V5 hardcodée.
 * Utilitaire de migration.
 * 
 * @param {object} legacySpec - spec V5 brute (format Grimoire LAB_CATALOG)
 * @param {object} meta - { contentId, contentVersion, rulesVersion?, seed?, metadata? }
 * @returns {object} LevelDefinition
 */
export function migrateLegacyV5Spec(legacySpec, { contentId, contentVersion = 1, rulesVersion = "v5-engine", seed, metadata }) {
  return createLevelDefinition({
    contentId,
    contentVersion,
    rulesVersion,
    spec: legacySpec,
    seed,
    metadata,
  });
}