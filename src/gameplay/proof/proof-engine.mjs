/**
 * @file proof-engine.mjs
 * MATHIC V6 - M26 Proof Engine
 *
 * Validates a sequence of commands against the V5 rule engine using getMoves() + apply().
 *
 * ---------------------------------------------------------------------------
 * PORTÉE DE LA PREUVE — M26 = BLOCKED
 * ---------------------------------------------------------------------------
 * Ce moteur ne prouve QUE la LÉGALITÉ PRIMITIVE d'une séquence de PLACE :
 *   1. V5.getMoves(state) contient la commande ;
 *   2. V5.apply(state, commande) l'accepte.
 *
 * Il ne prouve PAS la POSTCONDITION SÉMANTIQUE d'une Méthode, c'est-à-dire que
 * la transformation mathématique demandée a réellement été accomplie.
 * Contrat M25 §2 M-01 : « une méthode ne peut jamais muter l'état du jeu sans
 * prouver sa transformation en une séquence d'opérations primitives valides
 * dans V5 ». Ce module satisfait C-02/C-03, mais M-01 N'EST PAS SEMANTIQUEMENT
 * SATISFAIT dans l'état observé : seule la partie « séquence de primitives
 * valides » est démontrée, la partie « transformation » ne l'est pas. Le
 * verdict est donc BLOCKED / UNPROVEN au niveau de preuve requis, et le reste
 * tant que le gate V5-SEMANTIC-WITNESS n'est pas fermé.
 *
 * Cause racine : V5 n'expose aucune API publique de témoin sémantique
 * (evaluateLine / verifyLine). Prouver « 3 et 4 sur une ligne * produisent 12 »
 * imposerait de recopier lineOk() / evalOp() / sumFeasible() dans
 * src/gameplay/, ce que le contrat interdit explicitement.
 *
 * ETAT CONNUE, mesuré en audit maître (M26 BLOCKED) :
 *   METHOD_FACTORIZE(12 = 3 x 4) sur une ligne ops ["+","+"]  -> valid = true
 *   METHOD_DECOMPOSE(7 = 3 + 4) sur une ligne ops ["*","*"]   -> valid = true
 *   METHOD_FACTORIZE avec 3@(0,0) et 4@(2,2) (sans ligne commune) -> valid = true
 *
 * Ces trois cas sont des FAUX POSITIFS de portée, pas des succès de Méthode.
 * Toute réouverture de M26 doit les faire basculer sur un statut PROVEN
 *_semantique_ appuyé sur un témoin V5, jamais sur un élargissement de `valid`.
 * ---------------------------------------------------------------------------
 */

import { getMoves, apply } from "../../v5/rules/engine.mjs";

/** Portée effectivement démontrée par `prove()`. */
export const PROOF_SCOPE_PRIMITIVE_ONLY = "PRIMITIVE_LEGALITY_ONLY";

/** Statut du volet sémantique tant que le gate V5 n'est pas fermé. */
export const SEMANTIC_STATUS_BLOCKED = "BLOCKED";

/** Statut cible, atteignable uniquement via une API de témoin V5. */
export const SEMANTIC_STATUS_PROVEN = "PROVEN";

/**
 * Verdict sémantique figé. `proven` ne peut pas valoir `true` tant que
 * `SEMANTIC_STATUS_BLOCKED` est exporté par ce module : un implémenteur futur
 * doit faire évoluer le moteur ET ses tests, et ne peut jamais laisser croire
 * qu'un `valid: true` certifie une Méthode.
 */
export const SEMANTIC_PROOF_BLOCKED = Object.freeze({
  status: SEMANTIC_STATUS_BLOCKED,
  proven: false,
  reason:
    "V5 n'expose aucune API publique de témoin sémantique (evaluateLine/verifyLine) : " +
    "la postcondition d'une Méthode ne peut être établie sans dupliquer " +
    "lineOk()/evalOp()/sumFeasible(), ce que le contrat M25 interdit.",
  missingApi: Object.freeze(["evaluateLine"]),
  blockedBy: "V5-SEMANTIC-WITNESS",
});

/**
 * Porte de sortie unique pour un consommateur : tant que le volet sémantique
 * n'est pas prouvé, AUCUN résultat de ce module ne doit être présenté comme un
 * certificat de Méthode.
 */
export function isSemanticallyProven(result) {
  return result?.semantic?.status === SEMANTIC_STATUS_PROVEN && result?.semantic?.proven === true;
}

function envelope(extra) {
  return {
    engine: "V5",
    scope: PROOF_SCOPE_PRIMITIVE_ONLY,
    semantic: SEMANTIC_PROOF_BLOCKED,
    ...extra,
  };
}

export function prove(state, commands) {
  if (!state || !Array.isArray(commands)) {
    return envelope({
      valid: false,
      steps: [],
      finalState: null,
      error: "Paramètres d'entrée invalides pour ProofEngine.prove",
    });
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
      return envelope({
        valid: false,
        steps,
        finalState: null,
        error: `Étape ${index} illégale selon V5.getMoves() : PLACE ${command?.v}@(${command?.r},${command?.c})`,
      });
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
      return envelope({
        valid: false,
        steps,
        finalState: null,
        error: `Étape ${index} rejetée par V5.apply() : PLACE ${command?.v}@(${command?.r},${command?.c})`,
      });
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

  return envelope({
    valid: true,
    steps,
    finalState: currentState,
  });
}
