// MATHIC 1.0 — Adaptive Progression Experiment (MISSION 6)
//
// Prouve expérimentalement que le profil détecté RÉELLEMENT (depuis les
// Evidence du moteur réel, adaptateur de runtime M5) entraîne une progression
// DIFFÉRENTE, PERTINENTE et DÉTERMINISTE dans Mathic.
//
// PRINCIPES :
//  - un « bot » est un ordre de sélection d'actions qui JOUENT RÉELLEMENT le
//    niveau via createRuntimeAdapter → Engine b1 réel → Evidence réelle ;
//  - aucune prédiction : chaque action est un ACTION_PREVIEWED /
//    ACTION_COMMITTED réel, chaque victoire/échec est un terminal réel du moteur ;
//  - profil détecté = detectProfile sur l'Evidence cumulée des sessions réelles ;
//  - progression pilotée par orchestrate() réel (seul écrivain de la position,
//    kill-switch SAFE_DEFAULT et invariants §11/§13 conservés) ;
//  - les primitives de jeu (markCompleted / unlockTo / saveNow) simulent la
//    prise en compte d'une victoire réelle — seule écriture hors orchestrate ;
//  - déterministe : PRNG seedé (mulberry32), aucun Math.random, rejeu reproductible.

import { createSession, apply, evaluate, enumerateActions, isWon, isLost, isBlocked } from "../b1/engine.mjs";
import { createClock } from "./evidence.mjs";
import { detectProfile } from "./profile.mjs";
import { createRuntimeAdapter } from "./runtime.mjs";
import { orchestrate } from "./progression-orchestrator.mjs";
import { loadSave, saveNow, markCompleted, unlockTo } from "../b1/save.mjs";

export const EXPERIMENT_VERSION = 1;
export const EXPERIMENT_METHOD = "selfplay-adaptive-v1";

const ENGINE = Object.freeze({ createSession, apply, evaluate, enumerateActions, isWon, isLost, isBlocked });

export const SIM_SAVE_KEY = "mathic.save.v1";

// PRNG déterministe (mulberry32) — runs reproductibles, seed documenté.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSimStorage() {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    delete: (k) => void map.delete(k),
  };
}

// Horloge injectable strictement croissante — déterministe, partageable entre
// sessions voisines (l'adaptateur n'utilise jamais l'horloge du système ici).
let _clockNow = 1700000000000;
export function fakeClock({ start = 1700000000000, step = 90000 } = {}) {
  let now = start;
  return createClock({
    now: () => {
      now += step;
      return now;
    },
  });
}

// Sélection d'action par comportement. Ne lit QUE le GameState réel du moteur
// et évalue réellement les actions candidates — jamais de devinette.
export function pickAction(strategy, session, rnd) {
  const acts = enumerateActions(session);
  if (!acts.length) return null;
  if (strategy === "arithm") {
    let best = null;
    let bestDelta = -Infinity;
    for (const a of acts) {
      const ev = evaluate(session, a);
      if (ev && ev.ok !== false && ev.delta > bestDelta) {
        bestDelta = ev.delta;
        best = a;
      }
    }
    return best ?? acts[0];
  }
  if (strategy === "explorer") {
    const evals = acts
      .map((a) => ({ a, ev: evaluate(session, a) }))
      .sort((x, y) => (x.ev?.delta ?? 0) - (y.ev?.delta ?? 0));
    const pool = evals.slice(0, Math.max(1, Math.floor(evals.length / 2) || 1));
    return (pool[Math.floor(rnd() * pool.length)] ?? evals[0]).a;
  }
  if (strategy === "chain") {
    for (const a of acts) {
      const ev = evaluate(session, a);
      if (ev && ev.ok !== false && ev.chainRun >= 1) return a;
    }
    return acts[Math.floor(rnd() * acts.length)];
  }
  return acts[Math.floor(rnd() * acts.length)];
}

// Joue UN niveau réel via l'adapter runtime. Le terminal est l'état REEL du
// moteur (won / isLost / isBlocked). Retourne l'adapter + le bilan de partie.
export function playLevelOnce({ strategy, seed, level, maxTurns = 24 }) {
  const rnd = mulberry32(seed);
  const adapter = createRuntimeAdapter({
    engine: ENGINE,
    level,
    sessionId: `m6-adaptive:${level.id}:${strategy}:${seed}`,
    clock: fakeClock(),
  });
  adapter.started();
  let turn = 0;
  while (turn++ < maxTurns) {
    const s = adapter.session();
    if (s.won) break;
    if (adapter.terminal) break;
    if (isLost(s) || isBlocked(s)) break;
    let action;
    if (strategy === "explorer") {
      for (const a of enumerateActions(s)) adapter.preview(a);
      action = pickAction(strategy, s, rnd);
      if (rnd() < 0.35 && adapter.session().trace.length > 0) adapter.undo();
    } else if (strategy === "chain") {
      action = pickAction(strategy, s, rnd);
      const ev = action != null ? evaluate(s, action) : null;
      if (!(ev && ev.ok !== false && ev.chainRun >= 1) && rnd() < 0.12) adapter.restart();
    } else {
      action = pickAction(strategy, s, rnd);
    }
    if (action == null) break;
    const out = adapter.apply(action);
    if (!out.ok) {
      if (out.reason === "REJECTED_BY_ENGINE") continue;
      if (out.reason === "TERMINAL") break;
    }
    if (out.terminal) break;
  }
  const s = adapter.session();
  return {
    adapter,
    won: Boolean(s.won),
    lost: Boolean(isLost(s)),
    blocked: Boolean(isBlocked(s)),
    score: s.score ?? 0,
    movesLeft: s.movesLeft ?? 0,
  };
}

// ============================== SELF-PLAY ADAPTATIF =========================

export function selfPlayAdaptive({
  strategy = "arithm",
  seed = 20260924,
  levelCount = 5,
  window = 2,
  ladder,
  metadata,
  difficulty,
  storage,
  config = {},
  maxRetries = 3,
}) {
  let evidences = [];
  const trajectory = [];
  const seeded = mulberry32(seed);

  const indexOf = (id) => ladder.findIndex((l) => l.id === id);
  const levelById = (id) => ladder.find((l) => l.id === id);
  const nextLevelId = (id) => {
    const i = indexOf(id);
    return i >= 0 && i + 1 < ladder.length ? ladder[i + 1].id : null;
  };

  for (let stepNo = 0; stepNo < levelCount; stepNo++) {
    const state = loadSave(storage);
    const currentId = state.current;
    const level = levelById(currentId);
    if (!level) break;

    // 1. JOUER réellement le niveau courant (retries réels bornés).
    let played = null;
    for (let tryNo = 0; tryNo < maxRetries; tryNo++) {
      played = playLevelOnce({ strategy, level, seed: seeded() });
      if (played.won) break;
      if (played.lost || played.blocked) continue;
      break;
    }

    // 2. Victoire réelle → primitives du vrai jeu (completed + fenêtre devant,
    //    comme l'accès multi-niveaux réel du joueur) ; défaite → pas de complétion.
    let next = loadSave(storage);
    if (played.won) {
      next = markCompleted(next, currentId, { score: played.score, movesLeft: played.movesLeft });
    }
    const maxIdx = Math.min(indexOf(currentId) + window, ladder.length - 1);
    next = unlockTo(next, ladder[maxIdx].id);
    next = saveNow(next, storage);

    // 3. Profil détecté RÉELLEMENT sur l'Evidence cumulée réelle.
    evidences = [...evidences, ...played.adapter.events()];
    const profile = detectProfile([...evidences]);
    const dims = profile.profile;
    const applied = {
      arithmetic: dims.arithmetic ?? 0,
      exploration: dims.exploration ?? 0,
      strategy: dims.strategy ?? 0,
      efficiency: dims.efficiency ?? 0,
      chainAffinity: dims.chainAffinity ?? 0,
    };

    // 4. RECOMMANDATION + APPLICATION via l'Orchestrator réel (seul écrivain de
    //    la position ; kill-switch SAFE_DEFAULT / invariants §11-§13 intacts).
    const out = orchestrate({ storage, metadata, difficulty, profile: profile.profile, config });

    trajectory.push({
      step: stepNo + 1,
      level: currentId,
      won: played.won,
      score: played.score,
      movesLeft: played.movesLeft,
      action: out.action,
      recommended: out.level,
      mode: out.policyMode,
      reasonCodes: [...(out.reasonCodes ?? [])],
      stateChanged: out.stateChanged,
      profileState: profile.state,
      dimensions: applied,
    });

    // 5. Position suivante = niveau appliqué par l'IA, sinon niveau suivant.
    const target = (out.action === "APPLIED" && out.level) || nextLevelId(currentId);
    if (!target) break;
    next = saveNow({ ...loadSave(storage), current: target }, storage);
  }

  const finalProfile = detectProfile([...evidences]);
  return {
    strategy,
    seed,
    trajectory,
    evidenceCount: evidences.length,
    finalProfile: { state: finalProfile.state, profile: { ...finalProfile.profile } },
  };
}