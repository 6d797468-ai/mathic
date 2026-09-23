# MATHIC V5 — Gameplay Laboratory (GATE 1)

## Périmètre (contrat strict)

- **ISOLE** : aucun code importe/exporte depuis `src/`, `tests/` ou `android/` de la production.
- **V4 = baseline immuable** : ce laboratoire ne modifie, ne lit-systématiquement et ne supprime **rien** de V4.
- **Uniquement du Node pur** : 0 dépendance, 0 DOM, 0 réseau, 0 Capacitor, 0 animation, 0 APK.
- **Aucun commit n'est effectué sans ordre explicite.**

## Question unique du laboratoire

> Est-ce que les règles expérimentales (A / B) produisent réellement de *meilleures décisions de jeu* que V4 ?
> — PAS « est-ce que le code fonctionne ? »

Le code fonctionne (tests), mais l'objet mesuré est la **qualité décisionnelle** (GAMEPLAY-G0).

## Commandes

```bash
npm test            # tests unitaires + déterminisme + solver (node --test)
npm run lab         # exécute l'analyse complète A vs B (console)
npm run report      # idem + écrit lab/gameplay/reports/g0-report.md
```

## Contenu

| Chemin | Rôle |
|---|---|
| `lib/engine-a.mjs` | Règles expérimentales A — Chaînes (opérateurs-consommables, file déterministe, conditions de victoire EXACT_VALUE + contraintes) |
| `lib/engine-b.mjs` | Règles expérimentales B — Grille croisée Lignes×Colonnes (backtracking vs multiplicité de réserve) |
| `lib/solver.mjs` | BFS (min), DFS (comptage de solutions), stats (branching, dead-ends, points de décision) |
| `lib/metrics.mjs` | Tableau de métriques par niveau + agrégats |
| `lib/gen.mjs` | Générateur de niveaux A aléatoires (seedés) → sa sonde MTH-001 |
| `lib/levels/a.mjs` / `b.mjs` | ~10 niveaux-spec A et ~10 B (seeds fixes) |
| `lib/compare.mjs` | Comparateur A vs B + verdicts G0 provisoires + éventuel Variant C |
| `run.mjs` | Orchestrateur CLI |
| `tests/lab.test.mjs` | Tests automatisés (déterminisme, unitaires moteurs, sanity solver) |

## Non-objectif (rappel §11 de la mission)

Ni UI, ni moteur V4, ni adapter, ni Momo, ni persistence, ni build/APK, ni nouvelle dépendance.