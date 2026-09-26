/**
 * MATHIC V5 — GENERATOR CONSTRAINTS
 * ============================================================================
 * Contraintes de génération V5 — données pures, aucune logique de jeu.
 */

export const DEFAULT_CONSTRAINTS = Object.freeze({
  // Dimensions de la grille
  minRows: 2,
  maxRows: 3,
  minCols: 2,
  maxCols: 3,

  // Valeurs possibles dans la réserve / grille
  minValue: 1,
  maxValue: 9,

  // Opérateurs autorisés
  allowedOps: ["+", "-", "*", "/"],

  // Nombre de cellules vides
  minEmptyCells: 2,
  maxEmptyCells: 9,

  // Cibles par ligne/colonne
  minTarget: 1,
  maxTarget: 50,

  // Réserve : politique de remplissage
  reservePolicy: "balanced", // "minimal" | "balanced" | "generous"

  // Contraintes de génération
  maxAttemptsPerSeed: 100,
});

export function validateConstraints(constraints) {
  if (!constraints || typeof constraints !== "object") {
    return { ok: false, reason: "constraints must be an object" };
  }
  const c = { ...DEFAULT_CONSTRAINTS, ...constraints };
  if (c.minRows < 1 || c.maxRows < c.minRows) return { ok: false, reason: "invalid rows range" };
  if (c.minCols < 1 || c.maxCols < c.minCols) return { ok: false, reason: "invalid cols range" };
  if (c.minValue < 1 || c.maxValue < c.minValue) return { ok: false, reason: "invalid value range" };
  if (!Array.isArray(c.allowedOps) || c.allowedOps.length === 0) return { ok: false, reason: "allowedOps required" };
  if (c.minEmptyCells < 1 || c.maxEmptyCells < c.minEmptyCells) return { ok: false, reason: "invalid empty cells range" };
  if (c.minTarget > c.maxTarget) return { ok: false, reason: "invalid target range" };
  if (c.maxAttemptsPerSeed < 1) return { ok: false, reason: "maxAttemptsPerSeed must be >= 1" };
  return { ok: true, constraints: c };
}