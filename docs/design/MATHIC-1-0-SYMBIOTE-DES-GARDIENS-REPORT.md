# MATHIC 1.0 — Rapport de mandat : Symbiote des Gardiens (MISSION 16)

**Référence** : MISSION 16 — `SYMBIOTE DES GARDIENS` · Architecture : `MATHIC-1-0-SYMBIOTE-DES-GARDIENS.md`  
**Statut** : IMPLÉMENTÉ, TESTÉ, VÉRIFIÉ, PROUVÉ (E5 logique + E6 navigateur). Publication : `00bf921` (seam M15) et `17b34ae` (M16) poussés sur `origin/kali/v5-gameplay-lab`. Restant hors périmètre prouvé : APK Android (non exécuté).  
**Baseline** : M15 = `e9e1efa` · **Suite de tests** : 419 PASS (0 FAIL, 0 SKIPPED).  
**Audit indépendant (2026-09-25)** : exécution de contrôle `npm test` 419/419 PASS, `npm run build` et `npm run build:atelier` OK, `git diff --check` CLEAN. Risques relevés : R-01 commit (P1, **fermé** : commits publiés), R-02 surqualification E6 du présent rapport (P2, **corrigée**), R-03 sémantique budget du backtracker (P2, **fermée en M16.x** : `composeGuardianSpecEx` expose le tri-état `SOLVED / UNSOLVABLE_PROVEN / SEARCH_BUDGET_EXCEEDED` — arbre épuisé = preuve, budget atteint = absence de preuve ; tests SYM-18..20), R-04 libellé SYM-16 (P2, **corrigé** dans le test : la garantie de non-triche est architecturale, pas une encapsulation JS de `session.spec`).
**Preuve E6 (2026-09-25, Chrome 153 headless, vrai DOM + vrai localStorage)** : scénario complet compose → play → solved → seal → fragments → reload exécuté sur `dist-atelier` — **18/18 assertions PASS, 0 erreur console**, 5 fragments restaurés depuis `mathic.knowledge.v1` après reload sans doublon. Harnais versionné : `lab/e6-browser-proof.mjs` (CDP brut, zéro dépendance) ; artefacts : `lab/e6-evidence/` (captures + `e6-result.json`). La preuve E6 a **détecté une régression réelle invisible des tests unitaires** — le badge Résonance n'était pas rafraîchi après forge/résolution — corrigée dans `atelier.js` (`updateResonance()` après `SYMBIOTE_COMPOSED` et `CHALLENGE_COMPLETED`), non-régression re-vérifiée 419/419.

---

## 1. Synthèse des Preuves par Nomenclature Officielle

- **PROUVÉ** (vérifié formellement par assertions machine et analyse source) :
  - **M16-01** (Composition) : composition de Gardiens produisant une `SessionSpec` valide et certifiée (SYM-01, SYM-15).
  - **M16-02** (Validation par contrat) : rejets stricts par `validateSymbiote` pour toute composition invalide, jamais par l'UI (SYM-02).
  - **M16-03** (Déterminisme) : $F(B, G) = F(B, G)$ et $S_1 \equiv S_2$ sur sessions indépendantes (SYM-03, SYM-14).
  - **M16-04** (Isolation) : non-mutation de `baseSpec` et non-mutation de `SessionState` (SYM-04, SYM-13).
  - **M16-05** (Invariance Moteur) : lois V5 (`+`, `-`, `*`, `/`) strictement inchangées, rejets intacts (SYM-05).
  - **M16-06** (Replay) : `ReplayController` de M13 rejoue, recule, annule et résout sur une session composée (SYM-06).
  - **M16-07** (Oculus) : fidélité absolue des diagnostics d'erreur et des raisons observables (SYM-07).
  - **M16-08** (Mémoire du Savoir) : le Symbiote alimente `mathic.knowledge.v1` sans toucher la sauvegarde de progression (SYM-08, SYM-10).
  - **M16-09** (Persistance et déduplication) : rechargement sans doublons, robustesse aux corruptions (SYM-09, preuve headless).
  - **M16-10** (Non-régression & Pureté) : suite complète 419 PASS, 0 violation de pureté, zéro I/O illicite (SYM-12).
- **OBSERVÉ** :
  - Intégration UI en direct dans l'Atelier Astral : toggles Gardiens, calcul de résonance dynamique, génération et injection immédiate dans la grille de jeu.
  - Sceau M12 généré depuis une session Symbiote et re-vérifié avec succès (SYM-17).
  - Déblocage automatique en cascade des fragments de savoir lors de la résolution (preuve headless `/tmp/opencode/ui-proof-m16.cjs`).
- **EXPÉRIMENTAL** :
  - L'exploration exhaustive de la Chambre 2×2 démontre que l'ensemble des 15 compositions possibles (4 singletons, 6 dualités, 4 triades, 1 convergence) est solvable par le solveur canonique V5 sans altération des règles.
- **NON PROUVÉ** :
  - Aucune monétisation, aucun classement en ligne, aucune persistance sur serveur distant — l'Atelier reste 100% hors-ligne et autonome.

---

## 2. Validation des 10 Portes GO (M16-01 à M16-10)

| Porte GO | Intitulé | Résultat | Justification / Test |
|---|---|---|---|
| **M16-01** | Composition de Gardiens | **CONFORME** | Deux Gardiens sélectionnés appliquent leurs lois respectives sur les lignes/colonnes (SYM-01). |
| **M16-02** | Contrat & Rejet | **CONFORME** | Rejet par contrat (gardien vide, dupliqué, inconnu, mode non-LAB, base invalide) (SYM-02). |
| **M16-03** | Déterminisme canonique | **CONFORME** | Deux exécutions produisent byte-à-byte la même spec et le même état de session (SYM-03). |
| **M16-04** | Isolation du compositeur | **CONFORME** | Aucune référence partagée ni mutation sur `baseSpec` ou `SessionState` (SYM-04, SYM-13). |
| **M16-05** | Invariance du Moteur V5 | **CONFORME** | Le moteur V5 continue d'appliquer `apply`, `getMoves`, `isSolved` sans modification (SYM-05). |
| **M16-06** | Compatibilité Replay M13 | **CONFORME** | `createReplayController` gère seek, back, undo, toPresent sur toute session composée (SYM-06). |
| **M16-07** | Diagnostic Oculus M14 | **CONFORME** | L'Oculus diagnostique les mêmes `reasonCode` (`ENGINE_OFFERS`, `ENGINE_ACCEPTS_NOT_OFFERED`) (SYM-07). |
| **M16-08** | Inscription Mémoire M15 | **CONFORME** | Déblocage des fragments dans `mathic.knowledge.v1`, isolation de la sauvegarde progression (SYM-08). |
| **M16-09** | Persistance sans duplication | **CONFORME** | Rechargement idempotent, structure JSON v1 validée sans doublons (SYM-09). |
| **M16-10** | Non-régression totale | **CONFORME** | 419 tests PASS, builds Vite OK, playtest 50/50, git diff propre (SYM-10, SYM-12). |

---

## 3. Détail des Tests M16 (`tests/atelier/symbiote.test.mjs`)

| Identifiant | Assertion vérifiée | Statut |
|---|---|---|
| **SYM-01** | Deux Gardiens composés → spec aux deux lois, grille vide (-1), valide | PASS |
| **SYM-02** | Compositions invalides rejetées par `validateSymbiote` et `composeGuardianSpec` | PASS |
| **SYM-03** | Déterminisme — deux exécutions identiques → $S_1 \equiv S_2$ | PASS |
| **SYM-04** | Isolation — `baseSpec` et sessions congelées, aucun partage | PASS |
| **SYM-05** | Invariance moteur — les lois V5 s'appliquent telles quelles | PASS |
| **SYM-06** | Replay M13 sur session composée — back/undo/solution | PASS |
| **SYM-07** | L'Oculus reste fidèle sur une session composée | PASS |
| **SYM-08** | Découverte Symbiote nourrit la mémoire sans toucher la progression | PASS |
| **SYM-09** | Reload → connaissance conservée, sans duplication | PASS |
| **SYM-10** | Knowledge M15 non modifié — catalogue de base et règles identiques | PASS |
| **SYM-11** | Échelle narrative du Symbiote déterministe (DORMANT → MASTERED) | PASS |
| **SYM-12** | Pureté du module : aucun DOM, hasard, horloge, réseau, localStorage direct | PASS |
| **SYM-13** | Non-mutation profonde des entrées | PASS |
| **SYM-14** | Mêmes expériences → même SymbioteState et mêmes compositions | PASS |
| **SYM-15** | Les 15 compositions de la Chambre 2×2 sont valides ET solvables | PASS |
| **SYM-16** | La composition ne permet jamais de forcer un grid-solution | PASS |
| **SYM-17** | `encodeSeal` / `decodeSeal` survivent à une spec composée (M12 intact) | PASS |

---

## 4. Preuve Headless End-to-End (`/tmp/opencode/ui-proof-m16.cjs`)

Une simulation complète sans navigateur a été exécutée pour valider la chaîne réelle :
1. **État initial** : catalogue à 10 fragments (5 base + 5 gardiens), 0 débloqué.
2. **Éveil** : toggle Gardien émet `SYMBIOTE_AWAKENED` → état `AWAKENED`.
3. **Liaison Dualité** : sélection `{AL_JABR, FRACTALIA}` et composition → état `BOUND`, 4 fragments débloqués (`LORE_AL_JABR_001`, `LORE_FRACTALIA_001`, `LORE_SYMBIOSIS_001`, `LORE_AL_JABR_FRACTALIA_001`).
4. **Sceau forgé** : `encodeSeal(spec)` génère un sceau valide `MATHIC-CHAL-1:...`.
5. **Résolution réelle** : BFS calcule la solution, `ctrl.move()` applique les coups, transition vers `solved: true` émet `CHALLENGE_COMPLETED` → état `RESONANT`. Déblocage additionnel de `LORE_ATELIER_001` et `LORE_ALJABR_001`.
6. **Reload stockage** : relecture depuis la clé `mathic.knowledge.v1` → 6 fragments fidèlement restaurés.
7. **Deuxième composition** : engagement de `{NEXUS, SCINDIUM}` → déblocage de `LORE_NEXUS_SCINDIUM_001`.
8. **Troisième composition** : engagement de `{AL_JABR, NEXUS}` → transition vers l'état ultime `MASTERED`.
9. **Contrôle d'intégrité** : `schemaVersion: 1`, liste de 7 fragments dédupliquée, aucune pollution externe.

---

## 5. Audit de Non-Régression et Intégrité

- **Moteur V5** (`src/v5/rules/engine.mjs`) : non modifié.
- **Solveur V5** (`src/v5/rules/solver.mjs`) : non modifié.
- **Sceau M12** (`src/atelier/seal.mjs`) : non modifié.
- **Replay M13** (`src/atelier/replay-controller.mjs`) : non modifié.
- **Oculus M14** (`src/atelier/oculus-controller.mjs`) : non modifié.
- **Knowledge M15** (`src/atelier/knowledge.mjs`) : extension propre sans régression (26/26 tests KNOW verts).
- **Compilation** :
  - `npm run build` : succès (Vite production bundle).
  - `npm run build:atelier` : succès (Vite bundle atelier dédié).
- **Playtest V3/V5** : 50/50 puzzles réussis, 0 faux positif.
- **Total global des tests** : **419 PASS**, 0 échec.
