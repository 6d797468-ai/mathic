/**
 * history.js — Historique « Calvados » (Phase 4 — Mathic 4.0)
 *
 * Pile d'ÉTATS IMMUABLES : chaque coup pousse UNE entrée qui réunit
 *  - `before` / `after` : les deux états du plateau (copies défensives),
 *  - les FAITS EXACTS de la transition (moves / mergedCells / spawned /
 *    exploded — fournis par slideBoard et la boucle de jeu),
 *  - le DIFF vectoriel (diffBoards) : niveau descriptif et vérifiable.
 *
 * L'Undo « remonte » le dernier coup en jouant le diff EN MIROIR :
 * `reversePlan` traduit l'entrée en un plan graphique exact (dé-fusions,
 * glissements inversés, retraits de spawns). Aucune reconstruction ad hoc :
 * les identités de tuiles (éléments DOM) survivent, les animations CSS
 * glissent en sens inverse sans jamais être cassées.
 *
 * La pile ne perd JAMAIS de ligne d'historique : chaque coup joué (mode
 * classique comme puzzle) produit une entrée ; l'Undo ne fait que la
 * dépiler et restaurer l'état complet (`snap` : score, jauge, cible, chaîne).
 *
 * Logique pure, sans DOM.
 */

import { diffBoards } from './diff.js';

/** Capacité par défaut de la pile (coups mémorisables). */
export const CALVADOS_CAPACITY = 50;

const posKey = (r, c) => `${r},${c}`;

/**
 * Construit une entrée Calvados à partir des faits bruts d'un coup.
 * Copie défensivement `before` / `after` (immutabilité de la pile) et
 * calcule le diff vectoriel (spawned → créations exactes).
 * @param {{
 *   before: (number|null)[][], after: (number|null)[][],
 *   moves: object[], mergedCells: object[],
 *   spawned?: {row:number,col:number,value:number}[],
 *   exploded?: {row:number,col:number,value:number}[],
 *   gained: number, dir: string, op: string,
 *   snap: {score:number, movesLeft:number, target:number,
 *          targetCount:number, moveIndex:number,
 *          chainWindowLeft:number, chainCount:number}
 * }} facts
 * @returns {object} l'entrée complète (avec `diff`)
 */
export function makeEntry(facts) {
  const spawned = (facts.spawned || []).map((s) => ({ row: s.row, col: s.col, value: s.value }));
  const exploded = (facts.exploded || []).map((e) => ({ row: e.row, col: e.col, value: e.value }));

  const entry = {
    before: facts.before.map((r) => [...r]),
    after: facts.after.map((r) => [...r]),
    moves: facts.moves,
    mergedCells: facts.mergedCells,
    spawned,
    exploded,
    gained: facts.gained,
    dir: facts.dir,
    op: facts.op,
    snap: { ...facts.snap },
  };
  // Le diff vectoriel : niveau descriptif / vérifiable du coup empilé.
  entry.diff = diffBoards(entry.before, entry.after, { spawned });
  return entry;
}

/**
 * Traduit une entrée en plan graphique pour l'Undo (sens inverse) :
 *  - `splits`     : fusions à DÉ-FAIRE (le survivant à `to` redevient deux
 *                   tuiles opérandes aux positions d'origine, valeur comprise) ;
 *  - `slidesBack` : glissements à REMONTER (la tuile à `to` repart à `from`,
 *                   même élément DOM → transition CSS animée) ;
 *  - `spawns`     : tuiles créées à RETIRER.
 *
 * Basé sur les trajectoires EXACTES de slideBoard (regroupées par
 * destination : 2 arrivées = fusion, 1 arrivée = glissement) — jamais sur
 * l'inférence, donc sans aucune ambiguïté.
 * @param {ReturnType<typeof makeEntry>} entry
 * @returns {{splits: {to:{row,col}, operands:{row,col,value}[]}[],
 *            slidesBack: {from:{row,col}, to:{row,col}, value:number}[],
 *            spawns: {row,col,value}[]}}
 */
export function reversePlan(entry) {
  const groups = new Map();
  for (const m of entry.moves || []) {
    const k = posKey(m.toRow, m.toCol);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }

  const splits = [];
  const slidesBack = [];

  for (const [k, list] of groups) {
    const [toRow, toCol] = k.split(',').map(Number);
    if (list.length >= 2) {
      splits.push({
        to: { row: toRow, col: toCol },
        operands: list.map((m) => ({ row: m.fromRow, col: m.fromCol, value: m.value })),
      });
    } else {
      const m = list[0];
      slidesBack.push({
        from: { row: m.fromRow, col: m.fromCol },
        to: { row: m.toRow, col: m.toCol },
        value: m.value,
      });
    }
  }

  return {
    splits,
    slidesBack,
    spawns: entry.spawned.map((s) => ({ row: s.row, col: s.col, value: s.value })),
  };
}

/**
 * Contexte lisible pour le coach (Momo) lors d'un Undo : faits chiffrés du
 * coup défilé (fusions dé-faites, glissements remontés, spawn retiré,
 * coups restants). Le LLM les transforme en réplique contextuelle.
 * @param {ReturnType<typeof makeEntry>} entry
 * @returns {{target: number, movesLeft: number, defusions: number,
 *            glissements: number, spawns: number, exploded: number}}
 */
export function calvadosContext(entry) {
  const plan = reversePlan(entry);
  return {
    target: entry.snap.target,
    movesLeft: entry.snap.movesLeft,
    defusions: plan.splits.length,
    glissements: plan.slidesBack.length,
    spawns: plan.spawns.length,
    exploded: entry.exploded.length,
  };
}

/**
 * Pile Calvados : dernière entrée en premier (LIFO).
 * Capacité maximale : les plus anciennes sortent pour borner la mémoire.
 * @param {{capacity?: number}} [opts]
 */
export function createCalvados({ capacity = CALVADOS_CAPACITY } = {}) {
  const entries = [];

  return {
    /**
     * Empile une entrée complète (au moins before + after).
     * @param {object} entry
     */
    push(entry) {
      if (!entry || !entry.before || !entry.after) {
        throw new Error('Calvados : entrée invalide (before/after requis)');
      }
      entries.push(entry);
      if (entries.length > capacity) entries.shift();
    },

    /** Dépile et retourne la dernière entrée (ou null si pile vide). */
    pop() {
      return entries.pop() || null;
    },

    /** Dernière entrée sans la retirer (ou null si vide). */
    peek() {
      return entries[entries.length - 1] || null;
    },

    /** Nombre d'entrées empilées. */
    size() {
      return entries.length;
    },

    /** Vide la pile (nouvelle partie). */
    clear() {
      entries.length = 0;
    },
  };
}