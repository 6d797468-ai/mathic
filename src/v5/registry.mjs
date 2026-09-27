/**
 * MATHIC V5 — LEVEL REGISTRY
 * ============================================================================
 * Registre déterministe des niveaux V5.
 * Aucune base de données, aucun backend, purement en mémoire / module.
 */

import { validateLevelDefinition, compileV5Level, computeLevelFingerprint, migrateLegacyV5Spec } from "./level.mjs";

/**
 * Registre interne.
 * @type {Map<string, object>}
 */
const _registry = new Map();

/**
 * Enregistre un niveau V5.
 * @param {object} levelDefinition - LevelDefinition validé
 * @returns {object} { ok: boolean, reason?: string, level?: object }
 */
export function registerLevel(levelDefinition) {
  const validation = validateLevelDefinition(levelDefinition);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  if (_registry.has(levelDefinition.contentId)) {
    return { ok: false, reason: `duplicate contentId: ${levelDefinition.contentId}` };
  }
  const entry = {
    definition: levelDefinition,
    compiledSpec: compileV5Level(levelDefinition),
    fingerprint: computeLevelFingerprint(levelDefinition),
  };
  _registry.set(levelDefinition.contentId, entry);
  return { ok: true, level: entry };
}

/**
 * Récupère un niveau par son contentId.
 * @param {string} contentId
 * @returns {object|null} { definition, compiledSpec, fingerprint } ou null
 */
export function getLevel(contentId) {
  const entry = _registry.get(contentId);
  return entry ? { ...entry } : null;
}

/**
 * Vérifie si un niveau existe.
 * @param {string} contentId
 * @returns {boolean}
 */
export function hasLevel(contentId) {
  return _registry.has(contentId);
}

/**
 * Liste tous les contentIds enregistrés.
 * @returns {string[]}
 */
export function listLevels() {
  return [..._registry.keys()].sort();
}

/**
 * Nombre de niveaux enregistrés.
 * @returns {number}
 */
export function levelCount() {
  return _registry.size;
}

/**
 * Vide le registre (tests uniquement).
 */
export function clearRegistry() {
  _registry.clear();
}

/**
 * Migre et enregistre une ancienne spec V5 (format Grimoire).
 * @param {object} legacySpec
 * @param {object} meta
 * @returns {object} { ok, reason?, level? }
 */
export function registerLegacyV5(legacySpec, meta) {
  const levelDef = migrateLegacyV5Spec(legacySpec, meta);
  return registerLevel(levelDef);
}

/**
 * Vide et réinitialise avec les 2 niveaux Grimoire d'origine.
 * Pour réinitialisation de test / développement.
 */
export function resetToDefaultGrimoireLevels() {
  clearRegistry();
  
  // LAB_SUM_2X2
  registerLegacyV5(
    {
      grid: [[-1, -1], [-1, -1]],
      rows: [{ ops: ["+"], target: 5 }, { ops: ["+"], target: 7 }],
      cols: [{ ops: ["+"], target: 4 }, { ops: ["+"], target: 8 }],
      reserve: { 2: 2, 3: 1, 5: 1 },
    },
    {
      contentId: "LAB_SUM_2X2",
      contentVersion: 1,
      metadata: { label: "Creuset 2×2 · Somme", playable: true },
    }
  );

  // LAB_MIXED_2X2
  registerLegacyV5(
    {
      grid: [[-1, -1], [-1, -1]],
      rows: [{ ops: ["*"], target: 10 }, { ops: ["-"], target: 4 }],
      cols: [{ ops: ["+"], target: 9 }, { ops: ["+"], target: 8 }],
      reserve: { 2: 1, 3: 1, 5: 1, 7: 1 },
    },
    {
      contentId: "LAB_MIXED_2X2",
      contentVersion: 1,
      metadata: { label: "Creuset 2×2 · Mixte", playable: true },
    }
  );
}

/**
 * Vide le registre (alias pour tests).
 */
export function clear() {
  clearRegistry();
}