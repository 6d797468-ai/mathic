# MATHIC 1.0 — Rapport de mandat : Player Profile Detection (Brique 3, MISSION 2)

**Référence** : Feuille de route MATHIC 1.0 §5.B, §6, §7 · Méthode : `MATHIC-1-0-PLAYER-PROFILE-DETECTION.md` · **Statut** : IMPLÉMENTÉ, TESTÉ, PROVEN — Gate G2-PROFILE visé.

---

## 1. Objet

Transformer une séquence de **Player Evidence validées** (Brique 2) en un **profil
comportemental dynamique, explicable, versionné et reproductible**. Le détecteur
est **déterministe, rule-based, indépendant de tout modèle** — aucun ML/LLM.
Il ne modifie jamais le gameplay.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Détecteur de profil | Code (ADD) | `src/intel/profile.mjs` |
| Tests | Test (ADD) | `tests/intel/profile.test.mjs` (P-01 → P-17 + 8 tests par dimension) |
| Conception | Doc (ADD) | `docs/design/MATHIC-1-0-PLAYER-PROFILE-DETECTION.md` |
| Rapport de mandat | Doc (ADD) | `docs/design/MATHIC-1-0-PLAYER-PROFILE-DETECTION-REPORT.md` |
| Révision contrat profil v1→v2 | Code + Doc | `src/intel/contracts.mjs`, `tests/intel/contracts.test.mjs`, `docs/design/MATHIC-1-0-PLAYER-PROFILE-CONTRACT.md` |

**PRÉSERVE (intouché)** : Kernel, Engine, Solver, Replay, Levels, Save,
`src/v5/`, N1-N36, score, progression, runtime. `contracts.mjs`/`evidence.mjs`
révisés **uniquement** pour la migration de schéma profil documentée (ci-dessous).

## 3. IMPLEMENTED — `src/intel/profile.mjs`

- **Consommation exclusive Evidence** : seule l'entrée Evidence (validée) nourrit
  le détecteur. Aucun DOM, aucune variable privée du runtime, aucun GameState.
- **Fenêtre** : moyenne à décroissance géométrique `weighted-recent-window-v1`
  (`decay = (windowSize−1)/windowSize`, défaut 20 → 0.95) ; mémoire bornée ;
  deux accumulateurs par dimension ; `evidenceWindow` = compteur d'évidences
  validées.
- **Règles v1** : table `DETECTION_RULES` — chaque type d'évidence pousse une ou
  plusieurs dimensions avec un signal ∈ [0,1] (coefficients/fonctions documentés
  dans la doc de conception §3.2). Les types dérivés ne déplacent aucune
  dimension.
- **Confiance** : `volume × couverture`, bornée [0,1] ; états `NO EVIDENCE /
  LOW EVIDENCE / SUFFICIENT EVIDENCE / HIGH CONFIDENCE` (seuils exportés :
  10 / 30 / 0.75). Vide ⇒ confiance 0, dimensions neutres — **absence ≠ faiblesse**.
- **Dynamique** : profil jamais figé ; le comportement récent domine.
- **Explications** : `explanations` par dimension touchée = `delta` + types
  d'évidence réels + compteur.
- **Fail-safe** : évidence absente/invalide/corrompue ou `previous` de version
  inconnue ⇒ profil sûr par défaut ; le jeu continue ; aucune capacité d'écriture
  (`update/profile/state/window/config` seulement).
- **Reproductibilité** : fonction pure `detectProfile` === accumulation
  incrémentale `createProfileDetector` ; aucune dépendance à Date.now / random /
  ordre des propriétés / DOM / réseau / LLM.
- **Nommage** : module `Player Profile Detector`, Mageek reste un personnage
  produit (separé).

## 4. TESTED — `tests/intel/profile.test.mjs`

| Test | Preuve |
| --- | --- |
| P-01 | profil vide → NO EVIDENCE, dims neutres 0, confidence 0 |
| P-02 | 1 évidence → fenêtre 1, LOW EVIDENCE, seules les dims touchées bougent |
| P-03 | fenêtre suffisante → SUFFICIENT EVIDENCE ; couverture complète → HIGH CONFIDENCE |
| P-04 | accumulation : incrémental == rejeu pur, fenêtre croissante |
| P-05 | évolution dynamique : phases A/B → profils différents, dimension recente qui monte |
| P-06 | comportement contradictoire : coexistence bornée < 1, 1 erreur ⇒ exploration ∈ (0,0.5) |
| P-07 | grand volume : toutes dimensions strictement dans ]0,1[ |
| P-08 | confidence ∈ [0,1], non décroissante, 0 à vide, confiance haute atteinte |
| P-09 | reproductibilité JSON identique ; incrémental == pur ; rejeu différé identique |
| P-10 | fenêtre déterministe : comportement récent dominant (moyenne pondérée ≠ uniforme) |
| P-11 | données interdites rejetées, jamais reflétées, profil sûr, sortie sans champ sensible |
| P-12 | corruption : profil identique au flux pur, compteurs accepted/rejected |
| P-13 | version de schéma : v2 active, version ancienne rejetée (migration), delta complet |
| P-14 | frontière : zéro import Game Core, zéro accès DOM/runtime, Game Core ne référence pas intel |
| P-15 | fail-safe : entrées absentes/corrompues ⇒ profil sûr ; config aberrante ⇒ repli défaut |
| P-16 | aucune mutation des évidence / GameState ; aucune capacité d'écriture |
| P-17 | **intégration réelle** : Engine réel → Evidence réelle (N7 + N13) → profil valide |
| DIM ×8 | un test directionnel par dimension (arithmetic, exploration, strategy, efficiency, chainAffinity, hintDependency, retryTolerance, difficultyResponse) |

Suite complète **201/201** (176 hérités + 15 Ev + 25 Profile), durée < 16 s.

## 5. PROVEN

- **Intégration réelle** (P-17) : des parties Engine réelles (N7 victoire chaînée,
  N13 chaîne rompue) produisent de la vraie Evidence via `createEvidenceRecorder`
  qui alimente le détecteur → profil valide, toutes évidence consommées.
- **Déterminisme** (P-04, P-09, P-10) : incrémental ≡ rejeu, rejeu différé
  identique, fenêtre pondérée effective.
- **Bornage** (P-06, P-07, P-08) : dimensions et confiance dans [0,1],
  pas de domination d'une seule évidence.
- **Fail-safe** (P-01, P-11, P-12, P-15) : absence ≠ faiblesse ; corruption sans
  effet ; le jeu n'est jamais bloqué.
- **Frontière** (P-14) : observateur pur, gamme déterministe, Game Core intact.

## 6. NOT PROVEN / HORS PÉRIMÈTRE (explicite)

- **Gameplay non impacté** : le détecteur n'est pas encore câblé dans le runtime
  (aucun consommateur `profile.mjs` dans `src/b1/web/`). La mission s'arrête à
  `EVIDENCE → PROFILE` (mandat §18/§22). Le profit est consommable tel quel.
- **Persistance du profil / journal** : hors périmètre (Phase suivante).
- **`comprehension`** : délibérément non ajouté (voir §7) — non prouvé, différé.
- **Provider IA / LLM / réseau** : interdits, non touchés.
- **Signification psychologique** : aucune — le profil évalue le comportement
  dans Mathic, pas l'humain.

## 7. Migration de schéma — réponse aux mandats §5, §6

### 7.1 Compréhension (mandat §5)

Le contrat actuel (avant MISSION 2) ne contenait `comprehension` ni comme
dimension ni comme évidence émise. La préparation Brique 2 proposait de
l'« ajouter à la Détection v2 ». **Résolution** : la liste v1 du mandat MISSION 2
n'inclut pas `comprehension` — il reste **hors** schéma, **aucune extension
silencieuse** ; inclusion future = révision explicite v3. Doc mise à jour.

### 7.2 Vocabulaire canonique des dimensions (mandat §4/§7)

`PROFILE_SCHEMA_VERSION 1 → 2` : `arithmeticAffinity/explorationTendency/
strategyTendency/efficiencyTendency` → `arithmetic/exploration/strategy/
efficiency` (même sémantique, même nombre). Révision visible et testée
(INTEL-C2/C6/C7/C8, P-13).

### 7.3 Nommage (mandat §6)

Module = **Player Profile Detector** ; Mageek = personnage produit, séparé de
l'architecture. Aucun nom de modèle nulle part.

## 8. Réponses aux questions du mandat (§19)

| Question | Réponse |
| --- | --- |
| Quelle dimension est dérivée de quelles Evidence ? | Table `DETECTION_RULES` documentée (§3.2 de la doc de conception) et gelée dans `src/intel/profile.mjs` (P-14 en atteste la stabilité). |
| Quelle confiance est attribuée ? | `confidence = volume(10→30) × couverture(8 dims)` ; 0 à vide ; états NO/LOW/SUFFICIENT/HIGH (P-08, §3.3). |
| Quelle fenêtre est utilisée ? | `weighted recent window` à décroissance géométrique, `windowSize` 20, `decay = 0.95`, mémoire bornée, versionnée (`method`), reproductible (P-10). |
| Quelle version du détecteur est active ? | `DETECTOR_VERSION = 1` ; méthode `"weighted-recent-window-v1"` ; schéma profil `PROFILE_SCHEMA_VERSION = 2`. |

## 9. Gate G2-PROFILE — bilan

| Condition | Bilan |
| --- | --- |
| Évidence réelles utilisables | ✅ P-17 (Engine → Evidence → Profile) |
| Profil déterministe | ✅ P-04/P-09/P-10 |
| Profil dynamique | ✅ P-05 |
| Dimensions explicables | ✅ `explanations` traçables (P-02, P-17, §3.5) |
| Valeurs bornées | ✅ P-06/P-07/P-08 |
| Confiance explicite | ✅ P-08, états §3.3 |
| Versionnage | ✅ v2 (P-13, INTEL-C2/C6-C8) |
| Fallback | ✅ P-01/P-15 |
| Aucune donnée interdite | ✅ P-11, sortie conforme `PROFILE_DIMENSIONS` |
| Aucun accès direct GameState | ✅ P-14/P-16 |
| Game Core intact | ✅ INTEL-C22, P-14, build |
| npm test PASS | ✅ 201/201 |
| Build PASS | ✅ `npm run build` → 35 modules, PASS |

## 10. Compilation finale

```
npm test       → 201/201 PASS
npm run build  → PASS (vite)
Git            → commit unique + push (sans force) sur kali/v5-gameplay-lab
commit message → feat(intel): implement player profile detection
```