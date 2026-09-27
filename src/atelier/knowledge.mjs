// ============================================================================
// M15 — FRAGMENTS DE SAVOIR · Marges de Maggeek
// ----------------------------------------------------------------------------
// Couche de MÉMOIRE PÉDAGOGIQUE, strictement dépendante d'expériences vérifiées.
//
//   FACT  = ce que le moteur / l'expérience établit réellement
//   LORE  = la manière narrative dont ce fait est présenté
//
//   Engine / Replay / Oculus (INVARIABLES)
//        ↓  observations réelles
//   Verified Event / Lesson Fact
//        ↓  évaluation pure, déterministe, monotone, idempotente
//   Fragment Unlock Rule
//        ↓
//   Fragment ID
//        ↓
//   Persistence locale (OFFLINE-FIRST, versionnée, fail-safe)
//
// Contrats (§10, §11, §20, §22) :
//   - Monotonie   : K_{t+1} ⊇ K_t — jamais de retrait.
//   - Idempotence : unlock(F)+unlock(F) = unlock(F) — NO_OP sans doublon.
//   - Déterminisme: F(E)=F(E), indépendant de l'ordre d'évaluation et du reload.
//   - Aucun hasard, aucune horloge, aucun réseau, aucun LLM, aucune monnaie.
//   - Storage corrompu → fallback sûr, jamais un blocage d'Atelier.
//
// Extension (seam M16 — Symbiote des Gardiens) :
//   createKnowledgeStore(backend, { extraFragments, extraRules }) permet
//   d'ENRICHIR le catalogue sans toucher aux 5 Fragments de base ni à leur
//   comportement : toutes les fonctions de base gardent leur signature et leur
//   sémantique (le contexte par défaut reste le catalogue M15). Les ids
//   additionnels sont reconnus par le décodage de ce STORE uniquement ; un
//   fragment inconnu reste, selon contrat, ignoré partout ailleurs.
// ============================================================================

export const KNOWLEDGE_SCHEMA_VERSION = 1;
const STORAGE_KEY = "mathic.knowledge.v1";

// ---------------------------------------------------------------------------
// Catalogue de base — contenu STATIQUE, versionné, LORE=SÉPARÉ du FACT.
// ---------------------------------------------------------------------------

const BASE_CATALOG = [
  {
    id: "LORE_ATELIER_001",
    title: "L'Atelier Astral",
    category: "ATELIER",
    version: 1,
    fact: "Une session du moteur V5 a été résolue dans l'Atelier (getState().solved → true).",
    body: "L'Atelier est un laboratoire de manipulation : chaque équation y est une incantation vérifiée. Ta place ici est celle d'un apprenti mathicien — le reste s'apprend en observant le moteur, pas en lui obéissant les yeux fermés.",
  },
  {
    id: "LORE_CHRONOS_001",
    title: "Marges de Chronos",
    category: "ENGINE",
    version: 1,
    fact: "Le Sablier a réellement remonté la trace : back()/backToStart() ont déplacé le curseur replay (la position de replay a changé).",
    body: "Chronos conserve chaque bifurcation. Revenir n'efface rien : cela déplace le présent. La trace garde la mémoire de ce que tu as osé, et reprendre la marche est un choix, pas un effacement.",
  },
  {
    id: "LORE_ENGINE_FAILFAST_001",
    title: "Marges du Validateur",
    category: "ENGINE",
    version: 1,
    fact: "Une incantation a été soumise à l'Oculus : apply() a répondu (acceptation, rejet, ou mise à l'écart par la loi de ligne/colonne via getMoves).",
    body: "Le Validateur ne juge pas, il vérifie : chaque pose est acceptée, rejetée ou écartée par la loi. L'arrêt est net, sans exception murmurée — et c'est une grâce, car toute cause est lisible ensuite.",
  },
  {
    id: "LORE_MAGEEK_001",
    title: "L'apprentissage par la trace",
    category: "MAGEEK",
    version: 1,
    fact: "Une incantation rejetée/écartée a été observée par l'Oculus, PUIS la session a été résolue (séquence réelle, ordre vérifié).",
    body: "Mageek note : « L'erreur n'est pas un échec, c'est une bifurcation marquée à l'encre. Qui suit la trace jusqu'au point de bascule puis recommence apprend deux fois. »",
  },
  {
    id: "LORE_ALJABR_001",
    title: "Sceau & transmission",
    category: "WORLD",
    version: 1,
    fact: "Un Sceau (représentation canonique déterministe du défi) a été forgé, PUIS ce défi a été résolu.",
    body: "Al-Djabr le graveur enseignait qu'un problème bien gravé se transmet sans se déformer. Le Sceau est la preuve que deux apprentis, regardant la même pierre, résoudront le même mystère.",
  },
];

// ---------------------------------------------------------------------------
// Règles de déverrouillage de base — prédicats sur la séquence d'évidences.
// ---------------------------------------------------------------------------

function has(seq, t) {
  return seq.some((o) => o.t === t);
}
// Vrai si un obs de type t1 précède (strictement) un obs de type t2.
function before(seq, t1, t2) {
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].t === t1) {
      for (let j = i + 1; j < seq.length; j++) if (seq[j].t === t2) return true;
    }
  }
  return false;
}

function ruleAtelier(seq) { return has(seq, "CHALLENGE_COMPLETED"); }
function ruleChronos(seq) { return has(seq, "REWIND_USED"); }
function ruleValidateur(seq) { return has(seq, "OCULUS_ACTION_ANALYZED"); }
function ruleMageek(seq) { return before(seq, "OCULUS_REJECTION_OBSERVED", "CHALLENGE_COMPLETED"); }
function ruleAljabr(seq) { return before(seq, "SEAL_CREATED", "CHALLENGE_COMPLETED"); }

const BASE_RULES = {
  LORE_ATELIER_001: ruleAtelier,
  LORE_CHRONOS_001: ruleChronos,
  LORE_ENGINE_FAILFAST_001: ruleValidateur,
  LORE_MAGEEK_001: ruleMageek,
  LORE_ALJABR_001: ruleAljabr,
};

// ---------------------------------------------------------------------------
// Contexte : catalogue (ordre = déterminisme d'affichage) + règles.
// ---------------------------------------------------------------------------

const defaultCtx = () => ({ catalog: BASE_CATALOG, rules: BASE_RULES });

export function getFragment(id) {
  const f = BASE_CATALOG.find((x) => x.id === id);
  return f ? { ...f } : null;
}

export function listFragments() {
  return BASE_CATALOG.map((f) => ({ ...f }));
}

// ---------------------------------------------------------------------------
// État de connaissance (KnowledgeState) — séparé de la Progression.
// ---------------------------------------------------------------------------

export const emptyKnowledgeState = () => ({
  schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
  unlockedFragments: [],
});

// Classement par ordre du contexte (ids inconnus en fin de liste, ordre stable).
function sortByCatalog(ids, ctx) {
  const idx = new Map(ctx.catalog.map((f, i) => [f.id, i]));
  return [...ids].sort((a, b) => (idx.get(a) ?? 1e9) - (idx.get(b) ?? 1e9));
}

// ---------------------------------------------------------------------------
// Règles de déverrouillage — ÉVALUATION PURE (aucune mutation implicite).
// evidence : { sequence: [obs, ...] } — obs réels, chronologiques.
//   CHALLENGE_COMPLETED · REWIND_USED · UNDO_USED · OCULUS_STATE_ANALYZED ·
//   OCULUS_ACTION_ANALYZED · OCULUS_REJECTION_OBSERVED · SEAL_CREATED ·
//   (extension M16) SYMBIOTE_AWAKENED · SYMBIOTE_COMPOSED
// ---------------------------------------------------------------------------

export function evaluateFragmentUnlocks(evidence, inputCtx = defaultCtx()) {
  const ctx = inputCtx && Array.isArray(inputCtx.catalog) ? inputCtx : defaultCtx();
  const seq = Array.isArray(evidence?.sequence) ? evidence.sequence : [];
  const unlocked = [];
  for (const f of ctx.catalog) {
    const rule = ctx.rules?.[f.id];
    if (typeof rule === "function" && rule(seq) && !unlocked.includes(f.id)) unlocked.push(f.id);
  }
  return sortByCatalog(unlocked, ctx);
}

// Apply : UNION monotone + idempotente. Retourne le NOUVEL état et les
// fragments réellement ajoutés (vide si NO_OP). Aucune mutation de l'entrée.
export function applyUnlocks(state, evidence, inputCtx = defaultCtx()) {
  const ctx = inputCtx && Array.isArray(inputCtx.catalog) ? inputCtx : defaultCtx();
  const current = new Set(sanitize(state, ctx).unlockedFragments);
  const candidates = evaluateFragmentUnlocks(evidence, ctx);
  const newly = [];
  for (const id of candidates) if (!current.has(id)) newly.push(id);
  const merged = sortByCatalog([...current, ...newly], ctx);
  return {
    state: { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, unlockedFragments: merged },
    newlyUnlocked: newly,
    noop: newly.length === 0,
  };
}

function sanitize(state, ctx) {
  return decodeKnowledgeState(state, ctx).state;
}

// ---------------------------------------------------------------------------
// Persistance — sérialisation déterministe (ids triés) + fail-safe.
// ---------------------------------------------------------------------------

export function encodeKnowledgeState(state, inputCtx = defaultCtx()) {
  const ctx = inputCtx && Array.isArray(inputCtx.catalog) ? inputCtx : defaultCtx();
  const s = sanitize(state, ctx);
  return JSON.stringify({ schemaVersion: s.schemaVersion, unlockedFragments: sortByCatalog(s.unlockedFragments, ctx) });
}

// decodeKnowledgeState : jamais de throw. Raw peut être une chaîne JSON ou un
// objet. Toute corruption → état vide valide + raison (le jeu continue).
export function decodeKnowledgeState(raw, inputCtx = defaultCtx()) {
  const ctx = inputCtx && Array.isArray(inputCtx.catalog) ? inputCtx : defaultCtx();
  const known = new Set(ctx.catalog.map((f) => f.id));
  let obj = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return { state: emptyKnowledgeState(), reason: "ok" };
    try {
      obj = JSON.parse(raw);
    } catch {
      return { state: emptyKnowledgeState(), reason: "corrupted-json" };
    }
  }
  if (!obj || typeof obj !== "object") return { state: emptyKnowledgeState(), reason: "structure" };
  if (obj.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION) {
    return { state: emptyKnowledgeState(), reason: "unknown-schema-version" };
  }
  if (!Array.isArray(obj.unlockedFragments)) return { state: emptyKnowledgeState(), reason: "missing-field" };
  const kept = [];
  for (const id of obj.unlockedFragments) {
    // fragment inconnu du CONTEXTE → ignoré (jamais de blocage, jamais d'invention)
    if (typeof id === "string" && known.has(id) && !kept.includes(id)) kept.push(id);
  }
  return { state: { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, unlockedFragments: sortByCatalog(kept, ctx) }, reason: "ok" };
}

// ---------------------------------------------------------------------------
// Stockage — backend injecté (persistance Web Storage injectée par l'UI, mémoire
// en test). Le backend peut échouer : l'Atelier continue (fallback mémoire).
// Contexte enrichissable (extraFragments/extraRules) — seam M16, non cassante.
// ---------------------------------------------------------------------------

export function createKnowledgeStore(backend, opts = {}) {
  const extra = (opts && Array.isArray(opts.extraFragments) ? opts.extraFragments : []).filter(
    (f) => f && typeof f.id === "string" && !BASE_CATALOG.some((b) => b.id === f.id)
  );
  const extraRules = (opts && opts.extraRules && typeof opts.extraRules === "object" ? opts.extraRules : {});
  const ctx = {
    catalog: [...BASE_CATALOG, ...extra],
    rules: { ...BASE_RULES, ...extraRules },
  };

  const memory = new Map();
  let backendOk = true;
  try {
    if (!backend || typeof backend.get !== "function" || typeof backend.set !== "function") throw new Error("no backend");
  } catch {
    backendOk = false;
  }

  const read = async () => {
    if (!backendOk) return memory.get(STORAGE_KEY) ?? null;
    try {
      return backend.get(STORAGE_KEY) ?? null;
    } catch {
      return memory.get(STORAGE_KEY) ?? null; // storage indisponible → mémoire
    }
  };
  const write = async (raw) => {
    if (backendOk) {
      try {
        backend.set(STORAGE_KEY, raw);
        return;
      } catch {
        backendOk = false; // bascule en mémoire, jamais d'échec remonté
      }
    }
    memory.set(STORAGE_KEY, raw);
  };

  const loadState = async () => {
    const raw = await read();
    const { state } = decodeKnowledgeState(raw, ctx);
    return state;
  };

  return {
    get mode() {
      return backendOk ? "persistent" : "memory";
    },
    get key() {
      return STORAGE_KEY;
    },
    get catalog() {
      return ctx.catalog.map((f) => ({ ...f }));
    },
    getFragment(id) {
      const f = ctx.catalog.find((x) => x.id === id);
      return f ? { ...f } : null;
    },
    listFragments() {
      return ctx.catalog.map((f) => ({ ...f }));
    },
    async load() {
      return loadState();
    },
    async record(obs) {
      const state = await loadState();
      const { state: next, newlyUnlocked, noop } = applyUnlocks(state, { sequence: [obs] }, ctx);
      if (!noop) await write(encodeKnowledgeState(next, ctx));
      return { state: next, newlyUnlocked, noop };
    },
    async recordAll(evidence) {
      const state = await loadState();
      const { state: next, newlyUnlocked, noop } = applyUnlocks(state, evidence, ctx);
      if (!noop) await write(encodeKnowledgeState(next, ctx));
      return { state: next, newlyUnlocked, noop };
    },
  };
}