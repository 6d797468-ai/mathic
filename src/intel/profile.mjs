// MATHIC 1.0 — Player Profile Detector (Brique 3, MISSION 2)
//
// Transforme une séquence de Player Evidence VALIDÉES (contrat Brique 2) en un
// profil comportemental dynamique, explicable, versionné et reproductible.
//
// PRINCIPES :
//  - consommateur EXCLUSIF de l'interface Evidence : aucune lecture du DOM,
//    aucune variable privée du runtime, aucun accès direct au GameState ;
//  - méthode v1 = DETERMINISTIC / RULE-BASED / EXPLAINABLE / MODEL-INDEPENDENT
//    (instruction du mandat §10) : aucun ML/LLM ici ;
//  - le détecteur ne modifie JAMAIS le gameplay (observateur pur) ;
//  - les dimensions décrivent le comportement OBSERVÉ dans Mathic, jamais la
//    personne (âge, QI, intelligence, personnalité, catégorie sensible : interdit) ;
//  - une évidence invalide est rejetée (le jeu continue, profil sûr) ;
//  - « absence d'information ≠ comportement faible » : un profil vide garde des
//    dimensions neutres à 0 et confidence 0 — jamais un jugement de faiblesse.
//
// FENÊTRE (§12) : moyenne à décroissance géométrique (weighted recent window).
// Chaque évidence reçoit un poids issu d'un facteur decay ; la plus récente a le
// poids maximal, les plus anciennes s'estompent. Mémoire bornée (2 accumulateurs
// par dimension) ; deterministe, versionnée, reproductible (le rejeu depuis zéro
// et l'incrémental donnent le même profil).

import {
  PROFILE_DIMENSIONS,
  PROFILE_SCHEMA_VERSION,
  DETECTOR_VERSION,
  DEFAULT_PROFILE,
  validateEvidence,
  isProfileShape,
  validateProfile,
} from "./contracts.mjs";

export const DETECTION_METHOD = "weighted-recent-window-v1";
export const EVIDENCE_WINDOW_DEFAULT = 20;
export const SUFFICIENT_EVIDENCE_MIN = 10;
export const HIGH_CONFIDENCE_MIN = 30;
export const HIGH_CONFIDENCE_THRESHOLD = 0.75;

export const PROFILE_STATES = Object.freeze(["NO EVIDENCE", "LOW EVIDENCE", "SUFFICIENT EVIDENCE", "HIGH CONFIDENCE"]);

const DIMENSION_KEYS = PROFILE_DIMENSIONS.filter((k) => k !== "confidence" && k !== "evidenceWindow");

// ---------------------------------------------------------------------------
// Table de règles v1 — chaque évidence pousse une/plusieurs dimensions avec un
// signal ∈ [0,1]. Les fonctions reçoivent payload (déjà validé) pour extraire un
// fait mesuré ; les constantes sont des coefficients documentés (voir doc § règle).
// ---------------------------------------------------------------------------

const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const arithAtWin = (p) => clamp01(0.6 + 0.005 * (p && Number.isFinite(p.score) ? p.score : 0));
const previewExploration = (p) => (p && p.chainRun >= 1 ? 0.3 : 0.6);
const previewStrategy = (p) => (p && p.chainRun >= 1 ? 0.8 : 0.3);
const commitStrategy = (p) => (p && p.chainRun >= 1 ? 0.8 : 0.4);
const commitChain = (p) => (p && p.chainRun >= 1 ? 0.9 : 0.15);
const commitEfficiency = (p) => (p && p.chainRun >= 1 ? 0.85 : 0.4);
const winEfficiency = (p) => (p && Number.isFinite(p.movesLeft) && p.movesLeft > 0 ? 0.85 : 0.4);

export const DETECTION_RULES = Object.freeze({
  LEVEL_STARTED: null,
  LEVEL_RESTARTED: Object.freeze({ retryTolerance: 0.85, difficultyResponse: 0.5 }),
  LEVEL_COMPLETED: Object.freeze({
    arithmetic: arithAtWin,
    efficiency: winEfficiency,
    difficultyResponse: 0.6,
    strategy: 0.55,
  }),
  LEVEL_FAILED: Object.freeze({ arithmetic: 0.2, efficiency: 0.2, difficultyResponse: 0.7, exploration: 0.3 }),
  LEVEL_ABANDONED: Object.freeze({ difficultyResponse: 0.3, strategy: 0.3, arithmetic: 0.25 }),
  ACTION_PREVIEWED: Object.freeze({ exploration: previewExploration, strategy: previewStrategy }),
  ACTION_COMMITTED: Object.freeze({ arithmetic: 0.5, strategy: commitStrategy, chainAffinity: commitChain, efficiency: commitEfficiency }),
  ACTION_INVALID: Object.freeze({ exploration: 0.35, difficultyResponse: 0.8, efficiency: 0.3 }),
  UNDO_USED: Object.freeze({ exploration: 0.6, strategy: 0.3, efficiency: 0.25 }),
  CHAIN_STARTED: Object.freeze({ chainAffinity: 0.95, strategy: 0.9, efficiency: 0.7 }),
  CHAIN_BROKEN: Object.freeze({ chainAffinity: 0.3, strategy: 0.25, exploration: 0.5 }),
  HINT_REQUESTED: Object.freeze({ hintDependency: 0.85, strategy: 0.2, difficultyResponse: 0.4 }),
  HINT_USED: Object.freeze({ hintDependency: 0.95, efficiency: 0.3 }),
  // TIME_TO_* / SOLUTION_* / RETRY_COUNT : types dérivés — aucune règle v1.
  // Ils comptent dans la fenêtre mais ne déplacent aucune dimension.
});

// ---------------------------------------------------------------------------
// Estimation décroissante — noyau déterministe
// ---------------------------------------------------------------------------

const round4 = (x) => Math.round(x * 1e4) / 1e4;

function emptyState() {
  const acc = {};
  for (const dim of DIMENSION_KEYS) acc[dim] = { w: 0, s: 0 };
  return { acc, count: 0 };
}

function signalValue(rule, payload) {
  return typeof rule === "function" ? rule(payload) : rule;
}

function estimateDimension(acc) {
  return acc.w > 0 ? clamp01(acc.s / acc.w) : 0;
}

function makeEstimates(state) {
  const out = {};
  for (const dim of DIMENSION_KEYS) out[dim] = estimateDimension(state.acc[dim]);
  return out;
}

// ---------------------------------------------------------------------------
// Profil de sortie — forme figée du contrat (ordre de clé déterministe)
// ---------------------------------------------------------------------------

export function profileState(profile) {
  const w = profile && typeof profile.evidenceWindow === "number" ? profile.evidenceWindow : 0;
  if (w === 0) return "NO EVIDENCE";
  if (w < SUFFICIENT_EVIDENCE_MIN) return "LOW EVIDENCE";
  if (profile && profile.confidence < HIGH_CONFIDENCE_THRESHOLD) return "SUFFICIENT EVIDENCE";
  return "HIGH CONFIDENCE";
}

export function confidenceOf(state) {
  if (!state || state.count === 0) return 0;
  const volume = clamp01((state.count - SUFFICIENT_EVIDENCE_MIN) / (HIGH_CONFIDENCE_MIN - SUFFICIENT_EVIDENCE_MIN));
  const active = DIMENSION_KEYS.filter((d) => state.acc[d].w > 0).length;
  const coverage = DIMENSION_KEYS.length ? active / DIMENSION_KEYS.length : 0;
  return round4(volume * coverage);
}

function snapshot(state) {
  const profile = {};
  for (const dim of DIMENSION_KEYS) profile[dim] = round4(estimateDimension(state.acc[dim]));
  profile.confidence = confidenceOf(state);
  profile.evidenceWindow = state.count;
  profile.version = PROFILE_SCHEMA_VERSION;
  return Object.freeze({ ...DEFAULT_PROFILE, ...profile });
}

// ---------------------------------------------------------------------------
// Cœur incrémental — mise à jour d'une évidence validée
// ---------------------------------------------------------------------------

function applyEvidence(state, decay, ev, batch) {
  const rule = DETECTION_RULES[ev.type];
  for (const dim of DIMENSION_KEYS) {
    const acc = state.acc[dim];
    acc.w *= decay;
    acc.s *= decay;
    const contrib = rule && Object.prototype.hasOwnProperty.call(rule, dim) ? rule[dim] : undefined;
    if (contrib !== undefined) {
      const v = clamp01(signalValue(contrib, ev.payload));
      acc.w += 1;
      acc.s += v;
      batch.dimTypes[dim] = batch.dimTypes[dim] || new Set();
      batch.dimTypes[dim].add(ev.type);
      batch.dimCount[dim] = (batch.dimCount[dim] || 0) + 1;
      batch.dimSignals[dim] = (batch.dimSignals[dim] || 0) + 1;
    }
  }
  state.count += 1;
  batch.types.add(ev.type);
}

function runBatch(state, decay, evidence) {
  const batch = { dimTypes: {}, dimCount: {}, dimSignals: {}, types: new Set(), accepted: 0, rejected: 0 };
  if (evidence === null || evidence === undefined) return batch;
  const sequence = Array.isArray(evidence) ? evidence : [evidence];
  for (const ev of sequence) {
    if (!validateEvidence(ev).length) {
      applyEvidence(state, decay, ev, batch);
      batch.accepted += 1;
    } else {
      batch.rejected += 1;
    }
  }
  return batch;
}

function explanationEntries(before, after, batch) {
  const entries = [];
  for (const dim of DIMENSION_KEYS) {
    if (!batch.dimTypes[dim]) continue;
    entries.push({
      dimension: dim,
      delta: round4(after[dim] - before[dim]),
      evidence: [...batch.dimTypes[dim]].sort(),
      evidenceCount: batch.dimCount[dim],
    });
  }
  return entries.sort((a, b) => a.dimension.localeCompare(b.dimension));
}

// ---------------------------------------------------------------------------
// API publique — détecteur incrémental ET fonction pure de rejeu
// ---------------------------------------------------------------------------

export function createProfileDetector({ windowSize = EVIDENCE_WINDOW_DEFAULT } = {}) {
  const size = Number.isFinite(windowSize) && windowSize > 1 ? windowSize : EVIDENCE_WINDOW_DEFAULT;
  const decay = (size - 1) / size;
  let state = emptyState();

  return {
    config: () => Object.freeze({ windowSize: size, decay, method: DETECTION_METHOD, detectorVersion: DETECTOR_VERSION }),
    update(evidence) {
      const before = makeEstimates(state);
      const batch = runBatch(state, decay, evidence);
      const after = makeEstimates(state);
      const delta = {};
      for (const dim of DIMENSION_KEYS) delta[dim] = round4(after[dim] - before[dim]);
      return {
        profile: snapshot(state),
        state: profileState(snapshot(state)),
        delta,
        explanations: explanationEntries(before, after, batch),
        accepted: batch.accepted,
        rejected: batch.rejected,
        version: PROFILE_SCHEMA_VERSION,
        detectorVersion: DETECTOR_VERSION,
        method: DETECTION_METHOD,
      };
    },
    profile() {
      return snapshot(state);
    },
    state() {
      return profileState(snapshot(state));
    },
    window() {
      return state.count;
    },
  };
}

export function detectProfile(evidence, { previous } = {}) {
  const detector = createProfileDetector();
  const result = detector.update(evidence);
  const before = isProfileShape(previous) && validateProfile(previous).length === 0 ? { ...DEFAULT_PROFILE, ...previous } : null;
  const delta = before ? {} : result.delta;
  if (before) {
    for (const dim of DIMENSION_KEYS) delta[dim] = round4(result.profile[dim] - before[dim]);
  }
  return { ...result, delta, method: DETECTION_METHOD, detectorVersion: DETECTOR_VERSION };
}