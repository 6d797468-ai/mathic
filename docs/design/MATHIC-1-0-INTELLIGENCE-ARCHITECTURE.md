# MATHIC 1.0 — Intelligence Architecture (frontière)

**Référence** : Feuille de route MATHIC 1.0 §1, §3, §24 · **Statut** : CONTRAT (socle Brique 1, opposable).

Ce document fige la **frontière architecturale** avant toute écriture d'intelligence : le plan d'intelligence joueur (Evidence / Profile / Policy / Orchestrator / Coach / Adapter / Providers) est séparé du Game Core, et **aucune IA n'atteint directement l'état de jeu**.

---

## 1. Chemin de dépendance obligatoire (jeu)

```text
GAME FACTS
   ↓
PLAYER EVIDENCE
   ↓
PROFILE
   ↓
POLICY
   ↓
PROGRESSION DECISION
   ↓
LEVEL SELECTION
```

## 2. Chemin de dépendance obligatoire (pédagogie)

```text
PLAYER CONTEXT
   ↓
COACH
   ↓
PEDAGOGICAL RECOMMENDATION
```

## 3. Chemin de dépendance obligatoire (IA optionnelle)

```text
AI MODEL
   ↓
INTERPRETATION / RECOMMENDATION
   ↓
VALIDATION
   ↓
SYSTEM POLICY
```

## 4. Jamais

```text
AI → GameState
AI → level obligatoire
AI → score
AI → modification arbitraire du plateau
```

Quatre interdictions codées dans `INTEL_PROHIBITIONS` (`src/intel/contracts.mjs`) et vérifiées par `validateProhibitionCompliance`.

## 5. Vue d'ensemble (cible E6)

```text
                          ┌───────────────────────┐
                          │      PLAYER           │
                          └──────────┬────────────┘
                                     │
                         observable actions
                                     │
                                     ▼
                    ┌───────────────────────────────┐
                    │     PLAYER EVIDENCE           │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │ PLAYER PROFILE DETECTOR       │
                    │ dynamic / explainable         │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │   PROGRESSION ORCHESTRATOR    │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │      PROGRESSION POLICY       │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │     DETERMINISTIC LEVEL       │
                    │           SYSTEM              │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │ SELECTED LEVEL   │
                         └──────────────────┘

PLAYER ───────────────► COACH
                         │
                         ▼
                 pedagogical assistance
                         │
                         ▼
                   MODEL ADAPTER
                         │
              ┌──────────┼───────────┐
              ▼          ▼           ▼
          LOCAL       CLOUD       FUTURE
           MODEL      MODEL      PROVIDER

             CORE GAME AUTHORITY
        ┌───────────────────────────┐
        │ Kernel / Engine / Solver  │
        │ Replay / Rules / State    │
        └───────────────────────────┘

              AUCUNE IA DIRECTE
                    ↓
                GameState
```

## 6. Le socle gelé (intouchable par l'intelligence)

Math Kernel · règles mathématiques · Solver · Replay · score B2 · invariants · N1-N36 · Level Design Grammar · PREVIEW/APPLY · `INVALID = NO STATE CHANGE`.

L'intelligence s'empile **au-dessus** ; elle n'y touche pas. Le Game Core ne référence aucun module d'intelligence (l'inverse est interdit : pas d'inversion de dépendance).

## 7. Contrats livrés dans cette brique

| Contrat | Doc | Module |
|---|---|---|
| Player Evidence | `MATHIC-1-0-EVIDENCE-CONTRACT.md` | `src/intel/contracts.mjs` (EVIDENCE_TYPES, validateEvidence) |
| Player Profile | `MATHIC-1-0-PLAYER-PROFILE-CONTRACT.md` | `defaultProfile`, isProfileShape, validateProfile |
| Intelligence Provider | `MATHIC-1-0-INTELLIGENCE-PROVIDER-CONTRACT.md` | PROVIDER_METHODS, isIntelligenceProvider, isRecommendation |
| Progression Policy | `MATHIC-1-0-PROGRESSION-POLICY-CONTRACT.md` | deterministicDefaultPolicy, isProgressionDecision |
| Coach | `MATHIC-1-0-COACH-CONTRACT.md` | COACH_METHODS, isCoach, validateCoach |
| Frontière | ce document | INTEL_PROHIBITIONS, hasWriteCapability |

## 8. Règle de non-régression

Toute brique suivante (détection, orchestration, coach, provider, adapter) doit :

1. laisser le Game Core **inchangé** (diff `src/` Game Core vide sauf `src/intel/`) ;
2. passer par les garde-fous du plan de contrat (`validateEvidence`, `validateProfile`, `isRecommendation`, `isProgressionDecision`, `validateCoach`) ;
3. rester **déterministe** sur les règles critiques du jeu ;
4. fonctionner **sans aucun provider** (DETERMINISTIC DEFAULT POLICY).

---

**D-ARC1** — l'intelligence est une couche posée sur le noyau, jamais greffée dedans. **D-ARC2** — l'IA est une optimisation, jamais une dépendance critique. **D-ARC3** — frontière objectivement testable (pas d'import Game Core dans `src/intel/`, pas de capacité d'écriture). Opposables.