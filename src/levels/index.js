/**
 * src/levels/index.js — Export groupé du Level Engine (G3)
 *
 * Gate : G3
 */

export { LEVEL_PALETTE, DEFAULT_BOARD_SIZE, getLevelByIndex, paletteSize } from './definitions.js';
export { solveLevel, certificateLevel, verifyCertificate } from './solver.js';
export { createSession } from './session.js';