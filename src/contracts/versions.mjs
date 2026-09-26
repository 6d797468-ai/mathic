/**
 * MATHIC — VERSION CONTEXT
 * ============================================================================
 * Contexte de versionnage centralisé par moteur.
 * Ne remplace PAS les constantes existantes — les regroupe logiquement.
 */

import { SEAL_RULE_VERSION } from "../atelier/seal.mjs";
import { WITNESS_VERSION } from "../v5/rules/solvability-witness.mjs";

export const PLATFORM_VERSION = 1;

/**
 * Versions par moteur — centralisation logique sans casser les consommateurs existants.
 * Chaque entrée ne contient QUE les versions qui affectent réellement ce moteur.
 */
export const ENGINE_VERSIONS = Object.freeze({
  v3: {
    engine: 1,
    rules: "v3-classic",
    // V3 n'utilise pas witnessVersion, SEAL_RULE_VERSION, etc.
  },
  b1: {
    engine: 1,
    rules: "b1-ladder",
    // B1 n'utilise pas witnessVersion, SEAL_RULE_VERSION, etc.
  },
  v5: {
    engine: 1,
    rules: SEAL_RULE_VERSION,      // "v5-engine" — provient du Seal Atelier
    witness: WITNESS_VERSION,       // provient du witness de solvabilité
    seal: 1,                        // SEAL_SCHEMA_VERSION
  },
});

/**
 * Retourne le contexte de version pertinent pour un moteur.
 * Ne retourne QUE les versions qui affectent ce moteur.
 * 
 * @param {"v3"|"b1"|"v5"} engine
 * @returns {object} objet versionné minimal
 */
export function getVersionContext(engine) {
  const ctx = ENGINE_VERSIONS[engine];
  if (!ctx) {
    throw new Error(`unknown engine: ${engine}`);
  }
  // Copie pour éviter mutation
  return Object.freeze({ ...ctx, platform: PLATFORM_VERSION });
}

/**
 * Retourne toutes les versions qui participent au fingerprint M29/M31.
 * Pour V5 : [SEAL_RULE_VERSION, WITNESS_VERSION]
 * Pour B1/V3 : [] (ne participent pas au fingerprint M29)
 * 
 * @param {"v3"|"b1"|"v5"} engine
 * @returns {string[]}
 */
export function getFingerprintDependencies(engine) {
  switch (engine) {
    case "v5":
      return [SEAL_RULE_VERSION, String(WITNESS_VERSION)];
    case "b1":
    case "v3":
      return [];
    default:
      return [];
  }
}

/**
 * Retourne la version de règles effective pour un moteur.
 * @param {"v3"|"b1"|"v5"} engine
 * @returns {string}
 */
export function getRulesVersion(engine) {
  const ctx = ENGINE_VERSIONS[engine];
  if (!ctx) throw new Error(`unknown engine: ${engine}`);
  return ctx.rules;
}

/**
 * Vérifie si un changement de version invalide un cache donné.
 * @param {object} oldCtx  ancien contexte (ex: { rules: "...", witness: 1 })
 * @param {object} newCtx  nouveau contexte
 * @returns {boolean} true si invalide
 */
export function versionInvalidatesCache(oldCtx, newCtx) {
  if (!oldCtx || !newCtx) return true;
  // Si règles changent → invalide
  if (oldCtx.rules !== newCtx.rules) return true;
  // Si witness change pour V5 → invalide
  if (oldCtx.witness !== undefined && newCtx.witness !== undefined) {
    if (oldCtx.witness !== newCtx.witness) return true;
  }
  return false;
}

/**
 * Met à jour les versions après une modification de règles.
 * À appeler par les outils de release, pas en runtime.
 * 
 * @param {"v3"|"b1"|"v5"} engine
 * @param {object} increments { rules?: boolean, witness?: boolean }
 * @returns {object} nouvelles versions
 */
export function bumpVersion(engine, increments = {}) {
  const ctx = { ...ENGINE_VERSIONS[engine] };
  if (increments.rules) {
    if (typeof ctx.rules === "string") {
      // Format "vX-engine" ou "b1-ladder"
      const match = ctx.rules.match(/^(.+?)-(\d+)$/);
      if (match) {
        ctx.rules = `${match[1]}-${parseInt(match[2], 10) + 1}`;
      } else {
        ctx.rules = `${ctx.rules}-1`;
      }
    }
  }
  if (increments.witness && ctx.witness !== undefined) {
    ctx.witness = Number(ctx.witness) + 1;
  }
  return Object.freeze(ctx);
}