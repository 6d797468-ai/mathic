# MATHIC-BRAND-GAMEPLAY-PRINCIPLES — Rapport de brique

Mandat : intégrer progressivement la culture Mathic dans le squelette existant, en commençant par Number Magic → choix → conséquences — sans réécriture du noyau.
Verdict précédent : CG = CONTINUE.

## PRESERVE
`src/b1/engine.mjs`, `src/b1/solver.mjs`, `src/b1/replay.mjs`, `src/b1/levels.mjs` (LADDER/WORLDS), `save.mjs`, gameplay B1.5 (ne corrige pas le libellé « B1.5 »), score `Base + Chain + OBJECTIVE_BONUS`.

## ADD
- `docs/design/MATHIC-BRAND-GAMEPLAY-PRINCIPLES.md` — identité officielle (Mathic, « Les nombres sont magiques. »), MATHIC-PRINCIPLE-001 (Number Magic), 12 sections, culture MATHIC-001..010, Annexe B (inventaire NM vérifié), Annexe C (gouvernance des mandats).
- `src/b1/design.mjs` — couche design pure (nouvelle, au-dessus du Kernel) : `nmFacts(level)` calcule finals/premiers coups légaux/routes minimales/runs/directWin/multiPath + conséquences (scores distincts, états distincts, chemins chaînés, meilleur score) ; `nmStage` classe direct/choice/consequence/single. Le Kernel reste mathématiquement pur : « magique » n'y apparaît jamais.
- Tagline dans l'écran de lancement réel : `<p class="tagline">Les nombres sont magiques.</p>` dans `index.html` + règle CSS.
- `tests/b1/nm-principles.test.mjs` (6 tests).

## CHANGE
Aucun fichier de production existant modifié hormis 2 petits ajouts de surface : `index.html` (une ligne) et `b1-web.css` (une règle). Aucune logique existante altérée.

## DO NOT DO
Pas de métrique NM affichée au joueur, pas de 5-solutions forcées, pas de réécriture du noyau, pas de « licornes d'équations », pas de Momo/GGUF/économie à ce stade.

## EVIDENCE (démontré automatiquement)
- `npm test` : **129/129 ✔** (123 hérités + 6 NM), aucune régression.
- Inventaire NM sur les 36 niveaux : **15 consequence · 14 choice · 6 single · 1 direct** (Annexe B, Solver+Engine+Replay, budget 40 000) — redistribution figée par test.
- Croisement avec la certification CG : N17 `routes 4, finals 11` identique ; N36 `minMoves 2`, meilleur score 49.
- N15 = « single direct » assumé (une seule route, finals 19) — la magie = précision.
- N22 démontre « des routes mathématiquement correctes, des scores différents » (27 vs …) via replay.
- Noyau pur : aucun fichier Kernel ne contient « magique » ni couplage à la métrique.
- Build web : tagline présente dans `dist-b1/index.html` (1 occurrence) + `b1-web.css`.

## INTEGRATION
La décision marque le squelette à 3 endroits fonctionnels : (1) le module design `src/b1/design.mjs` rend la promesse **vérifiable** (négativement : aucun impact Kernel) ; (2) l'écran de lancement (header) porte la signature ; (3) le document transversal devient la référence de culture/gouvernance pour les prochains mandats (Level Design, Score, Chain, Feedback, Progression, UX, Momo).

## Décision attendue
VERDICT = CONTINUE — rien n'oblige à modifier le Kernel ; la prochaine brique peut traduire Number Magic dans le Level Design (gradation découverte → possibilité → conséquence) ou dans Momo (politique pédagogique par étages NM).