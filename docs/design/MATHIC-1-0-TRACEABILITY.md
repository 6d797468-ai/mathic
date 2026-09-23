# MATHIC 1.0 — Traçabilité (exigences → contrat → module → test → preuve → gate)

**Référence** : mandat §21 · **Statut** : DESIGN (à valider) · Chaque exigence du BRIEF est rattachée à sa chaîne de preuve. Module = domaine cible (architecture §15/§3), Test = suite de vérification prévue, Preuve = artefact/rapport attendu, Gate = porte d'industrialisation concernée.

Légende gates (BRIEF §16 et roadmap) : G0=Intégrité math · G1=Gameplay Core · G2=Choix stratégique · G3=Chaîne/Combo · G4=Scoring · G5=Content · G6=Solver · **G7=Human Gameplay** · G8=UX · G9=AI · G10=Mobile · G11=Stability · G12=RC.

---

## A. Noyau & règles (fondation)

| # | Exigence BRIEF | Contrat | Module (impl) | Tests | Preuve | Gate |
|---|---|---|---|---|---|---|
| R1 | Opérations exactes `+ − × ÷`, `/` entier, `b≠0` (BRIEF §11) | A1 | `core/formula/kernel` | kernel-tabEquiv, kernel-anti (NaN/Infinity/undefined/lève-jamais) | rapport kernel (A1 §9) | G0 |
| R2 | Bornes entières, pas de flottant, anti-`0.1+0.2` (BRIEF §11) | A1 §2,§5 | `core/formula/kernel` | kernel-bornes (±1 au-delà → null) | — | G0 |
| R3 | Sérialisation canonique & replay déterministe (BRIEF §22) | A1 §6,§7bis | `core/formula/kernel` (+runtime) | kernel-replay (100× idem), serial-roundtrip | — | G0/G1 |
| R4 | Fail-fast : spec invalide, `opérateur inconnu` (BRIEF §7,§14) | A1 §7 | `core/content/validation` | validateSpec (table de violations) | — | G0 |
| R5 | Le kernel ne connaît ni UI ni niveau ni joueur (BRIEF §11, mandat §2) | A1 §10 | `core/formula/kernel` | kernel-anti (aucune importUI/deps) | revue module | G0 |

## B. Plateau & action

| # | Exigence BRIEF | Contrat | Module | Tests | Preuve | Gate |
|---|---|---|---|---|---|---|
| R6 | Plateau nombres+opérateurs, sélection, occupation (BRIEF §2) | A2 | `core/board` | board-rect, board-tiles, board-selection, board-canonique | — | G1 |
| R7 | Pas de RNG en partie, déterminisme (mandat §2, BRIEF §11) | A2 §3 | `core/board` | board-determinism | — | G0/G1 |
| R8 | Formule = token+éval déterministe, longueur fixe (BRIEF §11) | A3 | `core/formula` | formula-token, formula-eval, formula-canonical, formula-dedup-solver | — | G1 |
| R9 | Rejet ≠ échec, aucune tuile consommée (BRIEF §22) | A3/A4 | `core/formula`+`core/transformation` | formula-reject (état inchangé, moveCount stable) | — | G1/G3 |
| R10 | `state_before + action = state_after`, reproductible (mandat §8) | A4 | `core/transformation` | transformation-invariant, transformation-atomic, replay-build | — | G1 |

## C. Chaîne / Combo / Score / Objectifs

| # | Exigence BRIEF | Contrat | Module | Tests | Preuve | Gate |
|---|---|---|---|---|---|---|
| R11 | Chaîne = dépendance de résultats, propriété gameplay (BRIEF §3) | A5 | `core/chain` | chain-detect (maintenir/casser), chain-recalc-undo | — | G3 |
| R12 | Combo à cause mathématique, configurable, anti-farm (BRIEF §3) | A6 | `core/combo` | combo-trigger (chaque cause), combo-cycle-excluded, combo-bound | — | G3 |
| R13 | Score = composants × coefficients, data-driver, non définitif (BRIEF §4, mandate §11) | A7 | `core/score` | score-components, score-zero, score-reconfig (data→moteur intact) | calibrage (sim+humain) | G4 |
| R14 | Objectifs validés (target/maxMoves/ops) vs expérimentaux (BRIEF §6) | A8 | `core/objectives` | objective-eval, objective-blocked, maxMoves-fail | — | G1/G² |
| R15 | Victoire/échec/bloqué purs (mandat §4) | A8 §3 | `core/objectives`+`core/game-state` | obj-win, obj-fail, obj-blocked≠failed, no-side-effect | — | G1 |

## D. Contenu & solver

| # | Exigence BRIEF | Contrat | Module | Tests | Preuve | Gate |
|---|---|---|---|---|---|---|
| R16 | Niveau = équation de contraintes versionnable (BRIEF §6, mandate §13) | A9 | `core/content` | level-validate, level-version-migrate, level-ruleVersion-guard | — | G5 |
| R17 | Solver : solvabilité, count, shortest, alternatives, enveloppe (BRIEF §12) | A10 | `solver/` | solver-solvable, solver-shortest, solver-envelope, solver-cache | rapport A10 | G6 |
| R18 | Même sémantique que le moteur, jamais une copie (mandat §14) | A10 §2 | `solver/` | solver-vs-engine (table d'équivalence par niveau) | — | G6 |
| R19 | Certification pipeline, niveau non certifié = non-prod (BRIEF §14, mandate §15) | A11 | `solver/certification` | cert-pipeline (étapes), cert-verdicts, cert-no-cert-no-publish | rapport A11 par niveau | G6/G7 |
| R20 | Difficulté mesurée (8 dims), pondération calibrée (BRIEF §13, mandat §16) | A12 | `solver/difficulty` | diff-metrics, diff-class-range, diff-deadends, diff-dominance | calibration corpus | G6 |
| R21 | Tests domination/trivialité/profondeur (mandat §25–27) | A11/A12 | `solver/analysis` | test-domination, test-trivial, test-depth | — | G6 |

## E. IA — Momo

| # | Exigence BRIEF | Contrat | Module | Tests | Preuve | Gate |
|---|---|---|---|---|---|---|
| R22 | Momo coach, jamais autorité math, jamais écrit dans GameState (BRIEF §9, mandat §18) | A14 | `ai/momo` | momo-no-write, momo-fact-verifiable (chaque hint ↔ solverFactId) | — | G9 |
| R23 | Indices L1–L5 mesurés, pas LA solution d'emblée (BRIEF §9) | A14 §3 | `ai/momo` | momo-policy (L selon profil), momo-reliance-decline | échantillon G7/playtest | G9 |
| R24 | Fonctionne hors ligne, pas d'IA distante (BRIEF §20) | A14 §5 | `ai/momo` | momo-offline (aucune dsp réseau) | — | G9 |

## F. Produit & opérations

| # | Exigence BRIEF | Contrat | Module | Tests | Preuve | Gate |
|---|---|---|---|---|---|---|
| R25 | Mondes/étoiles/déblocages, pas d'économie 1.0 (BRIEF §5,§8, mandate §17) | A13 | `progression/` | prog-stars (adossés enveloppe), prog-unlock-range, prog-replay-motivation | — | G4/G8 |
| R26 | Maîtrise par opérateur, pèse sur l'aide pas le verrouillage (BRIEF §8) | A13 §3 | `progression/mastery` | mastery-calc, mastery-no-lock | — | G9 |
| R27 | Persistance locale, versionnée, offline, corrupt sûre (BRIEF §20, mandate §19) | A15 | `persistence/` | persist-cycle, persist-migrate, persist-corrupt, persist-offline | — | G10/G11 |
| R28 | Reprise = replay de trace déterminisme (mandat §19) | A15 §4 | `persistence/` | resume-replay, resume-desync-report | — | G10 |
| R29 | Télémétrie événements normés, local-first, opt-in (BRIEF §17, mandate §20) | A16 | `telemetry/` | telemetry-schema, telemetry-local, telemetry-opt-in, telemetry-no-ps | — | G11 |

---

## G. Fonctions transverses

| # | Exigence | Rattachements | Preuve | Gate |
|---|---|---|---|---|
| T1 | « multiple chemins → conséquences ≠ » (BRIEF §0, mandate §24) | A2 (choix), A3 (multi-routes), A4 (coûts), A5 (chaîne), A7 (score) | tests domaine (board+formula+solver multi-solutions), playtest G7 | G2 |
| T2 | Anti-stratégie dominante (mandat §25, BRIEF §17) | A12 §6, A11 QUALITY, A7 §6 | cert-dominance dataset | G6 |
| T3 | Test de compréhension = gate humain (G7, BRIEF §19) | A11 HUMAN, A13, tableau §17 | rapport G7 (test décisif 5 phrases §19) | G7 |
| T4 | Gameplay Freeze post-G7 (BRIEF §16, mandate §29) | tous les contrats (gèle) | décision G7 → zone d'ajout bloquée | G7+ |
| T5 | Slice 20 niveaux / 5 catégories | A9, A11, A13, pipeline §14 | rapport slice (20 certifiés, échantillon playtesté) | G2–G7 |
| T6 | Test d'exclusivité (BRIEF §0) | pitch + démo joueur | retour non-équipe (5 phrases) | G7 |

**Règle d'usage** : toute fonctionnalité NON listée est soit une **erreur** à supprimer, soit une **extension** à déclarer (jamais silencieuse). Toute fonctionnalité listée sans gate de sortie = bloquée à la validation.