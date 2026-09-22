/**
 * src/levels/loader.js — Level Content Loader (L10)
 *
 * Charge les définitions de niveau depuis le système de fichiers.
 * Permet de séparer ENGINE de CONTENT.
 *
 * Gate : L10
 */

const LEVELS_BASE = 'src/levels/content';

/**
 * Charge un niveau depuis un fichier JSON.
 * @param {string} levelId - Ex: "world-01/chapter-01/level-001"
 * @returns {Promise<LevelDefinition>}
 */
export async function loadLevel(levelId) {
  const response = await fetch(`${LEVELS_BASE}/${levelId}.json`);
  if (!response.ok) {
    throw new Error(`Niveau non trouvé: ${levelId}`);
  }
  return response.json();
}

/**
 * Charge tous les niveaux d'un chapitre.
 * @param {string} worldChapter - Ex: "world-01/chapter-01"
 * @returns {Promise<LevelDefinition[]>}
 */
export async function loadChapter(worldChapter) {
  // En environnement sans FS (navigateur), on utilise une liste connue
  // Pour Node.js / build, on pourrait utiliser fs.readdir
  const levels = [];
  for (let i = 1; i <= 99; i++) {
    const id = `${worldChapter}/level-${String(i).padStart(3, '0')}`;
    try {
      const level = await loadLevel(id);
      levels.push(level);
    } catch {
      break; // Plus de niveaux
    }
  }
  return levels;
}

/**
 * Charge tous les niveaux de tous les mondes.
 * @returns {Promise<LevelDefinition[]>}
 */
export async function loadAllLevels() {
  const worlds = ['world-01']; // Extensible
  const all = [];
  for (const world of worlds) {
    for (let c = 1; c <= 99; c++) {
      const chapter = `${world}/chapter-${String(c).padStart(2, '0')}`;
      const levels = await loadChapter(chapter);
      if (levels.length === 0) break;
      all.push(...levels);
    }
  }
  return all;
}

/**
 * Trouve le niveau suivant dans la progression.
 * @param {LevelDefinition} current
 * @param {LevelDefinition[]} allLevels
 * @returns {LevelDefinition|null}
 */
export function getNextLevel(current, allLevels) {
  const currentIdx = allLevels.findIndex((l) => l.id === current.id);
  if (currentIdx >= 0 && currentIdx + 1 < allLevels.length) {
    return allLevels[currentIdx + 1];
  }
  return null;
}

/**
 * Calcule la progression (étoiles, score) pour un niveau complété.
 * @param {Object} params
 * @param {number} params.movesUsed
 * @param {number} params.optimalMoves
 * @param {number} params.score
 * @returns {{stars: number, score: number, perfect: boolean}}
 */
export function computeProgression({ movesUsed, optimalMoves, score }) {
  let stars = 1;
  if (movesUsed <= optimalMoves) stars = 3;
  else if (movesUsed <= optimalMoves + 1) stars = 2;

  const perfect = movesUsed === optimalMoves;
  const bonus = perfect ? Math.floor(score * 0.5) : 0;

  return {
    stars,
    score: score + bonus,
    perfect,
  };
}