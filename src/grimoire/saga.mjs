// ---------------------------------------------------------------------------
// MATHIC 1.0 — M18 · SAGA : projection de progression (LECTURE PURE)
// Contrat : docs/design/MATHIC-1-0-PROGRESSION-PROJECTION.md (v1.1)
// ---------------------------------------------------------------------------
// La Saga est une FONCTION de (save, knowledge, LADDER, enveloppes solveur).
// Elle n'écrit rien (I-2) et n'invente aucune règle : les étoiles sont
// dérivées exclusivement des sources existantes (contrat §3) :
//
//   used = maxMoves − bestMovesLeft            (meilleure victoire enregistrée)
//   ⭐1 : wins ≥ 1
//   ⭐2 : used < maxMoves  OU  minMoves === maxMoves   (congruence C-1)
//   ⭐3 : used === minMoves                     (optimum certifié solveur)
//
// Propriétés opposées par la suite de tests (SG-*) :
//   P-ordre      : ⭐3 ⇒ ⭐2 ⇒ ⭐1 pour toute entrée, sur l'intégralité du LADDER ;
//   P-congruence : sur tout niveau à minMoves === maxMoves, une victoire
//                  accorde les trois étoiles (N1..N3 compris) ;
//   pureté       : même entrée → mêmes étoiles (aucune horloge, aucun aléa) ;
//   dégradation  : enveloppe absente ou save corrompue → étoiles manquantes,
//                  jamais de crash, jamais d'étoile inventée (I-5) ;
//   monotonie    : une étoile acquise ne se perd pas (bestMovesLeft ne
//                  décroît jamais — garantie de markCompleted).
//
// Le lab V5 est HORS HIÉRARCHIE (décision v1.1) : rubrique distincte, aucune
// étoile, aucun seuil. Les seuils de chapitre sont DÉRIVÉS (§4) et purement
// AFFICHÉS : le verrouillage réel reste celui de save.mjs (fenêtre M8).
// ---------------------------------------------------------------------------

import { LADDER, WORLDS, worldOf } from "../b1/levels.mjs";
import { solve as solveB1 } from "../b1/solver.mjs";

// Seuil d'un chapitre = ⭐ requises = min(6, 2 × nombreDeNiveauxDuChapitre).
// Constante de game design (contrat §4) — un joueur qui termine tout au ⭐1
// ouvre la suite ; le ⭐3 parfait n'est jamais requis pour avancer.
export const CHAPTER_THRESHOLD_CAP = 6;

export function chapterThreshold(levelCount) {
  const n = Number(levelCount);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return Math.min(CHAPTER_THRESHOLD_CAP, 2 * n);
}

// Fonction d'étoiles (contrat §3) — PURE, totale (aucune entrée ne crash).
//   record   : save.completed[id] ou null (save vierge / entrée corrompue)
//   level    : entrée LADDER (maxMoves notamment)
//   envelope : résultat du solveur b1 ou null (dégradation propre)
// Seuls les entiers sont crédibles : toute valeur suspecte dégrade l'étoile
// correspondante au lieu d'en inventer une (I-5).
export function starsOf(record, level, envelope) {
  const maxMoves = Number.isInteger(level?.maxMoves) ? level.maxMoves : null;
  const wins = Number.isInteger(record?.wins) ? record.wins : 0;
  const s1 = wins >= 1;

  const bestLeft = Number.isInteger(record?.bestMovesLeft) ? record.bestMovesLeft : null;
  const rawUsed = s1 && maxMoves !== null && bestLeft !== null ? maxMoves - bestLeft : null;
  // Une victoire réelle consomme 1..maxMoves coups — hors de ces bornes,
  // l'enregistrement est corrompu : on dégrade au lieu d'inventer (I-5).
  const usedOk = rawUsed !== null && rawUsed >= 1 && rawUsed <= maxMoves;
  const used = usedOk ? rawUsed : null;

  const envOk = Boolean(envelope) && envelope.solvable === true && Number.isInteger(envelope.minMoves);
  const congruent = envOk && maxMoves !== null && envelope.minMoves === maxMoves;

  // ⭐2 : victoire VALIDE (usedOk) puis — un coup d'avance sur le budget, ou
  // congruence certifiée (niveau où l'enveloppe ne discrimine pas : toute
  // victoire réelle y est optimale). La congruence ne court-circuite JAMAIS
  // la validation du save : un enregistrement incohérent dégrade au lieu
  // d'inventer une étoile (audit M18 §5 — verdict ⭐1⭐2✩ sur used=0 interdit).
  const s2 = s1 && usedOk && (used < maxMoves || congruent);
  // ⭐3 : joué aussi vite que la solution minimale certifiée.
  const s3 = s1 && envOk && usedOk && used === envelope.minMoves;

  return {
    count: (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0),
    s1,
    s2,
    s3,
    used, // coups consommés par la meilleure victoire (null si non calculable)
    minMoves: envOk ? envelope.minMoves : null,
    congruent,
    envelopeMissing: !envOk,
  };
}

// ---------------------------------------------------------------------------
// Usine de projection — injecte les sources de vérité, n'en possède aucune.
//   save      : () => état mathic.save.v1 (lecture, délégée à save.mjs côté UI)
//   knowledge : () => état mathic.knowledge.v1 (optionnel, lecture seule)
//   ladder / worlds : géographie (défauts : LADDER / WORLDS de levels.mjs)
//   solve     : solveur b1 injectable (défaut : src/b1/solver.mjs) — memoïsé
//   budget    : budget solveur éventuel, transmis tel quel
// ---------------------------------------------------------------------------
export function createSaga({ save, knowledge = null, ladder = LADDER, worlds = WORLDS, solve = solveB1, budget } = {}) {
  if (typeof save !== "function") {
    throw new TypeError("saga : save (fonction de lecture de la progression) requis");
  }
  if (knowledge !== null && typeof knowledge !== "function") {
    throw new TypeError("saga : knowledge doit être une fonction de lecture (ou null)");
  }
  if (typeof solve !== "function") {
    throw new TypeError("saga : solve doit être une fonction (solveur injectable)");
  }

  const levelById = new Map(ladder.map((L) => [L.id, L]));

  // Memoïsation d'enveloppes — par instance, au premier besoin (I-3 : les
  // enveloppes ne dépendent que du niveau, jamais de la progression).
  // Accepte un objet LADDER ou un id ("N1").
  const envelopes = new Map();
  const envelopeOf = (levelOrId) => {
    const level = typeof levelOrId === "string" ? levelById.get(levelOrId) : levelOrId;
    if (!level || !level.id) throw new TypeError("saga : niveau (objet LADDER ou id) requis");
    if (!envelopes.has(level.id)) envelopes.set(level.id, solve(level, { budget }));
    return envelopes.get(level.id);
  };

  const starsFor = (levelId) => {
    const level = levelById.get(levelId);
    if (!level) return null;
    const st = save();
    return starsOf(st?.completed?.[levelId] ?? null, level, envelopeOf(level));
  };

  const view = () => {
    const st = save();
    const completed = st?.completed ?? {};
    const unlocked = Array.isArray(st?.unlocked) ? st.unlocked : [];

    const chapters = worlds.map((w) => {
      const rows = ladder
        .filter((L) => L.world === w.id)
        .map((L) => {
          const stars = starsOf(completed[L.id] ?? null, L, envelopeOf(L));
          // L'état dérive UNIQUEMENT de la progression réelle (save.mjs) :
          // le seuil de chapitre n'est jamais un verrou (contrat §4).
          const state = stars.s1 ? "MASTERED" : unlocked.includes(L.id) ? "OPEN" : "LOCKED";
          return {
            id: L.id,
            name: L.name,
            world: w.id,
            maxMoves: L.maxMoves,
            state,
            stars: stars.count,
            used: stars.used,
            minMoves: stars.minMoves,
            congruent: stars.congruent,
            envelopeMissing: stars.envelopeMissing,
          };
        });
      const starsEarned = rows.reduce((acc, r) => acc + r.stars, 0);
      const threshold = chapterThreshold(rows.length);
      return {
        id: w.id,
        name: w.name,
        concept: w.concept,
        levels: rows,
        done: rows.filter((r) => r.state === "MASTERED").length,
        unlocked: rows.filter((r) => r.state !== "LOCKED").length,
        starsEarned,
        starsPossible: rows.length * 3,
        threshold,
        thresholdMet: starsEarned >= threshold,
      };
    });

    const totals = {
      starsEarned: chapters.reduce((a, c) => a + c.starsEarned, 0),
      starsPossible: chapters.reduce((a, c) => a + c.starsPossible, 0),
      completed: chapters.reduce((a, c) => a + c.done, 0),
      levelsTotal: ladder.length,
    };

    const knowState = knowledge ? knowledge() : null;
    return {
      totals,
      chapters,
      current: { levelId: st?.current ?? null, worldId: st?.current ? worldOf(st.current) : null },
      // Lab V5 : rubrique hors hiérarchie — aucune étoile, aucun seuil.
      lab: { engine: "v5", stars: null, threshold: null, note: "atelier — hors hiérarchie (décision v1.1)" },
      knowledge: knowledge
        ? { fragments: Array.isArray(knowState?.unlockedFragments) ? knowState.unlockedFragments.length : 0 }
        : null,
    };
  };

  return { envelope: envelopeOf, starsFor, view };
}
