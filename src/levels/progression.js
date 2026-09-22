/**
 * src/levels/progression.js — Progression logique (L13)
 *
 * Lkaddafi définit les règles fonctionnelles de progression :
 * - niveau terminé → prochain niveau
 * - étoiles
 * - score
 *
 * Il ne possède pas le stockage physique (Kali = persistance locale).
 *
 * Gate : L13
 */

/**
 * Calcule la progression après completion d'un niveau.
 * @param {Object} params
 * @param {number} params.movesUsed - Coups joués
 * @param {number} params.optimalMoves - Coups optimaux (certificat BFS)
 * @param {number} params.score - Score du niveau
 * @param {number} [params.previousTotalScore=0] - Score total précédent
 * @returns {{stars: number, score: number, totalScore: number, perfect: boolean, nextLevelUnlocked: boolean}}
 */
export function computeLevelCompletion({ movesUsed, optimalMoves, score, previousTotalScore = 0 }) {
  let stars = 1;
  if (movesUsed <= optimalMoves) stars = 3;
  else if (movesUsed <= optimalMoves + 1) stars = 2;

  const perfect = movesUsed === optimalMoves;
  const bonus = perfect ? Math.floor(score * 0.5) : 0;
  const levelScore = score + bonus;
  const totalScore = previousTotalScore + levelScore;

  return {
    stars,
    score: levelScore,
    totalScore,
    perfect,
    nextLevelUnlocked: true, // Toujours débloqué si complété
  };
}

/**
 * Calcule les étoiles pour un score en mode libre.
 * @param {number} score
 * @returns {number} 1-3 étoiles
 */
export function computeFreeModeStars(score) {
  if (score >= 1000) return 3;
  if (score >= 500) return 2;
  return 1;
}

/**
 * Vérifie si un monde est complété (tous les chapitres/niveaux).
 * @param {LevelDefinition[]} worldLevels
 * @param {Object} completedLevels - Map levelId -> {stars, perfect}
 * @returns {boolean}
 */
export function isWorldComplete(worldLevels, completedLevels) {
  return worldLevels.every((l) => completedLevels[l.id]?.stars >= 1);
}

/**
 * Vérifie si un chapitre est complété.
 * @param {LevelDefinition[]} chapterLevels
 * @param {Object} completedLevels
 * @returns {boolean}
 */
export function isChapterComplete(chapterLevels, completedLevels) {
  return chapterLevels.every((l) => completedLevels[l.id]?.stars >= 1);
}

/**
 * Calcule le pourcentage de complétion d'un monde.
 * @param {LevelDefinition[]} worldLevels
 * @param {Object} completedLevels
 * @returns {number} 0-100
 */
export function getWorldCompletionPercent(worldLevels, completedLevels) {
  if (worldLevels.length === 0) return 0;
  const completed = worldLevels.filter((l) => completedLevels[l.id]?.stars >= 1).length;
  return Math.round((completed / worldLevels.length) * 100);
}

/**
 * Calcule le pourcentage de complétion d'un chapitre.
 * @param {LevelDefinition[]} chapterLevels
 * @param {Object} completedLevels
 * @returns {number} 0-100
 */
export function getChapterCompletionPercent(chapterLevels, completedLevels) {
  if (chapterLevels.length === 0) return 0;
  const completed = chapterLevels.filter((l) => completedLevels[l.id]?.stars >= 1).length;
  return Math.round((completed / chapterLevels.length) * 100);
}

/**
 * Génère l'événement LEVEL_COMPLETED pour le moteur.
 * @param {Object} params
 * @returns {Object} Domain Event
 */
export function createLevelCompletedEvent({ movesUsed, optimalMoves, score, levelId }) {
  const { stars, totalScore, perfect } = computeLevelCompletion({
    movesUsed,
    optimalMoves,
    score,
  });
  return {
    type: 'LEVEL_COMPLETED',
    timestamp: Date.now(),
    levelId,
    moves: movesUsed,
    optimalMoves,
    score,
    stars,
    totalScore,
    perfect,
  };
}