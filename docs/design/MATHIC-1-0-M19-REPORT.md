# MATHIC 1.0 — M19 : Couche d'Intelligence (Maggeek + Momo)

## Contexte

M19 ajoute une couche d'intelligence en lecture seule dérivée du solveur B1 existant (`src/b1/solver.mjs`), sans aucune mutation du moteur, du solveur, de la logique de scoring, de la progression ou du save.

## Contraintes respectées

- Aucune modification de `src/b1/solver.mjs`, `src/b1/save.m1`, `src/b1/levels.mjs`, `src/b1/engine.mjs`, `src/b1/level-design.mjs`.
- Aucun appel à `Math.random|Date.now|fetch|document|localStorage` ajouté dans `src/b1/` ou `src/v5/rules/`.
- `mathic.save.v1` et `mathic.knowledge.v1` conservent leurs écrivains uniques.
- La couche intel est purement dérivée : `facts ← solverFacts`, `hint ← momo.hint({levelId, level, record})`.

## Architecture

```
src/intel/contracts.mjs        → types/interfaces (Fact, Hint, SolverFactId)
src/intel/profile.mjs          → profilage du joueur (wins, losses, streak)
src/intel/evidence.mjs         → cache de faits observés
src/intel/progression-policy.mjs → politique d'adaptation
src/intel/progression-orchestrator.mjs → orchestre les faits → hints
src/intel/runtime.mjs          → runtime read-only
src/intel/adaptive-experiment.mjs → expérimentation
── M19 ajout ──
src/intel/facts.mjs            → catalogue de faits solver (SF-BASE-01..SF-RULE-14)
src/intel/maggeek.mjs          → createMaggeek({facts}) → coach factuel
src/intel/momo.mjs             → createMomo({coach, provider, mode}) + momoMode()
```

## Seam UI

`src/grimoire/web/grimoire.js` :
- Importe `createMaggeek`, `createMomo`, `momoMode`, `solverFacts`.
- Instancie `maggeek` et `momo`.
- `renderHint()` : déclenché par `btn-hint` → `momo.hint({levelId, level, record})` → rend `momo-panel` (lecture seule).
- L'UI ne possède AUCUNE stratégie : elle rend le hint exposé par Momo.

## Tests

```
tests/intel/maggeek.test.mjs → MOMO-01..MOMO-18, 18/18 pass
npm test → 487 tests pass
```

## Invariants

- **Intel ≠ Moteur** : la couche intel ne modifie jamais l'état du solveur.
- **Intel ≠ Persistence** : les facts sont dérivés du save, jamais écrits dedans.
- **Intel ≠ Scoring** : les hints sont des conseils, pas des scores.

## État

**M19 PROVEN** — couche intel pure, testée par `tests/intel/maggeek.test.mjs` (18/18), intégrée dans le web shell sans mutation du cœur.
