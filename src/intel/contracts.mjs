// MATHIC 1.0 — Intelligence Architecture Contracts (plan de contrat pur)
//
// Frontière architecturale de l'intelligence joueur.
// PRÉSERVE  : aucun import depuis le Game Core (src/b1, src/v5) — plan découplé.
// GARANTIES : validations de schéma, garde-fous d'interdiction, politique
//             déterministe de repli, immutabilité des entrées.
// Le Game Core (Kernel/Engine/Solver/Replay/Levels/Score) ne dépend jamais de ce module.

export const INTEL_PLANE_VERSION = 1;
export const PROFILE_SCHEMA_VERSION = 1;
export const POLICY_VERSION = 1;
export const DETECTOR_VERSION = 1;

// ---------------------------------------------------------------------------
// A. Player Evidence — faits observables du gameplay (aucune donnée psychologique)
// ---------------------------------------------------------------------------

// Révision v1.1 (Brique 2) : ajout explicite de LEVEL_RESTARTED (fait de reprise ;
// retryCount reste une métrique dérivée) et de LEVEL_ABANDONED (abandon ≠ échec ;
// LEVEL_FAILED ne porte que les véritables échecs du niveau, ex. move_limit).
export const EVIDENCE_TYPES = Object.freeze([
  "LEVEL_STARTED",
  "LEVEL_RESTARTED",
  "LEVEL_COMPLETED",
  "LEVEL_FAILED",
  "LEVEL_ABANDONED",
  "ACTION_PREVIEWED",
  "ACTION_COMMITTED",
  "ACTION_INVALID",
  "UNDO_USED",
  "CHAIN_STARTED",
  "CHAIN_BROKEN",
  "HINT_REQUESTED",
  "HINT_USED",
  "TIME_TO_FIRST_ACTION",
  "TIME_TO_SOLUTION",
  "SOLUTION_DEPTH",
  "SOLUTION_SCORE",
  "RETRY_COUNT",
]);

// Champs jamais acceptés dans une évidence (Phase 8 — privacy paradigme).
export const FORBIDDEN_EVIDENCE_FIELDS = Object.freeze([
  "age",
  "iq",
  "intelligence",
  "gender",
  "name",
  "email",
  "geolocation",
  "deviceId",
  "personality",
]);

export function isEvidence(x) {
  return (
    x !== null &&
    typeof x === "object" &&
    typeof x.type === "string" &&
    EVIDENCE_TYPES.includes(x.type) &&
    typeof x.levelId === "string" &&
    x.levelId.length > 0 &&
    typeof x.atMs === "number" &&
    Number.isFinite(x.atMs) &&
    x.atMs >= 0 &&
    (x.payload === undefined || (x.payload !== null && typeof x.payload === "object" && !Array.isArray(x.payload))) &&
    !FORBIDDEN_EVIDENCE_FIELDS.some((k) => k in x)
  );
}

export function validateEvidence(x) {
  const errors = [];
  if (x === null || typeof x !== "object") return ["evidence : objet requis"];
  if (typeof x.type !== "string" || !EVIDENCE_TYPES.includes(x.type)) errors.push(`type '${x.type}' ∉ EVIDENCE_TYPES`);
  if (typeof x.levelId !== "string" || x.levelId.length === 0) errors.push("levelId : chaîne non vide requise");
  if (typeof x.atMs !== "number" || !Number.isFinite(x.atMs) || x.atMs < 0) errors.push("atMs : durée >= 0 requise");
  if (x.payload !== undefined && (x.payload === null || typeof x.payload !== "object" || Array.isArray(x.payload))) errors.push("payload : objet (ou absent) requis");
  for (const k of FORBIDDEN_EVIDENCE_FIELDS) if (k in x) errors.push(`champ interdit '${k}' dans une évidence`);
  return errors;
}

// ---------------------------------------------------------------------------
// B. Player Profile — état dérivé, explicable, versionné
// ---------------------------------------------------------------------------

export const PROFILE_DIMENSIONS = Object.freeze([
  "arithmeticAffinity",
  "explorationTendency",
  "strategyTendency",
  "efficiencyTendency",
  "chainAffinity",
  "hintDependency",
  "retryTolerance",
  "difficultyResponse",
  "confidence",
  "evidenceWindow",
]);

export function defaultProfile() {
  return Object.freeze({
    arithmeticAffinity: 0,
    explorationTendency: 0,
    strategyTendency: 0,
    efficiencyTendency: 0,
    chainAffinity: 0,
    hintDependency: 0,
    retryTolerance: 0,
    difficultyResponse: 0,
    confidence: 0,
    evidenceWindow: 0,
    version: PROFILE_SCHEMA_VERSION,
  });
}

export const DEFAULT_PROFILE = defaultProfile();

const DIMENSION_KEYS = PROFILE_DIMENSIONS.filter((k) => k !== "confidence" && k !== "evidenceWindow");
const ALL_PROFILE_KEYS = new Set([...PROFILE_DIMENSIONS, "version"]);

export function isProfileShape(x, { version = PROFILE_SCHEMA_VERSION } = {}) {
  if (x === null || typeof x !== "object" || Array.isArray(x)) return false;
  if (x.version !== version) return false;
  if (!Object.keys(x).every((k) => ALL_PROFILE_KEYS.has(k))) return false;
  for (const k of DIMENSION_KEYS) {
    const v = x[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return false;
  }
  if (typeof x.confidence !== "number" || !Number.isFinite(x.confidence) || x.confidence < 0 || x.confidence > 1) return false;
  if (typeof x.evidenceWindow !== "number" || !Number.isFinite(x.evidenceWindow) || x.evidenceWindow < 0) return false;
  return true;
}

export function validateProfile(x, { version = PROFILE_SCHEMA_VERSION } = {}) {
  const errors = [];
  if (x === null || typeof x !== "object" || Array.isArray(x)) return ["profile : objet requis"];
  if (x.version !== version) errors.push(`version ${x.version} ≠ ${version} (révision : migration requise)`);
  for (const k of Object.keys(x)) {
    if (!ALL_PROFILE_KEYS.has(k)) errors.push(`clé inconnue '${k}' (forme de profil figée)`);
  }
  for (const k of DIMENSION_KEYS) {
    const v = x[k];
    if (!(k in x)) errors.push(`${k} : dimension manquante`);
    else if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`${k} : nombre requis`);
    else if (v < 0 || v > 1) errors.push(`${k} : hors [0,1]`);
  }
  if (typeof x.confidence !== "number" || !Number.isFinite(x.confidence) || x.confidence < 0 || x.confidence > 1) errors.push("confidence : hors [0,1]");
  if (typeof x.evidenceWindow !== "number" || !Number.isFinite(x.evidenceWindow) || x.evidenceWindow < 0) errors.push("evidenceWindow : compteur >= 0 requis");
  return errors;
}

// ---------------------------------------------------------------------------
// C. PlayerIntelligenceProvider — interface interchangeable, sans nom de modèle
// ---------------------------------------------------------------------------

export const PROVIDER_METHODS = Object.freeze(["info", "isAvailable", "analyze", "recommend", "explain"]);

// Capacités déclarées d'un provider. La logique produit ne lit jamais un nom de modèle.
export const PROVIDER_CAPABILITIES = Object.freeze(["profile", "progression", "explanation", "none"]);

export function isIntelligenceProvider(p) {
  if (p === null || typeof p !== "object") return false;
  if (!PROVIDER_METHODS.every((m) => typeof p[m] === "function")) return false;
  let capability = null;
  try {
    const info = p.info();
    capability = info?.capability;
  } catch {
    return false;
  }
  return capability === null || capability === undefined || PROVIDER_CAPABILITIES.includes(capability);
}

export function validateIntelligenceProvider(p) {
  const errors = [];
  if (p === null || typeof p !== "object") return ["provider : objet requis"];
  for (const m of PROVIDER_METHODS) {
    if (typeof p[m] !== "function") errors.push(`méthode requise '${m}' manquante`);
  }
  let capability = null;
  try {
    capability = p.info?.()?.capability;
  } catch {
    errors.push("info() : ne doit pas lever");
  }
  if (capability !== null && capability !== undefined && !PROVIDER_CAPABILITIES.includes(capability)) {
    errors.push(`capability '${capability}' inconnue`);
  }
  return errors;
}

// Interdiction de capacité d'écriture : un provider ne possède JAMAIS le GameState.
export const WRITE_CAPABILITY_NAMES = Object.freeze([
  "apply",
  "mutate",
  "commit",
  "setBoard",
  "setState",
  "setScore",
  "save",
  "persist",
]);

export function hasWriteCapability(p) {
  return WRITE_CAPABILITY_NAMES.some((m) => p !== null && typeof p === "object" && typeof p[m] === "function");
}

// ---------------------------------------------------------------------------
// Recommandations — jamais de mutation, jamais de score, jamais de plateau
// ---------------------------------------------------------------------------

export const RECOMMENDATION_KINDS = Object.freeze(["profile", "progression", "explanation", "assistance", "default"]);

const RECOMMENDATION_ALLOWED_KEYS = new Set([
  "kind",
  "levelId",
  "levelIds",
  "targets",
  "rationale",
  "confidence",
  "text",
  "lines",
  "family",
  "providerId",
]);

// Recommandation = objet déclaratif. Aucune clé de mutation / autorité.
export function isRecommendation(r) {
  return (
    r !== null &&
    typeof r === "object" &&
    !Array.isArray(r) &&
    typeof r.kind === "string" &&
    RECOMMENDATION_KINDS.includes(r.kind) &&
    Object.keys(r).every((k) => RECOMMENDATION_ALLOWED_KEYS.has(k))
  );
}

export function validateRecommendation(r) {
  const errors = [];
  if (r === null || typeof r !== "object" || Array.isArray(r)) return ["recommandation : objet requis"];
  if (typeof r.kind !== "string" || !RECOMMENDATION_KINDS.includes(r.kind)) errors.push(`kind '${r.kind}' inconnu`);
  for (const k of Object.keys(r)) {
    if (!RECOMMENDATION_ALLOWED_KEYS.has(k)) errors.push(`clé non déclarative '${k}' (interdit : score/board/state/mutation)`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// D. Progression Policy — autorité fonctionnelle
// ---------------------------------------------------------------------------

export const LEVEL_STATE_SHAPE = Object.freeze(["unlocked", "completed"]);

export function isLevelState(s) {
  return (
    s !== null &&
    typeof s === "object" &&
    Array.isArray(s.unlocked) &&
    s.unlocked.every((id) => typeof id === "string" && id.length > 0) &&
    s.completed !== null &&
    typeof s.completed === "object" &&
    !Array.isArray(s.completed)
  );
}

export function isAvailableLevels(list) {
  return (
    Array.isArray(list) &&
    list.every(
      (l) => l !== null && typeof l === "object" && typeof l.id === "string" && l.id.length > 0 && typeof l.world === "string" && l.world.length > 0
    )
  );
}

export function validateProgressionInput({ profile, levelState, availableLevels } = {}) {
  const errors = [];
  const pe = validateProfile(profile);
  if (pe.length) errors.push(...pe.map((e) => `profile : ${e}`));
  if (!isLevelState(levelState)) errors.push("levelState : { unlocked: string[], completed: object } requis");
  if (!isAvailableLevels(availableLevels) || availableLevels.length === 0) errors.push("availableLevels : catalogue non vide requis");
  return errors;
}

export function isProgressionDecision(d) {
  if (d === null || typeof d !== "object" || Array.isArray(d)) return false;
  if (!Array.isArray(d.allowedLevels) || !d.allowedLevels.every((id) => typeof id === "string")) return false;
  if (!Array.isArray(d.blockedLevels) || !d.blockedLevels.every((id) => typeof id === "string")) return false;
  if (typeof d.confidence !== "number" || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) return false;
  if (d.policyVersion !== POLICY_VERSION) return false;
  if (!Array.isArray(d.rationale) || !d.rationale.every((r) => typeof r === "string")) return false;
  return true;
}

export function validateProgressionDecision(d) {
  const errors = [];
  if (d === null || typeof d !== "object" || Array.isArray(d)) return ["décision : objet requis"];
  if (!Array.isArray(d.allowedLevels) || !d.allowedLevels.every((id) => typeof id === "string")) errors.push("allowedLevels : string[] requis");
  if (!Array.isArray(d.blockedLevels) || !d.blockedLevels.every((id) => typeof id === "string")) errors.push("blockedLevels : string[] requis");
  if (typeof d.confidence !== "number" || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) errors.push("confidence : hors [0,1]");
  if (d.policyVersion !== POLICY_VERSION) errors.push(`policyVersion ${d.policyVersion} ≠ ${POLICY_VERSION}`);
  if (!Array.isArray(d.rationale) || !d.rationale.every((r) => typeof r === "string")) errors.push("rationale : string[] requis");
  return errors;
}

// Politique déterministe de repli (fail-safe obligatoire, Gate G2) :
// sans IA, ou profil non valide, ou faible confiance → le joueur continue.
// La policy respecte le Level System : elle ne propose que ce qui est disponible.
export function deterministicDefaultPolicy({ profile, levelState, availableLevels } = {}) {
  if (validateProfile(profile).length) return null;
  if (!isLevelState(levelState)) return null;
  if (!isAvailableLevels(availableLevels) || availableLevels.length === 0) return null;
  const allowed = availableLevels.map((l) => l.id);
  const blocked = levelState.unlocked.filter((id) => !allowed.includes(id));
  return {
    allowedLevels: allowed,
    blockedLevels: blocked,
    confidence: 0.5,
    policyVersion: POLICY_VERSION,
    rationale: ["DETERMINISTIC DEFAULT POLICY — aucun modèle requis, contraintes du Level System respectées"],
  };
}

// ---------------------------------------------------------------------------
// E. Coach Contract — aide la pensée, ne la remplace jamais
// ---------------------------------------------------------------------------

export const COACH_METHODS = Object.freeze(["explain", "hint", "encourage", "summarize", "recommend"]);

export function isCoach(c) {
  return c !== null && typeof c === "object" && COACH_METHODS.every((m) => typeof c[m] === "function") && !hasWriteCapability(c);
}

export function validateCoach(c) {
  const errors = [];
  if (c === null || typeof c !== "object") return ["coach : objet requis"];
  for (const m of COACH_METHODS) if (typeof c[m] !== "function") errors.push(`méthode requise '${m}' manquante`);
  if (hasWriteCapability(c)) errors.push("le coach ne possède aucune capacité d'écriture sur le GameState");
  return errors;
}

// ---------------------------------------------------------------------------
// Frontière — interdictions architecturales (Phase 1, opposables)
// ---------------------------------------------------------------------------

export const INTEL_PROHIBITIONS = Object.freeze([
  {
    id: "INTEL-PROHIBITION-001",
    rule: "AI → GameState : jamais",
    guard: "aucun provider/coach n'expose une capacité d'écriture sur l'état de jeu",
  },
  {
    id: "INTEL-PROHIBITION-002",
    rule: "AI → level obligatoire : jamais",
    guard: "toute recommandation de niveau reste une proposition validée par la policy",
  },
  {
    id: "INTEL-PROHIBITION-003",
    rule: "AI → score : jamais",
    guard: "les recommandations ne portent aucune clé score/board/state",
  },
  {
    id: "INTEL-PROHIBITION-004",
    rule: "AI → modification arbitraire du plateau : jamais",
    guard: "le Game Core reste l'autorité ; l'intelligence est observateur et conseiller",
  },
]);

export function validateProhibitionCompliance(provider) {
  const errors = validateIntelligenceProvider(provider);
  if (hasWriteCapability(provider)) errors.push("provider : capacité d'écriture interdite (INTEL-PROHIBITION-001/004)");
  return errors;
}