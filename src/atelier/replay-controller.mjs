// ============================================================================
// M13 — SABLIER DE CHRONOS · Replay Controller
// ----------------------------------------------------------------------------
// Le Sablier est une PROJECTION UI du mécanisme de replay existant :
//
//   PLAYER → UI Atelier → Replay Controller → replay(spec, events) → Game State
//
// Principes :
//   - Aucun nouvel état « artisanal » : l'état à la position k est TOUJOURS
//     `replay(spec, events.slice(0, k))` — fonction pure du moteur V5.
//   - La trace n'enregistre que les événements VALIDES réellement commis
//     (le contrat `apply(...) → null` ⇒ INVALID ne crée aucune transition).
//   - Après retour temporel, un nouveau coup VALIDE crée une BRANCHE :
//     la trace reste une liste plate unique, la position du curseur définit
//     le présent, et les événements futurs sont tronqués (modèle branche).
//     Aucun deuxième historique (interdit par le mandat §15).
//   - Aucune écriture Save, aucun accès Policy/Intelligence, aucun réseau.
//   - Aucune horloge, aucun hasard : deux replays identiques sont byte-identiques.
// ============================================================================

import {
  validateSpec,
  createSession,
  apply,
  getState,
  getMoves,
  isSolved,
  canonical,
  replay,
} from "../v5/rules/engine.mjs";

function assertCursor(value, total, label) {
  if (!Number.isInteger(value) || value < 0 || value > total) {
    throw new RangeError(`chronos : ${label} hors bornes (${value} ∉ [0, ${total}])`);
  }
  return value;
}

export function createReplayController(spec) {
  validateSpec(spec);
  const S0 = createSession(spec);

  let trace = [];        // événements VALIDES commis (liste plate, vraie trace)
  let position = 0;      // curseur [0, trace.length] ; 0 = état initial

  // L'état au curseur = replay réel du préfixe (vérité moteur, jamais reconstruit à la main).
  function stateAt(k) {
    if (k === 0) return S0;
    const states = replay(spec, trace.slice(0, k));
    return states[states.length - 1];
  }

  return {
    kind: "chronos",

    get spec() {
      return spec;
    },
    get trace() {
      return trace.slice();
    },
    get position() {
      return position;
    },
    get total() {
      return trace.length;
    },

    cursor() {
      return { position, total: trace.length };
    },

    atStart() {
      return position === 0;
    },
    atEnd() {
      return position === trace.length;
    },

    // État réel au curseur (source : replay(spec, E[1..k])).
    getState() {
      return getState(stateAt(position));
    },

    // État initial (curseur 0) — replay d'une trace vide.
    getInitialState() {
      return getState(S0);
    },

    // État courant réel (curseur total) — l'extrémité vivante de la trace.
    getPresentState() {
      return getState(stateAt(trace.length));
    },

    // Commandes VALIDES disponibles AU CURSEUR (vérité du moteur).
    getCommands() {
      return getMoves(stateAt(position)).map((m) => ({ value: m.v, r: m.r, c: m.c, id: m.id }));
    },

    isSolvedAtCursor() {
      return isSolved(stateAt(position));
    },

    canonicalAtCursor() {
      return canonical(stateAt(position));
    },

    // ── Déplacements temporels (position du curseur) -------------------------
    // seek(k) : déplacement explicite, au curseur. k ∈ [0, total] stricte.
    seek(k) {
      const safe = assertCursor(k, trace.length, "seek position");
      position = safe;
      return this.getState();
    },
    // back(k) : revient de k crans (navigation sûre, clampée à 0 ; k ≥ 1 entier).
    back(k = 1) {
      if (!Number.isInteger(k) || k < 1) {
        throw new RangeError(`chronos : back depth invalide (${String(k)})`);
      }
      return this.seek(Math.max(0, position - k));
    },
    // backToStart() : retour à l'origine (position 0 = état initial).
    backToStart() {
      return this.seek(0);
    },
    // toPresent() : retour au présent (position total = état courant).
    toPresent() {
      return this.seek(trace.length);
    },

    // ── Actions ---------------------------------------------------------------
    // move(cmd) : applique une ACTION au curseur.
    //   VALID  → transition d'état réelle + événement → trace → branche (si besoin)
    //   INVALID→ aucune transition (apply→null) : curseur/état/trace inchangés.
    move(cmd) {
      const current = stateAt(position);
      const payload = {
        id: cmd?.id ?? "PLACE",
        v: cmd?.value ?? cmd?.v,
        r: cmd?.r,
        c: cmd?.c,
      };
      const next = apply(current, payload);
      if (!next) {
        return { ok: false, reason: "ILLIGAL_PLACE", cmd };
      }
      // Coups invalides NON comptés dans la trace : seuls les événements réels entrent.
      const event = next.events[next.events.length - 1];
      trace = [...trace.slice(0, position), event]; // branche : tronque le futur
      position = trace.length;                      // le présent devient la nouvelle extrémité
      return { ok: true, event, state: getState(stateAt(position)) };
    },

    // redoAfterSeek(cmd) : depuis une position temporelle (curseur k<n), l'UI joue
    // une action VALIDE → branche. Identique à move() : la trace reste unique.
    // Equivalent direct : move() est déjà position-aware. Fourni par clarté API.
    moveFromCursor(cmd) {
      return this.move(cmd);
    },

    // undo() : recule le curseur d'un cran en TRONQUANT l'événement rejeté de la
    // trace (modèle branche). Ne provient JAMAIS d'une inversion mathématique :
    // l'état est re-dérivé par replay(spec, E[1..k-1]). Déterministe.
    undo() {
      if (position <= 0) {
        return { ok: false, reason: "AT_START", position };
      }
      trace = trace.slice(0, position - 1);
      position = trace.length;
      return { ok: true, position, state: getState(stateAt(position)) };
    },

    // ── Contrat de reproductibilité ------------------------------------------
    // Deux replays identiques → états byte-identiques (déterminisme moteur).
    verify() {
      const a = stateAt(trace.length);
      const b = stateAt(trace.length);
      return {
        ok: canonical(a) === canonical(b) && getState(a).moves === getState(b).moves,
        canonical: canonical(a),
        moves: getState(a).moves,
      };
    },

    // État terminal : le replay ne l'altère pas (lecture pure, aucune écriture).
    terminalCanonical() {
      const s = stateAt(trace.length);
      return canonical(s);
    },
  };
}