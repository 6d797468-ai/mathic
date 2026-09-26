/**
 * MATHIC V5 — ADMISSION GATE
 * ============================================================================
 * Gate d'admission pour les specs V5 entrantes dans la seam Grimoire V5.
 *
 * Ce module ne duplique AUCUNE logique de jeu. Il consomme :
 *   - la spec V5 canonique (celle que valide engine.mjs)
 *   - la version de règles du sceau Atelier (SEAL_RULE_VERSION)
 *   - la version du witness de solvabilité (WITNESS_VERSION)
 *
 * Il produit un verdict d'admission basé sur le witness de solvabilité.
 *
 * Interdits :
 *   - aucune table d'operateurs, aucun evalOp, aucun lineOk
 *   - aucune duplication de engine.mjs
 *   - aucun import de solver.mjs (legacy)
 */

import { SEAL_RULE_VERSION } from "../../atelier/seal.mjs";
import { proveSolvability, WITNESS_VERSION, SOLVABLE, UNSOLVABLE, UNPROVEN, UNSUPPORTED } from "./solvability-witness.mjs";
import { validateSpec } from "./engine.mjs";

/**
 * Cache de preuves d'admission. Clé = fingerprint.
 * Structure : Map<fingerprint, { proofStatus, cause, outcome, fingerprint, witnessVersion, ruleVersion, witness }>
 */
const admissionCache = new Map();

/**
 * Hash déterministe rapide (FNV-1a 64-bit via BigInt) pour fingerprint de cache.
 * Pas cryptographique, mais suffisant pour l'adressage de cache sans collision
 * dans le domaine d'application (quelques milliers de clés max).
 */
function fnv1a64(str) {
  let hash = 0xcbf29ce484222325n; // FNV offset basis (64-bit)
  const prime = 0x100000001b3n;   // FNV prime (64-bit)
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn; // mask 64-bit
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Calcule le fingerprint canonique d'une spec V5.
 *
 * Le fingerprint est un FNV-1a 64-bit (hex) de :
 *   canonicalSpec + "|" + SEAL_RULE_VERSION + "|" + WITNESS_VERSION
 *
 * `canonicalSpec` = JSON.stringify(spec, clés triées) — stable et déterministe.
 *
 * @param {object} spec  spec V5 validée
 * @returns {string} empreinte hex 16 chars
 */
/**
 * Calcule le fingerprint canonique d'une spec V5.
 *
 * Le fingerprint est un FNV-1a 64-bit (hex) de :
 *   canonicalSpec + "|" + SEAL_RULE_VERSION + "|" + WITNESS_VERSION
 *
 * `canonicalSpec` = JSON.stringify(spec, replacer qui trie SEULEMENT les clés racine).
 * Le bug connu de JSON.stringify avec un tableau comme replacer (qui filtre tout l'arbre)
 * est évité en utilisant une fonction replacer qui ne trie que le niveau racine.
 */
export function computeFingerprint(spec) {
  // Replacer qui ne trie que les clés du niveau racine
  const canonSpec = JSON.stringify(spec, (key, value) => {
    if (key === "") return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
    return value;
  });
  const payload = `${canonSpec}|${SEAL_RULE_VERSION}|${WITNESS_VERSION}`;
  return fnv1a64(payload);
}

/**
 * Exécute l'admission complète pour une spec V5.
 *
 * @param {object} spec           spec V5 à admettre
 * @param {object} [options]      { maxDepth, budget }
 * @returns {object}              { outcome, proofStatus, cause, fingerprint, witness }
 */
export function admitSpec(spec, options = {}) {
  // Validation structurelle (engine.mjs)
  let validatedSpec;
  try {
    validatedSpec = validateSpec(spec);
  } catch (err) {
    return {
      outcome: "REJECT",
      proofStatus: "UNSUPPORTED",
      cause: "UNSUPPORTED",
      fingerprint: null,
      witness: { status: "UNSUPPORTED", reason: `spec invalide : ${err.message}` },
    };
  }

  // Fingerprint
  const fingerprint = computeFingerprint(validatedSpec);

  // Cache hit
  const cached = admissionCache.get(fingerprint);
  if (cached) {
    return { ...cached, fingerprint };
  }

  // Solvability witness
  const maxDepth = options.maxDepth ?? 8;
  const budget = options.budget ?? 20000;
  const witness = proveSolvability(validatedSpec, { maxDepth, budget });

  // Mapping proofStatus → outcome + cause
  let outcome, cause;
  switch (witness.status) {
    case "PROVEN_SOLVABLE":
      outcome = "ACCEPT";
      cause = "PROVEN_SOLVABLE";
      break;
    case "PROVEN_UNSOLVABLE":
      outcome = "REJECT";
      cause = "PROVEN_UNSOLVABLE";
      break;
    case "UNPROVEN":
      outcome = "HOLD";
      cause = "UNPROVEN";
      break;
    case "UNSUPPORTED":
      outcome = "REJECT";
      cause = "UNSUPPORTED";
      break;
    default:
      outcome = "REJECT";
      cause = "UNSUPPORTED";
  }

  const result = {
    outcome,
    proofStatus: witness.status,
    cause,
    fingerprint,
    witness: {
      status: witness.status,
      proof: witness.proven,
      searchComplete: witness.searchComplete,
      minMoves: witness.minMoves,
      nodesExpanded: witness.nodesExpanded,
      nodesSeen: witness.nodesSeen,
      truncatedBy: witness.truncatedBy,
      reason: witness.reason,
    },
  };

  // Cache
  admissionCache.set(fingerprint, {
    ...result,
    fingerprint,
    witnessVersion: WITNESS_VERSION,
    ruleVersion: SEAL_RULE_VERSION,
  });

  return result;
}

/**
 * Vide le cache d'admission (utile pour les tests).
 */
export function clearAdmissionCache() {
  admissionCache.clear();
}

/**
 * Exporte le cache pour inspection (tests).
 */
export function getAdmissionCache() {
  return admissionCache;
}