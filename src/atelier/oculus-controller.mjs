// ============================================================================
// M14 — OCULUS D'ANALYSE · Oculus Controller
// ----------------------------------------------------------------------------
// L'Oculus est une PROJECTION ANALYTIQUE du moteur V5 — il n'est PAS un moteur.
//
//   Atelier UI → Oculus Controller → État adressable (replay) → analyse réelle
//
// Principes (mandat M14 §6, §13, §15) :
//   - Aucune cause inventée : un rejet n'est décrit que par des FAITS observables
//     sur l'état réel (cellule occupée, réserve épuisée, id inconnu, hors grille),
//     complétés par l'oracle `apply(state, cmd) === null`.
//   - Aucune seconde logique d'analyse : `getMoves` (portail de la loi de
//     ligne/colonne du moteur) est cité tel quel, jamais recalculé ici.
//   - Aucune mutation : analyse = fonction pure A = f(S, C), S = (spec, events, k).
//     Aucune écriture GameState / Save / trace replay. Aucun hasard, aucune
//     horloge, aucun réseau, aucun LLM (OC-07..11, OC-18).
//   - L'analyse est ATTACHÉE au curseur k : S_k = replay(spec, events[0..k])
//     est exactement l'état que le Sablier affiche à sa position k (§7).
// ============================================================================

import {
  validateSpec,
  createSession,
  apply,
  getState,
  getMoves,
  quickReject,
  replay,
} from "../v5/rules/engine.mjs";

const PLACE = "PLACE";

// ---------------------------------------------------------------------------
// État adressé : S_k = replay(spec, events[0..k]) — même construction que M13.
// ---------------------------------------------------------------------------

function stateAt(spec, events, k) {
  if (!Number.isInteger(k) || k < 0 || k > events.length) {
    throw new RangeError(`oculus : curseur hors bornes (${k} ∉ [0, ${events.length}])`);
  }
  if (k === 0) return createSession(spec);
  const states = replay(spec, events.slice(0, k));
  return states[states.length - 1];
}

// ---------------------------------------------------------------------------
// Lignes : données brutes exposées à la présentation (spec + grille au curseur).
// Aucun calcul de loi ici — on montre les valeurs réelles, le joueur voit la loi.
// ---------------------------------------------------------------------------

function lineViews(state, spec) {
  const grid = state.grid;
  const R = grid.length;
  const C = grid[0].length;
  const rows = [];
  for (let r = 0; r < R; r++) {
    const def = spec.rows[r];
    rows.push({ kind: "row", idx: r, ops: def.ops, target: def.target, cells: grid[r].slice() });
  }
  const cols = [];
  for (let c = 0; c < C; c++) {
    const def = spec.cols[c];
    const cells = [];
    for (let r = 0; r < R; r++) cells.push(grid[r][c]);
    cols.push({ kind: "col", idx: c, ops: def.ops, target: def.target, cells });
  }
  return { rows, cols };
}

// ---------------------------------------------------------------------------
// Fait observable d'un rejet (jamais dérivé du lore, jamais recalculé).
// ---------------------------------------------------------------------------

function rejectionFact(reasonCode, state, cmd) {
  switch (reasonCode) {
    case "REJECTED_COMMAND_UNKNOWN":
      return { fact: `Le moteur ne connaît que 'PLACE' — reçu '${String(cmd.id)}'.` };
    case "REJECTED_OUT_OF_BOUNDS":
      return { fact: `Coordonnées (${cmd.r},${cmd.c}) hors de la grille ${state.grid.length}×${state.grid[0].length}.` };
    case "REJECTED_CELL_OCCUPIED":
      return { fact: `Case (${cmd.r},${cmd.c}) : déjà scellée par ${state.grid[cmd.r][cmd.c]}. Aucune superposition possible.` };
    case "REJECTED_RESERVE_EMPTY":
      return { fact: `Réserve de ${cmd.value} : ${state.reserve[String(cmd.value)] ?? 0} exemplaire disponible.` };
    case "REJECTED_VALUE_INVALID":
      return { fact: `Valeur ${String(cmd.value)} : non reconnaissable par le moteur (ce n'est pas un entier).` };
    default:
      return { fact: "apply(state, cmd) === null : le moteur n'a produit aucune transition." };
  }
}

// ---------------------------------------------------------------------------
// Normalisation de la commande : adresse vérifiée AVANT l'appel au moteur.
// `apply` planterait sur r hors bornes (`s.grid[cmd.r][cmd.c]` indexerait
// undefined) ; l'Oculus garde l'analyse totale en garantissant l'adresse.
// Ce n'est pas un calcul mathématique : c'est une garde de coordonnées.
// ---------------------------------------------------------------------------

function normalizeCommand(cmd) {
  const raw = cmd ?? {};
  const isPlace = raw.id === undefined || raw.id === PLACE;
  const r = Number(raw.r);
  const c = Number(raw.c);
  const value = raw.value === undefined ? raw.v : raw.value;
  return { isPlace, id: raw.id, r, c, value };
}

// ---------------------------------------------------------------------------
// analyzeAction : analyse d'une ACTION proposée sur S_k.
//   valid   ← apply(S_k, cmd) !== null         (le moteur produirait une transition)
//   offered ← le coup figure-t-il dans getMoves(S_k) ?  (la loi de ligne/colonne)
// Un coup `valid` mais `offered:false` est accepté par le moteur ET ÉCARTÉ par
// la loi : les deux faits (apply OK, getMoves exclut) sont réels.
// ---------------------------------------------------------------------------

export function analyzeAction(spec, events, k, cmd) {
  const s = stateAt(spec, events, k);
  const state = getState(s);
  const command = normalizeCommand(cmd);
  const R = state.grid.length;
  const C = state.grid[0].length;

  let reasonCode = null;
  let rejectedFacts = [];
  let next = null;

  const inRange = Number.isInteger(command.r) && Number.isInteger(command.c) && command.r >= 0 && command.r < R && command.c >= 0 && command.c < C;

  if (!command.isPlace) {
    reasonCode = "REJECTED_COMMAND_UNKNOWN";
  } else if (!inRange) {
    reasonCode = "REJECTED_OUT_OF_BOUNDS";
  } else if (state.grid[command.r][command.c] !== -1) {
    reasonCode = "REJECTED_CELL_OCCUPIED";
  } else if (Number.isNaN(command.value)) {
    reasonCode = "REJECTED_VALUE_INVALID";
  } else {
    next = apply(s, { id: PLACE, v: command.value, r: command.r, c: command.c });
    if (next === null) {
      reasonCode = "REJECTED_RESERVE_EMPTY";
    }
  }

  if (next === null) {
    const rejectedFact = reasonCode !== null ? rejectionFact(reasonCode, state, command) : rejectionFact("default", state, command);
    return buildActionResult(spec, events, k, state, command, null, reasonCode, [rejectedFact]);
  }

  // Le moteur accepterait : la loi de ligne/colonne l'offre-t-elle ?
  const offered = getMoves(s).some((m) => m.v === command.value && m.r === command.r && m.c === command.c);
  const after = getState(next);
  return buildActionResult(spec, events, k, state, command, after, offered ? "ENGINE_OFFERS" : "ENGINE_ACCEPTS_NOT_OFFERED", []);
}

// ---------------------------------------------------------------------------
// analyzeState : analyse de L'ÉTAT complet au curseur k (S_k).
//  grid/reserve/solved/moves ← getState(S_k) réels.
//  offeredMoves  ← getMoves(S_k) — l'ensemble des coups que la LOI DU MOTEUR offre.
//  lines         ← données brutes (spec + grille) à la présentation.
//  lastEvent     ← événement réel events[k-1] qui produisit S_k (§8 : action faite).
//  specNote      ← quickReject (observer l'additivité) ; nil si non-tout-plus.
// ---------------------------------------------------------------------------

function additiveNote(spec) {
  const allPlus =
    spec.rows.every((l) => l.ops.every((op) => op === "+")) &&
    spec.cols.every((l) => l.ops.every((op) => op === "+"));
  if (!allPlus) return "NON-ADDITIF";
  return quickReject(spec) ? "UNSAT" : "SAT";
}

export function analyzeState(spec, events, k) {
  const s = stateAt(spec, events, k);
  const state = getState(s);
  return {
    mode: "state",
    cursor: k,
    total: events.length,
    atPresent: k === events.length,
    solved: state.solved,
    moves: state.moves,
    grid: state.grid,
    reserve: state.reserve,
    lastEvent: k === 0 ? null : events[k - 1],
    offeredMoves: getMoves(s).map((m) => ({ id: m.id, v: m.v, r: m.r, c: m.c, label: m.label })),
    lines: lineViews(state, spec),
    specNote: additiveNote(spec),
    reasonCode: state.solved ? "SOLVED" : "ONGOING",
    valid: true,
    affectedCells: k === 0 ? [] : [cellOfEvent(events[k - 1])],
    affectedValues: k === 0 ? [] : [valueOfEvent(events[k - 1])],
    source: "engine.replay|engine.getState|engine.getMoves|engine.quickReject",
  };
}

function cellOfEvent(ev) {
  return { r: ev.r, c: ev.c, role: "dernier coup", content: ev.value };
}
function valueOfEvent(ev) {
  return { value: ev.value, role: "posée au dernier coup" };
}

// ---------------------------------------------------------------------------
// analyzeSpec : expose la raison RÉELLE de validateSpec (§6 du corpus).
// ---------------------------------------------------------------------------

export function analyzeSpec(spec) {
  try {
    validateSpec(spec);
    return {
      mode: "spec",
      valid: true,
      reasonCode: "SPEC_OK",
      message: null,
      specNote: additiveNote(spec),
      source: "engine.validateSpec|engine.quickReject",
    };
  } catch (err) {
    return {
      mode: "spec",
      valid: false,
      reasonCode: "SPEC_INVALID",
      message: err.message,
      specNote: null,
      source: "engine.validateSpec",
    };
  }
}

// ---------------------------------------------------------------------------
// Construction d'un résultat d'action (clés ordonnées — stabilité octets).
// ---------------------------------------------------------------------------

function buildActionResult(spec, events, k, state, command, after, reasonCode, rejectedFacts) {
  const result = {
    mode: "action",
    cursor: k,
    total: events.length,
    atPresent: k === events.length,
    valid: after !== null,
    reasonCode,
    offered: after !== null && reasonCode === "ENGINE_OFFERS",
    command: { id: command.isPlace ? PLACE : String(command.id), value: command.value, r: command.r, c: command.c },
    stateBefore: { grid: state.grid, reserve: state.reserve },
    stateAfter: after !== null ? { grid: after.grid, reserve: after.reserve, solved: after.solved, moves: after.moves } : null,
    affectedCells: [],
    affectedValues: [],
    facts: rejectedFacts,
    source: "engine.apply|engine.getMoves",
  };

  if (command.value !== undefined && !Number.isNaN(command.value)) {
    if (after !== null) {
      result.affectedCells.push({ r: command.r, c: command.c, role: "cible", content: command.value });
      result.affectedValues.push({ value: command.value, role: "posée" });
    } else if (reasonCode === "REJECTED_CELL_OCCUPIED") {
      result.affectedCells.push({ r: command.r, c: command.c, role: "occupée", content: state.grid[command.r][command.c] });
    } else if (reasonCode === "REJECTED_OUT_OF_BOUNDS") {
      result.affectedCells.push({ r: command.r, c: command.c, role: "hors grille", content: null });
    } else if (reasonCode === "REJECTED_RESERVE_EMPTY") {
      result.affectedValues.push({ value: command.value, role: "épuisée", qty: state.reserve[String(command.value)] ?? 0 });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Présentation diégétique — DÉCOUPLÉE des faits.
//   AnalysisResult (ENGINE FACT, machine-lisible) ≠ present() (DIEGETIC TEXT).
//   Le texte n'ajoute JAMAIS une cause que les faits n'établissent pas.
// ---------------------------------------------------------------------------

const PRESENTATION = {
  SOLVED: { label: "CRÉATION STABILISÉE", tone: "ok" },
  ONGOING: { label: "ANOMALIE EN COURS", tone: "" },
  ENGINE_OFFERS: { label: "INCANTATION ACCEPTÉE", tone: "ok" },
  ENGINE_ACCEPTS_NOT_OFFERED: { label: "ACCEPTÉE PAR LE MOTEUR — ÉCARTÉE PAR LA LOI", tone: "warn" },
  REJECTED_COMMAND_UNKNOWN: { label: "INCANTATION REJETÉE", tone: "err" },
  REJECTED_OUT_OF_BOUNDS: { label: "INCANTATION HORS GRILLE", tone: "err" },
  REJECTED_CELL_OCCUPIED: { label: "INCANTATION REJETÉE", tone: "err" },
  REJECTED_RESERVE_EMPTY: { label: "INCANTATION REJETÉE", tone: "err" },
  REJECTED_VALUE_INVALID: { label: "INCANTATION REJETÉE", tone: "err" },
  SPEC_OK: { label: "SCEAU LÉGIBLE", tone: "ok" },
  SPEC_INVALID: { label: "SCEAU CORROMPU", tone: "err" },
};

export function present(result) {
  const p = PRESENTATION[result.reasonCode ?? "ONGOING"] ?? PRESENTATION.ONGOING;
  let body = null;
  if (result.mode === "spec" && !result.valid && result.message) {
    body = result.message;
  } else if (result.mode === "action" && !result.valid) {
    body = result.facts[0]?.fact ?? "Le moteur n'a produit aucune transition (apply → null).";
  } else if (result.mode === "action" && result.valid && !result.offered) {
    body = "Le moteur appliquerait cette pose, mais aucun de ses coups légaux (getMoves) ne l'offre : la loi de ligne/colonne l'écarte, sans qu'aucune cellule soit coupable.";
  }
  return { title: p.label, tone: p.tone, body, facts: result.facts ?? [] };
}

// ---------------------------------------------------------------------------
// createOculusController : façade mince (fail-fast comme M13) sur les fonctions
// pures. Ne porte AUCUN état de jeu : seulement la spec (et rien d'autre).
// Chaque appel re-dérive S_k par replay — l'analyse reste A = f(S, C).
// ---------------------------------------------------------------------------

export function createOculusController(spec) {
  validateSpec(spec);
  return {
    kind: "oculus",
    get spec() {
      return spec;
    },
    analyzeState(events, k) {
      return analyzeState(spec, events, k);
    },
    analyzeAction(events, k, cmd) {
      return analyzeAction(spec, events, k, cmd);
    },
    analyzeSpec() {
      return analyzeSpec(spec);
    },
    present(result) {
      return present(result);
    },
  };
}

// ---------------------------------------------------------------------------
// Aide à la présentation : valeurs actuellement en réserve (faits réels).
// ---------------------------------------------------------------------------

export function reserveValuesAt(state) {
  return Object.keys(state.reserve).filter((v) => state.reserve[v] > 0);
}