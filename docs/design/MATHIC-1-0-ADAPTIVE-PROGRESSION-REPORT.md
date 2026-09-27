# MATHIC 1.0 — Rapport de mandat : Progressive Adaptation Adaptive (MISSION 6)

**Référence** : Mandat MISSION 6 (G6-ADAPTIVE) · Méthode : `MATHIC-1-0-ADAPTIVE-PROGRESSION.md` · **Statut** : IMPLÉMENTÉ, TESTÉ, PROVEN — Gate G6-ADAPTIVE visé.

---

## 1. Objet

Prouver que le profil détecté **réellement** (depuis les Evidence du vrai
moteur — adaptateur M5, jamais une prédiction) entraîne une progression
Mathic **DIFFÉRENTE**, **PERTINENTE** et **DÉTERMINISTE**, sur plusieurs
profils de comportement et plusieurs trajectoires complètes du catalogue
réel N1-N36.

Preuve livrée : 8 tests AP (AP-01 → AP-08) + simulateur standalone
`scripts/simulate-adaptive-progression.mjs` avec **verdict fatal** (violation
de légalité ou de déterminisme ⇒ code de sortie 1).

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Montage expérimental (bots self-play réels) | Code (ADD) | `src/intel/adaptive-experiment.mjs` |
| Simulateur + verdict G6-ADAPTIVE | Script (ADD) | `scripts/simulate-adaptive-progression.mjs` |
| Tests | Test (ADD) | `tests/intel/adaptive-progression.test.mjs` (AP-01 → AP-08) |
| Conception | Doc (ADD) | `docs/design/MATHIC-1-0-ADAPTIVE-PROGRESSION.md` |
| Rapport de mandat | Doc (ADD) | `docs/design/MATHIC-1-0-ADAPTIVE-PROGRESSION-REPORT.md` |

**PRÉSERVE (intouché)** : `src/b1/` (moteur, LADDER, save), `src/v5/`, briques
intel M1-M4, adaptateur M5. **Correction locale** : `runtime.mjs` `undo()`
(rejouer une trace de ≥ 1 action échouait sur `const nxt` — réaffectation
interdite ; le bug était latent, non couvert par RT-12 qui n'undoait qu'avec une
trace vide).

## 3. IMPLEMENTED — observable réelle (seed 20261007, 7 niveaux, fenêtre 8)

### 3.1 Trajectoires réellement jouées (action de l'Orchestrator réel)

| Étape | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `arithm` | N1·SD | N2·SD | N3·SD | N4·SD | N5·SD | N6·APPLIED | N14·NO_OP |
| `explorer` | N1·SD | N2·APPLIED | N10·NO_OP | N11·APPLIED | N10·NO_OP | N11·APPLIED | N10·APPLIED |
| `chain` | N1·SD | N2·SD | N3·SD | N4·SD | N5·APPLIED | N13·NO_OP | N14·APPLIED |

SD = `SAFE_DEFAULT` (aucune écriture, kill-switch réel). Divergence en niveaux :
**arithm vs explorer 5/7**, **explorer vs chain 5/7**, arithm vs chain 1/7 ;
`STABILITY_HOLD` puis `STABILITY_BREAK` réels (explorer, tours 3-7).

### 3.2 Profils détectés réels (fin de run)

| Stratégie | arithmetic | exploration | strategy | efficiency | chainAffinity | retryTol | conf | état |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `arithm` | 0.50 | 0.30 | 0.62 | 0.55 | 0.56 | 0 | 0.525 | SUFFICIENT |
| `explorer` | 0.39 | **0.45** | 0.57 | 0.50 | 0.69 | 0 | 0.75 | HIGH |
| `chain` | 0.51 | **0.00** | 0.68 | 0.63 | 0.65 | 0.85 | 0.75 | HIGH |

Δmax = **0.45 sur exploration** (explorer vs chain) ; `chain` pousse réellement
`retryTolerance` (restarts réels). Profils **réellement distincts**.

### 3.3 Grammaires réellement atteintes

- `arithm` atteint **COMBINATION** (N14 atteint, raisonCodes DIFFICULTY_MATCH /
  STRATEGY_MATCH) — cible arithmétique réellement servie dès qu'elle existe ;
- `chain` atteint **CHAIN** (N13-N14, raisonCodes CHAIN_MATCH émis réellement) ;
- `explorer` oscille sur N10-N11 en émettant CHAIN_MATCH + STABILITY_*.

## 4. Observables critiques vérifiés (AP-xx)

| # | Propriété | Résultat |
| --- | --- | --- |
| AP-01 | DÉTERMINISME — rejeu même seed ⇒ byte-à-byte identique | ✅ |
| AP-02 | ADMISSIBILITÉ — niveaux réels + débloqués dans la save | ✅ |
| AP-03 | DIFFÉRENCIATION — divergence ≥ 3/7 et Δmax ≥ 0.4 | ✅ |
| AP-04 | SÉCURITÉ — SAFE_DEFAULT/REJECTED ⇒ `stateChanged:false` | ✅ |
| AP-05 | AUTHENTICITÉ — Evidence réelles, LOW→HIGH (montée prudente) | ✅ |
| AP-06 | PERTINENCE — grammaire atteinte dès qu'elle existe dans l'offre | ✅ |
| AP-07 | MICRO — `playLevelOnce` rejouable, ACTION_COMMITTED réels | ✅ |
| AP-08 | CONTRAT — forme versionnée du montage | ✅ |

Robustesse : les 5 critères mesurés (Δmax=0.45, div 5/5/7, arithm→COMBINATION)
sont **identiques sur les seeds 1, 7, 42, 20261007, 999, 123456**.

## 5. Découverte d'offre réelle (à documenter pour le contenu)

| Propriété | Offre réelle (catalogue N1-N36) |
| --- | --- |
| COMBINATION | Aucune avant N13 — l'adaptation arithmétique n'est observable qu'avec une fenêtre débloquée ≥ N13 |
| MASTERY | Aucun niveau (offre nulle) — cible de grammaire sans contenu aujourd'hui |

Le verdict de pertinence est donc **conditionnel à l'offre** : grammaire
présente dans l'offre débloquée ⇒ doit être atteinte ; sinon absence documentée
(non fatale). Proposition de contenu future : enrichir la grammaire COMBINATION /
MASTERY dans le premier tiers du LADDER pour rendre l'adaptation arithmétique
perceptible plus tôt.

## 6. Bugs découverts et corrigés en cours de mission

| Bug | Impact | Correctif |
| --- | --- | --- |
| `runtime.mjs` `undo()` — `const nxt` réaffecté (`TypeError`) dès qu'une trace de ≥ 1 action est rejouée | crash réel sur undo après plusieurs coups | `const` → `let` (rejouer via vrai moteur) |

## 7. Limites documentées

- Les bots sont des heuristiques de sélection — pas un modèle de joueur humain ;
- `window` (taille de la fenêtre débloquée) est un paramètre du montage : la
  différenciation n'est observable que si l'offre contient des candidats de
  grammaire différente ;
- L'acheminement réel reste à valider sur l'UI (VS5) — hors périmètre M6.