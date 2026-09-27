// MATHIC 1.0 — Progression Orchestrator (MISSION 4)
//
// Transforme une RECOMMANDATION de la Progression Policy (MISSION 3) en une
// APPLICATION CONTRÔLÉE sur la progression réelle — et rien d'autre.
//
// PIPELINE (mandat §7, ordre opposable) :
//   1. LIRE       loadSave() — la save réelle (corrompue → blankSave, jamais d'exception)
//   2. CONSTRUIRE candidats = catalogue réel (LADDER, aucun niveau inventé)
//   3. DÉCIDER    recommend({ ..., held, history }) — boucle de rétroaction §9
//   4. VALIDER    forme §12 ∧ niveau ∈ eligibleLevels ∧ isUnlocked (défense en profondeur)
//   5. APPLIQUER  setCurrent + saveNow — UNIQUEMENT si le niveau diffère du courant
//   6. PERSISTER  la boucle de rétroaction (clé séparée, versionnée, §9)
//   7. RETOURNER  un outcome déclaratif (§12)
//
// PRIMITIVES (mandat §6 — opposable) :
//   ✅ setCurrent / saveNow / loadSave (src/b1/save.mjs, consommé tel quel)
//   ❌ aucune API de déblocage ni de complétion forcée, aucune mutation directe
//      de `unlocked` ou `completed`
//   → la Policy ne recommande que des niveaux déjà débloqués ; appliquer une
//     recommandation n'a donc JAMAIS besoin de débloquer quoi que ce soit.
//     Une recommandation sur un niveau non débloqué est une corruption d'entrée
//     → rejet (§11), jamais un déblocage.
//
// INVARIANT CENTRAL (§11) : aucun chemin d'échec n'écrit dans la save du jeu.
// Un échec de l'intelligence ne peut jamais altérer la progression du joueur.
// Un repli SAFE_DEFAULT (profil absent/invalide/confiance insuffisante) est un
// chemin d'observation : la recommandation de repli est exposée, JAMAIS appliquée.
//
// FRONTIÈRE : l'Orchestrator est le PONT autorisé entre le plan intelligence et
// la persistence. Il importe le Game Core UNIQUEMENT pour ses primitives de
// sauvegarde (save.mjs) — jamais Engine/Kernel/Solver/Replay/Level Grammar.
// Le profil est reçu en entrée : il n'est JAMAIS recalculé depuis l'Evidence.

import { LADDER } from "../b1/levels.mjs";
import { loadSave, saveNow, setCurrent, isUnlocked } from "../b1/save.mjs";
import { POLICY_VERSION } from "./contracts.mjs";
import { policyConfiguration, recommend, isProgressionRecommendation } from "./progression-policy.mjs";

export const ORCHESTRATOR_VERSION = 1;

// Clé de persistance de la boucle d'intelligence — SÉPARÉE de mathic.save.v1 :
// le format de sauvegarde du jeu reste intouché (mandat §9).
export const INTEL_LOOP_KEY = "mathic.intel.progression.v1";

export const ORCHESTRATOR_ACTIONS = Object.freeze(["APPLIED", "NO_OP", "REJECTED", "SAFE_DEFAULT"]);

// ---------------------------------------------------------------------------
// Boucle de rétroaction (mandat §9) — persistée, versionnée, bornée
// ---------------------------------------------------------------------------

const clampHistory = (h, max) =>
  Array.isArray(h) ? h.filter((x) => typeof x === "string" && x.length > 0).slice(0, max) : [];

// Un état de boucle inconnu (version ≠ 1, policyVersion ≠ contrat) est JETÉ :
// pas de migration hasardeuse, la boucle repart à vide (mandat §9).
export function loadIntelLoop(storage, { maxHistory = 3 } = {}) {
  try {
    const raw = storage?.get?.(INTEL_LOOP_KEY);
    if (!raw) return { held: null, history: [], mode: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { held: null, history: [], mode: null };
    if (parsed.version !== 1) return { held: null, history: [], mode: null };
    if (parsed.policyVersion !== POLICY_VERSION) return { held: null, history: [], mode: null };
    return {
      held: typeof parsed.held === "string" ? parsed.held : null,
      history: clampHistory(parsed.history, maxHistory),
      mode: typeof parsed.mode === "string" ? parsed.mode : null,
    };
  } catch {
    return { held: null, history: [], mode: null };
  }
}

function commitIntelLoop(storage, loop) {
  storage.set(
    INTEL_LOOP_KEY,
    JSON.stringify({
      version: 1,
      held: loop.held,
      history: loop.history,
      policyVersion: POLICY_VERSION,
      mode: loop.mode ?? null,
    })
  );
}

// ---------------------------------------------------------------------------
// Application défensive (§7 étapes 4-5) — exportée pour testabilité
// (les tests O-03/O-04/O-05 corrompent la recommandation ICI, jamais la Policy)
// ---------------------------------------------------------------------------

export function applyRecommendation(state, recommendation, { storage } = {}) {
  // 4. VALIDER — toute erreur → REJECTED, aucune écriture
  if (!isProgressionRecommendation(recommendation)) return { ok: false, detail: "INVALID_RECOMMENDATION" };
  const level = recommendation.recommendedLevel;
  if (level === null) return { ok: true, noop: true, detail: "NOTHING_TO_APPLY", state };
  if (!recommendation.eligibleLevels.includes(level)) return { ok: false, detail: "LEVEL_NOT_ELIGIBLE", state };
  if (!isUnlocked(state, level)) return { ok: false, detail: "LEVEL_LOCKED", state };
  // 5. APPLIQUER — idempotent : déjà courant → NO_OP, zéro écriture (§13)
  if (state.current === level) return { ok: true, noop: true, detail: "ALREADY_CURRENT", state };
  return { ok: true, noop: false, detail: null, state: saveNow(setCurrent(state, level), storage) };
}

// ---------------------------------------------------------------------------
// Outcome déclaratif (mandat §12) — aucune capacité d'écriture exposée
// ---------------------------------------------------------------------------

const outcome = ({ action, level = null, reasonCodes = [], policyMode = null, stateChanged = false, detail = null }) =>
  Object.freeze({
    orchestratorVersion: ORCHESTRATOR_VERSION,
    action,
    level,
    reasonCodes: Object.freeze([...reasonCodes]),
    policyMode,
    stateChanged,
    detail, // prolongement documenté de §12 : chemin précis de REJECTED / NO_OP
  });

// ---------------------------------------------------------------------------
// PIPELINE (mandat §7)
// ---------------------------------------------------------------------------

export function orchestrate(inputs = {}) {
  const cfg = policyConfiguration(inputs.config);
  const storage = inputs.storage; // injectable — jamais de persistance navigateur directe
  const maxHistory = Math.max(cfg.stabilityWindow, 3);

  // 1. LIRE — source de vérité de la progression (corrompue → blankSave)
  const state = loadSave(storage);
  // 3. boucle de rétroaction persistée (§9)
  const loop = loadIntelLoop(storage, { maxHistory });

  // 10. KILL-SWITCH : mode SAFE_DEFAULT configuré → l'Orchestrator n'applique
  // RIEN de adaptatif ; la progression suit son cours normal du jeu. La boucle
  // est conservée telle quelle (reprise propre), jamais appliquée, jamais écrite.
  if (cfg.mode === "SAFE_DEFAULT") {
    return outcome({ action: "SAFE_DEFAULT", policyMode: "SAFE_DEFAULT", stateChanged: false });
  }

  // 2-3. CONSTRUIRE + DÉCIDER — catalogue réel, profil reçu (jamais recalculé)
  let r;
  try {
    r = recommend({
      candidates: LADDER.map((l) => l.id),
      progression: state,
      metadata: inputs.metadata,
      difficulty: inputs.difficulty,
      profile: inputs.profile,
      config: inputs.config,
      held: loop.held,
      history: loop.history,
    });
  } catch {
    // l'intelligence échoue → la save du jeu reste intacte (invariant §11)
    return outcome({ action: "REJECTED", reasonCodes: [], policyMode: null, stateChanged: false, detail: "POLICY_ERROR" });
  }

  // Repli sûr (§9) : profil absent / invalide / confiance insuffisante → la
  // recommandation SAFE_DEFAULT n'est JAMAIS appliquée. L'Orchestrator reste
  // observateur, la progression du jeu continue telle quelle (aucune écriture,
  // position ni boucle). Le niveau de repli est exposé à titre informatif.
  if (r.mode === "SAFE_DEFAULT") {
    return outcome({
      action: "SAFE_DEFAULT",
      level: r.recommendedLevel,
      reasonCodes: [...r.reasonCodes],
      policyMode: "SAFE_DEFAULT",
      stateChanged: false,
    });
  }

  // 4-5. VALIDER + APPLIQUER — setCurrent + saveNow uniquement
  const applied = applyRecommendation(state, r, { storage });
  if (!applied.ok) {
    // rejet : aucune écriture (position ni boucle), le jeu continue
    return outcome({ action: "REJECTED", reasonCodes: [...r.reasonCodes], policyMode: r.mode, stateChanged: false, detail: applied.detail });
  }

  // 6. PERSISTER la boucle — UNIQUEMENT pour une transition réellement appliquée
  //    (idempotence §13 : une recommandation NO_OP est une simple confirmation,
  //    jamais une nouvelle observation ; la boucle reste donc strictement identique
  //    à entrées égales). Un repli/échec n'écrit jamais (§11).
  const stateChanged = !applied.noop;
  if (stateChanged) {
    const newLoop = {
      held: r.recommendedLevel,
      history: clampHistory([r.candidateLevel, ...loop.history], maxHistory),
      mode: r.mode,
    };
    if (JSON.stringify(newLoop) !== JSON.stringify(loop)) commitIntelLoop(storage, newLoop);
  }

  return outcome({
    action: stateChanged ? "APPLIED" : "NO_OP",
    level: r.recommendedLevel,
    reasonCodes: [...r.reasonCodes],
    policyMode: r.mode,
    stateChanged,
    detail: applied.detail,
  });
}
