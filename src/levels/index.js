/**
 * src/levels/index.js — Export groupé du Level Engine (L9, L10, L13)
 *
 * Gate : L9, L10, L13
 */

export {
  LEVEL_PALETTE,
  DEFAULT_BOARD_SIZE,
  getLevelByIndex,
  getLevelById,
  paletteSize,
  generateLevel,
} from './definitions.js';

export { solveLevel, certificateLevel, verifyCertificate } from './solver.js';
export { createSession } from './session.js';
export { loadLevel, loadChapter, loadAllLevels, getNextLevel, computeProgression } from './loader.js';
export {
  computeLevelCompletion,
  computeFreeModeStars,
  isWorldComplete,
  isChapterComplete,
  getWorldCompletionPercent,
  getChapterCompletionPercent,
  createLevelCompletedEvent,
} from './progression.js';