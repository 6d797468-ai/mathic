// ============================================================================
// M17 — GRIMOIRE · Seams concrètes (moteurs purs injectés, jamais connus du cœur)
// ----------------------------------------------------------------------------
// Assemblage officiel : b1 (campagne, mathic.save.v1) + v5 (lab/Atelier).
// Chaque seam adapte le contrat PUBLIC du moteur vers la forme du cœur :
//   { mount, apply, isTerminal, outcome, legal, expose,
//     finalize?, finalizeProgression?, nextLevel?, catalog }
//
// Frontière I-5 (contrat M17 §4) : mathic.save.v1 n'est écrit que par
// src/b1/save.mjs ; mathic.knowledge.v1 n'est écrit que par
// src/atelier/knowledge.mjs. Ce module ne fait que DÉLÉGUER à ces modules —
// aucune écriture directe, aucune règle inventée, aucun moteur modifié (I-1).
// ============================================================================

import {
  createSession,
  apply as b1Apply,
  enumerateActions,
  isWon,
  isLost,
  isBlocked,
  finalScore as b1FinalScore,
} from "../b1/engine.mjs";
import { LADDER, nextLevel as b1NextLevel } from "../b1/levels.mjs";
import {
  loadSave,
  saveNow,
  markCompleted,
  isUnlocked,
  hasWon,
  normalized,
  pickStorage,
  SAVE_KEY,
} from "../b1/save.mjs";

import {
  createSession as v5CreateSession,
  apply as v5Apply,
  getMoves,
  isSolved,
  getState,
  canonical,
} from "../v5/rules/engine.mjs";

// ---------------------------------------------------------------------------
// Façade progression — l'unique passerelle vers mathic.save.v1 (via save.mjs)
// ---------------------------------------------------------------------------

export function createProgressionFacade({ storage = null } = {}) {
  const store = storage ?? pickStorage();
  return {
    key: SAVE_KEY,
    read() {
      return normalized(loadSave(store), store);
    },
    isUnlocked(id) {
      return isUnlocked(this.read(), id);
    },
    hasWon(id) {
      return hasWon(this.read(), id);
    },
    // Délégation pure : markCompleted (règle de progression de save.mjs) + saveNow.
    // Retourne l'état suivant ; le diff de déblocage est calculé par l'appelant.
    recordCompletion(levelId, { score, movesLeft } = {}) {
      const before = this.read();
      const next = markCompleted(before, levelId, { score, movesLeft });
      saveNow(next, store);
      return next;
    },
  };
}

// ---------------------------------------------------------------------------
// Seam b1 — campagne (verrouillage par progression, échelle N1..N41)
// ---------------------------------------------------------------------------

export function createB1Seam({ progression } = {}) {
  return {
    kind: "b1",
    catalog() {
      return LADDER.map((l) => ({ id: l.id, title: l.name, playable: true, level: l }));
    },
    mount(entry) {
      return { session: createSession(entry.level) };
    },
    apply(state, move) {
      return b1Apply(state, move);
    },
    legal(state) {
      return enumerateActions(state);
    },
    isTerminal(state) {
      return isWon(state) || isLost(state) || isBlocked(state);
    },
    outcome(state) {
      return isWon(state) ? "WON" : "LOST";
    },
    expose(state) {
      return {
        levelId: state.level.id,
        target: state.level.target,
        maxMoves: state.level.maxMoves,
        movesLeft: state.movesLeft,
        score: state.score,
        won: state.won,
        cells: state.board.cells.map((c) => (c === null ? null : { kind: c.kind, v: c.v, result: !!c.result })),
      };
    },
    finalize(state) {
      return b1FinalScore(state);
    },
    // Récompense campagne → mathic.save.v1 (délégation, diff de déblocage calculé).
    finalizeProgression(state, levelId, terminal) {
      if (terminal?.outcome !== "WON") return { progression: null, knowledge: [] };
      const before = progression.read().unlocked.slice();
      const next = progression.recordCompletion(levelId, {
        score: terminal.finalScore ?? b1FinalScore(state),
        movesLeft: state.movesLeft,
      });
      const added = next.unlocked.filter((id) => !before.includes(id));
      return { progression: { unlocked: added }, knowledge: [] };
    },
    nextLevel(id) {
      return b1NextLevel(id);
    },
  };
}

// ---------------------------------------------------------------------------
// Seam v5 — lab (jamais verrouillé, jamais perdu : un atelier ne se « perd » pas)
// ---------------------------------------------------------------------------

const LAB_CATALOG = Object.freeze([
  {
    id: "LAB_SUM_2X2",
    title: "Creuset 2×2 · Somme",
    playable: true,
    spec: Object.freeze({
      grid: [
        [-1, -1],
        [-1, -1],
      ],
      rows: [
        { ops: ["+"], target: 5 },
        { ops: ["+"], target: 7 },
      ],
      cols: [
        { ops: ["+"], target: 4 },
        { ops: ["+"], target: 8 },
      ],
      reserve: { 2: 2, 3: 1, 5: 1 },
    }),
  },
  {
    id: "LAB_MIXED_2X2",
    title: "Creuset 2×2 · Mixte",
    playable: true,
    spec: Object.freeze({
      grid: [
        [-1, -1],
        [-1, -1],
      ],
      rows: [
        { ops: ["*"], target: 10 },
        { ops: ["-"], target: 4 },
      ],
      cols: [
        { ops: ["+"], target: 9 },
        { ops: ["+"], target: 8 },
      ],
      reserve: { 2: 1, 3: 1, 5: 1, 7: 1 },
    }),
  },
]);

export function createV5Seam() {
  return {
    kind: "v5",
    catalog() {
      return LAB_CATALOG.map((e) => ({ id: e.id, title: e.title, playable: e.playable, spec: e.spec }));
    },
    mount(entry) {
      return { session: v5CreateSession(entry.spec) };
    },
    apply(state, cmd) {
      return v5Apply(state, cmd);
    },
    legal(state) {
      return getMoves(state).map((m) => ({ id: "PLACE", v: m.v, r: m.r, c: m.c }));
    },
    isTerminal(state) {
      return isSolved(state);
    },
    outcome() {
      return "WON"; // le lab n'a pas de condition de défaite
    },
    expose(state) {
      return { ...getState(state), canonical: canonical(state) };
    },
    finalize(state) {
      return getState(state).moves;
    },
    // Récompense lab → savoir (mathic.knowledge.v1 via le store injecté au cœur).
    // La progression n'est JAMAIS touchée par ce chemin.
    finalizeProgression() {
      return { progression: null, knowledge: [{ t: "CHALLENGE_COMPLETED" }] };
    },
    nextLevel() {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Assemblage officiel — la seule place où moteurs, save et savoir se rencontrent
// ---------------------------------------------------------------------------

export function createGrimoireAssembly({ storage = null, knowledgeStore = null } = {}) {
  const progression = createProgressionFacade({ storage });
  const engines = {
    b1: createB1Seam({ progression }),
    v5: createV5Seam(),
  };
  // Import tardif évité : le store knowledge est injecté par l'appelant (UI),
  // ou créé ici via le module dédié — l'écriture reste dans knowledge.mjs.
  if (!knowledgeStore) {
    // eslint-disable-next-line no-undef
    throw new TypeError("grimoire : knowledgeStore requis (createKnowledgeStore de src/atelier/knowledge.mjs)");
  }
  return { engines, progression, knowledge: knowledgeStore };
}
