# MATHIC 1.0 — B1 : Minimal Playable Slice — Rapport

**Statut** : INSTRUMENT DE VALIDATION DU GAMEPLAY (ni V6, ni V7, ni MATHIC 1.0).
**Date** : 2026-09-23 · **Responsable** : Kali (slice construit, non évalué par un humain).
**Références** : contrat du gate B1 (directive architecte « B1 = PROCHAINE ÉTAPE AUTORISÉE »), revue B0 (`MATHIC-1-0-CROSS-CONTRACT-REVIEW.md`), BRIEF §§18–20, traçabilité lignes T7/T8/B1-B1-F.

Verdict rapide : **B1 READY FOR HUMAN** — le code répond aux critères B1-A à B1-F **en tant qu'instrument** ; AUCUNE conclusion gameplay (voir §11).

---

## 1. État exact du commit de départ

- Branche `kali/v5-gameplay-lab`, HEAD = `8fbdced` (« Phase B — review croisée des contrats (gate B0) », 2026-09-23).
- `main` (V4) intouché. `ai-models-gguf/` non suivi, hors périmètre.
- B1 ajoute **exclusivement** : `src/b1/` (8 modules) et `tests/b1/b1.test.mjs` (21 tests). Aucun fichier existant modifié (aucune régression : `node --test` = 58/58).

## 2. Changements réalisés

| Fichier | Rôle | Contrat adressé |
|---|---|---|
| `src/b1/kernel.mjs` | `apply2(a,op,b)` + `reason()` — sémantique exacte | A1 (§ K-0 **corrigé**) |
| `src/b1/board.mjs` | grille fixe, cellules typées, rendu | A2 |
| `src/b1/formula.mjs` | validation + évaluation d'une formule (`a op b`, ancrage A) | A3 (§ C-3) |
| `src/b1/engine.mjs` | `createSession/apply/evaluate` — 3→1, trace, chaîne, score min, objectifs | A4 + A5 + A7 + A8 |
| `src/b1/replay.mjs` | reconstruction exacte depuis la trace | A1 §7bis + A15 (§ B1-D) |
| `src/b1/solver.mjs` | BFS borné, instrument de certification **uniquement** | § B1-E |
| `src/b1/levels.mjs` | 6 niveaux (matrice S1/S7/S8/S4/K-0/C-3/B1-B) | A9 |
| `src/b1/play.mjs` | interface terminal jouable + mode scripté | BRIEF §18 |
| `tests/b1/b1.test.mjs` | 21 tests : sémantique, C-3, atomicité, chaîne, objectifs, replay, conformance, certification | B1-A…B1-E |

## 3. Architecture effectivement implémentée

- **État** : `{ level, board.cells[] (fixe codant positions), movesLeft, trace[] (positions), events[], score, won, nextChain }`. Fonctionnel, immuable par copie (style moteur V5).
- **Action** : triplet de **cellules** `{a, op, b}` où `op` est la *tuile opérateur* (ressource consommée — D-B1/H-B1 concret) ; `A` est la cellule d'ancrage (D-T1/H-AN).
- **Transformation 3→1** : `cells[A]=result`, `cells[op]=∅`, `cells[B]=∅`, `movesLeft−1` (D-T2/H-3→1).
- **Kernel** : `+ − × ÷`, `/` entier exact `b≠0`, `a−b≥0` (K-0), bornes désactivées en B1 (doc §10), résultat **entièrement réutilisable** (chaîne = dépendance de résultat).
- **Score minimal** : `base=|r|/10` + bonus chaîne +2/maillon consécutif + objectif +10 une fois (coefficients **placeholders**, EXP).
- **Replay** : reproduit états, événements, score, cellules à l'identique ; `undo` = replay de la trace tronquée. Les positions d'ancrage sont dans la trace (C-3).
- **Solver** : BFS borné (budget 20 000) partageant **la même** `apply()` — conformance par construction, vérifiée par test (B1-E).

## 4. Scénarios jouables (6 niveaux, terminal)

| ID | Nom | Scenario revue | Ce qu'il met en scène |
|---|---|---|---|
| b1-1 | Le Pont | S1 | immédiat (`12×4`) → 14 pts **vs** préparation (`12+4`→`16×3`) → 17 pts, états post-coup différents |
| b1-2 | Le 2 partagé | S7 | `24×2` **exclusif** de `96÷2` : choisir quel chemin sacrifie le 2 |
| b1-3 | Quatre routes | S8 | `24×2` / `50−2` / `12×4` / `96÷2` : 4 routes à **4 états post-coup distincts** |
| b1-4 | La Falaise | S4/S9 | `5+7` d'abord → **BLOQUÉ** (pas échec), undo, puis `5×7` |
| b1-5 | Division exacte | K-0/C-3 | rejet atomique `50÷4` ; `12×4` **≠** `4×12` (ancrage) |
| b1-6 | La Chaîne | B1-B | aucune victoire en 1 coup : `2+4=6`, `+` d'abord, `×` réservé au coup final |

## 5. Tests mathématiques (sémantique)

- K-0 concret : `apply2(5,−,1)=4`, `apply2(5,−,5)=0` (règle `a−b≥0`, **0 autorisé**), `apply2(3,−,5)=null` (**jamais** −2), `reason()` explicatif.
- `÷` : `96÷2=48`, `50÷4=null`, `50÷12=null`, `8÷0=null` ; `+ ×` exacts ; re-test de l'addition sur 50 valeurs entières.
- **Atomicité** : une formule rejetée ne consomme **aucune** tuile (état sérialisé inchangé).

## 6. Tests solver / runtime / replay (conformance B1-E)

- **Règle** : le solver réutilise `apply()` du runtime → divergence structurellement impossible, **mais** vérifiée : pour chaque niveau, chaque chemin « solution » du solver est rejoué (`replay`) et joué en direct (`apply`) → états, score et victoire identiques.
- Replay : reconstruction exacte des snapshots de cellules à chaque étape ; `undo` reconstruit l'état du jeu direct.
- Déterminisme : deux sessions aux mêmes coups → états identiques.
- Certification par niveau : résoluble dans `maxMoves`, minMoves calculé, sous budget.

## 7. Captures / traces de parties

Interactif (headless, b1-4) : `5+7` → `BLOQUÉ (coups légaux : 0)` → `undo` → `5×7` → **OBJECTIF 35 atteint, 13 pts**. Scriptées :

```
b1-1 immédiat    : 12×4=48   +4 → 14 pts, coups 1/2
b1-1 préparation : 12+4=16 +1, 16×3=48 +6 (chaîne +2) → 17 pts, coups 0/2
b1-2             : 96÷2=48  +4 → 14 pts (24 reste sur le board, 2 perdu)
b1-3             : 50−2=48  +4 → 14 pts (24,12,4,96,×,÷ restent)
b1-4 piège       : 5+7=12 → BLOQUÉ (0 coup légal), coups 1/2 restant
b1-5             : 50÷4 rejeté (0 tuile consommée) ; 12×4=48 ancré cellule 2 → 14 pts
b1-6             : 2+4=6 +0 (base 0 !), 6×8=48 +6 (chaîne +2) →  16 pts, coups 1/3
```

## 8. Problèmes rencontrés

1. **Bug `evaluate`/`trace` (id vs valeur)** : `evalFormula` renvoyait `b` = *valeur* (id dans `bCell`) ; `evaluate` et `trace` lisaient `cells[valeur]` → crash hors bornes et replay/undo inopérants. Corrigé (usage systématique de `a/opCell/bCell` = positions). Défaut attrapé par test, exactement la classe C-3.
2. **Solver en première passe** était brouillon (code mort) → réécrit propre, `winsByDepth` + états post-coup à toutes les profondeurs.
3. **Test `5−5`** imposait (`null`) une règle « non-positifs » que le contrat ne dit pas : la règle est `a−b≥0` → `5−5=0` autorisé. Test corrigé, kernel inchangé.
4. b1-6 exhibe `2+4=6` → **base 0** (`|6|/10`), chaîne seule récompense la préparation au coups 2 — mesure honnête, à étalonner via playtest.

## 9. Hypothèses toujours EXPERIMENTAL (aucun humain n'a encore joué)

- **H-B1** (opérateurs = tuiles) : mécanique implémentée, décision induite (S7) ; la *valeur de la décision* reste à observer.
- **H-3→1** (consommation) : implémentée (rareté du 2, ÷, × réservé) ; frustration/vertu à observer (S7, S4, b1-6).
- **H-AN** (ancrage opérande A) : implémenté et **doublement exploité** (b1-5 : `12×4 ≠ 4×12` avant même de le documenter) ; « profondeur utile vs arbitraire » = observation humaine.
- **Combo N ∈ {3,4,5,6}** : **exclu du slice** (hors périmètre) ; aucune donnée. Les coefficients score (base/10, chaîne +2, objectif +10) sont des **placeholders** non calibrés.

## 10. Limites connues

- Interface terminal (pas de tactile mobile) : suffisant pour B1-A/B1-B, insuffisant pour toute conclusion mobile/tactile.
- Bornes kernel `[−1024,+4096]` désactivées en B1 (toutes les valeurs restent < 1024) ; à ré-activer et certifier en V1.
- Pas de combo, pas de Momo, pas de progression, pas d'économie — **volontaire** (périmètre).
- Solver = instrument de test, pas de certification de production (A11 reste à B2/V1).
- Nombre d'états explorés et « états post-coup » calculés par snapshot (cellules+movesLeft), pas par graphe complet.

## 11. Aucune conclusion gameplay sans humain

Le code ne **prouve pas** que le noyau est intéressant. Il fournit : des situations où immédiat ≠ préparation (b1-1, b1-6), des ressources exclusives (b1-2), des états post-coup distincts (b1-3), un piège observable (b1-4), des règles palpables (b1-5). Le seul juge est la session humaine (§ B1-A à B1-F + journal 5 phrases du BRIEF §19). Des indices suggestifs existent (la route préparation rapporte 17 > 14 ; la base 0 du 6 suggère un sous-reinforcement de la préparation), mais ils **ne sont pas** une validation.

## 12. Verdict

**B1 READY FOR HUMAN.** Critères : **B1-A** interface auto-explicative (objectif, tuiles id, 3-ids par coup) ✔ · **B1-B** décisions immédiat-vs-préparation présentes et opposées en score (à *vérifier* humain) ✔-instrument · **B1-C** ≥ 2 routes distinctes avec états post-coup différents sur 5/6 niveaux ✔ · **B1-D** replay reconstructif exact ✔ · **B1-E** zéro divergence solver≡runtime≡replay vérifiée ✔ · **B1-F** journal de session disponible via `trace`/`--scripts` ✔ (télémétrie structurée = prochaine étape, observations manuelles suffisent).

> B1 ≠ V6, B1 ≠ V7, B1 ≠ MATHIC 1.0. Ce slice est un **instrument de validation du gameplay**. Prochaine étape : un humain joue (gates B1-A…B1-F) → observations → **GAMEPLAY FREEZE** ou retour ciblé.

---

### Annexe — décisions de classification (mandat : « avant d'ajouter une fonctionnalité hors slice, arrêter et classer »)

| Élément ajouté | Classification | Justification |
|---|---|---|
| Chaîne (réutilisation de résultat) | **Nécessaire** | B1-B/B1-F observent explicitement le choix immédiat-vs-préparation ; sans récompense de réutilisation, aucune décision observable. |
| Solver BFS | **Nécessaire (instrument)** | B1-E exige la non-divergence solver/runtime/replay et la preuve de multi-solutions B1-C ; jamais exposé au joueur (pas de Momo B1). |
| `reason()` (messages de rejet explicites) | **Nécessaire** | B1-A demande « comprendre le nouvel état sans explication externe » ; un rejet muet est illisible. |
| Combo + seuil N | **Hors périmètre** | absents du slice ; hypothèse combo parkée jusqu'aux données humaines du noyau. |
| Momo, économie, boosters, progression, cloud, social, mastery, 20 niveaux | **Hors périmètre** | périmètre B1 exclusif, non implémentés. |
| Bornes kernel par défaut | **Nécessaire (inactif)** | Loi du kernel conservée, désactivée faute de besoin B1 ; réactivation = décision V1. |