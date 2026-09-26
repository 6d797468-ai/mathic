# MATHIC 1.0 — Player Profile Detection (Brique 3, MISSION 2)

**Référence** : Feuille de route MATHIC 1.0 §5.B, §6, §7 · **Consomme** : Player Evidence (Brique 2, `src/intel/evidence.mjs` + contrat `EVIDENCE_TYPES`) · **Produit** : Player Profile (contrat `MATHIC-1-0-PLAYER-PROFILE-CONTRACT.md`, schéma v2) · **Méthode** : `DETECTION_METHOD = "weighted-recent-window-v1"` · **Version détecteur** : `DETECTOR_VERSION = 1` · **Statut** : IMPLÉMENTÉ (rapport de mandat séparé).

---

## 1. Position architecturale

```text
GAMEPLAY ─► PLAYER EVIDENCE ─► PLAYER PROFILE DETECTOR ─► PLAYER PROFILE
            (Brique 2)          (Brique 3, ce module)      (schéma v2)
```

- **Consommateur exclusif de l'interface Evidence** : le détecteur ne lit jamais
  le DOM, jamais les variables privées du runtime, jamais le GameState.
- **Observateur pur** : aucune capacité d'écriture sur l'état de jeu, le score ou
  les niveaux (`INTEL-PROHIBITION-001/004`).
- **Mageek reste un personnage produit** : le module technique s'appelle
  *Player Profile Detector* (`src/intel/profile.mjs`), pas `MageekDetector`.

## 2. Profil produit (schéma v2)

```json
{
  "version": 2,
  "dimensions": {
    "arithmetic": 0.72,        // objectif atteint, score de transformation
    "exploration": 0.61,       // chemins/previews/undos tentés
    "strategy": 0.74,          // planification (préview, chaînes intentionnelles)
    "efficiency": 0.43,        // routes au meilleur score, chaos dans les réutilisations
    "chainAffinity": 0.31,     // usage et protection des chaînes
    "hintDependency": 0.18,    // dépendance aux indices
    "retryTolerance": 0.66,    // acceptation de la reprise
    "difficultyResponse": 0.59 // réaction constructive à la difficulté
  },
  "confidence": 0.71,
  "evidenceWindow": 12
}
```

Chaque dimension ∈ [0,1], `confidence` ∈ [0,1], `evidenceWindow ≥ 0`, `version = PROFILE_SCHEMA_VERSION (2)`.

### 2.1 Révision du schéma v1 → v2 (explicite)

`PROFILE_SCHEMA_VERSION = 2`. Les libellés Brique 1 `arithmeticAffinity`,
`explorationTendency`, `strategyTendency`, `efficiencyTendency` deviennent
`arithmetic`, `exploration`, `strategy`, `efficiency` — vocabulaire canonique du
mandat MISSION 2 §4/§7. Même nombre de dimensions, même sémantique, aucune
donnée supplémentaire. Toute sauvegarde en version 1 est rejetée par le schéma
courant (migration demandée).

### 2.2 `comprehension` — décision documentée (mandat §5)

La roadmap précédente proposait `comprehension` (dimension). **Décision** : il
reste **hors** schéma v2 — la liste v1 du mandat ne l'inclut pas. Pas d'ajout
silencieux ; toute inclusion future est une révision explicite du contrat
(migration v2 → v3 documentée et testée).

## 3. Méthode v1 — déterminisme, règles, explicabilité

### 3.1 Fenêtre (mandat §12)

**weighted recent window à décroissance géométrique** :

```text
decay = (windowSize − 1) / windowSize      (défaut windowSize = 20 → decay = 0.95)
```

Chaque évidence validée applique `acc *= decay` puis ajoute son signal à deux
accumulateurs par dimension (poids, somme). Estimation = `somme / poids`.
La plus récente évidence a le poids maximal ; les plus anciennes s'estompent.
Mémoire bornée (2 accumulateurs par dimension), incrémental, déterministe,
versionné, reproductible : le rejeu depuis zéro (`detectProfile`) est
**strictement identique** à l'accumulation incrémentale (`createProfileDetector`).

- `evidenceWindow` = nombre total d'évidences **validées** consommées.
- Une évidence invalide est rejetée (n'altère ni la fenêtre ni le profil).
- Les types dérivés (`TIME_TO_*`, `SOLUTION_*`, `RETRY_COUNT`) comptent dans la
  fenêtre mais ne déplacent aucune dimension (règle v1).

### 3.2 Règles de signal (mandat §10) — coefficients documentés

Chaque type d'évidence pousse les dimensions listées avec un signal ∈ [0,1]
(constante ou fait mesuré du payload validé) :

| Évidence | arithmetic | exploration | strategy | efficiency | chainAffinity | hintDependency | retryTolerance | difficultyResponse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `LEVEL_STARTED` | – | – | – | – | – | – | – | – |
| `LEVEL_RESTARTED` | – | – | – | – | – | – | 0.85 | 0.5 |
| `LEVEL_COMPLETED` | 0.6 + 0.005·score* | 0.6 / – | 0.55 | 0.85 si `movesLeft>0` sinon 0.4 | – | – | – | 0.6 |
| `LEVEL_FAILED` | 0.2 | 0.3 | – | 0.2 | – | – | – | 0.7 |
| `LEVEL_ABANDONED` | 0.25 | – | 0.3 | – | – | – | – | 0.3 |
| `ACTION_PREVIEWED` | – | 0.6 / 0.3 si `chainRun≥1` | 0.3 / 0.8 si `chainRun≥1` | – | – | – | – | – |
| `ACTION_COMMITTED` | 0.5 | – | 0.4 / 0.8 si `chainRun≥1` | 0.4 / 0.85 si `chainRun≥1` | 0.15 / 0.9 si `chainRun≥1` | – | – | – |
| `ACTION_INVALID` | – | 0.35 | – | 0.3 | – | – | – | 0.8 |
| `UNDO_USED` | – | 0.6 | 0.3 | 0.25 | – | – | – | – |
| `CHAIN_STARTED` | – | – | 0.9 | 0.7 | 0.95 | – | – | – |
| `CHAIN_BROKEN` | – | 0.5 | 0.25 | – | 0.3 | – | – | – |
| `HINT_REQUESTED` | – | – | 0.2 | – | – | 0.85 | – | 0.4 |
| `HINT_USED` | – | – | – | 0.3 | – | 0.95 | – | – |

\* `arithmetic` à la victoire = `clamp01(0.6 + 0.005 × score final)`.

**Seuils** (documentés, exportés) :

```text
SUFFICIENT_EVIDENCE_MIN = 10   // état SUFFICIENT EVIDENCE (fenêtre ≥ 10)
HIGH_CONFIDENCE_MIN     = 30   // volume de confiance maximal
HIGH_CONFIDENCE_THRESHOLD = 0.75  // état HIGH CONFIDENCE
```

### 3.3 Confiance (mandat §9)

```text
confidence = volume × couverture
volume      = clamp01((window − 10) / (30 − 10))     // 0 sous 10 év., 1 à 30+
couverture  = nb de dimensions ayant ≥ 1 signal / 8  // l'évidence doit toucher le profil
confidence  = 0          si aucune évidence (NO EVIDENCE)
```

États : `NO EVIDENCE` → `LOW EVIDENCE` → `SUFFICIENT EVIDENCE` → `HIGH CONFIDENCE`.

**Absence d'information ≠ comportement faible** : sans évidence, toutes les
dimensions restent **neutres à 0** avec `confidence = 0` — jamais un verdict de
faiblesse. Un profil à faible confiance ne bloque jamais le jeu (repli policy).

### 3.4 Pas de domination (mandat §13)

Les signaux étant bornés [0,1] et moyennés par la fenêtre, **aucun événement
unique ne peut zéroriser ni saturer une dimension**. Une erreur isolée produit
`exploration ∈ (0, 0.5)`, jamais 0. Aucune décision binaire.

### 3.5 Explication (mandat §11)

Chaque `update`/`detectProfile` renvoie `explanations` : pour chaque dimension
touchée par le lot, la variation `delta` (profil avant → après) et les **types
d'évidence réels** qui l'ont provoquée (avec compteur) :

```json
{ "dimension": "exploration", "delta": 0.08,
  "evidence": ["ACTION_INVALID", "ACTION_PREVIEWED"], "evidenceCount": 4 }
```

Toute explication est traçable jusqu'à des évidence réelles.

## 4. Dynamique et fail-safe (mandats §8, §17)

- Les profils évoluent continûment : `Evidence 1..N → profil v1 → nouvelles
  évidence → profil v2 → …`. Le comportement récent domine la moyenne.
- Entrées absentes, corrompues ou de version inconnue ⇒ **profil sûr par défaut**,
  confiance faible, jeu **jamais bloqué** (P-01, P-11, P-12, P-15).

## 5. Reproductibilité (mandat §15)

```text
same evidence + same detector version + same configuration = same profile
```

Aucune dépendance à `Date.now()` (horloge absente du module), `Math.random()`,
à l'ordre des propriétés JavaScript (itération figée sur les dimensions), DOM,
réseau ou LLM. Prouvé par P-09 (JSON identique, incrémental == rejeu, rejeu
différé identique).

## 6. API

```js
import { createProfileDetector, detectProfile } from "../src/intel/profile.mjs";

// Incrémental (fenêtre bornée, état interne) :
const det = createProfileDetector();               // config : windowSize 20
const r   = det.update(evidenceBatch);             // → { profile, state, delta, explanations, accepted, rejected, … }
det.profile(); det.state(); det.window(); det.config();

// Pur (rejeu) — doit être identique à la somme des updates :
const r2 = detectProfile(allEvidence, { previous }); // previous optionnel, utilisé pour `delta`
```

## 7. Frontières

- **PRÉSERVE** : Kernel, Engine, Solver, Replay, Levels, Save, `src/v5/`,
  N1-N36, score, progression, runtime ; `contracts.mjs` et `evidence.mjs`
  (sauf révision de contrat documentée).
- **INTERDIT ici** : Orchestrator, Coach, Mageek runtime, GGUF, LLM, réseau,
  backend. Mission strictement `EVIDENCE → PROFILE`.
- `profile.mjs` n'importe que le plan de contrat (`./contracts.mjs`) ; le Game
  Core n'importe jamais l'intelligence.

**D-PD1** — le profil décrit le comportement observé dans Mathic, jamais la personne. **D-PD2** — déterminisme, versionnage et explicabilité sont des exigences de la méthode, pas des options. **D-PD3** — l'absence d'information ne produit jamais un jugement de faiblesse. Opposables.