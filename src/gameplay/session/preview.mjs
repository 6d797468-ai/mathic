/**
 * @file preview.mjs
 * MATHIC V6 - M26 Preview Engine
 *
 * Simulates intent compilation and proof without mutating original session state.
 */

import { validateIntent } from "../methods/intent.mjs";
import { checkPreconditions } from "../methods/preconditions.mjs";
import { compile } from "../commands/compiler.mjs";
import { prove } from "../proof/proof-engine.mjs";

export function preview(state, intent, registry) {
  if (!state) {
    return {
      valid: false,
      methodId: intent?.methodId ?? "UNKNOWN",
      commands: [],
      proof: { valid: false, engine: "V5", steps: [], finalState: null },
      proposedState: null,
      cost: null,
      error: "État V5 initial nul ou indéfini",
    };
  }

  // Deep clone initial state snapshot for immutability check / safety
  const stateSnapshot = JSON.stringify(state);

  const intentCheck = validateIntent(intent);
  if (!intentCheck.valid) {
    return {
      valid: false,
      methodId: intent?.methodId ?? "UNKNOWN",
      commands: [],
      proof: { valid: false, engine: "V5", steps: [], finalState: null },
      proposedState: null,
      cost: null,
      error: `Intent invalide : ${intentCheck.errors.join("; ")}`,
    };
  }

  if (!registry || typeof registry.has !== "function" || !registry.has(intent.methodId)) {
    return {
      valid: false,
      methodId: intent.methodId,
      commands: [],
      proof: { valid: false, engine: "V5", steps: [], finalState: null },
      proposedState: null,
      cost: null,
      error: `Méthode '${intent.methodId}' non enregistrée`,
    };
  }

  const method = registry.get(intent.methodId);
  const cost = method.cost ? { ...method.cost } : null;

  const preconditionsResult = checkPreconditions(state, intent, registry);
  if (!preconditionsResult.ok) {
    return {
      valid: false,
      methodId: intent.methodId,
      commands: [],
      proof: { valid: false, engine: "V5", steps: [], finalState: null },
      proposedState: null,
      cost,
      error: `Préconditions échouées : ${preconditionsResult.reason}`,
    };
  }

  let compiled;
  try {
    compiled = compile(state, intent, registry);
  } catch (err) {
    return {
      valid: false,
      methodId: intent.methodId,
      commands: [],
      proof: { valid: false, engine: "V5", steps: [], finalState: null },
      proposedState: null,
      cost,
      error: `Échec de compilation : ${err.message}`,
    };
  }

  const proof = prove(state, compiled.commands);

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
    error: proof.valid ? undefined : proof.error,
  };
}
