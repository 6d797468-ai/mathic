/**
 * @file preconditions.mjs
 * MATHIC V6 - M26 Preconditions Engine
 *
 * Verifies structural and contextual preconditions before compilation.
 */

import { validateIntent } from "./intent.mjs";

export function checkPreconditions(state, intent, registry) {
  if (!state || !state.grid || !state.reserve) {
    return { ok: false, reason: "État V5 invalide ou incomplet (grid/reserve manquants)" };
  }

  const intentCheck = validateIntent(intent);
  if (!intentCheck.valid) {
    return { ok: false, reason: `Intent invalide: ${intentCheck.errors.join("; ")}` };
  }

  if (!registry || typeof registry.has !== "function" || !registry.has(intent.methodId)) {
    return { ok: false, reason: `Méthode non enregistrée dans le registre: '${intent?.methodId}'` };
  }

  const method = registry.get(intent.methodId);

  const numRows = state.grid.length;
  const numCols = state.grid[0]?.length ?? 0;

  // Check targets bounds and emptiness
  for (const { r, c } of intent.targets) {
    if (r < 0 || r >= numRows || c < 0 || c >= numCols) {
      return { ok: false, reason: `Cible (${r},${c}) hors limites de la grille (${numRows}x${numCols})` };
    }
    if (state.grid[r][c] !== -1) {
      return { ok: false, reason: `Case (${r},${c}) n'est pas vide (contient ${state.grid[r][c]})` };
    }
  }

  // Count required values in intent
  const requiredCounts = {};
  for (const val of intent.values) {
    requiredCounts[val] = (requiredCounts[val] || 0) + 1;
  }

  // Check reserve availability
  for (const [valStr, count] of Object.entries(requiredCounts)) {
    const val = +valStr;
    const available = state.reserve[val] ?? 0;
    if (available < count) {
      return {
        ok: false,
        reason: `Réserves insuffisantes pour la valeur ${val}: ${count} requis, ${available} disponibles`,
      };
    }
  }

  // Custom method-level preconditions if defined
  if (typeof method.preconditions === "function") {
    const customResult = method.preconditions(state, intent);
    if (!customResult.ok) {
      return customResult;
    }
  }

  return { ok: true };
}
