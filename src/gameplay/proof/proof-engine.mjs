/**
 * @file proof-engine.mjs
 * MATHIC V6 - M26 Proof Engine
 *
 * Validates a sequence of commands against the V5 rule engine using getMoves() + apply().
 */

import { getMoves, apply } from "../../v5/rules/engine.mjs";

export function prove(state, commands) {
  if (!state || !Array.isArray(commands)) {
    return {
      valid: false,
      engine: "V5",
      steps: [],
      finalState: null,
      error: "Paramètres d'entrée invalides pour ProofEngine.prove",
    };
  }

  let currentState = state;
  const steps = [];

  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];

    // 1. Get legal moves for currentState from V5
    const legalMoves = getMoves(currentState);

    // 2. Check if requested command belongs to legal moves
    const isLegalMove = legalMoves.some(
      (m) => m.id === command.id && m.v === command.v && m.r === command.r && m.c === command.c
    );

    if (!isLegalMove) {
      steps.push({
        index,
        command,
        legal: false,
        state: currentState,
      });
      return {
        valid: false,
        engine: "V5",
        steps,
        finalState: null,
        error: `Étape ${index} illégale selon V5.getMoves() : PLACE ${command?.v}@(${command?.r},${command?.c})`,
      };
    }

    // 3. Apply command in V5
    const nextState = apply(currentState, command);

    if (!nextState) {
      steps.push({
        index,
        command,
        legal: false,
        state: currentState,
      });
      return {
        valid: false,
        engine: "V5",
        steps,
        finalState: null,
        error: `Étape ${index} rejetée par V5.apply() : PLACE ${command?.v}@(${command?.r},${command?.c})`,
      };
    }

    // 4. Record successful step and advance
    steps.push({
      index,
      command,
      legal: true,
      state: nextState,
    });

    currentState = nextState;
  }

  return {
    valid: true,
    engine: "V5",
    steps,
    finalState: currentState,
  };
}
