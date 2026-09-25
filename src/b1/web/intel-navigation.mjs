// MATHIC 1.0 — Pont UI → Adaptive Progression (MISSION 7)
//
// Achemine M6 dans l'UI réelle (src/b1/web/b1-web.js) SANS réécrire le
// frontend ni implanter une deuxième logique de progression.
//
// PRINCIPES :
//  - l'UI continue de piloter sa session réelle (createSession/apply) ;
//  - ce pont RÉOBSERVE chaque transition UI dans un adaptateur Runtime (M5) :
//    même moteur, même règles, ré-exécution déterministe → Evidence RÉELLE ;
//  - au terminal de niveau : profil détecté (detectProfile) sur les Evidence
//    réelles de la session UI, puis orchestrate() réel (SEUL écrivain de la
//    position, kill-switch SAFE_DEFAULT, invariants §11/§13) ;
//  - le niveau suivant est la Recommendation acceptée par l'Orchestrator si
//    elle est débloquée ; sinon le parcours standard (nextLevel ordinal) ;
//  - Intelligence OFF : progression standard déterministe existante (§7).
//
// DONC : l'UI n'a AUCUNE autorité de progression. Elle affiche et déclenche ;
// elle ne décide pas, ne débloque pas, ne mute pas la save hors victoire UI.

import { createRuntimeAdapter } from "../../intel/runtime.mjs";
import { createClock } from "../../intel/evidence.mjs";
import { detectProfile } from "../../intel/profile.mjs";
import { orchestrate } from "../../intel/progression-orchestrator.mjs";
import { analyzeAll } from "../level-design.mjs";
import { LADDER, nextLevel } from "../levels.mjs";
import { loadSave, isUnlocked } from "../save.mjs";

export const INTEL_UI_VERSION = 1;
export const INTEL_UI_METHOD = "ui-navigation-v1";

function makeClock() {
  let now = 1700000000000;
  return createClock({
    now: () => {
      now += 90000;
      return now;
    },
  });
}

const DIFFICULTY = () =>
  Object.fromEntries(LADDER.map((l) => [l.id, { index: Number(Number(l.id.slice(1))) || l.id.charCodeAt(0) }]));

export function createIntelNavigation({ engine, storage, config = {}, metadata = null, clock } = {}) {
  if (!engine) throw new TypeError("createIntelNavigation : engine requis (injecté, jamais importé par intel)");
  if (!storage) throw new TypeError("createIntelNavigation : storage requis");

  let enabled = true;
  let level = null;
  let adapter = null;
  let _metadata = metadata;
  let lastPreviewKey = null;
  let lastDecision = null;
  // Historique d'Evidence RÉELLE agrégé sur la session UI (le profil du joueur
  // se construit à travers les niveaux, comme la fenêtre M6 — jamais jeté).
  let evidences = [];

  const clockInstance = clock ?? makeClock();

  const metadataProvider = () => {
    if (_metadata) return _metadata;
    _metadata = Object.fromEntries(analyzeAll({ budget: 40000 }).map((a) => [a.id, a]));
    return _metadata;
  };

  return {
    version: INTEL_UI_VERSION,
    method: INTEL_UI_METHOD,

    isEnabled: () => enabled,
    setEnabled: (v) => {
      enabled = Boolean(v);
      if (!enabled) lastDecision = null;
    },

    beginLevel(next) {
      level = next;
      adapter = createRuntimeAdapter({
        engine,
        level: next,
        sessionId: `m7-ui:${next.id}:${nextLevel(next.id)?.id ?? "END"}`,
        clock: clockInstance,
      });
      adapter.started();
      lastDecision = null;
      lastPreviewKey = null;
      return this;
    },

    preview(action) {
      if (!enabled || !adapter || action == null) return null;
      const key = JSON.stringify(action);
      if (key === lastPreviewKey) return null;
      lastPreviewKey = key;
      return adapter.preview(action);
    },

    commit(action) {
      if (!enabled || !adapter || action == null) return null;
      lastPreviewKey = null;
      return adapter.apply(action);
    },

    undo() {
      if (!enabled || !adapter) return { ok: false };
      lastPreviewKey = null;
      return adapter.undo();
    },

    restart() {
      if (!enabled || !adapter) return { ok: false };
      lastPreviewKey = null;
      return adapter.restart();
    },

    finishLevel({ won, score, movesLeft }) {
      if (!adapter) return null;
      const result = won ? adapter.completed({ score: score ?? 0, movesLeft: movesLeft ?? 0 }) : adapter.failed("move_limit");
      if (adapter.events().length) evidences = [...evidences, ...adapter.events()];
      return result;
    },

    // Décide le niveau suivant à partir des Evidence RÉELLES de la session UI.
    decideNext() {
      if (!adapter) return null;
      if (lastDecision) return lastDecision;

      const terminal = adapter.events().filter((e) => e.type === "LEVEL_COMPLETED" || e.type === "LEVEL_FAILED").length > 0;

      let decision;
      if (!enabled || !terminal) {
        // Intelligence OFF ou partie non terminée → parcours standard.
        decision = {
          level: level.id,
          nextLevel: nextLevel(level.id)?.id ?? null,
          recommended: null,
          action: "FALLBACK",
          fallbackUsed: true,
          reasonCodes: [],
          policyMode: null,
          profileState: "INTEL_OFF",
          profile: null,
          evidenceCount: adapter.events().length,
        };
      } else {
        const profile = detectProfile(evidences);
        let out = null;
        try {
          out = orchestrate({
            storage,
            metadata: metadataProvider(),
            difficulty: DIFFICULTY(),
            profile: profile.profile,
            config,
          });
        } catch {
          out = null;
        }
        const accepted = out && out.action === "APPLIED" && out.level;
        const recommendedId = accepted ? out.level : null;
        let nextLevelId = recommendedId;
        let fallbackUsed = false;
        if (accepted) {
          const st = loadSave(storage);
          if (!isUnlocked(st, recommendedId) && !st.completed[recommendedId]) {
            nextLevelId = null;
            fallbackUsed = true;
          }
        } else {
          fallbackUsed = true;
        }
        if (!nextLevelId) {
          nextLevelId = nextLevel(level.id)?.id ?? null;
        }
        decision = {
          level: level.id,
          nextLevel: nextLevelId,
          recommended: recommendedId,
          action: accepted ? out.action : out && out.action === "NO_OP" ? "NO_OP" : "FALLBACK",
          fallbackUsed,
          reasonCodes: [...(out?.reasonCodes ?? [])],
          policyMode: out?.policyMode ?? null,
          profileState: profile.state,
          profile: { ...profile.profile },
          evidenceCount: evidences.length,
        };
      }
      lastDecision = decision;
      if (typeof console !== "undefined" && console.info) {
        console.info("MATHIC-UI|", JSON.stringify({ levelId: decision.level, nextLevel: decision.nextLevel, recommended: decision.recommended, reasonCodes: decision.reasonCodes, fallbackUsed: decision.fallbackUsed, profileState: decision.profileState, evidenceCount: decision.evidenceCount }));
      }
      return decision;
    },

    decision: () => lastDecision,
    events: () => (adapter ? [...evidences] : []),
    profile: () => (adapter ? detectProfile(evidences) : null),
  };
}