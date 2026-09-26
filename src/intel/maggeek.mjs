import { LADDER, ladderBy } from "../b1/levels.mjs";
import { evaluate, createSession } from "../b1/engine.mjs";
import {
  isCoach,
  validateCoach,
  isRecommendation,
  validateRecommendation,
  DEFAULT_PROFILE,
  deterministicDefaultPolicy,
} from "./contracts.mjs";
import { FACT_ID, solverFacts as defaultSolverFacts } from "./facts.mjs";

export function createMaggeek({ facts = defaultSolverFacts, ladder = LADDER, evaluate: ev = evaluate, profile = DEFAULT_PROFILE } = {}) {
  const cache = new Map();

  function factsFor(level) {
    if (!level) return null;
    if (cache.has(level.id)) return cache.get(level.id);
    const r = facts(level);
    cache.set(level.id, r);
    return r;
  }

  function resolveLevel(context) {
    const { levelId, level } = context;
    if (level) return level;
    if (levelId) return ladder.find((l) => l.id === levelId) || null;
    return null;
  }

  function abstain(text) {
    return {
      type: "hint",
      level: "L1",
      confidence: "verified",
      abstain: true,
      solverFactId: [FACT_ID.SOLVABLE],
      text,
      lines: [],
    };
  }

  function hint(context) {
    const lvl = resolveLevel(context);
    if (!lvl) {
      return abstain("Niveau inconnu — aucun fait solver disponible.");
    }
    const reg = factsFor(lvl);
    if (!reg || reg.solvable === false) {
      return abstain("Aucun indice : ce niveau n'a pas de solution certifiée (fait vérifié, jamais inventé).");
    }
    if (reg.solvable === undefined || reg.solvable === null) {
      return abstain("Fait indisponible — aucun indice ne peut être dérivé de manière fiable.");
    }

    const target = lvl.target;
    const wins = (context.record && context.record.wins) || 0;
    const isL2 = wins >= 1 && reg.multiPath === true;
    const lines = [];
    const fids = [];

    if (reg.directWin && reg.firstMove) {
      const m = reg.firstMove;
      lines.push({
        solverFactId: FACT_ID.FIRST_MOVE,
        text: `${m.a} ${m.op} ${m.b} = ${target} — une opération suffit.`,
      });
      fids.push(FACT_ID.FIRST_MOVE, FACT_ID.DIRECT_WIN);
    } else if (reg.multiPath === true) {
      lines.push({
        solverFactId: FACT_ID.MULTI_PATH,
        text: `Tu peux obtenir ${target} de ${reg.routeCount} façon(s) — compare les scores (SF-ROUTE-05).`,
      });
      fids.push(FACT_ID.MULTI_PATH);
    } else if (reg.chainDepth >= 1) {
      lines.push({
        solverFactId: FACT_ID.CHAIN_DEPTH,
        text: `Cherche une chaîne : un résultat réutilisé vaut plus (SF-CHAIN-07, profondeur ${reg.chainDepth}).`,
      });
      fids.push(FACT_ID.CHAIN_DEPTH, FACT_ID.CHAIN_POSSIBLE);
    } else {
      lines.push({
        solverFactId: FACT_ID.LEGAL_FIRST_ACTS,
        text: `Regarde les nombres près de ${target} ; ${reg.legalFirstActs} premiers coups sont légaux (SF-AREA-11).`,
      });
      fids.push(FACT_ID.LEGAL_FIRST_ACTS, FACT_ID.SOLVABLE);
    }

    if (isL2 && reg.scoreRange) {
      lines.push({
        solverFactId: FACT_ID.SCORE_RANGE,
        text: `Les routes donnent des scores de ${reg.scoreRange[0]} à ${reg.scoreRange[1]} — joue la chaîne pour viser le plus haut.`,
      });
      fids.push(FACT_ID.SCORE_RANGE);
    }

    const movesTried = Array.isArray(context.movesTried) ? context.movesTried : [];
    if (movesTried.length) {
      lines.push({
        solverFactId: FACT_ID.MOVE_VALIDITY,
        text: `${movesTried.length} coup(s) déjà essayé(s) — aucun n'a été inventé.`,
      });
      fids.push(FACT_ID.MOVE_VALIDITY);
    }

    return {
      type: "hint",
      level: isL2 ? "L2" : "L1",
      confidence: "verified",
      abstain: false,
      solverFactId: [...new Set(fids)],
      text: lines.map((l) => l.text).join(" "),
      lines,
    };
  }

  function explain(context) {
    const { levelId, level, action, state } = context;
    const lvl = level || (levelId ? ladder.find((l) => l.id === levelId) : null);
    if (!lvl || !state || typeof ev !== "function") {
      return {
        type: "explain",
        ok: false,
        reason: "contexte insuffisant pour analyser ce coup",
        solverFactId: FACT_ID.MOVE_VALIDITY,
        confidence: "verified",
        text: "Coup non analysable : état ou niveau manquant.",
      };
    }
    const result = ev(state, action);
    if (!result || !result.ok) {
      return {
        type: "explain",
        ok: false,
        reason: (result && result.reason) || "coup illégal",
        solverFactId: FACT_ID.MOVE_VALIDITY,
        confidence: "verified",
        result,
        text: `Interdit : ${((result && result.reason) || "règle du noyau non satisfaite")}.`,
      };
    }
    const chain = result.chainRun > 0 ? `, chaîne ×${result.chainRun}` : "";
    return {
      type: "explain",
      ok: true,
      reason: "coup valide",
      solverFactId: FACT_ID.MOVE_VALIDITY,
      confidence: "verified",
      result,
      text: `${result.base} points${chain}, → ${result.result}.`,
    };
  }

  function encourage(context) {
    const { record } = context;
    if (!record) {
      return {
        type: "encourage",
        confidence: "verified",
        solverFactId: [FACT_ID.SOLUTION_COUNT],
        text: "Chaque essai nourrit le prochain. Continue.",
      };
    }
    const wins = record.wins || 0;
    if (wins >= 1) {
      return {
        type: "encourage",
        confidence: "verified",
        solverFactId: [FACT_ID.SOLUTION_COUNT],
        text: `Tu as déjà résolu ce niveau ${wins} fois. ${wins >= 3 ? "Tu maîtrises ce geste." : "Approfondis la chaîne."}`,
      };
    }
    return {
      type: "encourage",
      confidence: "verified",
      solverFactId: [FACT_ID.SOLUTION_COUNT],
      text: "Tu as déjà tenté — examine les coups refusés ; le moteur ne ment jamais.",
    };
  }

  function summarize(context) {
    const { record, levelId } = context;
    if (!record) {
      return {
        type: "summarize",
        confidence: "verified",
        solverFactId: [],
        text: "Pas de trace enregistrée.",
      };
    }
    return {
      type: "summarize",
      confidence: "verified",
      solverFactId: [FACT_ID.MIN_MOVES],
      text: `${levelId}: ${record.wins} victoire(s), meilleur score ${record.bestScore ?? "–"}.`,
    };
  }

  function recommend(context) {
    const { levelId, level, profile: prof, levelState, availableLevels } = context;
    if (prof && prof.hintDependency > 0.6) {
      return {
        kind: "assistance",
        text: `Tu sollicites souvent les indices — revoyez ${levelId || (level && level.id) || "un niveau"} pour renforcer le geste.`,
        rationale: [FACT_ID.SOLUTION_COUNT],
        confidence: "verified",
      };
    }
    if (levelState && availableLevels && prof) {
      const d = deterministicDefaultPolicy({ profile: prof, levelState, availableLevels });
      if (d) {
        return {
          kind: "assistance",
          text: "Revoyez un niveau ouvert pour renforcer la base.",
          rationale: ["DETERMINISTIC_DEFAULT_POLICY"],
          confidence: "verified",
          levelIds: d.allowedLevels,
        };
      }
    }
    return {
      kind: "default",
      text: "Aucune assistance prioritaire.",
      rationale: [],
      confidence: "verified",
    };
  }

  const coach = { hint, explain, encourage, summarize, recommend, factsFor, evaluate };
  return coach;
}

export { createSession };
