/**
 * MATHIC — FINGERPRINT UTILITIES (M31 Ready)
 * ============================================================================
 * Utilitaires de fingerprint pour M31 Level Engine.
 * NE MODIFIE PAS le contrat M29 (admission.mjs utilise son propre FNV-1a).
 * Ce module sera utilisé par M31 pour le LevelDefinition fingerprint.
 */

import { SEAL_RULE_VERSION } from "../atelier/seal.mjs";
import { WITNESS_VERSION } from "../v5/rules/solvability-witness.mjs";

/**
 * Calcule le fingerprint canonique d'une spec V5 pour M31.
 * Identique à admission.mjs mais isolé pour évoluer indépendamment.
 * 
 * Format: FNV-1a 64-bit de canonicalSpec|SEAL_RULE_VERSION|WITNESS_VERSION
 * 
 * @param {object} v5Spec - spec V5 validée (sortie de validateSpec)
 * @returns {string} fingerprint hex 16 chars
 */
export function computeV5ContentFingerprint(v5Spec) {
  // Deep canonicalization: recursively sort all object keys
  function deepCanonicalize(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(deepCanonicalize);
    return Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = deepCanonicalize(obj[k]);
      return acc;
    }, {});
  }
  const canonSpec = JSON.stringify(deepCanonicalize(v5Spec));
  const payload = canonSpec + "|" + SEAL_RULE_VERSION + "|" + WITNESS_VERSION;
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < payload.length; i++) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Calcule le fingerprint pour un moteur donné.
 * Pour V5 : utilise computeV5ContentFingerprint
 * Pour B1/V3 : à définir quand leurs LevelDefinition existeront
 * 
 * @param {"v3"|"b1"|"v5"} engine
 * @param {object} spec - spec native du moteur
 * @returns {string|null} fingerprint ou null si non supporté
 */
export function computeContentFingerprint(engine, spec) {
  switch (engine) {
    case "v5":
      return computeV5ContentFingerprint(spec);
    case "b1":
    case "v3":
      // Sera implémenté quand LevelDefinition existera pour ces moteurs
      return null;
    default:
      return null;
  }
}

/**
 * Vérifie si deux specs produisent le même fingerprint.
 * @param {string} fp1
 * @param {string} fp2
 * @returns {boolean}
 */
export function sameFingerprint(fp1, fp2) {
  return fp1 === fp2 && fp1 !== null;
}

/**
 * Calcule un fingerprint de contenu générique (pour tests/debug).
 * FNV-1a 64-bit sur string arbitraire.
 * @param {string} payload
 * @returns {string}
 */
export function fnv1a64(payload) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < payload.length; i++) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Calcule un fingerprint de contenu générique pour n'importe quel objet.
 * Utile pour tests/debug.
 * @param {object} obj
 * @returns {string}
 */
export function fingerprintObject(obj) {
  const canon = JSON.stringify(obj, (key, value) => {
    if (key === "") return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
    return value;
  });
  return fnv1a64(canon);
}