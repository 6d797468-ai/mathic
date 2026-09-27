/**
 * @file compiler.mjs
 * MATHIC V6 - M26 Method Compiler
 *
 * Compiles explicit PlayerIntent into a sequence of V5 primitive commands (PLACE).
 * Pure, deterministic, no mutations, no tree search, no solver.
 */

import { checkPreconditions } from "../methods/preconditions.mjs";

const ALLOWED_COMMAND_IDS = new Set(["PLACE"]);

export function compile(state, intent, registry) {
  const preconditionResult = checkPreconditions(state, intent, registry);
  if (!preconditionResult.ok) {
    throw new Error(`MethodCompiler : préconditions non satisfaites : ${preconditionResult.reason}`);
  }

  const method = registry.get(intent.methodId);
  const compiled = method.compile(state, intent);

  if (!compiled || !Array.isArray(compiled.commands)) {
    throw new TypeError(`MethodCompiler : le compilateur de '${intent.methodId}' n'a pas retourné un tableau de commandes`);
  }

  for (const cmd of compiled.commands) {
    if (!cmd || typeof cmd !== "object") {
      throw new TypeError("MethodCompiler : commande invalide (non-objet)");
    }
    if (!ALLOWED_COMMAND_IDS.has(cmd.id)) {
      throw new TypeError(`MethodCompiler : commande V5 imaginaire ou interdite '${cmd.id}'. Seule 'PLACE' est autorisée.`);
    }
    if (!Number.isInteger(cmd.v) || cmd.v <= 0) {
      throw new TypeError(`MethodCompiler : commande PLACE valeur invalide '${cmd.v}'`);
    }
    if (!Number.isInteger(cmd.r) || cmd.r < 0 || !Number.isInteger(cmd.c) || cmd.c < 0) {
      throw new TypeError(`MethodCompiler : commande PLACE coordonnées invalides (${cmd.r},${cmd.c})`);
    }
  }

  return {
    methodId: intent.methodId,
    commands: compiled.commands.map((cmd) => ({
      id: "PLACE",
      v: cmd.v,
      r: cmd.r,
      c: cmd.c,
    })),
  };
}
