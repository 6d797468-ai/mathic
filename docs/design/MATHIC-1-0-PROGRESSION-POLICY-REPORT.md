# MATHIC 1.0 — Rapport de mandat : Progression Policy (MISSION 3)

**Référence** : Mandat MISSION 3 (G3-POLICY) · Méthode : `MATHIC-1-0-PROGRESSION-POLICY.md` · **Statut** : IMPLÉMENTÉ, TESTÉ, PROVEN — Gate G3-POLICY visé.

---

## 1. Objet

Transformer **Player Profile + Current Progression State + Candidate Levels +
Level Design Metadata + Difficulty Metadata + Policy Configuration** en une
**recommandation de progression déterministe et explicable**. La Policy
recommande, elle ne commande pas : aucune écriture GameState, aucun déblocage,
aucune sauvegarde, aucun modèle IA, aucun réseau. La fonction de décision est
pure et simulable sur des milliers de profils sans toucher au jeu.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Progression Policy | Code (ADD) | `src/intel/progression-policy.mjs` |
| Tests | Test (ADD) | `tests/intel/progression-policy.test.mjs` (PP-01 → PP-21 + corpus + garde-fous) |
| Conception | Doc (ADD) | `docs/design/MATHIC-1-0-PROGRESSION-POLICY.md` |
| Rapport de mandat | Doc (ADD) | `docs/design/MATHIC-1-0-PROGRESSION-POLICY-REPORT.md` |

**PRÉSERVE (intouché)** : `src/b1/kernel.mjs`, `engine.mjs`, `solver.mjs`,
`replay.mjs`, `levels.mjs`, `save.mjs`, `design.mjs`, `level-design.mjs`,
`src/v5/`, N1-N36, score, objectifs, GameState, runtime math,
`src/intel/contracts.mjs`, `src/intel/evidence.mjs`, `src/intel/profile.mjs`
(profil compatible MISSION 2, aucune révision de schéma). Vérifié par PP-21
(aucun fichier du Game Core ne référence la policy ; la policy n'importe rien du
Game Core — elle consomme les métadonnées en données, pas en dépendance).

## 3. IMPLEMENTED — `src/intel/progression-policy.mjs`

- **Mapping profile → rule (§8)** : `PROFILE_RULES` — 5 règles de décision
  documentées (arithmétique→COMBINATION/MASTERY, exploration→MULTI-PATH/
  DISCOVERY/CHOICE, stratégie→CHOICE/CONSEQUENCE, efficacité→OPTIMIZATION,
  chaîne→CHAIN). Grammaire réelle uniquement (`PROPERTY_VOCAB`, tokens de
  `level-design.mjs`) ; matching sur `properties` + `stage.name`. Trois
  modulateurs transversaux : `difficultyResponse` (bump), `hintDependency`
  (rampe douce), `retryTolerance` (bonus reprise). Aucune taxonomie parallèle.
- **Candidate filtering (§6, §18)** : `eligibility` — admissible ⟺ existant
  (catalogue candidat) ∧ certifié (métadonnées de design) ∧ débloqué
  (`progression.unlocked`). Rejets explicites `NOT_CERTIFIED` / `LOCKED`
  (`rejectedLevels`) ; ids inexistants ignorés comme non certifiés ; doublons et
  entrées invalides ignorés. Aucun bypass possible.
- **Confidence handling (§10)** : trois tiers portés par la configuration —
  `light` [0.35, 0.6) poids 0.25, `full` [0.6, 0.8) poids 0.5, `specific`
  ≥ 0.8 poids 0.6 ; < 0.35 → aucune adaptation (repli). Seuils configurables
  (`policyConfiguration`), aucun seuil enterré.
- **Score déterministe (§7)** : hiérarchie documentée — grammaire d'abord
  (règles × weight), puis bande de difficulté, puis proximité, puis bonus
  reprise ; tie-breakers déterministes. Choix de conception consigné : la
  proximité dominante rendait la différenciation par profil morte (front 0.7 >
  0.6 d'une règle) — la grammaire domine, la proximité est un garde-fou.
- **Stability mechanism (§11)** : hystérésis à deux flux de retour — `held`
  (dernière recommandation livrée) + `history` (candidats bruts précédents,
  sortie `candidateLevel`). HOLD tant que la série du candidat < fenêtre (3) ;
  BREAK une fois la fenêtre atteinte (sortie toujours possible) ; bascule
  immédiate si la branche tenue devient inadmissible ; aucune inertie quand
  rien ne change. Amortit les oscillations A/B/A sans enfermer le joueur.
- **Safe fallback (§9, §15)** : `SAFE_DEFAULT` automatique si profil absent /
  invalide / confiance < gradual / aucun candidat / mode configuré.
  Recommandation = premier admissible non terminé (progression Mathic normale).
  `policyConfidence = 0.5`, aligné sur la façade `deterministicDefaultPolicy`
  (G2). Le mode `SAFE_DEFAULT` est indépendant du profil : l'adaptation n'est
  jamais obligatoire.
- **Reason codes (§12)** : vocabulaire figé `REASON_CODES` (19 codes), chaque
  code référence une règle réellement exécutée ; `LOCKED`/`NOT_CERTIFIED` sont
  des motifs de rejet, jamais des raisons de recommandation. Sortie porteuse de
  `rankedLevels` (classement explicable) et `candidateLevel` (traçabilité de
  l'hystérésis).
- **Policy version (§12)** : `policyVersion = POLICY_VERSION` (contrat intel, = 1)
  + `policyMethod = "progression-rule-v1"`. Validateur de sortie
  `isProgressionRecommendation` (forme §12, recommandation ⊆ éligibles).
- **Aucune autorité (§13)** : fonctions pures uniquement ; aucune import du Game
  Core ; aucun `setGameState/apply/unlock/save` ; aucun réseau, LLM, DOM,
  `Date.now`, `Math.random` (prouvé par PP-19/PP-20 sur le code).

## 4. TESTED — `tests/intel/progression-policy.test.mjs` (27 tests)

Tests exécutés sur le **catalogue réel N1-N36** analysé par le Solver
(`analyzeAll`) et la forme de progression réelle de `save.mjs`. Aucun niveau
inventé.

| Test | Preuve |
| --- | --- |
| PP-01 | conf 0.45 → tier light, `LOW_CONFIDENCE_ADAPTATION`, pas de `HIGH_CONFIDENCE_SPECIFIC`, policyConfidence moyenne |
| PP-02 | conf 0.85 → tier `specific`, `HIGH_CONFIDENCE_SPECIFIC`, policyConfidence > 0.8 |
| PP-03 | profil exploration → `EXPLORATION_MATCH` exécuté, porté par le gagnant |
| PP-04 | fenêtre large : gagnant porte `STRATEGY_MATCH` et bat tout niveau sans grammaire stratégie (dominance §8) |
| PP-05 | profil efficacité → `EFFICIENCY_MATCH`, niveaux OPTIMIZATION classés |
| PP-06 | profil chaîne → `CHAIN_MATCH` exécuté, porté par le gagnant |
| PP-07 | `GRADUAL_RAMP` ; profils ne différant que par hint/difficulty → cibles grad < cibles bold |
| PP-08 | `DIFFICULTY_MATCH` → niveau le plus avancé recommandé (bump au-dessus du front) |
| PP-09 | profil contradictoire : déterministe, codes de grammaire ⊆ règles au-dessus du seuil |
| PP-10 | profil absent → `SAFE_DEFAULT`, `NO_PROFILE`, premier admissible non terminé, niveau réel |
| PP-11 | profils absents (null/undefined) → `NO_PROFILE` ; corrompus (10 formes) → `INVALID_PROFILE`, conf 0, jamais d'exception |
| PP-12 | N7-N36 tous rejetés `LOCKED`, jamais recommandés, `LOCKED` jamais reasonCode de recommandation |
| PP-13 | N999 jamais recommandé, rejeté `NOT_CERTIFIED` (aucune fabrication) |
| PP-14 | métadonnée N2 retirée → rejeté `NOT_CERTIFIED`, jamais recommandé |
| PP-15 | mêmes entrées → recommandation JSON identique ; le niveau ne dépend pas des métadonnées optionnelles |
| PP-16 | pour 5 profils : toute règle au-dessus du seuil et admissible est traçable, grammaire réelle du gagnant vérifiée, aucun code inventé |
| PP-17 | HOLD cycle 1-2, BREAK cycle 3 (fenêtre 3) ; retour amorti (HOLD) ; branche tenue perdue → bascule immédiate ; rien ne change → pas de HOLD |
| PP-18 | mode `SAFE_DEFAULT` : parcours linéaire indépendant du profil (5 profils), classement adaptatif vide |
| PP-19 | code source sans écriture GameState/save/stockage/random/temps (commentaires exclus) ; immutabilité des entrées vérifiée (progression, profil, métadonnées) |
| PP-20 | code source sans réseau/DOM/process/global/LLM/wllama/gguf/import dynamique |
| PP-21 | Game Core sans référence à la policy ; policy sans import du Game Core ; façade G2 (confiance 0.5, `deterministicDefaultPolicy`) cohérente ; config et vocabulaire vérifiés |
| Corpus §17 | 7 profils synthétiques → différenciation attendue (explorateur/stratege/efficace/chaîne portent leur code), gagnants tous admissibles, light conf amorti |
| Garde-fou §8 | pour 5 tailles de fenêtre : le front sans grammaire ne bat jamais un niveau CHAIN adéquat |
| Dégénéré | `{}`, progression malformée, entrées hétérogènes, held inadmissible → replis déterministes, jamais d'exception |
| Config | `SAFE_DEFAULT` configuré : autres seuils intacts ; adaptation jamais obligatoire |
| Version | `policyVersion = 1` (contrat) sur toute recommandation |

## 5. PROVEN

- **Déterminisme** : même profil + même progression + même catalogue + même
  version ⇒ même recommandation (PP-15, PP-09, corpus).
- **Zéro bypass** : toute recommandation ∈ éligibles = existant ∧ certifié ∧
  débloqué (PP-12/13/14, PP-21, `isProgressionRecommendation`).
- **Différenciation par profil** : corpus 7 profils, gagnants et codes distincts
  quand les règles le prévoient (PP-03/04/05/06, corpus).
- **Stabilité** : HOLD → BREAK après fenêtre, sortie de branche toujours
  possible, repli immédiat sur inadmissibilité (PP-17).
- **Frontière architecturale** : code sans écriture/réseau/IA (PP-19/PP-20),
  Game Core intact (PP-21).
- **Régression** : `npm test` 228/228 (baseline 201 + 27 policy) ;
  `npm run build` PASS.

## 6. NOT PROVEN (hors périmètre MISSION 3)

- **Pertinence pédagogique des règles §8** : les mappings profil → grammaire
  sont des règles de décision documentées, pas des vérités psychologiques ; leur
  valeur pédagogique réelle exige le playtest humain (G13).
- **Application réelle** : la Policy recommande, rien ne l'applique encore —
  c'est le rôle de l'Orchestrator (MISSION 4). Aucun effet sur le jeu en l'état.
- **Simulations à grande échelle** : la fonction est pure et simulable, mais
  aucune campagne de simulation massive (milliers de profils) n'a été exécutée
  dans cette mission.
- **Mageek** : aucun runtime, aucune personnalité, aucune génération de texte
  (mandat §19 — explicitement non implémenté ici).

## 7. Gate G3-POLICY — checklist

| Critère | Statut |
| --- | --- |
| Policy déterministe | ✅ PP-15, PP-09 |
| Recommandation explicable | ✅ reasonCodes traçables (PP-16), rankedLevels |
| Niveau uniquement admissible | ✅ PP-12/13/14, validateur de sortie |
| Aucun bypass | ✅ PP-12/13/14, PP-21 |
| Fallback sûr | ✅ PP-10/11/18, confiance 0.5 alignée G2 |
| Stabilité | ✅ PP-17 (fenêtre, sortie, repli immédiat) |
| Aucun accès GameState | ✅ PP-19 (code + immutabilité) |
| Aucune IA obligatoire | ✅ PP-18 (SAFE_DEFAULT indépendant du profil) |
| Aucun réseau | ✅ PP-20 |
| Tests complets | ✅ 27 tests, PP-01 → PP-21 + corpus + garde-fous |
| Build PASS | ✅ `npm run build` |
| Game Core intact | ✅ PP-21, PRÉSERVE |

---

**Verdict** : GO pour MISSION 4 (Progression Orchestrator). L'Orchestrator
consommera `recommend()` tel quel — il ne doit pas réimplémenter ces règles.
