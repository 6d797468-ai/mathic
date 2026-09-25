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
// ============================================================================

export const KNOWLEDGE_SCHEMA_VERSION = 1;
const STORAGE_KEY = "mathic.knowledge.v1";

// ---------------------------------------------------------------------------
// Catalogue — contenu STATIQUE, versionné, LORE=SÉPARÉ du FACT.
// ---------------------------------------------------------------------------

const CATALOG = [
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

const CATALOG_INDEX = new Map(CATALOG.map((f, i) => [f.id, i]));
const CATALOG_BY_ID = new Map(CATALOG.map((f) => [f.id, f]));

export function getFragment(id) {
  const f = CATALOG_BY_ID.get(id);
  return f ? { ...f } : null;
}

export function listFragments() {
  return CATALOG.map((f) => ({ ...f }));
}

// ---------------------------------------------------------------------------
// État de connaissance (KnowledgeState) — séparé de la Progression.
// ---------------------------------------------------------------------------

export const emptyKnowledgeState = () => ({
  schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
  unlockedFragments: [],
});

// Classement par ordre du catalogue (déterminisme d'affichage).
function sortByCatalog(ids) {
  return [...ids].sort((a, b) => (CATALOG_INDEX.get(a) ?? 1e9) - (CATALOG_INDEX.get(b) ?? 1e9));
}

// ---------------------------------------------------------------------------
// Règles de déverrouillage — ÉVALUATION PURE (aucune mutation implicite).
// evidence : { sequence: [obs, ...] } — obs réels, chronologiques.
//   CHALLENGE_COMPLETED · REWIND_USED · UNDO_USED · OCULUS_STATE_ANALYZED ·
//   OCULUS_ACTION_ANALYZED · OCULUS_REJECTION_OBSERVED · SEAL_CREATED
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

export function evaluateFragmentUnlocks(evidence) {
  const seq = Array.isArray(evidence?.sequence) ? evidence.sequence : [];
  const unlocked = [];
  const wants = (id, ok) => {
    if (ok && !unlocked.includes(id)) unlocked.push(id);
  };

  wants("LORE_ATELIER_001", has(seq, "CHALLENGE_COMPLETED"));
  wants("LORE_CHRONOS_001", has(seq, "REWIND_USED"));
  wants("LORE_ENGINE_FAILFAST_001", has(seq, "OCULUS_ACTION_ANALYZED"));
  wants("LORE_MAGEEK_001", before(seq, "OCULUS_REJECTION_OBSERVED", "CHALLENGE_COMPLETED"));
  wants("LORE_ALJABR_001", before(seq, "SEAL_CREATED", "CHALLENGE_COMPLETED"));

  return sortByCatalog(unlocked);
}

// Apply : UNION monotone + idempotente. Retourne le NOUVEL état et les
// fragments réellement ajoutés (vide si NO_OP). Aucune mutation de l'entrée.
export function applyUnlocks(state, evidence) {
  const current = new Set(sanitize(state).unlockedFragments);
  const candidates = evaluateFragmentUnlocks(evidence);
  const newly = [];
  for (const id of candidates) if (!current.has(id)) newly.push(id);
  const merged = sortByCatalog([...current, ...newly]);
  return {
    state: { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, unlockedFragments: merged },
    newlyUnlocked: newly,
    noop: newly.length === 0,
  };
}

function sanitize(state) {
  return decodeKnowledgeState(state).state;
}

// ---------------------------------------------------------------------------
// Persistance — sérialisation déterministe (ids triés) + fail-safe.
// ---------------------------------------------------------------------------

export function encodeKnowledgeState(state) {
  const s = sanitize(state);
  return JSON.stringify({ schemaVersion: s.schemaVersion, unlockedFragments: sortByCatalog(s.unlockedFragments) });
}

// decodeKnowledgeState : jamais de throw. Raw peut être une chaîne JSON ou un
// objet. Toute corruption → état vide valide + raison (le jeu continue).
export function decodeKnowledgeState(raw) {
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
  const known = [];
  for (const id of obj.unlockedFragments) {
    // fragment inconnu → ignoré (jamais de blocage, jamais d'invention)
    if (typeof id === "string" && CATALOG_BY_ID.has(id) && !known.includes(id)) known.push(id);
  }
  return { state: { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, unlockedFragments: sortByCatalog(known) }, reason: "ok" };
}

// ---------------------------------------------------------------------------
// Stockage — backend injecté (persistance Web Storage injectée par l'UI, mémoire
// en test). Le backend peut échouer : l'Atelier continue (fallback mémoire).
//   "persistent" | "memory" | "disabled" (stockage indisponible ET mémoire bloquée)
// ---------------------------------------------------------------------------

export function createKnowledgeStore(backend) {
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
    // raw peut être un objet si le backend « mémoire » a reçu un stock qui
    // a lui-même persisté des objets ; on gère l'un et l'autre.
    const { state } = decodeKnowledgeState(raw);
    return state;
  };

  return {
    get mode() {
      return backendOk ? "persistent" : "memory";
    },
    get key() {
      return STORAGE_KEY;
    },
    async load() {
      return loadState();
    },
    async record(obs) {
      const state = await loadState();
      const { state: next, newlyUnlocked, noop } = applyUnlocks(state, { sequence: [obs] });
      if (!noop) await write(encodeKnowledgeState(next));
      return { state: next, newlyUnlocked, noop };
    },
    async recordAll(evidence) {
      const state = await loadState();
      const { state: next, newlyUnlocked, noop } = applyUnlocks(state, evidence);
      if (!noop) await write(encodeKnowledgeState(next));
      return { state: next, newlyUnlocked, noop };
    },
  };
}