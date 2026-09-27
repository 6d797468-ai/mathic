/**
 * MATHIC V5 — SEMANTIC WITNESS
 * ============================================================================
 * Atteste qu'une transformation arithmetique est REELLEMENT produite par
 * l'evaluateur souverain, et pas seulement autorisee par la legite des
 * primitives. Ferme le gap identifie par M26.
 *
 * ---------------------------------------------------------------------------
 * PRINCIPE FONDAMENTAL
 * ---------------------------------------------------------------------------
 * Ce module NE CALCULE AUCUNE EXPRESSION ARITHMETIQUE.
 *
 * Il se limite a lire une DECLARATION, puis a deleguer l'EVALUATION :
 *   1. LIRE  la declaration d'une ligne (spec.rows / spec.cols) pour verifier
 *       que l'operateur reclame et la cible reclamee y figurent ;
 *   2. DEMANDER a rule-engine-v5 (isSolved) si l'etat observe est confirme
 *       resolu par l'evaluateur souverain.
 *
 * Il n'y a ni table d'operateurs, ni copie de lineOk/evalOp, ni recherche, ni
 * solveur. Toute la semantique reste dans engine.mjs.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI LA RELATION EST "SATISFACTION DE LIGNE" ET NON "a op b = c"
 * ---------------------------------------------------------------------------
 * Une identite binaire n'a pas de sens ici. Sur une ligne
 * ops = ["*", "*"], target = 12, valeurs [3, 4, 1], le moteur calcule
 * 3 * 4 * 1 = 12 : c'est la LIGNE qui accomplit la transformation, pas un
 * couple d'operandes isole.
 *
 * Exiger `a op b === c` obligerait a recalculer l'expression — donc a
 * dupliquer la semantique V5 — et, pire, autoriserait un faux PROVEN :
 * une ligne additive resolue (3 + 4 + 5 = 12) satisferait alors une reclamation
 * "3 * 4 = 12", ce qui est faux. La relation est donc exprimee comme la
 * satisfaction d'une ligne declaree, ce qui est verifiable SANS calcul.
 *
 * ---------------------------------------------------------------------------
 * CE QUE "PROVEN" AFFIRME — ET RIEN DE PLUS
 * ---------------------------------------------------------------------------
 * Pour une relation { values, cells, requiredOp, target } :
 *   P1. les valeurs declarees sont PHYSIQUEMENT presentes aux cellules
 *       declarees, a l'etat observe ;
 *   P2. les deux cellules partagent une ligne (ligne ou colonne) ;
 *   P3. `requiredOp` figure dans la declaration `ops` de CETTE ligne ;
 *   P4. `target` est la cible declaree de CETTE ligne ;
 *   P5. la ligne est complete, donc V5 l'evalue reellement (lineOk sort du
 *       cas trivial des cellules a -1) ;
 *   P6. rule-engine-v5.confirme l'etat observe comme resolu.
 *
 * P6 est une affirmation de l'evaluateur souverain sur l'etat ENTIER : le
 * temoin ne pretend pas evaluer une sous-partie, il constate que V5
 * lui-meme ne trouve plus rien a corriger.
 *
 * Le temoin n'affirme JAMAIS une identite arithmetique. Il ne dit jamais
 * "3 * 4 = 12". Il dit "V5 confirme que la ligne declaree, qui porte 3 et 4,
 * remplit sa cible 12 en utilisant l'operateur *".
 *
 * ---------------------------------------------------------------------------
 * W-08 — ECHEC FERME
 * ---------------------------------------------------------------------------
 * Toute incertitude produit un verdict negatif. L'absence d'information ne
 * peut pas degenerer en feu vert.
 */

import { isSolved } from "./engine.mjs";

/** Relation couverte par ce temoin. */
export const RELATION_KIND = "LINE_SATISFACTION";

/** Motifs de non-couverture, pour que UNSUPPORTED reste distinguable d'UNPROVEN. */
const UNSUPPORTED_REASONS = Object.freeze({
  NO_STATE: "session V5 absente ou sans plateau observable",
  NO_RELATION: "aucune relation semantique fournie",
  UNKNOWN_KIND: `relation de kind inconnu : seul ${RELATION_KIND} est couvert`,
  BAD_CELLS: "relation.cells doit contenir exactement 2 positions {r, c}",
  BAD_VALUES: "relation.values doit contenir exactement 2 entiers",
  NO_OP_OR_TARGET: "relation.requiredOp et relation.target sont requis",
  CELL_OUT_OF_RANGE: "cellule declaree hors du plateau",
  CELL_EMPTY: "cellule declaree vide : aucune valeur observee sur le plateau",
  NO_LINE_DEF: "la ligne portant les cellules n'est pas declaree dans la spec",
  LINE_INCOMPLETE:
    "ligne incomplete : rule-engine-v5 accepte une ligne contenant -1 sans jamais l'evaluer, " +
    "donc aucune conclusion semantique n'est possible",
});

function verdict(status, reason, extra = {}) {
  // `proven` est un booleen de LECTURE : il ne fait que refléter `status`.
  // Les deux sont figés, donc un verdict PROVEN ne peut pas être requalifié
  // a posteriori par un consommateur.
  return Object.freeze({
    status,
    proven: status === "PROVEN",
    kind: RELATION_KIND,
    reason,
    checkedCells: [],
    observed: null,
    ...extra,
  });
}

const NOMATCH = (observed, claimed) =>
  `valeurs observees sur le plateau (${JSON.stringify(observed)}) different de la relation reclamee (${JSON.stringify(claimed)})`;

/** Lecture brute d'une ligne. Aucun calcul, aucune verification de cible. */
function readLine(state, line) {
  const n = line.kind === "row" ? state.grid[0].length : state.grid.length;
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push(line.kind === "row" ? state.grid[line.index][k] : state.grid[k][line.index]);
  }
  return out;
}

function locate(state, cell) {
  return state.grid[cell?.r]?.[cell?.c];
}

const lineWord = (line) => (line.kind === "row" ? "ligne" : "colonne");

/**
 * Atteste la satisfaction d'une ligne declaree par l'evaluateur souverain.
 *
 * @param {object} state    etat V5 observe (sortie de createSession/apply)
 * @param {object} relation { kind, values:[n,n], cells:[{r,c},{r,c}], requiredOp, target }
 * @returns {object} verdict fige { status, kind, reason, checkedCells, observed }
 */
export function witnessRelation(state, relation) {
  // -- G0 : entree exploitable -------------------------------------------------
  if (!state || !Array.isArray(state.grid) || !Array.isArray(state.spec?.rows)) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.NO_STATE);
  }
  if (!relation) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.NO_RELATION);
  }
  if (relation.kind !== RELATION_KIND) {
    return verdict("UNSUPPORTED", `${UNSUPPORTED_REASONS.UNKNOWN_KIND} (recu : ${relation.kind})`);
  }
  if (!Array.isArray(relation.cells) || relation.cells.length !== 2) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.BAD_CELLS);
  }
  if (!Array.isArray(relation.values) || relation.values.length !== 2
      || !relation.values.every(Number.isInteger)) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.BAD_VALUES);
  }
  if (typeof relation.requiredOp !== "string" || !Number.isInteger(relation.target)) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.NO_OP_OR_TARGET);
  }

  const { values, cells, requiredOp, target } = relation;
  const [p, q] = cells;
  const checkedCells = [{ r: p.r, c: p.c }, { r: q.r, c: q.c }];

  // -- G1 : les valeurs sont-elles reellement sur le plateau ? (P1) ------------
  const observed = [locate(state, p), locate(state, q)];
  if (observed.includes(undefined)) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.CELL_OUT_OF_RANGE, { checkedCells });
  }
  if (observed.includes(-1)) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.CELL_EMPTY, { checkedCells, observed });
  }
  if (observed[0] !== values[0] || observed[1] !== values[1]) {
    return verdict("UNPROVEN", NOMATCH(observed, values), { checkedCells, observed });
  }

  // -- G2 : les deux cellules portent-elles une operation commune ? (P2) ------
  let line;
  if (p.r === q.r) line = { kind: "row", index: p.r };
  else if (p.c === q.c) line = { kind: "col", index: p.c };
  else {
    return verdict("UNPROVEN", "aucune ligne commune : aucune operation ne peut relier ces deux cellules", {
      checkedCells, observed: { values: observed, sharedLine: null },
    });
  }

  // -- G3 : la declaration de CETTE ligne porte-t-elle la reclamation ? --------
  // Lecture de declaration, pas evaluation. C'est ce garde-fou qui interdit un
  // PROVEN lorsque la semantique reelle de la ligne differe de l'operateur
  // reclame (ex. reclamer "*" sur une ligne declaree en "+").
  const def = line.kind === "row" ? state.spec.rows[line.index] : state.spec.cols?.[line.index];
  if (!def || !Array.isArray(def.ops)) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.NO_LINE_DEF, { checkedCells });
  }
  if (!def.ops.includes(requiredOp)) {
    return verdict("UNPROVEN",
      `l'operateur reclame '${requiredOp}' ne figure pas dans la declaration ops de la ${lineWord(line)} ${line.index} ${JSON.stringify(def.ops)}`,
      { checkedCells, observed: { values: observed, sharedLine: line, declaredOps: [...def.ops] } });
  }
  if (def.target !== target) {
    return verdict("UNPROVEN",
      `la cible reclamee ${target} n'est pas la cible declaree de la ${lineWord(line)} ${line.index} (${def.target})`,
      { checkedCells, observed: { values: observed, sharedLine: line, declaredTarget: def.target } });
  }

  // -- G4 : V5 peut-il reellement evaluer cette ligne ? (P5) -----------------
  const lineValues = readLine(state, line);
  if (lineValues.some((v) => v === -1)) {
    return verdict("UNSUPPORTED", UNSUPPORTED_REASONS.LINE_INCOMPLETE, {
      checkedCells, observed: { values: observed, sharedLine: line, lineValues },
    });
  }

  // -- G5 : delegation a l'evaluateur souverain. (P6) -----------------------
  // Seul point ou la semantique est tranchee, et c'est V5 qui tranche.
  const confirmed = isSolved(state);

  return Object.freeze({
    status: confirmed ? "PROVEN" : "UNPROVEN",
    proven: confirmed,
    kind: RELATION_KIND,
    reason: confirmed
      ? `rule-engine-v5.confirme l'etat observe comme resolu : la ${lineWord(line)} ${line.index} declaree ${JSON.stringify(def.ops)} portant ${JSON.stringify(values)} remplit sa cible ${target} en utilisant '${requiredOp}'`
      : `rule-engine-v5 ne confirme pas l'etat observe comme resolu : la ${lineWord(line)} ${line.index} ne remplit pas sa cible ${target}, la transformation n'est pas etablie`,
    checkedCells,
    observed: {
      values: observed,
      sharedLine: line,
      declaredOps: [...def.ops],
      declaredTarget: def.target,
      lineValues,
      engineSolved: confirmed,
    },
  });
}
