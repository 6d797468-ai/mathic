// MATHIC 1.0 — Progression Policy (MISSION 3)
//
// Transforme :
//   Player Profile + Current Progression State + Candidate Levels + Level
//   Design Metadata + Difficulty Metadata + Policy Configuration
// en une RECOMMANDATION DE PROGRESSION déterministe et explicable.
//
// PRINCIPES (mandat MISSION 3) :
//  - la Policy RECOMMANDE, elle ne COMMANDE pas : aucune capacité d'écriture sur
//    le GameState (setGameState/apply/unlock/save), aucune sauvegarde,
//    aucun déblocage, aucun LLM / réseau / backend, aucun Mageek runtime ;
//  - méthode v1 = DETERMINISTIC / RULE-BASED / EXPLAINABLE / MODEL-INDEPENDENT ;
//  - JAMAIS de bypass des déblocages existants : le niveau recommandé doit
//    exister (catalogue candidat réel), être certifié (métadonnées de design
//    présentes), être admissible (au sens du système) et débloqué ;
//  - profil absent / invalide / confiance insuffisante → SAFE_DEFAULT
//    (repli : la progression actuelle de Mathic continue normalement) ;
//  - hystérésis : changement de branche seulement si le nouveau candidat
//    reste stable sur une fenêtre minimale (stabilityWindow) — voir
//    stabilise() ; flux de retour : `held` + `history` + `candidateLevel` ;
//  - aucune IA obligatoire : l'adaptation n'est jamais imposée.

import {
  POLICY_VERSION,
  validateProfile,
} from "./contracts.mjs";

export const POLICY_METHOD = "progression-rule-v1";

export const PROPERTY_VOCAB = Object.freeze([
  "DISCOVERY",
  "SINGLE-PATH",
  "MULTI-PATH",
  "CHOICE",
  "CONSEQUENCE",
  "CHAIN",
  "OPTIMIZATION",
  "COMBINATION",
  "MASTERY",
]);

// Vocabulaire documenté des reasonCodes — chaque code traîne à une règle RÉELLE
// exécutée (aucune justification inventée, mandat §12).
export const REASON_CODES = Object.freeze([
  "NO_PROFILE",
  "INVALID_PROFILE",
  "LOW_CONFIDENCE_ADAPTATION",
  "HIGH_CONFIDENCE_SPECIFIC",
  "SAFE_DEFAULT_PROGRESSION",
  "STABILITY_HOLD",
  "STABILITY_BREAK",
  "NO_CANDIDATES",
  "ARITHMETIC_MATCH",
  "EXPLORATION_MATCH",
  "STRATEGY_MATCH",
  "EFFICIENCY_MATCH",
  "CHAIN_MATCH",
  "GRADUAL_RAMP",
  "DIFFICULTY_MATCH",
  "RETRY_MATCH",
  "DIFFICULTY_IN_BAND",
  "NOT_CERTIFIED",
  "LOCKED",
]);

export const POLICY_MODES = Object.freeze(["ADAPTIVE", "SAFE_DEFAULT"]);

// Map profil → grammaire de niveau (règles de DÉCISION documentées, mandat §8).
// Ce ne sont pas des vérités psychologiques : elles définissent un contenu
// pédagogique cohérent avec le comportement observé dans Mathic.
export const PROFILE_RULES = Object.freeze([
  Object.freeze({ dimension: "arithmetic", grammar: ["COMBINATION", "MASTERY"], code: "ARITHMETIC_MATCH", justification: "arithmétique solide → contenus multi-étapes / synthèse" }),
  Object.freeze({ dimension: "exploration", grammar: ["MULTI-PATH", "DISCOVERY", "CHOICE"], code: "EXPLORATION_MATCH", justification: "exploration → chemins multiples / découverte / choix" }),
  Object.freeze({ dimension: "strategy", grammar: ["CHOICE", "CONSEQUENCE"], code: "STRATEGY_MATCH", justification: "stratégie → choix à conséquences" }),
  Object.freeze({ dimension: "efficiency", grammar: ["OPTIMIZATION"], code: "EFFICIENCY_MATCH", justification: "efficacité → optimisation du score" }),
  Object.freeze({ dimension: "chainAffinity", grammar: ["CHAIN"], code: "CHAIN_MATCH", justification: "affinité chaîne → contenus chaînés" }),
]);

const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

// ---------------------------------------------------------------------------
// MODÈLE LevelCandidate (mandat M10) — la Policy consomme EXPLICITEMENT les
// informations sémantiques du niveau, structurées, et ne les reconstruit
// JAMAIS depuis l'ID : LevelId ≠ LadderPosition ≠ WorldPosition ≠
// DifficultyIndex. `ladderPosition` provient du DifficultyMetadata (canonique,
// construit depuis LADDER) ; `world`, `stage`, `properties` et les faits de
// design proviennent du LevelDesignMetadata réel (analyzeLevel).
// ---------------------------------------------------------------------------

export function levelCandidate(id, metadata, difficulty) {
  const m = metadata && typeof metadata === "object" ? metadata[id] : undefined;
  const d = difficulty && typeof difficulty === "object" ? difficulty[id] : undefined;
  const index = typeof d?.index === "number" && Number.isFinite(d.index) ? d.index : undefined;
  return Object.freeze({
    id,
    ladderPosition: index, // position canonique LADDER (jamais Number(id.slice(1)))
    world: m?.world ?? undefined,
    difficulty: index,
    stage: m?.stage ?? undefined,
    properties: Array.isArray(m?.properties) ? m.properties : [],
    chainDepth: m?.facts?.chainDepth ?? undefined,
    consequenceEvidence: m?.facts?.consequenceEvidence ?? undefined,
    routeCount: m?.facts?.routeCount ?? undefined,
    minMoves: m?.facts?.minMoves ?? undefined,
    scoreRange: m?.facts?.scoreRange ?? undefined,
  });
}

// Position canonique : ladderPosition si connu, sinon position dans la liste
// d'entrée (repli rétrocompatible quand le DifficultyMetadata est absent).
// Jamais de dérivation depuis l'ID.
function positionOf(candidate, indexOf) {
  return typeof candidate.ladderPosition === "number" ? candidate.ladderPosition : indexOf.get(candidate.id);
}

// ---------------------------------------------------------------------------
// Configuration — seuils et poids documentés (mandat §10, §11, §15)
// ---------------------------------------------------------------------------

export function policyConfiguration(overrides = undefined) {
  const cfg = {
    mode: "ADAPTIVE",            // "ADAPTIVE" | "SAFE_DEFAULT" (jamais obligatoire)
    confidence: {
      gradual: 0.35,             // < seuil → SAFE_DEFAULT (aucune adaptation)
      adaptive: 0.6,             // ≥ → adaptation normale (règles pleines)
      specific: 0.8,             // ≥ → adaptation spécifique (poids renforcé)
    },
    ruleMatchThreshold: 0.6,     // dimension ≥ seuil → règle profil activée
    // Hiérarchie de score documentée : la GRAMMAIRE (règles profil, mandat §8)
    // domine ; la proximité du front et la bande de difficulté sont des
    // garde-fous secondaires — jamais l'inverse.
    ruleWeight: 0.5,             // poids d'une règle profil (tier « full »)
    lightWeight: 0.25,           // tier « light » (adaptation faible, §10)
    specificWeight: 0.6,         // tier « specific » (confiance élevée, §10)
    proximityWeight: 0.4,        // proximité de la cible de progression
    reach: { bump: 1, drop: 1 }, // pas de difficulté nominal (difficultyResponse/hintDependency)
    difficultyBand: 1,           // ± bande (selon DifficultyMetadata) considérée comme cible
    difficultyBandWeight: 0.3,
    retryBonusWeight: 0.25,      // tolérance à la reprise → contenu plus dur acceptable
    stabilityWindow: 3,          // hystérésis : fenêtre minimale de recommandations stables
  };
  if (overrides === undefined || overrides === null) return Object.freeze(cfg);
  const merged = { ...cfg, ...overrides };
  merged.confidence = { ...cfg.confidence, ...(overrides.confidence ?? {}) };
  merged.reach = { ...cfg.reach, ...(overrides.reach ?? {}) };
  return Object.freeze(merged);
}

export const DEFAULT_POLICY_CONFIGURATION = policyConfiguration();

// ---------------------------------------------------------------------------
// Helpers d'entrée
// ---------------------------------------------------------------------------

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    // Deux formes acceptées : id simple ("N22") ou objet candidat { id, ... }
    // (catalogue avec métadonnées). Toute autre entrée est ignorée.
    const id = typeof c === "string" ? c : c !== null && typeof c === "object" ? c.id : undefined;
    if (typeof id !== "string" || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeUnlocked(progression) {
  if (progression === null || progression === undefined) return null;
  if (!Array.isArray(progression.unlocked)) return null;
  return progression.unlocked.filter((id) => typeof id === "string" && id.length > 0);
}

function completedSet(progression) {
  if (progression === null || progression === undefined || typeof progression !== "object") return new Set();
  const completed = progression.completed;
  if (completed === null || typeof completed !== "object" || Array.isArray(completed)) return new Set();
  const out = new Set();
  for (const [id, rec] of Object.entries(completed)) {
    if (rec && typeof rec === "object" && (rec.wins ?? 0) > 0) out.add(id);
  }
  return out;
}

// Adéquation grammaticale profil ↔ candidat (LevelCandidate consommé
// explicitement : propriétés de design + stage déclaré, jamais l'ID).
function matchesGrammar(candidate, tokens) {
  if (candidate === null || typeof candidate !== "object") return false;
  const properties = Array.isArray(candidate.properties) ? candidate.properties : [];
  const stageName = typeof candidate.stage === "object" && candidate.stage !== null && typeof candidate.stage.name === "string" ? candidate.stage.name : "";
  return tokens.some((t) => properties.includes(t) || stageName === t);
}

function ruleCodesFor(candidate, profile, threshold) {
  const codes = [];
  for (const rule of PROFILE_RULES) {
    const value = profile ? profile[rule.dimension] : 0;
    if (typeof value === "number" && Number.isFinite(value) && value >= threshold && matchesGrammar(candidate, rule.grammar)) {
      codes.push(rule.code);
    }
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Éligibilité — jamais de bypass (mandat §6, §18) : un niveau n'est recommandé
// que s'il est (a) dans le catalogue candidat (réel), (b) certifié (>= une
// métadonnée de design), (c) admissible et débloqué selon la progression.
// ---------------------------------------------------------------------------

export function eligibility(inputs = {}) {
  const candidates = normalizeCandidates(inputs.candidates);
  const unlocked = normalizeUnlocked(inputs.progression);
  const metadata = inputs.metadata ?? {};
  const eligible = [];
  const rejected = [];
  const order = [];

  for (const id of candidates) {
    const certified = metadata[id] !== null && metadata[id] !== undefined;
    if (!certified) {
      rejected.push({ id, reason: "NOT_CERTIFIED" });
      continue;
    }
    if (unlocked !== null && !unlocked.includes(id)) {
      rejected.push({ id, reason: "LOCKED" });
      continue;
    }
    eligible.push(id);
    order.push(id);
  }
  return Object.freeze({ eligible, order, rejected: Object.freeze(rejected), candidates: Object.freeze(candidates) });
}

// ---------------------------------------------------------------------------
// Profil et adaptation
// ---------------------------------------------------------------------------

function profileStatus(inputs) {
  const profile = inputs.profile;
  if (profile === null || profile === undefined) return { status: "absent", conf: 0 };
  const errors = validateProfile(profile);
  if (errors.length) return { status: "invalid", conf: 0 };
  const conf = (profile.confidence ?? 0);
  return { status: "ok", profile, conf };
}

function decisiveMode(configMode, status, conf, cfg) {
  if (configMode === "SAFE_DEFAULT") return "SAFE_DEFAULT";
  if (status !== "ok") return "SAFE_DEFAULT";
  if (conf < cfg.confidence.gradual) return "SAFE_DEFAULT";
  return "ADAPTIVE";
}

// ---------------------------------------------------------------------------
// Classement ADAPTIVE — fonction de score déterministe documentée
// ---------------------------------------------------------------------------

function rankedRecommendation({ eligible, order, metadata, profile, conf, cfg, difficulty }) {
  // Trois tiers d'adaptation (mandat §10) — seuils portés par la configuration :
  //   light    (gradual ≤ conf < adaptive) : adaptation faible (poids réduit) ;
  //   full     (adaptive ≤ conf < specific) : adaptation normale ;
  //   specific (conf ≥ specific)           : adaptation spécifique (poids renforcé).
  // La composante « historique stable » de §10 est portée par le mécanisme de
  // stabilité (§11, stabilise) : un changement de branche exige une fenêtre
  // stable, quelle que soit la confiance.
  const tier = conf >= cfg.confidence.specific ? "specific" : conf >= cfg.confidence.adaptive ? "full" : "light";
  const weight = tier === "specific" ? cfg.specificWeight : tier === "full" ? cfg.ruleWeight : cfg.lightWeight;
  const threshold = cfg.ruleMatchThreshold;

  const indexOf = new Map();
  for (let i = 0; i < order.length; i++) indexOf.set(order[i], i);

  // Positions CANONIQUES (mandat M10) : chaque candidat est matérialisé en
  // LevelCandidate et sa position est la ladderPosition du DifficultyMetadata —
  // indépendante de l'ordre d'entrée (PD-11), jamais dérivée de l'ID (PD-13).
  const candidates = eligible.map((id) => levelCandidate(id, metadata, difficulty));
  const posOf = (id) => {
    const c = candidates.find((x) => x.id === id);
    return c ? positionOf(c, indexOf) : indexOf.get(id);
  };
  const positions = eligible.map((id) => posOf(id));
  // front : candidat admissible le plus avancé selon la POSITION CANONIQUE
  const maxPos = Math.max(...positions);
  const frontierIdx = positions.indexOf(maxPos);
  const frontier = positions[frontierIdx];
  const frontierId = eligible[frontierIdx];
  const minPos = Math.min(...positions);
  const span = Number.isFinite(maxPos) ? Math.max(1, Math.ceil((maxPos - minPos + 1) / 4) || 1) : 1;

  let reach = 0;
  const globalReasons = [];
  if ((profile?.difficultyResponse ?? 0) >= threshold) {
    reach += cfg.reach.bump;
    globalReasons.push("DIFFICULTY_MATCH");
  }
  if ((profile?.hintDependency ?? 0) >= threshold) {
    reach -= cfg.reach.drop;
    globalReasons.push("GRADUAL_RAMP");
  }
  if (tier === "light") globalReasons.push("LOW_CONFIDENCE_ADAPTATION");
  if (tier === "specific") globalReasons.push("HIGH_CONFIDENCE_SPECIFIC");

  const retryTolerant = (profile?.retryTolerance ?? 0) >= threshold;
  const target = frontier + reach;
  const baseDiff = difficulty && positions.length ? difficulty[frontierId]?.index : undefined;

  // Score déterministe, composantes documentées (ordre décroissant d'influence) :
  //   1. grammaire      — chaque règle profil réellement exécutée pèse `weight` ;
  //   2. bande difficulté — niveau dans la bande cible (baseDiff + reach) ;
  //   3. proximité      — clamp01(1 − |distance|/span) × proximityWeight ;
  //   4. reprise        — bonus si contenu au-dessus de la cible réduite et
  //                       retryTolerance ≥ seuil (rampe douce acceptée plus dure).
  const ranked = eligible.map((id) => {
    const c = levelCandidate(id, metadata, difficulty);
    const rawDistance = posOf(id) - target;
    const codes = [...ruleCodesFor(c, profile, threshold)];
    let score = codes.length * weight;
    if (rawDistance > 0 && retryTolerant) {
      codes.push("RETRY_MATCH");
      score += cfg.retryBonusWeight;
    }
    if (difficulty && baseDiff !== undefined && typeof c.difficulty === "number") {
      const d = c.difficulty - (baseDiff + reach);
      if (Math.abs(d) <= cfg.difficultyBand) {
        codes.push("DIFFICULTY_IN_BAND");
        score += cfg.difficultyBandWeight;
      }
    }
    score += clamp01(1 - Math.abs(rawDistance) / span) * cfg.proximityWeight;
    return { id, score, distance: rawDistance, codes, level: c };
  });

  ranked.sort((a, b) => b.score - a.score || Math.abs(a.distance) - Math.abs(b.distance) || posOf(a.id) - posOf(b.id));
  return { ranked, globalReasons, reach };
}

// ---------------------------------------------------------------------------
// Repli SAFE_DEFAULT — parcours de progression cohérent avec le système actuel
// ---------------------------------------------------------------------------

function safeDefaultPick({ eligible, order, progression }) {
  const done = completedSet(progression);
  for (const id of order) {
    if (!done.has(id)) return id; // premier niveau admissible non encore terminé
  }
  return order[0] ?? null; // tout est terminé → rejouabilité au front
}

// ---------------------------------------------------------------------------
// Hystérésis / stabilité (mandat §11) : changement de branche seulement si la
// nouvelle recommandation reste stable sur une fenêtre minimale.
//
// Mécanisme (simple et testable) — deux flux de retour fournis par l'appelant :
//  - `held`    : dernier niveau RECOMMANDÉ livré (sortie `recommendedLevel`
//    de l'appel précédent) — la branche actuellement tenue ;
//  - `history` : niveaux CANDIDATS bruts précédents (sortie `candidateLevel`
//    des appels précédents), du plus récent au plus ancien — le flux de
//    préférence AVANT hystérésis.
//
// Règle : le candidat courant `winnerId` ne remplace la branche tenue que si
// sa série consécutive (préfixe de `history` + évaluation courante) atteint
// `stabilityWindow` → STABILITY_BREAK (changement confirmé). Sinon
// STABILITY_HOLD : le niveau tenu reste recommandé. Retour à la branche tenue
// (winnerId === held) : immédiat, sans hystérésis. Branche tenue devenue
// inadmissible (verrouillage perdu, retrait du catalogue) : bascule immédiate
// (STABILITY_BREAK), sans inertie.
// ---------------------------------------------------------------------------

function stabilise(winnerId, held, history, eligibleSet, cfg) {
  const hasHeld = typeof held === "string" && held.length > 0;
  if (!hasHeld || held === winnerId) return { level: winnerId, held: false, code: null };
  if (!eligibleSet.has(held)) return { level: winnerId, held: false, code: "STABILITY_BREAK" };
  let run = 1;
  if (Array.isArray(history)) {
    for (const x of history) {
      if (x !== winnerId) break;
      run++;
    }
  }
  if (run >= cfg.stabilityWindow) return { level: winnerId, held: false, code: "STABILITY_BREAK" };
  return { level: held, held: true, code: "STABILITY_HOLD" };
}

// ---------------------------------------------------------------------------
// RECOMMANDATION (mandat §12) — sortie déclarative, sans aucune autorité
// ---------------------------------------------------------------------------

export function recommend(inputs = {}) {
  const cfg = policyConfiguration(inputs.config);
  const candidates = normalizeCandidates(inputs.candidates);
  if (candidates.length === 0) {
    return Object.freeze({
      policyVersion: POLICY_VERSION,
      policyMethod: POLICY_METHOD,
      // aucun candidat → aucun parcours possible : repli sûr (mode réellement
      // appliqué, pas le mode configuré).
      mode: "SAFE_DEFAULT",
      recommendedLevel: null,
      candidateLevel: null,
      reasonCodes: ["NO_CANDIDATES"],
      profileConfidence: inputs.profile?.confidence ?? 0,
      policyConfidence: 0,
      stability: Object.freeze({ windowSize: cfg.stabilityWindow, held: false }),
      rankedLevels: [],
      eligibleLevels: [],
      rejectedLevels: [],
    });
  }

  const elig = eligibility(inputs);
  const eligibleSet = new Set(elig.eligible);
  // `status` est une CHAÎNE ("absent"|"invalid"|"ok") — le profil validé est
  // exposé séparément sous `validProfile`.
  const { status, profile: validProfile, conf } = profileStatus(inputs);
  const mode = decisiveMode(cfg.mode, status, conf, cfg);

  let reasonCodes = [];
  let recommendedLevel = null;
  let candidate = null;
  let heldFlag = false;
  let ranked = [];
  let policyConfidence;

  if (mode === "SAFE_DEFAULT") {
    recommendedLevel = safeDefaultPick({ eligible: elig.eligible, order: elig.order, progression: inputs.progression });
    reasonCodes.push("SAFE_DEFAULT_PROGRESSION");
    if (status === "absent") reasonCodes.push("NO_PROFILE");
    if (status === "invalid") reasonCodes.push("INVALID_PROFILE");
    if (status === "ok" && conf < cfg.confidence.gradual) reasonCodes.push("LOW_CONFIDENCE_ADAPTATION");
    policyConfidence = 0.5; // repli déterministe (G2) — le joueur continue
  } else {
    const r = rankedRecommendation({ eligible: elig.eligible, order: elig.order, metadata: inputs.metadata, profile: validProfile, conf, cfg, difficulty: inputs.difficulty });
    ranked = r.ranked;
    const top = ranked.length ? ranked[0].id : null;
    candidate = top;
    const stability = stabilise(top, inputs.held ?? null, inputs.history, eligibleSet, cfg);
    recommendedLevel = stability.level;
    heldFlag = stability.held;
    if (stability.code) reasonCodes.push(stability.code);
    reasonCodes.push(...r.globalReasons);
    const topCodes = ranked.find((x) => x.id === recommendedLevel)?.codes ?? [];
    reasonCodes.push(...topCodes);
    const coverage = clamp01(elig.eligible.length / 8);
    policyConfidence = clamp01(0.35 + 0.5 * conf + 0.15 * coverage);
  }

  const detail = (id, codes) => {
    const entry = ranked.find((x) => x.id === id);
    return entry ? { id, score: +entry.score.toFixed(6), distance: entry.distance, codes } : { id, codes };
  };

  return Object.freeze({
    policyVersion: POLICY_VERSION,
    policyMethod: POLICY_METHOD,
    mode,
    recommendedLevel,
    candidateLevel: candidate,
    reasonCodes: Object.freeze([...new Set(reasonCodes)]),
    profileConfidence: conf,
    policyConfidence: +policyConfidence.toFixed(6),
    stability: Object.freeze({
      windowSize: cfg.stabilityWindow,
      held: heldFlag,
    }),
    rankedLevels: Object.freeze(ranked.map((x) => Object.freeze(detail(x.id, x.codes)))),
    eligibleLevels: Object.freeze([...elig.eligible]),
    rejectedLevels: Object.freeze(elig.rejected.map((r) => Object.freeze(r))),
  });
}

// ---------------------------------------------------------------------------
// Validateur de la sortie (forme mandat §12) — aucun blindage d'autorité
// ---------------------------------------------------------------------------

export function isProgressionRecommendation(r) {
  if (r === null || typeof r !== "object" || Array.isArray(r)) return false;
  if (r.policyVersion !== POLICY_VERSION) return false;
  if (!POLICY_MODES.includes(r.mode)) return false;
  if (r.recommendedLevel !== null && typeof r.recommendedLevel !== "string") return false;
  if (r.candidateLevel !== null && r.candidateLevel !== undefined && typeof r.candidateLevel !== "string") return false;
  if (!Array.isArray(r.reasonCodes) || !r.reasonCodes.every((c) => REASON_CODES.includes(c))) return false;
  if (r.recommendedLevel !== null && !r.eligibleLevels.includes(r.recommendedLevel)) return false;
  if (typeof r.profileConfidence !== "number" || r.profileConfidence < 0 || r.profileConfidence > 1) return false;
  if (typeof r.policyConfidence !== "number" || r.policyConfidence < 0 || r.policyConfidence > 1) return false;
  return true;
}