/**
 * game.js — GameAdapter (K5 convergence Runtime → Engine)
 *
 * Pont unique entre le runtime (main.js) et le moteur audité
 * (createSession / applyCommand / GameEvents). Un point de vérité :
 *   Input → UI → GameAdapter → GameSession → Core → GameEvents → UI
 *
 * Le moteur reste l'autorité pour TOUTE la mécanique :
 *  - glissements / fusions / contacts (slideBoard via applyCommand),
 *  - spawn (déterministe, flux game du seed),
 *  - compteur de coups (state.moves),
 *  - game over / victory,
 *  - undo (restauration d'état), replay (déterministe).
 *
 * Ce qui reste PRÉSENTATION ici :
 *  - mode classic : la cible fixe (TARGET_NUMBER) et les bonus d'effondrement
 *    (500 + 100/tuile) LUS sur le plateau moteur (jamais muté : clone) ;
 *  - jauge de coups puzzle (budget certifié − coups appliqués) ;
 *  - Mathic Chain (registres de destructions, fenêtre 2 coups) ;
 *  - pile d'entrées Calvados pour l'animation de REWIND (reversePlan).
 *
 * Zéro DOM. Logique pure. Les constantes de bonus classic sont ici pour
 * être testables ; main.js les consomme.
 */

import { createSession } from './levels/session.js';
import { consumeTargetTiles } from './targets.js';
import { slideBoard, isCleaningMove, minMovesToReach, createChainTracker } from './core/board.js';
import { TARGET_NUMBER } from './core/rules.js';
import { makeEntry, reversePlan, calvadosContext } from './history.js';

/** Cible fixe classic (effondrement V3) = 24. */
export const CLASSIC_TARGET = TARGET_NUMBER;
/** Bonus massif par tuile-cible effondrée. */
export const CLASSIC_BONUS = 500;
/** Bonus par tuile-cible supplémentaire dans la même explosion. */
export const CLASSIC_HIT_BONUS = 100;

/**
 * Crée l'adapter de jeu (une partie à la fois).
 * @param {{rows?: number, cols?: number}} [opts]
 * @returns {Object} GameAdapter
 */
export function createGame({ rows = 4, cols = 4 } = {}) {
  let mode = 'classic';
  let session = null;
  let sessionSeed = '';

  // Presentation classique (l'effondrement lit le board moteur, ne le mute pas).
  let classicBonus = 0;
  let targetCount = 0;
  let chain = createChainTracker();
  let chainWindowLeft = 0;
  let chainCount = 0;

  // Puzzle : jauge de coups = budget certifié − coups appliqués.
  let puzzleBudget = 0;
  let puzzleApplied = 0;

  // Entrées d'undo visuelles (une par coup DÉPLACÉ) : pour l'animation
  // rewind + restauration des compteurs de présentation. Le MOTEUR possède
  // déjà la pile d'états ; ici c'est purement graphique.
  const undoVisuals = [];

  const DEEP = (v) => JSON.parse(JSON.stringify(v));

  const startSession = (spec) => {
    undoVisuals.length = 0;
    classicBonus = 0;
    targetCount = 0;
    chain = createChainTracker();
    chainWindowLeft = 0;
    chainCount = 0;
    puzzleApplied = 0;
    session = createSession(spec);
    sessionSeed = String(spec.seed);
  };

  /** Vue d'affichage : en classic, les tuiles-cible sont « effondrées »
   * (invisibles) — le moteur conserve ses 24 comme tuiles normales, on ne
   * les montre jamais et on ne re-présente qu'un espace. Jamais de ghost. */
  const displayBoard = () => {
    const b = session.currentBoard;
    if (mode !== 'classic') return b;
    return b.map((r) => r.map((v) => (v === CLASSIC_TARGET ? null : v)));
  };

  const spawnedFrom = (res) =>
    res.events
      .filter((e) => e.type === 'TILE_SPAWNED')
      .map((e) => e.cell);

  return {
    /** @type {'classic'|'puzzle'} */
    get mode() { return mode; },

    /** Lance une partie classique (plateau libre + cible d'effondrement). */
    newClassic({ rows: r = rows, cols: c = cols, seed = String(Date.now()) } = {}) {
      mode = 'classic';
      startSession({ mode: 'free', rows: r, cols: c, seed });
    },

    /** Lance un puzzle « Coup Parfait » (target/moves certificat BFS). */
    newPuzzle({ seed = String(Date.now()), rows: r = rows, cols: c = cols, target, moves } = {}) {
      mode = 'puzzle';
      startSession({ mode: 'puzzle', rows: r, cols: c, target, moves, seed });
      puzzleBudget = session.moves; // profondeur RÉELLE certifiée (générée)
    },

    /**
     * Applique un coup. Le moteur est le réduit ; le visuel recompute la
     * même physique (pure) pour fournir trajectoires + faits exacts.
     * @param {'up'|'down'|'left'|'right'} dir
     * @param {'add'|'sub'|'mul'|'div'} op
     * @returns {Object} outcome (voir main.js)
     */
    move(dir, op) {
      const beforeBoard = DEEP(session.currentBoard);
      const visual = slideBoard(beforeBoard, dir, op);
      const res = session.command(dir, op);

      if (!res.moved) {
        return {
          moved: false,
          gameOver: res.gameOver,
          victory: res.victory,
          invalidCells: res.invalidCells || [],
          score: this.score,
          moveIndex: session.currentMoveIndex,
        };
      }

      if (mode === 'puzzle') puzzleApplied += 1;

      // Effondrement classic : lecture sur clone (jamais de mutation moteur).
      let exploded = [];
      let bonus = 0;
      let isCombo = false;
      let chainOutcome = { chained: false, chainLength: 1 };
      const chainWLBefore = chainWindowLeft;
      const chainCountBefore = chainCount;
      const targetCountBefore = targetCount;

      if (mode === 'classic') {
        exploded = consumeTargetTiles(DEEP(session.currentBoard), CLASSIC_TARGET);
        if (exploded.length > 0) {
          bonus = CLASSIC_BONUS + (exploded.length - 1) * CLASSIC_HIT_BONUS;
          classicBonus += bonus;
          targetCount += exploded.length;
          chainOutcome = chain.registerTarget(session.currentMoveIndex);
          isCombo = chainOutcome.chained;
          chainCount = chainOutcome.chained ? chainOutcome.chainLength : 1;
          chainWindowLeft = 2;
        } else if (chainWindowLeft > 0) {
          chainWindowLeft -= 1;
        }
      } else {
        exploded = res.events
          .filter((e) => e.type === 'TARGET_COLLAPSED')
          .flatMap((e) => e.cells);
        if (exploded.length > 0) {
          targetCount += exploded.length;
          chainOutcome = chain.registerTarget(session.currentMoveIndex);
          isCombo = chainOutcome.chained;
          chainCount = chainOutcome.chained ? chainOutcome.chainLength : 1;
          chainWindowLeft = 2;
        } else if (chainWindowLeft > 0) {
          chainWindowLeft -= 1;
        }
      }

      // Nettoyage tactique (Hype-Man) : infos pour le coach, calcul moteur.
      // NB : on compare sur le plateau post-glissement SANS spawn (parité
      // exacte avec le runtime d'origine).
      const cleaning = isCleaningMove(beforeBoard, visual.board, op)
        ? { op, freed: countEmpty(visual.board) - countEmpty(beforeBoard) }
        : null;

      const entry = makeEntry({
        before: beforeBoard,
        after: DEEP(session.currentBoard),
        moves: visual.moves,
        mergedCells: res.mergedCells,
        spawned: spawnedFrom(res),
        exploded,
        gained: res.gained,
        dir,
        op,
        snap: {
          score: this.score,
          movesLeft: this.movesLeft,
          target: this.target,
          targetCount: targetCountBefore,
          moveIndex: session.currentMoveIndex,
          chainWindowLeft: chainWLBefore,
          chainCount: chainCountBefore,
        },
      });
      undoVisuals.push({ entry, targetCountBefore, chainWindowLeftBefore: chainWLBefore, chainCountBefore, classicBonusBefore: classicBonus, puzzleAppliedBefore: mode === 'puzzle' ? puzzleApplied - 1 : 0 });

      return {
        moved: true,
        gained: res.gained,
        mergedCells: res.mergedCells,
        invalidCells: res.invalidCells || [],
        moves: visual.moves,
        exploded,
        bonus,
        isCombo,
        chain: chainOutcome,
        cleaning,
        victory: res.victory,
        gameOver: res.gameOver,
        moveIndex: session.currentMoveIndex,
        score: this.score,
        movesLeft: this.movesLeft,
      };
    },

    /**
     * Undo : moteur (état) + présentation (Badge chain, targetCount, jauge)
     * + plan de rewind animé (s'ils existent).
     * @returns {{ok: boolean, plan: Object|null, entry: Object|null, context: Object|null}}
     */
    undo() {
      const ok = session.undo();
      if (!ok) return { ok: false, plan: null, entry: null, context: null };
      const v = undoVisuals.pop();
      if (v) {
        targetCount = v.targetCountBefore;
        chainWindowLeft = v.chainWindowLeftBefore;
        chainCount = v.chainCountBefore;
        classicBonus = v.classicBonusBefore;
        if (mode === 'puzzle') puzzleApplied = v.puzzleAppliedBefore;
      }
      return { ok: true, plan: v ? reversePlan(v.entry) : null, entry: v ? v.entry : null, context: v ? calvadosContext(v.entry) : null };
    },

    /** Vue d'affichage (classic : cibles effondrées). */
    get board() { return displayBoard(); },
    /** Board moteur brut (autorité). */
    get engineBoard() { return session.currentBoard; },
    /** Score affiché = score moteur + bonus d'effondrement classic. */
    get score() { return session.currentScore + classicBonus; },
    get moveIndex() { return session.currentMoveIndex; },
    get target() { return mode === 'puzzle' ? session.target : CLASSIC_TARGET; },
    get targetCount() { return targetCount; },
    get gameOver() { return session.gameOver; },
    get victory() { return session.isVictory; },
    get seed() { return sessionSeed; },
    get sessionId() { return session.sessionId; },
    get movesLeft() { return mode === 'puzzle' ? Math.max(0, puzzleBudget - puzzleApplied) : 0; },
    get puzzleMoves() { return mode === 'puzzle' ? puzzleBudget : 0; },
    get chainWindowLeft() { return chainWindowLeft; },
    get chainCount() { return chainCount; },

    /** Solvabilité temps réel (puzzle) : coups restants pour la cible. */
    solvabilityRemainder() {
      return minMovesToReach(session.currentBoard, session.target, this.movesLeft);
    },

    /** Snapshot sérialisable (persistance K8). */
    getSnapshot() {
      return DEEP({
        v: 1,
        mode,
        seed: sessionSeed,
        classicBonus,
        targetCount,
        puzzleBudget,
        state: session.getSnapshot(),
      });
    },

    /**
     * Réhydrate une partie depuis un snapshot (persistance K8 : jouer →
     * fermer → rouvrir → continuer). Reconstruit la session moteur puis
     * replie les compteurs de présentation. L'historique d'undo moteur
     * repart à zéro (les états passés ne sont pas sérialisés) — l'undo
     * post-reprise est donc indisponible jusqu'au prochain coup.
     * @param {Object} payload snapshot produit par getSnapshot()
     * @throws {Error} snapshot invalide ou version incompatible
     */
    restoreSnapshot(payload) {
      if (!payload || payload.v !== 1 || !payload.state) {
        throw new Error('Snapshot invalide (version)');
      }
      const engineMode = payload.mode === 'puzzle' ? 'puzzle' : 'free';
      session = createSession({
        mode: engineMode,
        rows: payload.state.rows,
        cols: payload.state.cols,
        seed: payload.seed ?? String(Date.now()),
      });
      session.loadSnapshot(payload.state);
      sessionSeed = String(payload.seed ?? '');
      mode = payload.mode === 'puzzle' ? 'puzzle' : 'classic';
      classicBonus = Number.isInteger(payload.classicBonus) ? payload.classicBonus : 0;
      targetCount = Number.isInteger(payload.targetCount) ? payload.targetCount : 0;
      puzzleBudget = Number.isInteger(payload.puzzleBudget) ? payload.puzzleBudget : (engineMode === 'puzzle' ? session.moves : 0);
      puzzleApplied = engineMode === 'puzzle' ? payload.state.moves : 0;
      undoVisuals.length = 0;
      chain = createChainTracker();
      chainWindowLeft = 0;
      chainCount = 0;
    },

    /** Prochain niveau (puzzle) — non utilisé par le runtime V4 actuel. */
    nextLevel() {
      return session.nextLevel();
    },
  };
}

/** Nombre de cases vides (pour le calcul « nettoyage »). */
function countEmpty(board) {
  let n = 0;
  for (const r of board) for (const v of r) if (v === null) n++;
  return n;
}