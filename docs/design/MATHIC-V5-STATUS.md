# MATHIC V5 — Évaluation de l'état du gameplay (LABORATOIRE)

**ATTENTION — MISE À JOUR PRODUIT (2026-09-23)** : décision de cadrage « MATHIC 1.0 » actée. **Ce document décrit l'état du LABORATOIRE V5**, dont les acquis sont des **outils réutilisables** pour la cible produit. La cible unique est désormais **MATHIC 1.0** — voir **`docs/design/MATHIC-1-0-BRIEF.md`** (référence unique : re-sélection de la mécanique en « construction de formules », donc le **Concept B n'est PAS le noyau produit**). Ce statut V5 reste valable comme **compte-rendu des travaux de recherche gameplay** et comme chaîne de preuves pour l'industrialisation.

**Type de document** : état des lieux + évaluation à l'usage d'un architecte de revue.
**Date** : 2026-09-23 · **Branche** : `kali/v5-gameplay-lab` · **Baseline V4** : `main` intact (jamais modifié).

---

## 1. Résumé exécutif

- La **fondation gameplay V5 est posée et prouvée par mesure** (règles, moteur pur, solver de certification, contrat formel, adaptateur runtime) sans aucun impact sur le produit V4.
- Un gameplay est **techniquement jouable** (console) mais **aucune UI** n'existe : la partie « jeu visible » (sessions, progression, contenu) est la prochaine unité de travail.
- Décision centrale actée : **Concept B « Grille croisée »** retenu (score G0 8/8 vs 6/8 pour A « Chaînes »), A conservé en mode secondaire.
- Risque principal restant : **G0.1/G0.2 (compréhension — ressenti humain) non encore validé par un testeur** : c'est l'unique critère G0 que le solver ne couvre pas.

## 2. Historique des travaux (chaîne de preuves)

| Id | Contenu | Artefacts |
|---|---|---|
| PHASE 0–2 | Exploration : diagnostic V4, 3 concepts (A/B/C), critères GAMEPLAY-G0, proposition lab | `docs/design/MATHIC-V5-GAMEPLAY-EXPLORATION.md` |
| GATE 1 (PHASE 3–4) | Lab de simulation : engine A/B, solver BFS/DFS budgeté, 30 niveaux-spec, métriques, comparateur, rapport G0, retest curation A-v2 | `lab/gameplay/` + `lab/gameplay/reports/g0-report.md` |
| PHASE 6 | Règles formelles : contrat `GAME-RULES` OLD→NEW + durcissement `validateSpec`/`replay` | `docs/design/MATHIC-V5-CONTRACT-RULES-B.md`, `lab/gameplay/lib/engine-b.mjs` |
| Architecture | Blueprint de greffe PHASE 8 zéro-casse + définition GATE 2 | `docs/design/MATHIC-V5-ARCHITECTURE.md` |
| PHASE 8·A | Rule Engine V5 dans le produit (fichiers neufs uniquement) | `src/v5/rules/` + `tests/v5/rules.test.mjs` |
| GATE 2 (partiel) | Playtest humain console (validation G0.1/G0.2 en attente) | `src/v5/rules/playtest.mjs` |
| PHASE 8·B (S3a) | Adaptateur runtime V5 sur le seam V4 (zéro-casse) | `src/runtime/game-adapter-v5.js` + `tests/v5/game-adapter-v5.test.mjs` |

## 3. Décisions actées (avec preuves chiffrées)

1. **Concept B retenu comme gameplay principal.**
   - Score G0 mesurable : **B = 8/8, A = 6/8** (`lab/gameplay/reports/g0-report.md`).
   - Décision réelle : B branching moyen **9,34** (V4 : 14,6 mais qualitativement équivalent) ; ratio décision **0,75** ; **7/9** niveaux à ≥ 2 solutions.
   - A « Chaînes » re-curaté (A-v2 : 10/10 résolvables, ≥ 2 solutions 5/10 vs 3/10 en v1) => **candidat mode secondaire**, pas produit principal.
2. **Niveaux résolvables ≠ niveaux tous jouables** : b-07 est un « impossible » assumé (réserve incompatible) → exercice de diagnostic, verbalisé, jamais une erreur.
3. **MTH-001 traité par design.** Sonde anti-MTH-001 (100 specs seedées, génération naïve) :
   - résolvables **13/100** · non résolvables **87/100** · cible préexistante **12** · solutions min ≤ 1 **13**
   => **toute génération dynamique V5 est subordonnée à un certificateur solver** (`certify`).
4. **Déterminisme non négociable** : 0 `Math.random`/`Date.now` dans les moteurs (moteur = autorité, jamais l'UI ni Momo).
5. **V4 = baseline immuable** : git diff de `src/` vs `main` = **5 fichiers neufs, 428 insertions, 0 modification existante**.

## 4. Inventaire des biens livrés

Dans la branche `kali/v5-gameplay-lab` :

- **Lab de recherche** (sandbox hors produit, 0 dépendance) : `lab/gameplay/`
  - `lib/engine-a.mjs` (Chaînes), `lib/engine-b.mjs` (Grille croisée + `validateSpec`/`replay`/`quickReject`)
  - `lib/solver.mjs` (minMoves budgeté, countSolutions avec dedupe, stats), `lib/metrics.mjs`, `lib/compare.mjs`
  - `lib/levels/a.mjs` (v1 + v2), `lib/levels/b.mjs` (10 niveaux), `lib/gen.mjs` (sonde MTH-001)
  - `reports/g0-report.md` (rapport G0 final, tables, verdicts, retest A-v2)
- **Rule Engine V5 produit** : `src/v5/rules/`
  - `engine.mjs` : `validateSpec` (fail-fast), `createSession`, `getMoves`, `apply`, `isSolved`, `getState`, `canonical`, `replay`, `quickReject` — module pur, zéro import, déterministe
  - `solver.mjs` : `certify(spec, opts)` → `{solvable, minMoves, solutions, budgeted}`
  - `index.mjs`, `playtest.mjs` (partie console humaine)
- **Adaptateur runtime** : `src/runtime/game-adapter-v5.js`
  - interface homonyme du GameAdapter V4 (`start`/`move`/`undo`/`restart`/`getState`/`subscribe`), commandes `PLACE {value,r,c}` normalisées, événements POJO via `makeEvent` (seam V4), GameState sérialisable, `getCommands()` pour l'UI.
- **Tests** : `tests/v5/rules.test.mjs` (9) · `tests/v5/game-adapter-v5.test.mjs` (6) · lab (17). Total `npm test` root = **37 fichiers / 37 pass** + playtest V4 + `npm run build` ✅.
- **Documents de gouvernance** : exploration §12.2 (contrat pressenti), `MATHIC-V5-CONTRACT-RULES-B.md` (formel OLD→PROBLEM→NEW→MIGRATION→TESTS), `MATHIC-V5-ARCHITECTURE.md` (greffe + définition GATE 2).

## 5. Mesures de référence (extraits du rapport G0)

| Métrique (niveaux résolvables) | A v1 | A v2 | B | V4 (baseline) |
|---|---|---|---|---|
| n solvables / total | 10/10 | 10/10 | 9/10 | — |
| branching moyen | 1,14 | 1,20 | **9,34** | 14,6 (qualitativement faible) |
| ratio décision | 0,22 | 0,24 | **0,75** | — |
| niveaux ≥ 2 solutions | 3/10 | 5/10 | **7/9** | — |
| trivial (hors warm-up) | 0 | 0 | 0 | niveaux dégénérés (MTH-001) |
| min/max minMoves | 1–2 | 1–3 | 4–∞ (b-07) | 0 possible (fallback) |

## 6. Évaluation par dimension de gameplay

| Dimension | État | Verdict |
|---|---|---|
| Règles (mécanique B) | Formalisées, motorisées, testées | ✅ Solide |
| Décision du joueur | Branching/décision/multiplicité mesurés, ≠ V4 | ✅ Rempli |
| Causalité / déterminisme | Moteur = autorité, 0 aléa (testé) | ✅ Rempli |
| Certification des niveaux | `certify` + `validateSpec` fail-fast | ✅ Rempli |
| Identité | Plus proche kenken/kakuro — vigilance notée, A différencié | ⚠️ Identité allégée |
| G0.1/G0.2 (compréhension, ressenti) | Jamais testé humain | ❌ À valider en GATE 2 |
| UI / rendu | Aucun écran, aucun bouton d'entrée V5 | ❌ Manquant (S3b) |
| Boucle de partie (score, progression, tutos) | Aucune | ❌ Manquant |
| Contenu | 10 niveaux-spec authored, générateur non câblé | ⚠️ Limitée |
| Intelligence (Momo L1–L5) | Contrat de hiérarchie seulement | ❌ Prévu |
| Mobile (Android/Capacitor) | Aucun ; K12 en attente de device | ❌ Prévu |

## 7. Comment reproduire les preuves

```bash
cd /home/kali/Documents/mathic
npm test                                        # 37/37 + playtest V4
npm run build                                   # build vite OK
node --test tests/v5/rules.test.mjs             # 9/9   (contrat moteur)
node --test tests/v5/game-adapter-v5.test.mjs   # 6/6   (couture runtime)
cd lab/gameplay && npm run lab                  # analyses A/B + sonde MTH-001
cd lab/gameplay && npm test                     # 17/17 (lab)
git diff main..HEAD -- src/                     # seulement additions pures
node src/v5/rules/playtest.mjs mixed2x2         # partie console humaine (GATE 2)
```

## 8. Risques et inconnues

1. **Ressenti humain jamais validé** (G0.1/G0.2) — unique inconnue de conception ; risque d'investir l'UI sur un gameplay non goûté → à fermer avant S3b (une partie de 20 s suffit).
2. **Contenu limité** : 10 niveaux figés ; le générateur certifié est la pièce manquante pour une progression.
3. **Comptages budgetés** sur grands niveaux B 3×3 (nodeBudget) : valeurs « ≥ n » marquées, jamais présentées comme exactes.
4. **Identité** : B joue dans un voisinage kenken/kakuro — à différencier davantage au design final (ordinateurs explicites, réserve centrale, événementiel).
5. **Mobile** : aucune mesure on-device (K12 sans appareil).

## 9. Feuille de route (ordre imposé par la gouvernance V5)

1. **Fermer GATE 2** : validation humaine au playtest ; puis S3b (UI minimale « Laboratoire », roue V4 intacte).
2. **Générateur certifié** + choix de progression (lots / paliers).
3. **Boucle session** (score, variantes, tutos) — ordre du blueprint PHASE 8.
4. **Momo L1–L5**, persistance, puis **mobile** (K12) — dans l'ordre de la mission, jamais UI-first.

---

*Posture : ce document décrit l'existant vérifiable (commit référencés, commandes reproductibles) ; aucune affirmation qui ne soit appuyée par une mesure ou un test listé ci-dessus.*