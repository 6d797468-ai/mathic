/**
 * MATHIC V5 — LEGACY SOLVER · NON FIABLE · HORS CHAÎNE DE PREUVE
 * ============================================================================
 * STATUT M28 : `LEGACY / UNTRUSTED`
 *
 * Ce module est CONSERVE pour analyse et pour deux tests historiques. Il
 * n'est PAS l'oracle du gate V5-SOLVABILITY et ne doit jamais l'être.
 *
 * ---------------------------------------------------------------------------
 * CONTRAT — À LIRE AVANT TOUT USAGE
 * ---------------------------------------------------------------------------
 *   A negative result from legacy certify() MUST NOT be interpreted
 *   as a proof of unsolvability.
 *
 *   Un resultat negatif de certify() NE DOIT PAS etre interprete
 *   comme une preuve d'inesolvabilite.
 *
 * Deux raisons, chacune verifiee par test de non-regression :
 *
 * 1. `certify()` ne rend AUCUN chemin. Il produit un resume
 *    (`{solvable, minMoves, solutions, budgeted}`) sans sequence
 *    rejouable. C'est un resume, pas une preuve : rien ne peut etre
 *    rejoue pour verifier l'affirmation.
 *
 * 2. `budgeted` est un drapeau structurellement MORT. Il n'est pose que
 *    sur `nodes > budget`, condition INATTEIGNABLE dans la boucle, dont
 *    la garde est `nodes < budget` (donc `nodes <= budget` dans le
 *    corps). Il ne peut donc etre vrai que via le retour anticipe
 *    MAXPICK. Consequence : le drapeau ne porte AUCUNE information sur
 *    la troncature.
 *
 *    Defaut M28-SOLVER-001 (fige par tests/v5/legacy-solver.test.mjs) :
 *    sur un puzzle reellement resolvable, `certify()` peut repondre
 *      { solvable: false, budgeted: false }
 *    c'est-a-dire un certificat d'inexistence FAUX, accompagne d'une
 *    ALLEGATION D'EXHAUSTIVITE FAUSSE. Les deux moities sont
 *    defectueuses, et c'est la seconde qui est la plus grave : elle
 *    presente un abandon comme une preuve.
 *
 *    Deux voies de troncature produisent ce resultat, independamment :
 *      - troncature de BUDGET   : sortie a `nodes >= budget`
 *      - troncature de PROFONDEUR: `break` a `d > maxDepth`
 *
 * 3. `maxDepth` casse la BOUCLE ENTIERE (`break`), abandonnant la file
 *    d'attente. Une profondeur atteinte n'epuise donc rien.
 *
 * ---------------------------------------------------------------------------
 * PORTEE DU DEFAULT
 * ---------------------------------------------------------------------------
 * Le default est un defaut de COMPLETUDE, assorti d'une fausse
 * allégation d'exhaustivite — PAS un defaut de soundness au sens
 * "affirme solvable a tort" :
 *
 *   soundness     : si certify() dit solvable, est-ce really solvable ?
 *                   OUI, via getMoves/apply/isSolved du moteur souverain.
 *   completeness  : si c'est really solvable, certify() le voit-il ?
 *                   NON. Il peut rater une solution existante.
 *
 * La seconde moitie du contrat est la redhibitoire pour un certificat
 * NEGATIF : un `solvable:false` accompagne de `budgeted:false` affirme
 * "l'espace d'etats pertinent a ete entierement explore", ce qui est
 * faux des que la recherche s'est arretee sur une borne.
 *
 * ---------------------------------------------------------------------------
 * CE QUI EST CORRECT ICI, ET QUI RESTE VALABLE
 * ---------------------------------------------------------------------------
 * La generation de transitions est legitime : `getMoves` et `apply`
 * viennent du moteur souverain, aucune regle n'est dupliquee. Le
 * defaut est dans la gestion de l'arret et dans l'absence de chemin,
 * pas dans la semantique.
 *
 * ---------------------------------------------------------------------------
 * MIGRATION M28
 * ---------------------------------------------------------------------------
 * Le composant de preuve de M28 est `src/v5/rules/solvability-witness.mjs`.
 * Il ne DOIT PAS importer ce module. Il consomme les transitions de
 * `engine.mjs` et produit un chemin rejouable, un verdict
 * PROVEN_SOLVABLE / PROVEN_UNSOLVABLE / UNPROVEN / UNSUPPORTED, et une
 * dimension independante `searchComplete`.
 *
 * Ce fichier n'est pas supprime : il est la piece d'analyse qui
 * documente POURQUOI l'ancien mecanisme de certification ne peut pas
 * porter le gate. Il ne sera pas repare a l'aveugle.
 */

import { createSession, isSolved, getMoves, apply, canonical } from "./engine.mjs";

const MAXPICK = 512;

export function certify(spec, { maxDepth = 8, budget = 20000 } = {}) {
  if (isSolved(createSession(spec))) return { solvable: true, minMoves: 0, solutions: 1, budgeted: false };
  const start = createSession(spec);
  const queue = [{ s: start, d: 0 }];
  const seen = new Set([canonical(start)]);
  let minMoves = Infinity;
  let solutions = 0;
  let nodes = 0;
  let budgeted = false;
  while (queue.length && nodes < budget) {
    const { s, d } = queue.shift();
    if (d > maxDepth) break;
    nodes++;
    for (const mv of getMoves(s)) {
      const n = apply(s, mv);
      if (!n) continue;
      const key = canonical(n);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isSolved(n)) {
        if (nodes > budget) budgeted = true;
        if (d + 1 < minMoves) minMoves = d + 1;
        solutions++;
        if (solutions >= MAXPICK) return { solvable: true, minMoves, solutions, budgeted: true };
        continue;
      }
      queue.push({ s: n, d: d + 1 });
    }
    if (nodes > budget) budgeted = true;
  }
  return {
    solvable: Number.isFinite(minMoves),
    minMoves: Number.isFinite(minMoves) ? minMoves : Infinity,
    solutions,
    budgeted,
  };
}