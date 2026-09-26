/**
 * MATHIC V5 — SOLVABILITY WITNESS
 * ============================================================================
 * Etablit l'EXISTENCE d'un chemin de solution depuis un etat initial, en
 * pilotant les transitions du moteur V5 souverain.
 *
 * ---------------------------------------------------------------------------
 * PRINCIPE
 * ---------------------------------------------------------------------------
 * Ce composant ne connait AUCUNE regle de jeu. Il ne sait pas ce qu'est une
 * addition, une multiplication, une ligne ou une colonne. Il ne possede
 * aucune table d'operateurs, aucun evaluation, aucun jeu de regles.
 *
 * Il ne sait poser que trois questions au moteur, et il obeyit :
 *
 *     getMoves(S)   -> quels coups sont possibles depuis cet etat ?
 *     apply(S, m)   -> quel nouvel etat est reellement produit par ce coup ?
 *     isSolved(S)   -> cet etat atteint-il l'objectif ?
 *
 * Toute la semantique demeure dans engine.mjs. Si V5 change, ce composant
 * change de comportement sans etre modifie : c'est la propriete recherchee.
 *
 * ---------------------------------------------------------------------------
 * DEFINITION FORMELLE
 * ---------------------------------------------------------------------------
 *   Solvable(S0)  <==>  il existe pi = (m1, ..., mn) tel que
 *
 *     (1) pour tout i,  mi appartient a getMoves(S_{i-1})   [LEGALITE V5]
 *     (2) pour tout i,  S_i = apply(S_{i-1}, mi)             [TRANSITION V5]
 *     (3) isSolved(S_n)                                     [OBJECTIF V5]
 *
 * (1) est indispensable et non substituable : `apply()` est PERMISSIF — il
 * accepte un PLACE qui rend une ligne fausse, et `replay()` rejoue via
 * `apply()`, donc il accepte lui aussi une sequence dont les lignes sont
 * fausses. Seule l'appartenance a `getMoves` encode les regles reelles.
 * C'est verifie par test.
 *
 * ---------------------------------------------------------------------------
 * LES QUATRE VERDICTS
 * ---------------------------------------------------------------------------
 *   PROVEN_SOLVABLE    un chemin existe, chaque pas est legal (1), chaque
 *                      transition est reellement produite (2), l'etat final
 *                      atteint l'objectif (3), et le chemin est rejouable.
 *
 *   PROVEN_UNSOLVABLE  l'espace etat REELLEMENT atteint depuis S0 a ete
 *                      ENTIEREMENT explore et ne contient aucune solution.
 *                      N'est possible QUE si `searchComplete === true`, ce
 *                      qui exige que la profondeur d'exploration soit
 *                      SUFFISANTE (voir ci-dessous).
 *
 *   UNPROVEN           une recherche a eu lieu et n'a etabli NI existence NI
 *                      inexistence, typiquement parce qu'elle a ete tronquee
 *                      par `budget`. searchComplete === false.
 *
 *   UNSUPPORTED        la demande elle-meme n'est pas couverte : spec
 *                      invalide, bornes non entieres, etc. Aucune recherche
 *                      n'est lancee.
 *
 * LA PROFONDEUR SUFFISANTE — POURQUOI `maxDepth` NE TRONQUE PAS
 * ---------------------------------------------------------------
 * Une borne de profondeur posee a l'aveugle ne permet PAS de certifier
 * l'inexistence : elle risque de declarer insoluble un puzzle qui se
 * resout juste plus loin. Ce serait un faux certificat, de la meme
 * famille que M28-SOLVER-001.
 *
 * Il existe cependant une profondeur qui rend l'exploration EXHAUSTIVE,
 * et elle se deduit de faits V5 et non d'une convention :
 *
 *   - `apply()` place UNE valeur et remplit UNE cellule ;
 *   - `isSolved()` est faux tant qu'il reste une cellule a -1.
 *
 * Donc toute solution depuis S0 a une longueur EXACTEMENT egale au nombre
 * de cellules vides de S0 : ni plus courte (chaque coup n'en remplit
 * qu'une), ni plus longue (isSolved l'interdit).
 *
 * En consequence, `maxDepth >= cellulesVides` rend l'espace entierement
 * explorable, et SEULlement dans ce cas `PROVEN_UNSOLVABLE` est prononceable.
 * En dessous, la recherche est bornee : le verdict est `UNPROVEN`, avec
 * `searchComplete === false` et la raison qui nomme la borne fautive.
 *
 * INTERDIT, et rendu impossible par construction : un `PROVEN_UNSOLVABLE`
 * accompagne de `searchComplete === false`. Ce serait un certificat
 * d'inexistance presente alors que l'espace n'a pas ete epuise — exactement
 * le defaut M28-SOLVER-001 du legacy `certify()`. Une garde explicite leve
 * une exception si cette combinaison tente de se produire.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISME
 * ---------------------------------------------------------------------------
 * BFS en file FIFO sur `getMoves`, dont l'ordre est fixe par le moteur
 * (lignes, puis colonnes, puis reserve dans l'ordre d'insertion). Deux
 * executions sur la meme spec rendent le meme chemin, a la profondeur
 * minimale pres.
 *
 * Aucun `worker`, aucun `Math.random`, aucune horloge : un worker
 * introduirait un ordre de completion non reproductible et casserait la
 * rejouabilite de la preuve.
 *
 * ---------------------------------------------------------------------------
 * DEDUPLICATION
 * ---------------------------------------------------------------------------
 * La cle est `canonical(state)`, c'est-a-dire l'empreinte du plateau.
 *
 * Justification : depuis une racine fixee, le plateau determine le multiset
 * des valeurs posees, donc determine la reserve restante
 * (`reserve = reserve_initiale - compte(posees)`). Deux etats de meme
 * plateau sont donc le meme etat au sens de la recherche. Cette propriete
 * est un INVARIANT, pas une commodite : elle est verifiee par test sur une
 * vraie arborescence, parce qu'un `apply()` qui cesserait de decrementer la
 * reserve la casserait silencieusement.
 *
 * ---------------------------------------------------------------------------
 * PREUVE REJOUABLE
 * ---------------------------------------------------------------------------
 * Le witness porte le chemin. `verifyWitness()` le rejoue par DEUX voies
 * independantes :
 *   - `replay(spec, events)` du moteur, pour l'EXECUTABILITE ;
 *   - l'appartenance de chaque coup a `getMoves` a chaque etape, pour la
 *     LEGALITE.
 * Executabilite sans legalite ne suffit pas : les deux sont exigees.
 */

import { createSession, isSolved, getMoves, apply, canonical, replay } from "./engine.mjs";

export const SOLVABLE = "PROVEN_SOLVABLE";
export const UNSOLVABLE = "PROVEN_UNSOLVABLE";
export const UNPROVEN = "UNPROVEN";
export const UNSUPPORTED = "UNSUPPORTED";

const DEFAULTS = Object.freeze({ maxDepth: 8, budget: 20000 });

function unsupported(reason) {
  return Object.freeze({
    status: UNSUPPORTED,
    proven: false,
    searchComplete: false,
    established: "NOTHING",
    minMoves: null,
    nodesExpanded: 0,
    nodesSeen: 0,
    truncatedBy: null,
    path: Object.freeze([]),
    initial: null,
    final: null,
    goalReached: false,
    reason,
  });
}

/**
 * Garde de conception : un certificat d'inexistence exige l'exhaustivite.
 * Cette fonction est le SEUL point ou un verdict est construit ; si un
 * tiers tente de produire un PROVEN_UNSOLVABLE sur une recherche tronquee,
 * on prefere echouer bruyamment que d'emettre un faux certificat.
 */
function build(status, fields) {
  if (status === UNSOLVABLE && fields.searchComplete !== true) {
    throw new Error(
      "solvability-witness : refus d'emettre PROVEN_UNSOLVABLE sans searchComplete=true. " +
        "C'est le defaut M28-SOLVER-001 ; il ne doit pas etre reintroduit."
    );
  }
  return Object.freeze({
    bounds: fields.bounds ?? null,
    status,
    proven: status === SOLVABLE || status === UNSOLVABLE,
    searchComplete: fields.searchComplete,
    // `established` est lisible par un tiers qui ne lirait QUE ce champ.
    // Il doit donc n'annoncer que ce qui est reellement etabli : une
    // recherche tronquee n'etablit RIEN, ni dans un sens ni dans l'autre.
    established: status === SOLVABLE ? "EXISTS" : status === UNSOLVABLE ? "NOT-EXISTS" : "NOTHING",
    minMoves: fields.minMoves ?? null,
    nodesExpanded: fields.nodesExpanded ?? 0,
    nodesSeen: fields.nodesSeen ?? 0,
    truncatedBy: fields.truncatedBy ?? null,
    path: Object.freeze(fields.path ?? []),
    initial: fields.initial,
    final: fields.final,
    goalReached: fields.goalReached === true,
    reason: fields.reason,
  });
}

function snapshot(s) {
  return {
    fingerprint: canonical(s),
    grid: s.grid.map((row) => [...row]),
    reserve: { ...s.reserve },
  };
}

/**
 * Etablit l'existence (ou l'inexistence etablie) d'un chemin de solution.
 *
 * @param {object} spec                    spec V5
 * @param {object} [options] { maxDepth, budget } bornes entieres positives
 * @returns {object} witness fige
 */
export function proveSolvability(spec, options = {}) {
  // -- G0 : demande couverte ? -------------------------------------------------
  const maxDepth = options.maxDepth ?? DEFAULTS.maxDepth;
  const budget = options.budget ?? DEFAULTS.budget;
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    return unsupported(`maxDepth doit etre un entier >= 0 (recu : ${JSON.stringify(maxDepth)})`);
  }
  if (!Number.isInteger(budget) || budget < 1) {
    return unsupported(`budget doit etre un entier >= 1 (recu : ${JSON.stringify(budget)})`);
  }
  if (!spec || typeof spec !== "object") {
    return unsupported("spec V5 absente ou non objet");
  }

  let start;
  try {
    start = createSession(spec);
  } catch (err) {
    return unsupported(`spec refusee par rule-engine-v5 : ${err.message}`);
  }

  const initial = snapshot(start);

  // Profondeur minimale ET unique d'une solution, deduite de la structure V5
  // (voir en-tete) : une cellule vide par coup, et aucune cellule vide toleree
  // a l'etat resolu. Ce n'est pas une convention, c'est une consequence.
  const emptyCells = start.grid.reduce((n, row) => n + row.filter((v) => v === -1).length, 0);
  const depthSufficient = maxDepth >= emptyCells;
  const bounds = Object.freeze({ maxDepth, budget, emptyCells, depthSufficient });

  // -- Cas trivial : l'etat initial est deja resolu -----------------------------
  if (isSolved(start)) {
    return build(SOLVABLE, {
      searchComplete: true,
      minMoves: 0,
      path: [],
      bounds,
      initial,
      final: snapshot(start),
      goalReached: true,
      reason: "L'etat initial est deja resolu : la solution vide est un chemin de longueur 0.",
    });
  }

  // -- BFS deterministe ---------------------------------------------------------
  // File FIFO : le premier chemin trouve est de longueur MINIMALE.
  const seen = new Set([canonical(start)]);
  const queue = [{ s: start, d: 0, path: [] }];
  let head = 0;
  let nodesExpanded = 0;
  let truncatedBy = null;

  while (head < queue.length) {
    const { s, d, path } = queue[head++];

    if (nodesExpanded >= budget) {
      truncatedBy = "budget";
      break;
    }
    if (d >= maxDepth) continue;

    nodesExpanded++;

    for (const mv of getMoves(s)) {
      const next = apply(s, mv);
      if (!next) continue; // le moteur a refuse : ce coup n'existe pas

      const key = canonical(next);
      if (seen.has(key)) continue;
      seen.add(key);

      const step = Object.freeze({
        move: Object.freeze({ id: mv.id, v: mv.v, r: mv.r, c: mv.c }),
        stateFingerprint: key,
      });
      const nextPath = Object.freeze([...path, step]);

      if (isSolved(next)) {
        return build(SOLVABLE, {
          searchComplete: true,
          minMoves: d + 1,
          nodesExpanded,
          nodesSeen: seen.size,
          path: nextPath,
          bounds,
          initial,
          final: snapshot(next),
          goalReached: true,
          reason:
            `Chemin de ${d + 1} coup(s) produit par les transitions de rule-engine-v5 : ` +
            `chaque coup appartient a getMoves() de son etat, et l'etat final est confirme resolu.`,
        });
      }

      queue.push({ s: next, d: d + 1, path: nextPath });
    }
  }

  // -- Sortie sans solution ----------------------------------------------------
  // Distinction DECISIVE entre « inexistence etablie » et « abandon ».
  if (truncatedBy === "budget") {
    return build(UNPROVEN, {
      searchComplete: false,
      minMoves: null,
      nodesExpanded,
      nodesSeen: seen.size,
      truncatedBy,
      path: [],
      bounds,
      initial,
      final: null,
      goalReached: false,
      reason:
        `Recherche interrompue par la borne budget=${budget} apres ${nodesExpanded} noeud(s) ` +
        `explores : l'espace n'a PAS ete epuise, donc aucune conclusion — ni existence, ` +
        `ni inexistence — n'est etablie.`,
    });
  }

  // La file est vide, mais la borne de profondeur peut avoir exclu une
  // solution. On ne certifie PAS l'inexistence dans ce cas.
  if (!depthSufficient) {
    return build(UNPROVEN, {
      searchComplete: false,
      minMoves: null,
      nodesExpanded,
      nodesSeen: seen.size,
      truncatedBy: "maxDepth",
      path: [],
      bounds,
      initial,
      final: null,
      goalReached: false,
      reason:
        `Frontier epuisee mais maxDepth=${maxDepth} < ${emptyCells} cellule(s) vide(s) : ` +
        `une solution, si elle existe, a exactement ${emptyCells} coup(s) d'apres les regles ` +
        `V5 (un coup remplit une cellule, isSolved n'en tolere aucune). La borne a donc ` +
        `pu EXCLURE une solution : l'inexistence n'est PAS etablie. ` +
        `Relancer avec maxDepth >= ${emptyCells} pour conclure.`,
    });
  }

  return build(UNSOLVABLE, {
    searchComplete: true,
    minMoves: null,
    nodesExpanded,
    nodesSeen: seen.size,
    truncatedBy: null,
    path: [],
    bounds,
    initial,
    final: null,
    goalReached: false,
    reason:
      `Espace etat entierement explore (${nodesExpanded} noeud(s) expandus, ${seen.size} etat(s) ` +
      `atteints, profondeur ${maxDepth} >= ${emptyCells} cellule(s) vide(s) donc exhaustive) ` +
      `et aucune solution trouvee : l'inexistence est ETABLIE.`,
  });
}

/**
 * Rejoue un chemin par DEUX voies independantes du moteur souverain.
 *
 * La spec d'origine est EXIGEE en parametre : elle n'est jamais devinee, et
 * le witness ne la transporte pas pour rester compact.
 *
 * Voie 1 — EXECUTABILITE : `replay(spec, events)`, qui rejoue via `apply()`
 *          et leve si un coup est refuse.
 * Voie 2 — LEGALITE     : appartenance de chaque coup a `getMoves()` de
 *          l'etat courant, etat reconstruit coup par coup.
 *
 * Les deux sont exigees : l'executabilite seule est insuffisante, car
 * `apply()` et `replay()` acceptent une sequence dont les lignes sont
 * fausses. C'est verifie par test.
 *
 * @param {object} witness sortie de proveSolvability, status SOLVABLE
 * @param {object} spec    spec V5 d'origine
 * @returns {{ok, steps, legal, executable, matches, finalFingerprint, reason}}
 */
export function verifyWitness(witness, spec) {
  const fail = (reason) => ({
    ok: false, steps: 0, legal: false, executable: false, matches: false,
    finalFingerprint: null, reason,
  });

  if (!witness || witness.status !== SOLVABLE) {
    return fail("rien a rejouer : le witness n'est pas PROVEN_SOLVABLE");
  }
  if (!spec || typeof spec !== "object") {
    return fail("spec V5 d'origine absente : le rejeu exige la spec, elle n'est jamais devinee");
  }

  const moves = witness.path.map((s) => s.move);
  const events = moves.map((m) => ({ type: "PLACE", value: m.v, r: m.r, c: m.c }));

  // -- Voie 1 : EXECUTABILITE, via le replay du moteur ------------------------
  let replayed;
  try {
    replayed = replay(spec, events);
  } catch (err) {
    return { ...fail(`replay() du moteur a refuse le chemin : ${err.message}`), steps: moves.length };
  }
  const executable = replayed.length === moves.length;
  const finalFingerprint = executable ? canonical(replayed[replayed.length - 1]) : null;

  // -- Voie 2 : LEGALITE, via getMoves() a chaque etape ------------------------
  let s = createSession(spec);
  let legal = true;
  for (const m of moves) {
    const offered = getMoves(s).some((x) => x.id === m.id && x.v === m.v && x.r === m.r && x.c === m.c);
    if (!offered) legal = false;
    s = apply(s, m);
    if (!s) break;
  }

  const matches = finalFingerprint !== null && finalFingerprint === witness.final?.fingerprint;

  return {
    ok: legal && executable && matches,
    steps: moves.length,
    legal,
    executable,
    matches,
    finalFingerprint,
    reason: legal && executable && matches
      ? `Chemin rejoue coup par coup : chaque coup offert par getMoves(), chaque etat produit ` +
        `par apply() puis par replay(), empreinte finale conforme a celle certifiee.`
      : `Rejeu refuse : legal=${legal} executable=${executable} empreinteConforme=${matches}.`,
  };
}
