# MATHIC 1.0 — Rapport final de Phase A (Design)

**Référence** : mandat §35 · **Date** : 2026-09-23 · **Statut** : DESIGN (à valider architecte). Ce rapport répond aux 20 questions de la Phase A après production des 16 contrats + traçabilité + statut.

---

## 1. Boucle de gameplay définitive proposée

```
OBJECTIF visible (target + maxMoves + ops autorisées)
  ↓
OBSERVER le board (nombres + opérateurs, tuiles)
  ↓
CHOISIR une opération parmi les tuiles disponibles
  ↓
CONSTRUIRE `a op b` (sélection de 2 nombres + 1 opérateur)
  ↓
ÉVALUER (kernel exact : r | null)
  ↓
TRANSFORMER (consomme 3 tuiles, résultat ancré sur l'opérande 1)
  ↓
(chaîne si le résultat est réutilisé ; combo si un trigger math ; score + récompense)
  ↓
VICTOIRE (target présent) | ÉCHEC (moveCount > maxMoves) | BLOQUÉ (plus de coup)
```
Une seule boucle, déterministe, sans IA nécessaire (BRIEF §1). Tout le reste (progression, Momo, télémétrie) observe cette boucle.

## 2. Partie qui vient du laboratoire V5

| Élément | Origine lab | Réutilisation |
|---|---|---|
| Sémantique opérateurs exacte (`+ − × ÷`, `/` entier, `b≠0`, null) | `oprel.mjs` / `engine-b` | Contrat A1, ré-attestation exigée |
| Solver BFS budgeté + canonical/visited | solver V5 (B) | Contrat A10 (même méthode, domaine différent) |
| `validateSpec` fail-fast + replay | engine-b | A9/A11 (validation de spec) |
| Métriques G0 (branching, decision, multi, dead-end, trivial, diversity) | g0-report | A12 (dimensions de difficulté) |
| Sonde anti-MTH-001 (génération naïve insolvable) | g0-report | A11 QUALITY + pipeline §14 BRIEF |
| Méthode de mesure G0 8/8 vs 6/8 | lab | ré-utilisée pour les gates G1/G2/G3 |

**CE QUI NE VIENT PAS du lab** : la mécanique de placement B (grid + lignes/colonnes à opérateurs fixes) — **rejetée pour le domaine produit** (voir §3), mais consignée comme résultat de recherche.

## 3. Partie nouvelle

- **Formula Engine** (choix nombre + opérateur, `a op b`, éval) — nouveau domaine `core/formula`.
- **Transformation** (consommation 3→1, ancrage) — `core/transformation`.
- **Chain / Combo / Score / Objectives** (dérivés purs, data-driven) — nouveaux.
- **Level = objet pur versionné** + `ruleVersion` (contrat d'interprétation) — nouveau.
- Pipeline contenu → certification → difficulté mesurée — nouveau.
- Momo (coach offline, faits solver) — nouveau. Progression/monde/étoiles — nouveau.
- Persistance (trace-checkpoint), télémétrie (local-first) — nouveau.
- **Décision de gameplay** : orientation « construction de formules » (choix de l'opérateur par le joueur), NTR L`opérateur fixe par ligne` du B — c'est le pivot consenti du BRIEF §1/§22.

## 4. Partie expérimentale (restée en EXP zone)

Réserve / next-preview / génération de tuiles · operator palette illimitée · contrainte de voisinage · placement libre du résultat · arborescences/parenthèses · calculs multi-opérandes · time-based combo/chrono · boosters (CALCULATRICE/DOUBLE/SWAP/FREEZE/REVERSE/MULTIPLIER) · opérateurs spéciaux (&times;2, ÷2, ², √, %, DOUBLE/COPY/SWAP/CHAIN/POWER) · règles avancées (operator rules) · objectifs expérimentaux (minScore/minChain/minCombo/multi) · forme de score additive-vs-multiplicative · pondération de difficulté · coefficients de combo. Tous EXCLUDUS du noyau tant que non validés par simulation + test humain (CONTAMINATION interdite, mandat §23).

## 5. Architecture proposée (domaines)

```
core/      formula · board · transformation · chain · combo · score · objectives · game-state
solver/    search · certification · difficulty · simulation · analysis
content/   levels · generators(encadrés) · validation
ai/momo    hints · policy · explanations (faits solver)
progression/ worlds · rewards · mastery
ui/        board · hud · animations(≠mécanique) · momo
persistence/ telemetry/ platform/android/
```
Séparations strictes : **MATHEMATICS ≠ GAMEPLAY ≠ UI ≠ AI ≠ PERSISTENCE ≠ TELEMETRY** (BRIEF §15). Le noyau ne connaît ni UI ni IA ni niveau ; le solver partage la sémantique du kernel, jamais une copie (§14 mandat).

## 6. Interfaces entre modules

- **Kernel → tout** : `apply(a,op,b)->r|null`, bornes, sérialisation (A1/§7bis). Seule autorité arithmétique.
- **Formula → Transformation** : `validate`+`eval` (A3) ; **Transformation** expose `applyTransformation(action,state)->state'` (A4).
- **Board/Transformation → dérivés** : chain/combo/score lisent **état + trace** (jamais mutés).
- **Solver ↔ moteur** : même sémantique (tables d'équivalence en test A10 §2) ; solver = lecture seule des specs niveau.
- **Momo ↔ Solver** : consomme sorties solver (`shortestSolution`, `alternatives`, `deadEnds`, `scoreEnvelope`, `apply`) ; chaque indice ↔ `solverFactId`.
- **Level (A9)** : objet pur, lu par runtime, solver, Momo, télémétrie (id/version/ruleVersion).
- Contrats d'interface en texte à chaque module (§A2–A16 « Contractuel »), codifiés ensuite en types.

## 7. Invariants non négociables

1. `state_before + action = state_after` — reproductible, atomique (A4).
2. Python API d'arithmétique fermée : entier exact, bornes, `null`/rejet — jamais NaN/Inf/float (A1).
3. Le kernel et le solver partagent la MÊME sémantique (jamais de copie divergenture) (A10 §2).
4. Sélection ≠ mutation de l'état ; seule une formule valide soumise consume (A2 §5).
5. Rejet d'action = aucune consommation (A3/A4) ; `moveCount` n'incrémente que sur transformation valide (A2 §2).
6. Dérivés (chain/combo/score) purs et recalculables depuis la trace (A5/A6/A7).
7. Niveau non certifié = pas de contenu production (A11).
8. `ruleVersion` versionné : aucun changement de règle n'altère silencieusement un niveau (A9 §4).
9. Momo n'écrit jamais dans l'état et ne produit que des faits solver vérifiables (A14).
10. La télémétrie n'impacte jamais le GameState (A16 — observateur pur).

## 8. Représentation d'une partie par le solver

Suite d'actions `[a₀ op₀ b₀, a₁ op₁ b₁, …]` (A3 §7) + états intermédiaires hashés + `(depth, chainLen, combo)` pour l'enveloppe. Vue = graphe orienté de (état, action), avec : `solvable`, `shortest`, `alternatives`, `decisionPoints`, `branching`, `deadEnds`, `scoreEnvelope`, `comboOpportunities`. Chaque résultat porte son niveau de certitude (exact | borné) (A10 §4, §6 ; A12 §2).

## 9. Comment on certifie un niveau

Pipeline A11 (DESIGN → MATH VALIDATION → SOLVER → DIFFICULTY → STRATEGY [domination/trivialité/profondeur] → QUALITY [anti-farm, clarté] → HUMAN TEST (G7) → CERTIFIED), verdicts PROVEN/BLOCKED/NO-GO par étape, rapport immuable, **re-certification à chaque changement de version**.

## 10. Comment on mesure la difficulté

8 dimensions mesurées par le solver (branching, decisionDensity, solutionDepth, constraintDensity, operationDiversity, deadEnds, alternatives, optimizationDifficulty) → `difficultyScore` à **pondération data calibrée** → classes Easy..Master par **plages mesurées** (A12 §4,§5). Contrainte dure : plage du monde respectée (A11 §2 → rejet hors-plage). Détection des pièges (dead ends injustes, couloirs, bruit opératoire) — jamais « ce niveau a l'air dur ».

## 11. Détection des stratégies dominantes

A12 §6 + A11 STRATEGY + A7 §6 : mesure par opérateur de la part de l'optimum (≥90 % sur un opérateur → **domination**), test « farm » sur les combos/cycles, et QUALITY d'A11. La réponse est toujours **data** (changement de coefficients/composition des boards), jamais « forcer un opérateur » dans la solution.

## 12. Comment fonctionne le score

Composants optionnels (`base`, `complexity`, `chain`, `combo`, `efficiency`, `objective`) × coefficients data par niveau (A7) ; mise à l'échelle combo après coup ; agrégation additive (défaut d'étude) ou multiplicative (variable testée en A12) ; `totalScore` archivé, rejouable pour battre son record. Aucun coefficient n'est définitif sans simulation + humain.

## 13. Chain / combo

- **Chaîne** : transformations consécutives où le résultat de la N devient opérande de la N+1 (A5 §1–3). Maintenue/cassée/mesurée en pure fonction de la trace. Rejet ≠ coupure.
- **Combo** : multiplicateur déclenché par événements mathématiques (REUSE/TARGET/EFFICIENCY/DIVERSITY/CLOSURE), plafonné, jamais décoratif, anti-cycles (A6).

## 14. Progression

Mondes (W1–W10, unités cognitives, opérateurs introduits pédagogiquement) → niveaux ordonnés par classe de difficulté → étoiles 1–3 adossées à l'enveloppe solver → déblocages (monde/opérateur) par cumul d'étoiles → maîtrise par opérateur (calculee depuis la trace) qui module l'aide de Momo. Pas d'économie, pas de verrouillage par la maîtrise (A13).

## 15. Rôle exact de Momo

Coach local offline : observe l'état autoritaire, consomme les faits du solver, délivre L1–L5 en fonction du profil/maîtrise/nb d'erreurs, vérifiable (`solverFactId`), jamais écrit dans l'état, jamais « LA solution » immédiate, pas nécessaire pour jouer (A14).

## 16. Fonctionnalités explicitement hors 1.0

PvP · chat · clans · marketplace · NFT/blockchain · économie/boosters payants · backend obligatoire · réseau requis pour jouer · IA distante/LLM · opérateurs spéciaux / règles avancées (Baba-like) · objectifs minScore/minChain/minCombo/multi (tant qu'expérimentaux) · time-based combo · daily/events · cloud/sauvegarde multi-appareils · palettes illimitées (EXP) · modes endless.

## 17. Risques architecturaux ouverts

1. **Opérateurs-tuiles consommés** (D-B1) → rareté pourrait frustrer (le joueur construit une chaîne mais n'a plus de `×`). Mitigation : contenu pré-calculé par solver (slack) + certification ; comportement humain à mesurer G7. Variante palette = EXP prête.
2. **Rejet ≠ coupure** (D-C1) → peut affaiblir la perception du « coût ». Mesure en playtest.
3. **Ancrage résultat sur l'opérande 1** (D-T1) → prévisibilité vs placement libre ; perçu ? à jauger humainement.
4. **Score additive-vs-multiplicative** : la forme impacte profondément la progression ; arbitrage différé → G4 reporté après A12.
5. **Pondération de difficulté** : sans dataset de calibration, la classe Easy..Master est instable → la certification 1.0 n'attribue de classe que sur un corpus calibré.
6. **Complexité combinatoire du solver** (board 6×6, 4 ops, 15 coups) → bornes supérieures requis ; risque de « trop coûteux » sur petites suites de niveaux → stratégie de budget + re-spec.
7. **Sauvegarde de reprise = trace** : si plateau très long, trace grosse → bornage (snapshot compressé périodique en variante si nécessaire, jamais au détriment du déterministe).
8. **`blocked ≠ failed`** (D-O1) : le « plus de coup valide » est-il frustrant ? Soit un dead end « propre » (choix) soit une confusion (échec) → test humain.

## 18. Tests nécessaires (découlent des contrats)

- **Noyau** : tables d'équivalence opérateurs, bornes ±, anti-NaN/Inf/lève-jamais, replay 100×, sérialisation roundtrip, validateSpec (A1 §9).
- **Jeu** : board-rect/tiles/selection/canonique; formula-reject (état intact); transformation-invariant/atomic/replay; chain maintain/casse/recalc; combo triggers+cycle-excluded+bound; score zero/reconfig/multiplicative-vs-additive; objectives win/fail/blocked/no-side-effect.
- **Solver** : solvable/shortest/envelope/alternatives ; équivalence solver↔moteur (par niveau) ; deadends ; cache; determinism.
- **Contenu** : cert-pipeline (étapes+verdicts), level-version-migrate, no-cert-no-publish, diff-metrics + plage-monde, domination/trivialité/profondeur.
- **IA** : momo-no-write, hint↔solverFactId, policy selon profil, offline (zero réseau).
- **Produit** : persist-cycle/migrate/corrupt/offline; resume-replay/desync; telemetry-schema/local/opt-in/no-ps.
- **Gates humains** : métriques de compréhension G7 (§19 BRIEF), tableau §17, test domination dataset.

## 19. Gates concernés

G0 (kernel) → G1 (core board/formula/transformation) → G2 (choix multi-chemins) → G3 (chain/combo) → G4 (score/objectifs validés) → G5 (content/slice) → G6 (solver/certification/difficulté) → **G7 (human gameplay — le gate dominant)** → GAMEPLAY FREEZE → G8 (UI/UX) → G9 (Momo) → G10 (mobile/device) → G11 (persistance/télémétrie/stabilité) → G12 (RC → 1.0).

## 20. Ce qui peut être implémenté sans risque de dérive

**À l'identique des contrats (fondation, aucune gameplay-dépendance)** :
- A1 Math Kernel (`core/formula/kernel`) + tests (G0) ;
- A3 Formula validé (`core/formula`, encapsulé sur kernel) + tests ;
- A9 niveau « objet pur » + validation de spec (fail-fast) (`core/content`) + tests ;
- A2 en partie structurelle (grille/cellules/tuiles typées + invariants) — **sans** encore brancher la politique opérateurs-tuiles tant que D-B1 n'est pas validé ;
- A10 en partie (BFS budgeté + enveloppe de base) comme module indépendant, sous contrat sémantique.

**À N'implémenter qu'après revue/validation** : D-B1 (opérateurs-tuiles), D-T1 (ancrage), D-T2 (consommation), A5/A6/A7 (dérivés), A8 (objectifs validés), toute UI, la pipeline certification complète, Momo, la progression.

---

**Conclusion** : la Phase A livre une architecture cohérente, tracée et sans dette d'invention : les seules incertitudes sont déclarées (D-*, EXP-*, pondérations, forme de score) et appartiennent à l'Experimental Zone ou à des décisions « proposées » clairement opposables. Aucune n'est masquée. **La validation architecturale est requise avant design-freeze (§36).**