/**
 * @file preview.mjs
 * MATHIC V6 - M26 Preview Engine
 *
 * Simulates intent compilation and proof without mutating original session state.
 */

import { validateIntent } from "../methods/intent.mjs";
import { checkPreconditions } from "../methods/preconditions.mjs";
import { compile } from "../commands/compiler.mjs";
import { methodRelation } from "../methods/catalog.mjs";
import {
  prove,
  isSemanticallyProven,
  PROOF_SCOPE_PRIMITIVE_ONLY,
  SEMANTIC_PROOF_BLOCKED,
  SEMANTIC_PROOF_UNPROVEN,
} from "../proof/proof-engine.mjs";

/**
 * Forme constante des retours précoces : mêmes clés que le cas nominal, donc
 * aucun consommateur ne peut lire `valid` sur un objet qui n'expose pas la
 * portée de la preuve ni le statut sémantique.
 */
function blockedPreview(methodId, error, cost = null) {
  return {
    valid: false,
    methodId: methodId ?? "UNKNOWN",
    commands: [],
    proof: { valid: false, engine: "V5", scope: PROOF_SCOPE_PRIMITIVE_ONLY, semantic: SEMANTIC_PROOF_UNPROVEN, steps: [], finalState: null },
    proposedState: null,
    cost,
    proofScope: PROOF_SCOPE_PRIMITIVE_ONLY,
    semantic: SEMANTIC_PROOF_UNPROVEN,
    methodSemanticsCertified: false,
    error,
  };
}

export function preview(state, intent, registry) {
  if (!state) {
    return blockedPreview(intent?.methodId, "État V5 initial nul ou indéfini");
  }

  // Deep clone initial state snapshot for immutability check / safety
  const stateSnapshot = JSON.stringify(state);

  const intentCheck = validateIntent(intent);
  if (!intentCheck.valid) {
    return blockedPreview(
      intent?.methodId,
      `Intent invalide : ${intentCheck.errors.join("; ")}`
    );
  }

  if (!registry || typeof registry.has !== "function" || !registry.has(intent.methodId)) {
    return blockedPreview(intent.methodId, `Méthode '${intent.methodId}' non enregistrée`);
  }

  const method = registry.get(intent.methodId);
  const cost = method.cost ? { ...method.cost } : null;

  const preconditionsResult = checkPreconditions(state, intent, registry);
  if (!preconditionsResult.ok) {
    return blockedPreview(
      intent.methodId,
      `Préconditions échouées : ${preconditionsResult.reason}`,
      cost
    );
  }

  let compiled;
  try {
    compiled = compile(state, intent, registry);
  } catch (err) {
    return blockedPreview(intent.methodId, `Échec de compilation : ${err.message}`, cost);
  }

  // Reclamation V5 derivee de la DECLARATION de la Methode (operateur) et de
  // l'Intent (cellules, valeurs, cible). Aucun calcul ici : le temoin statue.
  const relation = methodRelation(method, intent);
  const proof = prove(state, compiled.commands, relation);

  // Guarantee zero mutation on state
  if (JSON.stringify(state) !== stateSnapshot) {
    throw new Error("MUTATION DETECTED: preview() a altéré l'état initial !");
  }

  return {
    valid: proof.valid,
    methodId: intent.methodId,
    commands: compiled.commands,
    proof,
    proposedState: proof.valid ? proof.finalState : null,
    cost,
    // `valid` ne vaut que la légalité primitive des PLACE (portée V5). Il ne
    // certifie PAS que la Méthode a été accomplie : tant que le gate
    // V5-SEMANTIC-WITNESS est ouvert, ce drapeau reste à false.
    proofScope: proof.scope ?? PROOF_SCOPE_PRIMITIVE_ONLY,
    semantic: proof.semantic ?? SEMANTIC_PROOF_BLOCKED,
    semanticRelation: relation,
    methodSemanticsCertified: isSemanticallyProven(proof),
    error: proof.valid ? undefined : proof.error,
  };
}
