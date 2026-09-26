# MATHIC 1.0 — Progression Policy (MISSION 3)

**Référence** : Mandat MISSION 3 (G3-POLICY) · **Dépend de** : Player Profile (Brique 3, `src/intel/profile.mjs`), Level Design Grammar (`src/b1/level-design.mjs`), Progression (`src/b1/save.mjs`, forme `{ unlocked, completed }`) · **Produit par** : `src/intel/progression-policy.mjs` · **Consommé par** : Progression Orchestrator (MISSION 4) · **Statut** : IMPLÉMENTÉ (méthode v1, déterministe).

---

## 1. Principe

```text
PLAYER PROFILE (détecté)                PLAYER INTELLIGENCE — c'est la Policy
       ↓                                        ↓ (décision, fonction pure)
PROGRESSION POLICY                                 ↓
       ↓                                  RECOMMENDATION (déclarative, sans autorité)
PROGRESSION RECOMMENDATION
```

La Policy répond à **une seule question** :

> Parmi les niveaux actuellement admissibles, quels parcours sont compatibles avec le profil comportemental du joueur ?

Elle ne lance pas de niveau, ne modifie pas le GameState, ne débloque rien, ne
sauvegarde rien, n'appelle aucun modèle. Le mode d'action est décrit au §12.

## 2. Entrées (`recommend(inputs)`)

| Entrée | Forme | Source réelle |
| --- | --- | --- |
| `profile` | PlayerProfile (schéma v2, `contracts.mjs`) ou `null` | Brique 3 |
| `progression` | `{ unlocked: LevelId[], completed: Record<LevelId, {wins,...}> }` | `save.mjs` (forme exacte) |
| `candidates` | catalogue de niveaux : `"N22"` ou `{ id, ... }` | niveaux réellement existants (N1-N36) |
| `metadata` | `Record<LevelId, analyse level-design>` (`properties`, `stage`, `facts`) | `analyzeLevel`/`analyzeAll` |
| `difficulty` | optionnel, `Record<LevelId, { index }>` | métadonnées de difficulté |
| `config` | `policyConfiguration(overrides)` | appelant |
| `held` / `history` | flux de retour d'hystérésis (§9) | sortie `recommendedLevel` / `candidateLevel` des appels précédents |

Aucun niveau n'est inventé : un id absent des métadonnées est **non certifié**
et donc inadmissible (§7).

## 3. Sortie (forme contractuelle §12 du mandat)

```json
{
  "policyVersion": 1,
  "policyMethod": "progression-rule-v1",
  "mode": "ADAPTIVE",
  "recommendedLevel": "N13",
  "candidateLevel": "N14",
  "reasonCodes": ["HIGH_CONFIDENCE_SPECIFIC", "STRATEGY_MATCH", "DIFFICULTY_IN_BAND"],
  "profileConfidence": 0.85,
  "policyConfidence": 0.85375,
  "stability": { "windowSize": 3, "held": false },
  "rankedLevels": [{ "id": "N14", "score": 1.4, "distance": 1, "codes": ["STRATEGY_MATCH", "DIFFICULTY_IN_BAND"] }],
  "eligibleLevels": ["N1", "..."],
  "rejectedLevels": [{ "id": "N7", "reason": "LOCKED" }]
}
```

- `recommendedLevel` : la recommandation livrée (après hystérésis éventuelle) ;
- `candidateLevel` : le gagnant brut du classement **avant** hystérésis — c'est
  le flux de retour que l'appelant réinjecte dans `history` ;
- `reasonCodes` : chaque code référence une règle **réellement exécutée** (§6, §8) ;
- `rankedLevels` : classement complet, explicable niveau par niveau.

## 4. Configuration (`policyConfiguration`)

Tous les seuils sont **portés par la configuration** (aucun seuil enterré) :

```js
{
  mode: "ADAPTIVE",              // "ADAPTIVE" | "SAFE_DEFAULT" — l'adaptation n'est jamais obligatoire
  confidence: { gradual: 0.35, adaptive: 0.6, specific: 0.8 },
  ruleMatchThreshold: 0.6,       // dimension ≥ seuil → règle profil activée
  ruleWeight: 0.5,               // grammaire : tier "full"
  lightWeight: 0.25,             // grammaire : tier "light"
  specificWeight: 0.6,           // grammaire : tier "specific"
  proximityWeight: 0.4,          // proximité de la cible de progression
  reach: { bump: 1, drop: 1 },   // pas de difficulté (difficultyResponse / hintDependency)
  difficultyBand: 1,             // ± bande autour de la difficulté cible
  difficultyBandWeight: 0.3,
  retryBonusWeight: 0.25,        // tolérance à la reprise → contenu plus dur acceptable
  stabilityWindow: 3,            // hystérésis (§9)
}
```

## 5. Éligibilité — jamais de bypass (mandat §6, §18)

Un niveau n'est **admissible** que si les trois conditions tiennent :

1. **existant** : présent dans le catalogue candidat (aucune fabrication) ;
2. **certifié** : des métadonnées de design existent pour lui (`metadata[id]`) ;
3. **admissible + débloqué** : présent dans `progression.unlocked` (règles de
   progression existantes, `save.mjs`).

Tout candidat qui échoue est **rejeté explicitement** (`rejectedLevels`) :

- sans métadonnées → `NOT_CERTIFIED` (inclut tout niveau inexistant : la Policy
  ne certifie rien qu'elle ne connaît) ;
- non débloqué → `LOCKED`.

La Policy **ne fabrique jamais de bypass** : aucune recommandation ne peut sortir
du périmètre de l'éligibilité (`isProgressionRecommendation` le vérifie).

## 6. Règles profil → grammaire (mandat §7, §8)

Les règles utilisent **exclusivement** la grammaire existante (tokens réels de
`level-design.mjs`, vocabulaire `PROPERTY_VOCAB` ; aucune taxonomie parallèle).
Ce sont des **règles de décision** documentées, pas des vérités psychologiques :

| Dimension (≥ 0.6) | Grammaire visée | Code | Justification |
| --- | --- | --- | --- |
| `arithmetic` | COMBINATION, MASTERY | `ARITHMETIC_MATCH` | aisance aux opérations exactes → contenus multi-étapes et de synthèse, où plusieurs opérateurs doivent être combinés |
| `exploration` | MULTI-PATH, DISCOVERY, CHOICE | `EXPLORATION_MATCH` | essaie plusieurs formules → chemins multiples et découverte |
| `strategy` | CHOICE, CONSEQUENCE | `STRATEGY_MATCH` | planifie → choix dont les conséquences sont lisibles |
| `efficiency` | OPTIMIZATION | `EFFICIENCY_MATCH` | routes au meilleur score → optimisation explicite |
| `chainAffinity` | CHAIN | `CHAIN_MATCH` | protège les chaînes → contenus chaînés |

Deux modulateurs transversaux (issus du même schéma profil, sans nouvelle
taxonomie) :

- `difficultyResponse` ≥ 0.6 → cible de progression décalée **au-dessus** du
  front (`DIFFICULTY_MATCH`) : réponse constructive à la difficulté ;
- `hintDependency` ≥ 0.6 → cible décalée **en-dessous** (`GRADUAL_RAMP`) :
  progression plus graduelle, rampe douce ;
- `retryTolerance` ≥ 0.6 → bonus aux niveaux situés au-dessus de la cible
  (`RETRY_MATCH`) : la reprise est acceptée.

Le matching grammaire examine `properties` du niveau **et** son `stage.name`.

## 7. Score déterministe

Hiérarchie documentée — **la grammaire domine**, la proximité et la bande de
difficulté sont des garde-fous secondaires (jamais l'inverse) :

```text
score(niveau) = règles_exécutées × weight          ← grammaire (§6)
              + bonus bande de difficulté          ← difficulté[lang].index proche de (front + reach)
              + proximité × proximityWeight        ← clamp01(1 − |distance| / span)
              + bonus reprise (RETRY_MATCH)        ← au-dessus de la cible, retryTolerant
```

`weight` dépend du tier de confiance (§8). Tie-breakers déterministes :
distance absolue croissante, puis ordre du catalogue.

**Choix de conception** : avec la proximité en facteur dominant, le front de
progression gagnait toujours (0.7 de proximité contre 0.6 pour une règle) et la
différenciation par profil était morte. La grammaire d'abord garantit que le
mandat §8 est effectif : le meilleur niveau grammaticalement adéquat bat toujours
le front « générique ».

## 8. Confiance — trois tiers (mandat §10)

| Tier | Condition | Effet |
| --- | --- | --- |
| `light` | gradual (0.35) ≤ conf < adaptive (0.6) | adaptation faible : poids de règle réduit (0.25), `LOW_CONFIDENCE_ADAPTATION` |
| `full` | adaptive (0.6) ≤ conf < specific (0.8) | adaptation normale (poids 0.5) |
| `specific` | conf ≥ specific (0.8) | adaptation spécifique : poids renforcé (0.6), `HIGH_CONFIDENCE_SPECIFIC` |

En dessous du seuil `gradual` : **pas d'adaptation du tout** (repli §10).

## 9. Stabilité / hystérésis (mandat §11)

Mécanisme simple et testable, à deux flux de retour fournis par l'appelant :

- `held` : dernier niveau **recommandé** livré (branche actuelle) ;
- `history` : niveaux **candidats** bruts précédents (`candidateLevel`), du plus
  récent au plus ancien.

```text
candidat === held                        → recommandation inchangée (pas de code)
held inadmissible (verrou perdu, retrait) → bascule immédiate STABILITY_BREAK
série consécutive du candidat
  (préfixe de history + évaluation courante) ≥ stabilityWindow
                                         → changement confirmé STABILITY_BREAK
sinon                                    → STABILITY_HOLD : held reste recommandé
```

La sortie de branche est toujours possible : une fois la fenêtre de stabilité
atteinte, le changement est confirmé — l'hystérésis amortit les oscillations
(A/B/A/B), elle n'enferme jamais le joueur dans une branche.

## 10. Repli sûr — `SAFE_DEFAULT` (mandat §9, §15)

Bascule automatique vers le repli si : profil absent, profil invalide ou
corrompu, `confidence < gradual`, mode `SAFE_DEFAULT` configuré, ou **aucun
candidat**. Comportement : recommander le **premier niveau admissible non encore
terminé** (ordre du catalogue) — la progression actuelle de Mathic continue
normalement ; catalogue terminé → reprise au premier admissible.

Codes : `SAFE_DEFAULT_PROGRESSION` + `NO_PROFILE` / `INVALID_PROFILE` /
`LOW_CONFIDENCE_ADAPTATION` selon la cause. `policyConfidence = 0.5`, aligné sur
la façade `deterministicDefaultPolicy` du contrat intel (G2). Le mode
`SAFE_DEFAULT` configuré produit un parcours **indépendant du profil** :
l'adaptation n'est jamais obligatoire.

## 11. Reason codes (mandat §12, §16)

Vocabulaire figé (`REASON_CODES`), chaque code référence une règle réelle :
`NO_PROFILE`, `INVALID_PROFILE`, `LOW_CONFIDENCE_ADAPTATION`,
`HIGH_CONFIDENCE_SPECIFIC`, `SAFE_DEFAULT_PROGRESSION`, `STABILITY_HOLD`,
`STABILITY_BREAK`, `NO_CANDIDATES`, `ARITHMETIC_MATCH`, `EXPLORATION_MATCH`,
`STRATEGY_MATCH`, `EFFICIENCY_MATCH`, `CHAIN_MATCH`, `GRADUAL_RAMP`,
`DIFFICULTY_MATCH`, `RETRY_MATCH`, `DIFFICULTY_IN_BAND` (+ motifs de rejet
`NOT_CERTIFIED`, `LOCKED` portés par `rejectedLevels`).

`LOCKED` / `NOT_CERTIFIED` sont des **motifs de rejet** : ils n'apparaissent
jamais comme raison d'une recommandation.

## 12. Ce que la Policy n'est pas (mandat §13)

Le module n'expose que des fonctions pures (`eligibility`, `recommend`,
`policyConfiguration`, `isProgressionRecommendation`) et des constantes. Il
n'importe rien du Game Core, ne possède aucun accès à `setGameState`, `apply`,
`unlock`, `save`, aucun réseau, aucun LLM, aucun Mageek runtime. La
**recommandation** est un objet déclaratif : son application relève de
l'Orchestrator (MISSION 4), qui ne doit pas réimplémenter ces règles.

---

**D-GP1** — aucune recommandation hors éligibilité (pas de bypass).
**D-GP2** — profil absent ou douteux ⇒ progression normale, jamais bloquée.
**D-GP3** — même version + mêmes entrées ⇒ même recommandation.
**D-GP4** — chaque `reasonCode` référence une règle réellement exécutée. Opposables.
