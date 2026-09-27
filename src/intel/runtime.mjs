// MATHIC 1.0 — RUNTIME INTELLIGENCE ADAPTER (MISSION 5)
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ FRONTIÈRE (§12) — cet adapter est le PONT OBSERVATION autorisé :         │
// │                                                                          │
// │    ENGINE RÉEL ──(transition réellement appliquée)──▶ EVIDENCE           │
// │                                                                          │
// │ L'Engine RÉEL est INJECTÉ (paramètre `engine`), exactement comme         │
// │ `storage` est injecté à l'Orchestrator : **intel/ ne fait JAMAIS          │
// │ d'import statique d'Engine** (aucune ligne d'import, aucun "import …      │
// │ engine"). La direction autorisée est GAME CORE → INTELLIGENCE OBSERVATION.│
// │ L'inverse (Intel → Engine) est interdite : l'intelligence n'a JAMAIS de   │
// │ capacité de contrôle sur le moteur — elle observe.                       │
// └───────────────────────────────────────────────────────────────────────────┘
//
// PIPELINE (Mandat §7) — cette adapter ne fait que BRANCHER les briques
// réelles, dans l'ordre opposable HEY :
//
//    GAME CORE (Engine RÉEL) ─▶ Evidence ─▶ Profile ─▶ Policy ─▶ Orchestrator
//
//   1. Elle pilote la VRAIE session (createSession réel) ;
//   2. à chaque action réellement appliquée par le moteur, elle émet
//      l'Evidence ACTION_COMMITTED **depuis l'événement réel** retourné par le
//      moteur (jamais une prédiction, jamais une transition fantasme) ;
//   3. elle dérive le profil (detectProfile) depuis ces Evidence réelles,
//      jamais simulées ;
//   4. elle produit la recommandation (Policy recommendation) depuis ce
//      profil réel + catalogue réel ;
//   5. elle délègue l'application à l'Orchestrator — **le seul composant qui
//      écrit** (jamais markCompleted/unlockTo depuis l'adapter, jamais
//      d'écriture hors des primitives de sauvetage injectées).
//
// KILL-SWITCH (§10) : si la politique est en mode SAFE_DEFAULT ou que le
// profil est absent/invalide, l'adapter reste un OBSERVATEUR PUR :
//   - l'Evidence est bien produite et conservée (elle ne nuit jamais) ;
//   - la recommandation n'est JAMAIS appliquée (SAFE_DEFAULT ne s'écrit pas) ;
//   - le jeu continue normalement, jamais bloqué par l'intelligence.

import {
  EVIDENCE_SCHEMA_VERSION,
  createEvidenceRecorder,
  createMonotonicClock,
} from "./evidence.mjs";
import { deriveMetrics } from "./evidence.mjs";
import { detectProfile } from "./profile.mjs";
import { recommend, isProgressionRecommendation } from "./progression-policy.mjs";
import { orchestrate, ORCHESTRATOR_VERSION } from "./progression-orchestrator.mjs";

export const RUNTIME_ADAPTER_VERSION = 1;
export const RUNTIME_ADAPTER_METHOD = "runtime:live-engine-v1";
export const RUNTIME_KILL_SWITCH = "SAFE_DEFAULT";

// Horloge par défaut : monotone locale à la session (déterministe, injectée,
// jamais Date.now()/performance dans le chemin décisionnel).
function defaultClock() {
  return createMonotonicClock();
}

// Shallow-read du dernier événement de la trace réelle du moteur.
// Retourne null si la session n'a pas encore de transition appliquée.
// Lit l'événement RÉEL de la transition depuis la session retournée par
// engine.apply : le moteur b1 expose sa trace live dans `state.events`
// (dernier élément — jamais `.live`, jamais une prédiction).
// @param {object} session   Session RÉELLE retournée par engine.apply.
// @returns {object|null}    L'événement réel de la dernière transition.
function lastLive(session) {
  if (!session) return null;
  const liveEvents =
    session.live && Array.isArray(session.live.events)
      ? session.live.events
      : Array.isArray(session.events)
        ? session.events
        : null;
  if (!liveEvents || liveEvents.length === 0) return null;
  return liveEvents[liveEvents.length - 1];
}

/**
 * Crée l'adapter runtime. Prend l'Engine RÉEL par injection.
 *
 * @param {object} options
 * @param {object} options.engine   L'Engine RÉEL injecté — doit exposer
 *        createSession(level), evaluate(session, action), apply(session,
 *        action), isWon(session), isLost(session). JAMAIS importé.
 * @param {object} options.level    Le niveau réel certifié (level.id),
 *        jamais reconstruit.
 * @param {string} options.sessionId Identifiant de session réel.
 * @param {object} [options.storage] Storage réel injectable (réservé aux
 *        primitives ; jamais localStorage navigateur direct).
 * @param {object} [options.recorderOptions] Options passées à
 *        createEvidenceRecorder (schemaVersion, levelVersion, ruleVersion…).
 * @param {Function} [options.onEvidence] Observateur optionnel appelé pour
 *        CHAQUE Evidence émise (jamais écrivain).
 * @param {object} [options.clock] Horloge injectée (déterminisme).
 */
export function createRuntimeAdapter(options = {}) {
  const {
    engine = null,
    level = null,
    sessionId = null,
    storage = null,
    recorderOptions = {},
    onEvidence = null,
    clock = null,
  } = options;

  if (!engine || typeof engine.createSession !== "function" || typeof engine.apply !== "function") {
    throw new TypeError("runtime : Engine RÉEL injecté requis (createSession + apply) — jamais importé");
  }
  if (!level || typeof level.id !== "string" || !level.id) {
    throw new TypeError("runtime : niveau RÉEL certifié requis (level.id)");
  }
  if (!sessionId || typeof sessionId !== "string") {
    throw new TypeError("runtime : sessionId (chaîne) réel requis");
  }

  const clockEngine = clock ?? defaultClock();

  // Recorder Evidence RÉEL — même contrat que les tests M1/M2/M3/M4.
  const recorder = createEvidenceRecorder({
    levelId: level.id,
    sessionId,
    clock: clockEngine,
    ...recorderOptions,
  });

  // VRAIE session Engine — celle que le moteur a réellement créée.
  let session = engine.createSession(level);
  const trace = []; // trace réelle des transitions réellement appliquées

  let sessionId_ = sessionId;
  let terminal = null;

  let firstMoveLatencyMs = null;
  let commitCount = 0  ; // nombre de transitions réellement commitées

  // -----------------------------------------------------------------------
  // Émission strictement "transition réellement appliquée". Aucune création
  // d'événement hors moteur.
  // -----------------------------------------------------------------------
  function commitReal(action) {
    if (terminal) return { ok: false, reason: "TERMINAL", session, evidence: null };
    const before = session;
    const nxt = engine.apply(session, action);
    if (!nxt) return { ok: false, reason: "REJECTED_BY_ENGINE", session, evidence: null };

    // L'événement RÉEL de la transition appliquée (trace [last], vu via lastLive réel).
    const ev = lastLive(nxt);
    if (!ev) return { ok: false, reason: "NO_LIVE_TRACE", session: nxt, evidence: null };

    session = nxt;
    trace.push(action); // trace réelle des transitions réellement appliquées

    // Evidence depuis l'événement réel — champs idempotents-action.
    const evidence = recorder.committed({
      a: ev.a,
      op: ev.op,
      opCell: ev.opCell,
      b: ev.b,
      bCell: ev.bCell,
      result: ev.result,
      delta: ev.delta,
      chainRun: ev.chainRun,
    });

    if (firstMoveLatencyMs === null) {
      firstMoveLatencyMs = deriveMetrics(recorder.events()).timeToFirstAction;
    }
    commitCount += 1;

    if (onEvidence && evidence) onEvidence(evidence     );

    // Terminaux RÉELS du moteur — jamais prédits.
    const summary = terminalSummary();
    if (engine.isWon && engine.isWon(session)) {
      const done = recorder.completed(summary);
      if (onEvidence && done) onEvidence(done);
      terminal = "won";
    } else if (engine.isLost && engine.isLost(session)) {
      const failed = recorder.failed();
      if (onEvidence && failed) onEvidence(failed);
      terminal = "lost";
    }

    return { ok: true, evidence, session, terminal };
  }

  // Métriques dérivées depuis les Evidence réelles.
  function terminalSummary() {
    return {
      solutionDepth: deriveMetrics(recorder.events()).solutionDepth,
      solutionScore: deriveMetrics(recorder.events()).solutionScore,
    };
  }

  // -----------------------------------------------------------------------
  // API publique
  // -----------------------------------------------------------------------
  return {
    version: RUNTIME_ADAPTER_VERSION,
    method: RUNTIME_ADAPTER_METHOD,

    sessionId: () => sessionId_,

    started: () => {
      if (terminal) return null;
      const ev = recorder.started();
      if (onEvidence && ev) onEvidence(ev);
      return ev;
    },

    // Évaluation préliminaire RÉELLE — partage le moteur, ne l'altère pas.
    preview: (action) => {
      const ev = engine.evaluate ? engine.evaluate(session, action) : null;
      const preview = ev && ev.ok !== false ? recorder.previewed(ev) : null;
      if (onEvidence && preview) onEvidence(preview);
      return { ok: !!(ev && ev.ok !== false), ev, evidence: preview };
    },

    // ACTION RÉELLE — pilote le moteur réel.
    apply: (action) => commitReal(action),

    // Terminal pudique — complète la session déjà gagnée/perdue.
    completed: (summary = {}) => {
      const done = recorder.completed(summary);
      if (onEvidence && done) onEvidence(done);
      return done;
    },
    failed: (reason = "move_limit") => {
      const failed = recorder.failed(reason);
      if (onEvidence && failed) onEvidence(failed);
      return failed;
    },

    // Undo RÉEL : rejoue la trace tronquée sur une session neuve via le vrai
    // moteur (ré-exécution déterministe — jamais un "état fantôme").
    undo: () => {
      if (terminal) return { ok: false, reason: "TERMINAL" };
      if (trace.length === 0) return { ok: false, reason: "NOTHING_TO_UNDO" };
      const undone = trace.pop();
      let nxt = engine.createSession(level);
      for (const a of trace) {
        const r = engine.apply(nxt, a);
        if (r) nxt = r;
      }
      session = nxt;
      const ev = recorder.undone ? recorder.undone({ undone }) : null;
      if (onEvidence && ev) onEvidence(ev );
      return { ok: true, session, evidence: ev };
    },

    restart: () => {
      session = engine.createSession(level);
      trace.length = 0;
      const ev = recorder.restarted();
      if (onEvidence && ev) onEvidence(ev);
      return { ok: true, session, evidence: ev };
    },

    events: () => recorder.events(),
    evidence: () => recorder.events(),
    metrics: () => deriveMetrics(recorder.events()),

    profile: (overrides = {}) => detectProfile(recorder.events(), overrides),

    // POLICY — recommandation depuis profil RÉEL + éligibilité RÉELLE.
    recommendation: (inputs) => {
      const base = {
        candidates: inputs.candidates ?? [],
        progression: inputs.progression ?? {},
        difficulty: inputs.difficulty,
        profile: inputs.profile,
        metadata: inputs.metadata,
        config: inputs.config,
        held: inputs.held,
        history: inputs.history,
      };
      const r = recommend(base);
      return r;
    },

    // ORCHESTRATOR — SEUL écrivain (§7). Kill-switch SAFE_DEFAULT : jamais
    // appliqué (observateur pur).
    orchestrate: (inputs) => {
      if (inputs.mode === RUNTIME_KILL_SWITCH) {
        return {
          action: "SAFE_DEFAULT",
          policyMode: "SAFE_DEFAULT",
          level: inputs.recommendedLevel ?? null,
          reasonCodes: [],
          stateChanged: false,
        };
      }
      return orchestrate({
        storage,
        config: inputs.config,
        metadata: inputs.metadata,
        difficulty: inputs.difficulty,
        profile: inputs.profile,
      });
    },

    recorder,
    session: () => session,
  };
}
