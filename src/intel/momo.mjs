import {
  isCoach,
  validateCoach,
  isIntelligenceProvider,
  validateIntelligenceProvider,
  hasWriteCapability,
  isRecommendation,
  DEFAULT_PROFILE,
} from "./contracts.mjs";

export const MOMO_MODES = Object.freeze(["deterministic", "local-llm", "fallback"]);
const MOMO_DEFAULT_MODE = "deterministic";
const MOMO_TIMEOUT_DEFAULT = 1500;

function resolveMode(windowRef) {
  if (windowRef && windowRef.localStorage) {
    try {
      const v = windowRef.localStorage.getItem("mathic.momo.mode");
      if (v && MOMO_MODES.includes(v)) return v;
    } catch {}
  }
  if (typeof process !== "undefined" && process.env && process.env.MOMO_MODE && MOMO_MODES.includes(process.env.MOMO_MODE)) {
    return process.env.MOMO_MODE;
  }
  return MOMO_DEFAULT_MODE;
}

export function momoMode(windowRef) {
  return resolveMode(windowRef);
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    Promise.resolve(promise)
      .then((v) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(v);
        }
      })
      .catch(() => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(null);
        }
      });
  });
}

export function createMomo({ coach, provider = null, mode = MOMO_DEFAULT_MODE, timeoutMs = MOMO_TIMEOUT_DEFAULT } = {}) {
  if (!coach || !isCoach(coach)) {
    throw new TypeError("momo : un coach valide (explain/hint/encourage/summarize/recommend, sans capacité d'écriture) est requis");
  }
  if (coach && hasWriteCapability(coach)) {
    throw new TypeError("momo : le coach injecté ne doit posséder aucune capacité d'écriture sur le GameState");
  }

  let providerErrors = [];
  if (provider !== null && provider !== undefined) {
    providerErrors = validateIntelligenceProvider(provider);
    if (providerErrors.length) {
      throw new TypeError("momo : provider invalide — " + providerErrors.join(", "));
    }
    if (hasWriteCapability(provider)) {
      throw new TypeError("momo : un provider interdit d'écrire sur le GameState");
    }
  }

  const resolvedMode = MOMO_MODES.includes(mode) ? mode : MOMO_DEFAULT_MODE;
  let useLLM = false;
  if (resolvedMode === "local-llm" && provider && typeof provider.isAvailable === "function" && provider.isAvailable() === true) {
    useLLM = true;
  }
  if (resolvedMode === "fallback") {
    useLLM = false;
  }

  function deterministic() {
    return { level: "L1", confidence: "verified", source: "maggeek-deterministic" };
  }

  async function enrich(method, ctx) {
    if (!useLLM || !provider) return null;
    try {
      const res = await withTimeout(provider[method](ctx), timeoutMs);
      if (!res || typeof res !== "object") return null;
      if (!isRecommendation(res)) return null;
      if (hasWriteCapability(res)) return null;
      if (res.confidence !== "local" && res.confidence !== "verified") return null;
      return res;
    } catch {
      return null;
    }
  }

  function safeCall(name, ctx) {
    try {
      return coach[name](ctx);
    } catch {
      return fallbackHint();
    }
  }

  function fallbackHint() {
    return {
      type: "hint",
      level: "L1",
      confidence: "verified",
      abstain: true,
      solverFactId: [],
      text: "Momo est en mode secours — aucun conseil calculé ne remplace le moteur.",
      lines: [],
    };
  }

  const momo = {
    mode: () => resolvedMode,
    providerInfo: () => (provider && typeof provider.info === "function" ? provider.info() : null),
    isLLM: () => useLLM,
    providerState: () => ({ available: useLLM, mode: resolvedMode, validationErrors: providerErrors }),

    hint: (ctx) => safeCall("hint", ctx),
    explain: (ctx) => safeCall("explain", ctx),
    encourage: (ctx) => safeCall("encourage", ctx),
    summarize: (ctx) => safeCall("summarize", ctx),
    recommend: (ctx) => safeCall("recommend", ctx),

    hintAsync: async (ctx) => {
      const base = safeCall("hint", ctx);
      const extra = await enrich("recommend", ctx);
      if (!extra) return base;
      return {
        ...base,
        confidence: "local",
        level: "L3",
        providerId: extra.providerId ?? extra.kind,
        text: extra.text ? `${base.text} | ${extra.text}` : base.text,
        lines: [...(base.lines || []), { solverFactId: extra.rationale || [], text: extra.text }],
      };
    },

    factsFor: (level) => {
      try {
        return coach.factsFor ? coach.factsFor(level) : null;
      } catch {
        return null;
      }
    },
  };

  return momo;
}

export default createMomo;
