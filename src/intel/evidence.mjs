// MATHIC 1.0 — Player Evidence emission layer (Brique 2, MISSION 1)
//
// Produit des faits observables et reproductibles du gameplay Mathic,
// destinés à une future brique Player Profile Detection.
//
// PRINCIPES :
//  - l'émetteur dépend des faits du moteur, jamais l'inverse (Game Core ne
//    référence jamais src/intel) ;
//  - aucune interprétation psychologique : uniquement ce qui s'est réellement
//    passé dans Mathic ;
//  - déterminisme : l'horloge est injectée (EvidenceClock), aucune horloge
//    absolue dans le cœur de l'émetteur ;
//  - chaque évidence est validée par validateEvidence() à l'émission
//    (échec = TypeError : l'émetteur ne produit jamais d'évidence hors contrat) ;
//  - LEVEL_RESTARTED = fait ; retryCount = métrique dérivée ;
//  - abandon (LEVEL_ABANDONED) ≠ échec (LEVEL_FAILED) ;
//  - CHAIN_STARTED : chainRun 0 → ≥1 ; CHAIN_BROKEN : chainRun n>0 → 0,
//    uniquement sur une transition valide/commitée.

import { validateEvidence } from "./contracts.mjs";

export const EVIDENCE_SCHEMA_VERSION = 1;
export const LEVEL_VERSION = 1;
export const RULE_VERSION = "b1";
export const PROVIDER_ENGINE = "engine";

// ---------------------------------------------------------------------------
// EvidenceClock — horloge injectable.
// Production : temps mono-écoulé depuis la création. Test : clock déterministe.
// ---------------------------------------------------------------------------

function baseNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  if (typeof process !== "undefined" && typeof process.hrtime === "function") return Number(process.hrtime.bigint()) / 1e6;
  return Date.now();
}

export function createMonotonicClock() {
  return createClock({ now: baseNow });
}

export function createClock({ now = baseNow } = {}) {
  const start = now();
  return {
    now: () => {
      const elapsed = now() - start;
      return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
    },
  };
}

// Identifiant de session rotatif (Phase 8 : local, non réactivable).
// Utilitaire de production au point d'appel — jamais utilisé dans le cœur
// déterministe de l'émetteur (les tests fournissent un sessionId fixe).
export function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return `sess-${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}`;
}

// ---------------------------------------------------------------------------
// Recorder — enregistre les évidence d'une session de niveau
// ---------------------------------------------------------------------------

export function createEvidenceRecorder({
  levelId,
  sessionId,
  clock,
  schemaVersion = EVIDENCE_SCHEMA_VERSION,
  levelVersion = LEVEL_VERSION,
  ruleVersion = RULE_VERSION,
}) {
  if (!levelId || typeof levelId !== "string") throw new TypeError("evidence : levelId (chaîne) requis");
  if (!sessionId || typeof sessionId !== "string") throw new TypeError("evidence : sessionId (chaîne) requis");
  const c = clock ?? createMonotonicClock();

  const all = [];
  let seq = 0;
  let terminal = null;
  let lastChainRun = 0;

  function push(type, payload) {
    if (terminal) return null; // session terminée : silence
    const ev = {
      schemaVersion,
      sessionId,
      levelId,
      levelVersion,
      ruleVersion,
      seq: ++seq,
      type,
      atMs: c.now(),
      provider: PROVIDER_ENGINE,
    };
    if (payload !== undefined) ev.payload = payload;
    const errors = validateEvidence(ev);
    if (errors.length) throw new TypeError(`evidence : émission hors contrat — ${errors.join(" ; ")}`);
    all.push(ev);
    return ev;
  }

  function setTerminal(type, payload) {
    if (terminal) return null;
    const ev = push(type, payload);
    if (ev) terminal = type;
    return ev;
  }

  const recorder = {
    started: () => push("LEVEL_STARTED"),

    previewed: (ev) => {
      if (!ev || ev.ok === false) return null;
      const evCommit = push("ACTION_PREVIEWED", {
        a: ev.a,
        op: ev.opCell,
        b: ev.bCell,
        result: ev.result,
        delta: ev.delta,
        chainRun: ev.chainRun,
      });
      return evCommit;
    },

    invalid: ({ a, op, b, reason } = {}) => push("ACTION_INVALID", { a, op, b, reason }),

    // ev = dernier événement Engine d'un apply() réussi ; une seule émission
    // par transition. L'action invalide ne casse jamais une chaîne.
    committed: (ev) => {
      if (!ev) return null;
      const commitEv = push("ACTION_COMMITTED", {
        a: ev.a,
        op: ev.opCell,
        b: ev.bCell,
        result: ev.result,
        delta: ev.delta,
        chainRun: ev.chainRun,
      });
      if (!commitEv) return null;
      if (ev.chainRun >= 1 && lastChainRun < 1) push("CHAIN_STARTED", { run: ev.chainRun });
      if (lastChainRun >= 1 && ev.chainRun === 0) push("CHAIN_BROKEN", { prevRun: lastChainRun });
      lastChainRun = ev.chainRun;
      return commitEv;
    },

    undone: (undone) => {
      if (!undone) return null;
      return push("UNDO_USED", { undone: { a: undone.a, op: undone.op, b: undone.b } });
    },

    restarted: () => push("LEVEL_RESTARTED"),

    completed: (summary) => setTerminal("LEVEL_COMPLETED", summary ?? {}),
    failed: (reason = "move_limit") => setTerminal("LEVEL_FAILED", { reason }),
    abandoned: (reason = "quit") => setTerminal("LEVEL_ABANDONED", { reason }),

    events: () => all,
    evidence: () => all,
    terminal: () => terminal,
    retryCount: () => all.filter((e) => e.type === "LEVEL_RESTARTED").length,
  };

  return recorder;
}

// ---------------------------------------------------------------------------
// Métriques dérivées — JAMAIS émises comme événements bruts.
// Recalculables depuis les évidence (+ règles de score connues à l'appel).
// ---------------------------------------------------------------------------

export function deriveMetrics(evidence, { objectiveBonus = 0 } = {}) {
  const started = evidence.find((e) => e.type === "LEVEL_STARTED");
  const firstCommit = evidence.find((e) => e.type === "ACTION_COMMITTED");
  const completed = evidence.find((e) => e.type === "LEVEL_COMPLETED");
  const commits = evidence.filter((e) => e.type === "ACTION_COMMITTED");
  const deltas = commits.map((e) => e.payload?.delta ?? 0);
  return {
    retryCount: evidence.filter((e) => e.type === "LEVEL_RESTARTED").length,
    timeToFirstAction: started && firstCommit ? firstCommit.atMs - started.atMs : null,
    timeToSolution: started && completed ? completed.atMs - started.atMs : null,
    solutionDepth: commits.length,
    solutionScore: deltas.reduce((s, d) => s + d, 0) + (completed ? objectiveBonus : 0),
  };
}

export { EVIDENCE_TYPES } from "./contracts.mjs";
export { FORBIDDEN_EVIDENCE_FIELDS } from "./contracts.mjs";