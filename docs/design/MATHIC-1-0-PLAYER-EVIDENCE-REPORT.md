# MATHIC 1.0 — Rapport de mandat : Player Evidence (Brique 2, MISSION 1)

**Référence** : Feuille de route MATHIC 1.0 §5.A, §6, §22 · Contrat : `MATHIC-1-0-EVIDENCE-CONTRACT.md` (révision v1.1) · Préparation : `MATHIC-1-0-PLAYER-EVIDENCE-PREPARATION.md` · **Statut** : IMPLÉMENTÉ, TESTÉ, PRÊT pour le runtime (câblage UI hors périmètre ADD).

---

## 1. Objet

Émettre les faits **observables et reproductibles** de la session Mathic à destination d'une future brique Player Profile Detection. L'émetteur ne produit **jamais** d'interprétation psychologique : que ce qui s'est réellement passé dans Mathic, rien de plus, rien de moins.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Couche d'émission | Code (ADD) | `src/intel/evidence.mjs` |
| Tests d'évidence | Test (ADD) | `tests/intel/evidence.test.mjs` (E-01 → E-15) |
| Rapport de mandat | Doc (ADD) | `docs/design/MATHIC-1-0-PLAYER-EVIDENCE-REPORT.md` |
| Extension du contrat | Doc (révision v1.1) | `docs/design/MATHIC-1-0-EVIDENCE-CONTRACT.md` |
| Extension de la norme | Code (contrat) | `src/intel/contracts.mjs` (`EVIDENCE_TYPES` : +`LEVEL_RESTARTED`, +`LEVEL_ABANDONED`) |

**Périmètre préservé (intouché)** : Kernel, Engine, Solver, Replay, Levels, Save, `src/v5/`, N1-N36, score, invariants, plans de contrat existants.

## 3. Corrections exigées — statut

| # | Correction | Statut |
| --- | --- | --- |
| 1 | `quit` n'est **pas** `LEVEL_FAILED` → `LEVEL_ABANDONED` ; `LEVEL_FAILED` uniquement `reason:"move_limit"` | ✅ `LEVEL_ABANDONED` ajouté à `EVIDENCE_TYPES`, défini dans le contrat v1.1 ; test E-07 prouve quitter ≠ échouer |
| 2 | `atMs` via **horloge injectable** (`EvidenceClock`) ; production = temps mono écoulé de session ; tests = fake clock déterministe ; jamais `Date.now()` dans le cœur émetteur | ✅ `createClock`/`createMonotonicClock` ; E-05 prouve le déterminisme (JSON identique) avec horloge programmée |
| 3 | `RETRY_COUNT` n'est pas un événement → `LEVEL_RESTARTED` = fait, `retryCount` = dérivée | ✅ E-06 : `START → RESTART → START ⇒ retryCount = 1` ; jamais de dérivées émises (E-11/E-06) |
| 4 | `CHAIN_STARTED` : `chainRun 0 → ≥1` ; `CHAIN_BROKEN` : transition **validée** `chainRun n>0 → 0` ; action invalide ne casse jamais une chaîne | ✅ E-12 chaîne réelle `0→1→0` sur N13 ; E-15 : une ACTION_INVALID en pleine chaîne n'émet pas de rupture |

## 4. IMPLEMENTED — `src/intel/evidence.mjs`

- `EVIDENCE_SCHEMA_VERSION = 1`, `LEVEL_VERSION = 1`, `RULE_VERSION = "b1"`, `PROVIDER_ENGINE = "engine"`.
- **EvidenceClock injectable** : `createClock({ now })` (origine = premier tic, `elapsed ≥ 0`/fini) et `createMonotonicClock()` (production, `performance.now()` avec replis). Le cœur de l'émetteur appelle uniquement `clock.now()`.
- `createSessionId()` : utilité de production au point d'appel **hors cœur déterministe** (rotatif, non réactivable, Phase 8).
- `createEvidenceRecorder({ levelId, sessionId, clock, ... })` :
  - API d'émission : `started()`, `previewed(ev)`, `invalid({a,op,b,reason})`, `committed(ev)`, `undone({a,op,b})`, `restarted()`, `completed(summary)`, `failed(reason)`, `abandoned(reason)` ;
  - enveloppe `{ schemaVersion, sessionId, levelId, levelVersion, ruleVersion, seq, type, atMs, payload?, provider }` ; `seq` strictement croissant (E-02) ;
  - **validation à l'émission** : chaque évidence passe `validateEvidence()` ; une sortie hors contrat lève `TypeError` (jamais d'évidence corrompue) ;
  - **terminal unique** : `LEVEL_COMPLETED` / `LEVEL_FAILED` / `LEVEL_ABANDONED` clôturent la session ; toute émission suivante est refusée (`null`), E-03 ;
  - chaînes gérées sur les **engagements validés uniquement** (LAST réf = dernier `chainRun` committé) ;
  - `events()`/`evidence()` lecture, `retryCount()` dérivé.
- **Métriques dérivées** `deriveMetrics(evidence, { objectiveBonus })` : `timeToFirstAction`, `timeToSolution`, `solutionDepth`, `solutionScore`, `retryCount` — jamais émises comme événements.

Règle architecturale maintenue : l'émetteur dépend des faits du **moteur** (ids de cellule, résultat, delta, `chainRun` des événements Engine), le Game Core ne dépend jamais de l'intelligence (garanti par INTEL-C22). Aucun import de `src/intel/evidence.mjs` vers `src/b1/` — la couche émet ce qu'on lui passe, elle n'appelle pas l'Engine.

## 5. TESTED — `tests/intel/evidence.test.mjs` (E-01 → E-15)

| Test | Preuve |
| --- | --- |
| E-01 | victoire N1 réelle : enveloppe complète, `seq`, `schemaVersion`, payloads = faits |
| E-02 | séquence stricte sur un mix de types complet |
| E-03 | terminal unique — après le destin, silence total |
| E-04 | round-trip JSON sans perte (intégrité) |
| E-05 | déterminisme : mêmes faits + même horloge ⇒ JSON identique ; identité de session = entrée |
| E-06 | restart : `LEVEL_RESTARTED` = fait, `retryCount` = dérivée, dérivées jamais émises |
| E-07 | abandon : `LEVEL_ABANDONED`, jamais `LEVEL_FAILED`, terminal acquis |
| E-08 | victoire en chaîne réelle (N7, chemin du Solver) : `CHAIN_STARTED` avant `LEVEL_COMPLETED`, pas de rupture |
| E-09 | échec réel `move_limit` : `LEVEL_FAILED`, pas de victoire/abandon fantôme ; chaîne démarrée attestée |
| E-10 | undo réel : `UNDO_USED` porte le fait annulé, la partie continue |
| E-11 | anti-collecte : aucune évidence n'expose `FORBIDDEN_EVIDENCE_FIELDS` (tests + sérialisation) ; dérivés non émis |
| E-12 | chaîne réelle N13 `chainRun 0→1→0` : `CHAIN_STARTED` puis `CHAIN_BROKEN` |
| E-13 | non-régression : pas d'import Game Core depuis l'émetteur, émetteur ne mute jamais les faits gelés, `schemaVersion = 1` |
| E-14 | session réelle complète (N7) : preview, invalide, commit, undo, chaîne, victoire — `seq` continu de bout en bout |
| E-15 | **CHAIN_BROKEN ≠ ACTION_INVALID** : une tentative invalide en pleine chaîne n'émet aucune rupture |

Chaque évidence de chaque test est revalidée par `validateEvidence` et vérifiée exempte de champs interdits. Suite complète : **176/176 tests, durée ~16 s (< 30 s)**.

## 6. PROVEN

- L'émission est **réelle, pas simulée** : elle est pilotée par des sessions Engine réelles (N1, N7, N13) et les chaînes observées correspondent aux `chainRun` des événements Engine (E-08, E-12).
- Le déterminisme est prouvé par construction (horloge injectée) et par test (E-05 JSON identique).
- Les **corrections 1-4** sont prouvées par les tests dédiés E-06/E-07/E-08/E-12/E-15.
- La suite entière (player evidence + contrats + Game Core hérité) passe sans régression : **176/176**, build **PASS**.

## 7. NOT PROVEN / HORS PÉRIMÈTRE (explicite)

- **Détection de profil / interprétation** : aucune statistique psychologique, c'est une mission ultérieure (Phase Brique 3 Profile Detection — consommateur de cette évidence). Le présent mandat couvre le capteur, pas l'oracle.
- **Orchestrator, Coach, Mageek runtime, GGUF, réseau, backend** : interdits par le mandat et `INTEL-PROHIBITION-*`, non touchés.
- **Persistance locale des évidence** (`localStorage.session = journal`) : dérivé de l'ajout au runtime, explicitement différé (Phase 8 documentée). L'évidence est éligible à la persistance telle quelle (sérialisable, E-04).
- **Câblage UI** (`src/b1/web/b1-web.js`) : hors liste ADD. L'inspection du runtime a confirmé qu'**aucune action « abandon » n'existe aujourd'hui** dans l'UI (transitions : victoire → overlay Rejouer/Suivant · échec `move_limit` → overlay Échec · blocage → overlay Blocage non fatal · restart → reset · undo → rejeu trace). `LEVEL_ABANDONED` reste donc un **contrat d'API prêt à être branché** dès qu'un chemin « abandonner » existera ; le blocage n'est ni une victoire ni un échec et ne doit pas terminer une session (cohérent avec la sémantique du mandat).
- **Portage web(app) (Compression ≠ Observabilité)** : le runtime (web/minimal) étant le seul consommateur actuel, le portage web(app) est différé ; la couche d'évidence est déjà indépendante de la cible (Zéro import Game Core, saisie d'évidence explicite).
- **Priorisation des évidence** (réponse à la divergence « encapsulation ») : la norme est portée par `EVIDENCE_TYPES` et la liste figée INTEL-C2 (déterministe, opposable). Aucune évidence « prioritaire » séparée : toutes sont des faits de session ; leur hiérarchie d'usage relève de la future analyse (Profile Detection), pas de l'émission.

## 8. Divergences feuille de route ↔ contrat — résolues

- `HINT_CONSUMED` → `HINT_USED` (norme contrat Brique 1 conservée) ; hints non émis en MISSION 1 (pas de point d'émission runtime) ;
- `RETRY` → `RETRY_COUNT` dérivé + `LEVEL_RESTARTED` (fait) — correction 3 ;
- dérivés `TIME_TO_*`/`SOLUTION_*` recalculables — jamais émis ;
- `comprehension` / `chainMastery` / `chainAffinity` : dimensions de **profil** (Brique 3), simulées/prédites à partir de l'évidence, hors émission — seuls `chainRun` et `CHAIN_STARTED/BROKEN` sont émis comme faits ;
- `detectorVersion`/`profileSchemaVersion` : versionnage du consommateur (Brique 3), pas de la source.

## 9. Gate G1-EVIDENCE — bilan

| Condition | Bilan |
| --- | --- |
| Évidence réelle depuis gameplay réel (Engine) | ✅ E-01/08/09/12/14 (sessions Engine réelles) |
| Recorder émet des évidence utiles, observables, rejouables | ✅ E-01…E-15 |
| Aucune donnée psychologique / identifiante | ✅ E-11 + `validateEvidence` à l'émission |
| Aucune IA directe en jeu (Gameplay intouché) | ✅ Engine/Kernel/Score/N1-N36 inchangés ; build PASS |
| Tests < 30 s | ✅ ~16 s (176 tests) |
| Commit Git sans force push | ⏳ à exécuter : `feat(intel): implement player evidence emission` |
| Compression ≠ Observabilité (portage web(app)) | ⏳ différé — documenté §7 |

## 10. Compilation finale

```
npm test       → 176/176 pass (16 s)
npm run build  → PASS
Git            → commit unique + push (sans force) sur kali/v5-gameplay-lab
```

Preuves annexes (scripts d'exploration, non committés) : transcripts Engine réels N13 `0→1→0`, N7 victoire chaîne `0→1`, N7 échec `0→0→1` vérifiés par le moteur avant écriture des tests.