// ============================================================================
// M16 — SYMBIOTE DES GARDIENS · Guardian Composition Layer au-dessus de V5
// ----------------------------------------------------------------------------
// Un COMPOSITEUR DE CONFIGURATION, jamais un moteur.
//
//   GuardianComposition (SymbioteSpec)
//        ↓ composeGuardianSpec(baseSpec, guardians)
//   SessionSpec composée (targets recalculés, lois = ops des Gardiens)
//        ↓ engine.validateSpec
//   spec valide
//        ↓ engine.createSession
//   SessionState — lois V5 PIMMUABLES
//
// Le moteur continue d'appliquer exactement les mêmes lois (apply/getMoves/
// isSolved/lineOk). Le Symbiote ne dispose que de la SPECIFICATION :
// jamais de mutation de SessionState, jamais de triche, jamais de règle inventée.
// Module PUR : aucun DOM, stockage persistant direct, agent externe,
// aléatoire, horloge, réseau référencé. M16 observe M14, déclenche M15, réutilise
// M12/M13 — sans modifier leur code interne.
// ============================================================================

import { validateSpec, createSession } from "../v5/rules/engine.mjs";

// ---------------------------------------------------------------------------
// Ontologie — Gardien ⇄ opérateur loi (la traduction narrative d'un FAIT moteur).
// ---------------------------------------------------------------------------

export const GUARDIANS = Object.freeze({
  AL_JABR: { id: "AL_JABR", op: "+", title: "Al-Jabr", principle: "ADD", element: "l'ordre qui ajoute" },
  FRACTALIA: { id: "FRACTALIA", op: "-", title: "Fractalia", principle: "SUB", element: "la faille qui retranche" },
  NEXUS: { id: "NEXUS", op: "*", title: "Nexus", principle: "MUL", element: "le nœud qui multiplie" },
  SCINDIUM: { id: "SCINDIUM", op: "/", title: "Scindium", principle: "DIV", element: "le miroir qui divise" },
});

export const GUARDIAN_IDS = Object.freeze(Object.keys(GUARDIANS));
export const SYMBIOTE_MODE = "LAB";

const OP_BY_GUARDIAN = Object.freeze(Object.fromEntries(GUARDIAN_IDS.map((id) => [id, GUARDIANS[id].op])));

// ---------------------------------------------------------------------------
// Opérateurs réels du moteur V5 (copie lue dans engine.mjs) — le backtracer les
// utilise exactement comme engine.lineOk. SUB/DIV → null si non-entières.
// ---------------------------------------------------------------------------

const EVAL = {
  "+": (a, b) => a + b,
  "-": (a, b) => (a - b >= 0 ? a - b : null),
  "*": (a, b) => a * b,
  "/": (a, b) => (b !== 0 && a % b === 0 ? a / b : null),
};

function reduce(values, ops) {
  let acc = values[0];
  for (let k = 0; k < ops.length; k++) {
    acc = EVAL[ops[k]](acc, values[k + 1]);
    if (acc === null) return null;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Répartition DÉTERMINISTE des Gardiens sur les lignes (rows puis cols),
// en boucle modulo. Chaque Gardien sélectionné apparaît au moins une fois dès
// qu'il y a assez de lignes. (Même SymbioteSpec → même répartition.)
// ---------------------------------------------------------------------------

function guardianLineOps(baseSpec, guardians) {
  const n = guardians.length;
  const rows = baseSpec.grid.map((_, r) => Array(baseSpec.grid[0].length - 1).fill(OP_BY_GUARDIAN[guardians[r % n]]));
  const cols = baseSpec.grid[0].map((_, c) => Array(baseSpec.grid.length - 1).fill(OP_BY_GUARDIAN[guardians[(baseSpec.grid.length + c) % n]]));
  return { rows, cols };
}

// ---------------------------------------------------------------------------
// Backtracking CANONIQUE d'un remplissage : tous les livrôts (pleinement
// peuplées) doivent se réduire proprement avec leur ops assignée. Déterministe :
// cases ligne-major, valeurs croissantes, budget fixe. Pur (fonction des entrées).
// Retourne { grid, targets }, ou null si aucune solution n'a été trouvée DANS
// LE BUDGET : null signifie « infaisable sous budget (FILL_BUDGET) » — ce n'est
// PAS une preuve mathématique d'infaisabilité. Sémantique tri-état
// (SOLVED / UNSOLVABLE_PROVEN / SEARCH_BUDGET_EXCEEDED) prévue en M16.x.
// ---------------------------------------------------------------------------

const FILL_BUDGET = 6000;

function solveFill(baseSpec, rowsO, colsO, budget = FILL_BUDGET) {
  const R = baseSpec.grid.length;
  const C = baseSpec.grid[0].length;
  const reserve = { ...baseSpec.reserve };

  const grid = baseSpec.grid.map((row) => [...row]);
  const free = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const v = grid[r][c];
      if (v === -1) free.push([r, c]);
      else {
        if (reserve[v] === undefined) return null;
        reserve[v] -= 1;
      }
    }
  }
  for (const k of Object.keys(reserve)) if (reserve[k] < 0) return null;

  const values = Object.keys(reserve)
    .map(Number)
    .filter((v) => reserve[v] > 0)
    .sort((a, b) => a - b);

  const rowDone = (r) => grid[r].every((x) => x !== -1);
  const colDone = (c) => {
    for (let r = 0; r < R; r++) if (grid[r][c] === -1) return false;
    return true;
  };

  let nodes = 0;
  function rec(i) {
    if (++nodes > budget) return null;
    if (i === free.length) {
      const targets = [];
      for (let r = 0; r < R; r++) {
        const t = reduce(grid[r], rowsO[r]);
        if (t === null) return null;
        targets.push(t);
      }
      for (let c = 0; c < C; c++) {
        const col = [];
        for (let r = 0; r < R; r++) col.push(grid[r][c]);
        const t = reduce(col, colsO[c]);
        if (t === null) return null;
        targets.push(t);
      }
      return { grid: grid.map((row) => [...row]), targets };
    }
    const [r, c] = free[i];
    for (const v of values) {
      if (reserve[v] <= 0) continue;
      reserve[v]--;
      grid[r][c] = v;
      let prune = false;
      if (rowDone(r) && reduce(grid[r], rowsO[r]) === null) prune = true;
      if (!prune && colDone(c)) {
        const col = [];
        for (let rr = 0; rr < R; rr++) col.push(grid[rr][c]);
        if (reduce(col, colsO[c]) === null) prune = true;
      }
      if (!prune) {
        const sol = rec(i + 1);
        if (sol) {
          reserve[v]++;
          grid[r][c] = -1;
          return sol;
        }
      }
      reserve[v]++;
      grid[r][c] = -1;
    }
    return null;
  }
  return rec(0);
}

// ---------------------------------------------------------------------------
// Composition pure : baseSpec (shape + réserve, cellule fixes conservées)
//  + gardiens → UNE nouvelle SessionSpec VALIDE (ops + targets recalculés).
// ✔ null si la composition est infaisable (ou budget de recherche épuisé) pour ce shape (contrat → validateSymbiote).
// ✔ jette TypeError si le CONTRAT structurel est violé (jamais l'UI qui décide).
// ---------------------------------------------------------------------------

export function composeGuardianSpec(baseSpec, guardians) {
  if (!baseSpec || typeof baseSpec !== "object") throw new TypeError("symbiote : baseSpec requis");
  const g = sanitizeGuardians(guardians);
  const base = deepClone(baseSpec);
  let validated;
  try {
    validated = validateSpec(base);
  } catch (err) {
    throw new TypeError(`symbiote : baseSpec invalide — ${err.message}`);
  }
  const { rows: rowsO, cols: colsO } = guardianLineOps(validated, g);
  const sol = solveFill(validated, rowsO, colsO);
  if (!sol) return null;

  // La grille de la spec composée garde uniquement les cellules fixes du base
  // (jamais la solution) ; les targets DU découlent du remplissage canonique.
  const spec = {
    grid: validated.grid.map((row) => row.map((v) => (v === -1 ? -1 : v))),
    rows: rowsO.map((ops, r) => ({ ops: [...ops], target: sol.targets[r] })),
    cols: colsO.map((ops, c) => ({ ops: [...ops], target: sol.targets[validated.grid.length + c] })),
    reserve: { ...validated.reserve },
  };
  validateSpec(spec); // le compositeur produit TOUJOURS une spec contractuellement valide
  return spec;
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function sanitizeGuardians(guardians) {
  if (!Array.isArray(guardians) || guardians.length === 0) {
    throw new TypeError("symbiote : au moins un Gardien requis");
  }
  const seen = new Set();
  for (const id of guardians) {
    if (!OP_BY_GUARDIAN[id]) throw new TypeError(`symbiote : Gardien inconnu '${String(id)}'`);
    if (seen.has(id)) throw new TypeError(`symbiote : Gardien dupliqué '${id}'`);
    seen.add(id);
  }
  return [...guardians];
}

// ---------------------------------------------------------------------------
// SymbioteSpec
// { guardians: GuardianId[], baseSpec: SessionSpec, mode: "LAB" }
// Invariants : guardians.length >= 1, unique, baseSpec valide, mode === "LAB".
// ---------------------------------------------------------------------------

export function symbioteSpec(guardians, baseSpec, mode = SYMBIOTE_MODE) {
  return { guardians: [...guardians], baseSpec: deepClone(baseSpec), mode };
}

// CONTRAT D'ORDRE : l'ordre de `guardians` est SIGNIFICATIF. Il détermine la
// répartition des lois (rows : guardians[r % |G|], cols : guardians[(R+c) % |G|]).
// Deux listes de même ensemble mais d'ordre différent produisent des specs
// composées différentes — chacune déterministe. L'UI préserve l'ordre de
// sélection ; toute variante d'ordre est une composition distincte.

// validateSymbiote : LE contrat — rejette par contrat, pas par l'UI.
// { ok: true, spec } si une session est créable ; sinon { ok: false, reasons[] }.
// Aucune mutation. Ne crée AUCUNE session.
export function validateSymbiote(sp) {
  const reasons = [];
  if (!sp || typeof sp !== "object") return { ok: false, reasons: ["symbiote : spec requise"] };
  if (sp.mode !== SYMBIOTE_MODE) reasons.push(`symbiote : mode ≠ '${SYMBIOTE_MODE}'`);
  if (!Array.isArray(sp.guardians) || sp.guardians.length === 0) reasons.push("symbiote : au moins un Gardien requis");
  else {
    const seen = new Set();
    for (const id of sp.guardians) {
      if (!OP_BY_GUARDIAN[id]) reasons.push(`symbiote : Gardien inconnu '${String(id)}'`);
      if (seen.has(id)) reasons.push(`symbiote : Gardien dupliqué '${id}'`);
      seen.add(id);
    }
  }
  try {
    validateSpec(sp.baseSpec);
  } catch (err) {
    reasons.push(`symbiote : baseSpec invalide — ${err.message}`);
  }
  if (reasons.length) return { ok: false, reasons };

  let composed;
  try {
    composed = composeGuardianSpec(sp.baseSpec, sp.guardians);
  } catch (err) {
    return { ok: false, reasons: [err.message] };
  }
  if (composed === null) {
    reasons.push(
      "symbiote : composition infaisable sous budget (FILL_BUDGET=" + FILL_BUDGET + ") — aucune loi n'est trichée ; " +
        "ce rejet n'est pas une preuve mathématique d'infaisabilité"
    );
    return { ok: false, reasons };
  }
  return { ok: true, reasons: [], spec: composed };
}

// createSymbioteSession : la seule frontière vers l'Engine.
//   SymbioteSpec → composeGuardianSpec → validateSpec → engine.createSession.
// ✔ jette si le contrat est violé (aucune session illégitime).
export function createSymbioteSession(sp) {
  const v = validateSymbiote(sp);
  if (!v.ok) throw new TypeError("symbiote : " + v.reasons.join(" · "));
  return createSession(v.spec);
}

// ---------------------------------------------------------------------------
// Bases de laboratoire (shapes + réserves canoniques) fournies par le module.
// Résultat exploratoire verrouillé : 2×2 avec cette réserve loge les 15
// compositions (4 singles, 6 dualités, 4 triades, 1 convergence) — toutes
// solvables via le solveur V5. Les targets de base sont STRUCTURELS mais ceux
// de la composition sont recalculés par le backtracer (donc ignorés ici).
// ---------------------------------------------------------------------------

export const SYMBIOTE_BASES = Object.freeze([
  {
    id: "CHAMBRE_2X2",
    label: "Chambre 2×2 — réserve 1..4 ×2",
    spec: Object.freeze({
      grid: [
        [-1, -1],
        [-1, -1],
      ],
      rows: [
        { ops: ["+"], target: 5 },
        { ops: ["+"], target: 5 },
      ],
      cols: [
        { ops: ["+"], target: 5 },
        { ops: ["+"], target: 5 },
      ],
      reserve: { 1: 2, 2: 2, 3: 2, 4: 2 },
    }),
  },
]);

export function baseSpecById(id) {
  const b = SYMBIOTE_BASES.find((x) => x.id === id) ?? SYMBIOTE_BASES[0];
  return JSON.parse(JSON.stringify(b.spec));
}

// ---------------------------------------------------------------------------
// ÉTATS NARRATIFS DU SYMBIOTE — couche narrative, le moteur ne les connaît pas.
//   DORMANT → AWAKENED → BOUND → RESONANT → MASTERED
// evaluateSymbiosis(evidence) est PURE sur la séquence réelle de la session :
//   AWAKENED  : le joueur a découvert la mécanique (SYMBIOTE_AWAKENED)
//   BOUND     : une composition d'au moins deux Gardiens a été engagée
//   RESONANT  : une telle composition a précédé une résolution (défi hybride)
//   MASTERED  : trois compositions distinctes (≥2 Gardiens) ont été engagées
// Aucun hasard, aucune horloge ; déterministe (F(E)=F(E)).
// ---------------------------------------------------------------------------

export const SYMBIOTE_STATES = Object.freeze(["DORMANT", "AWAKENED", "BOUND", "RESONANT", "MASTERED"]);

function composedSets(seq) {
  const sets = new Map();
  for (const o of seq) {
    if (o.t !== "SYMBIOTE_COMPOSED" || !Array.isArray(o.guardians)) continue;
    const key = [...o.guardians].sort().join("+");
    sets.set(key, (sets.get(key) ?? 0) + 1);
  }
  return sets;
}

export function evaluateSymbiosis(evidence) {
  const seq = Array.isArray(evidence?.sequence) ? evidence.sequence : [];
  const awakened = seq.some((o) => o.t === "SYMBIOTE_AWAKENED");
  const sets = composedSets(seq);
  const bounded = [...sets.keys()].filter((k) => k.split("+").length >= 2);

  let resonant = false;
  for (let i = 0; i < seq.length; i++) {
    const o = seq[i];
    if (o.t === "SYMBIOTE_COMPOSED" && Array.isArray(o.guardians) && o.guardians.length >= 2) {
      for (let j = i + 1; j < seq.length; j++) {
        if (seq[j].t === "CHALLENGE_COMPLETED") { resonant = true; break; }
      }
    }
    if (resonant) break;
  }

  if (bounded.length >= 3) return { state: "MASTERED", sets: bounded.length };
  if (resonant) return { state: "RESONANT", sets: bounded.length };
  if (bounded.length >= 1) return { state: "BOUND", sets: bounded.length };
  if (awakened) return { state: "AWAKENED", sets: 0 };
  return { state: "DORMANT", sets: 0 };
}

// ---------------------------------------------------------------------------
// Fragments Gardiens (M16) — consomme la seam M15 : nourrit mathic.knowledge.v1
// (la MÉMOIRE du Symbiote), jamais la progression. Contenu statique, FACT/LORE
// séparés. Les règles sont des prédicats sur la séquence d'observations réelles.
// ---------------------------------------------------------------------------

export function guardianFragments() {
  return [
    {
      id: "LORE_AL_JABR_001",
      title: "Le Gardien Al-Jabr",
      category: "WORLD",
      version: 1,
      fact: "Une session composée a réellement engagé la loi d'Al-Jabr (opérateur '+', loi de ligne ADD).",
      body: "Al-Jabr assemble. Sa loi est un ordre : ce qui est ajouté à gauche doit être rendu à droite. L'Atelier ne l'écoute pas d'un cœur léger — il le vérifie.",
    },
    {
      id: "LORE_FRACTALIA_001",
      title: "La Gardienne Fractalia",
      category: "WORLD",
      version: 1,
      fact: "Une session composée a réellement engagé la loi de Fractalia (opérateur '-', loi de ligne SUB).",
      body: "Fractalia creuse. Sa loi refuse ce qui n'existe plus : une soustraction qui plongerait sous zéro est une promesse vide, et le moteur la rejette sans appel.",
    },
    {
      id: "LORE_SYMBIOSIS_001",
      title: "Symbiose",
      category: "ATELIER",
      version: 1,
      fact: "Deux Gardiens au moins ont réellement été composés dans une même session (guardians.length ≥ 2).",
      body: "Quand deux lois partagent la même pierre, aucune ne cède : elles s'accordent en rendant chaque ligne vraie. La symbiose est une loi qui ne change pas la loi.",
    },
    {
      id: "LORE_AL_JABR_FRACTALIA_001",
      title: "Al-Jabr & Fractalia",
      category: "MAGEEK",
      version: 1,
      fact: "La paire canonique {AL_JABR, FRACTALIA} a réellement été engagée dans une composition.",
      body: "Mageek note : « L'ajout et la faille sont les deux mains d'un même grimpeur. L'une tient, l'autre creuse la prise. »",
    },
    {
      id: "LORE_NEXUS_SCINDIUM_001",
      title: "Nexus & Scindium",
      category: "MAGEEK",
      version: 1,
      fact: "La paire canonique {NEXUS, SCINDIUM} a réellement été engagée dans une composition.",
      body: "Mageek note : « Multiplier, c'est nouer ; diviser, c'est couper net. Nexus et Scindium se surveillent — aucune division n'a lieu si elle n'est pas exacte. »",
    },
  ];
}

export function guardianRules() {
  // Un Gardien a réellement été engagé dans une composition exécutée.
  const composedIncluding = (id) => (seq) => {
    for (const o of seq) {
      if (o.t === "SYMBIOTE_COMPOSED" && Array.isArray(o.guardians) && o.guardians.length >= 1 && o.guardians.includes(id)) return true;
    }
    return false;
  };
  // Un sous-ensemble (au sens large) de Gardiens a été engagé.
  const composedCovering = (...ids) => (seq) => {
    for (const o of seq) {
      if (o.t !== "SYMBIOTE_COMPOSED" || !Array.isArray(o.guardians)) continue;
      const set = new Set(o.guardians);
      if (o.guardians.length >= 2 && ids.every((id) => set.has(id))) return true;
    }
    return false;
  };
  return {
    LORE_AL_JABR_001: composedIncluding("AL_JABR"),
    LORE_FRACTALIA_001: composedIncluding("FRACTALIA"),
    LORE_SYMBIOSIS_001: (seq) => {
      for (const o of seq) {
        if (o.t === "SYMBIOTE_COMPOSED" && Array.isArray(o.guardians) && o.guardians.length >= 2) return true;
      }
      return false;
    },
    LORE_AL_JABR_FRACTALIA_001: composedCovering("AL_JABR", "FRACTALIA"),
    LORE_NEXUS_SCINDIUM_001: composedCovering("NEXUS", "SCINDIUM"),
  };
}