# MATHIC-1-0-PLAYER-EVIDENCE-PREPARATION — Rapport de préparation (Brique 2)

**Référence** : Feuille de route opérationnelle §2 (Phase 2), §19 MISSION 1 · **Statut** : PRÉPARATION (aucune mise en œuvre) · **Checkpoint** : MISSION 0 (commit/push Brique 1) + préparation seule.
**Verdict précédent** : CONTINUE (Brique 1 — Intelligence Architecture Contracts, `daff47c` → nouveau commit).

Ce rapport prépare la Brique 2 **sans commencer sa mise en œuvre**. Il fige le contrat d'émission, le mapping `Game Engine → Evidence` réel, le schéma/versionnage, le plan de tests et les divergences roadmap ↔ contrat à trancher avant le développement.

---

## 1. Périmètre du checkpoint (non-faits)

Ne **rien** développer pendant ce checkpoint :

- ❌ pas de module d'émission d'évidence ;
- ❌ pas de Player Profile Detection ;
- ❌ pas de Progression Orchestrator ;
- ❌ pas de Coach complet ;
- ❌ pas de provider LLM / Model Adapter ;
- ❌ aucune modification de `Kernel`, `Engine`, `Solver`, `Replay`, `N1-N36`, `save.mjs`, `levels.mjs`.

L'unique livrable exécuté est la **MISSION 0** (ADD/COMMIT/PUSH/VERIFY de la Brique 1).

---

## 2. Divergences roadmap ↔ contrat Brique 1 (signalement obligatoire)

Règle (feuille de route §0, naming) : en cas de divergence roadmap ↔ contrat, **signaler, conserver le code stable, proposer la résolution**. Les divergences suivantes sont signalées. **Aucune n'a modifié le code.** Résolution à arbitrer avant la mise en œuvre (Gate G1).

### 2.1 Vocabulaire d'événements (Phase 2 ↔ EVIDENCE_TYPES)

| Roadmap opérationnelle (Phase 2) | Contrat Brique 1 (`EVIDENCE_TYPES`) | Écart | Résolution proposée |
|---|---|---|---|
| `HINT_CONSUMED` | `HINT_USED` | nom différent | conserver `HINT_USED` (déjà contracté + testé INTEL-C2) ; documenter `HINT_CONSUMED` comme synonyme produit |
| `CHAIN_EVENT` | `CHAIN_STARTED` / `CHAIN_BROKEN` | granularité | conserver 2 événements (déjà contractés) ; `CHAIN_EVENT` = transition de `chainRun` dans l'Engine |
| `RETRY` | `RETRY_COUNT` | nom + origine | `RETRY_COUNT` reste l'agrégat (compteur) ; l'événement de reprise reste `LEVEL_STARTED` + `RETRY_COUNT++` (le nom `RETRY` est un alias) |
| — | `TIME_TO_FIRST_ACTION`, `TIME_TO_SOLUTION` | roadmap ne les liste pas | **proposé** : ces deux types restent **dérivés** (calculs du détecteur à partir de `atMs`), pas émis bruts — à arbitrer |
| — | `SOLUTION_DEPTH`, `SOLUTION_SCORE` | roadmap ne les liste pas | **proposé** : restent **dérivés** au moment `LEVEL_COMPLETED` (rejouables) — à arbitrer |

Décision proposée globale : la phase 2 liste un **minimum** (« Minimum ») ; le contrat Brique 1 est un **superset** déjà verrouillé. L'émetteur produit les types de `EVIDENCE_TYPES` ; les quatre types dérivés (`TIME_TO_*`, `SOLUTION_*`) sont **calculés, pas émis**, sauf arbitrage inverse.

### 2.2 Axes de profil (Phase 3 ↔ PROFILE_DIMENSIONS)

| Roadmap opérationnelle (Phase 3) | Contrat Brique 1 (`PROFILE_DIMENSIONS`) | Écart | Résolution proposée |
|---|---|---|---|
| `comprehension` | absent | manquant | **ajouter** `comprehension` à la Détection (Brique 3) — changement de schéma → `PROFILE_SCHEMA_VERSION = 2` (migration Phase 11) |
| `chainMastery` | `chainAffinity` | nom | arbitrer : conserver `chainAffinity` (contrat) ou adopter `chainMastery` (roadmap) en v2 |
| `strategy`, `exploration`, `efficiency`, `arithmetic`, `difficultyResponse`, `hintDependency` | `strategyTendency`, `explorationTendency`, `efficiencyTendency`, `arithmeticAffinity`, `difficultyResponse`, `hintDependency` (4 noms identiques) | 4 noms sur 6 alignés | conservé ; les alias courts roadmap restent des libellés affichage |
| `retryTolerance` | présent au contrat, absent roadmap | enrichissement | conservé (dérivé de `RETRY_COUNT` + échecs) |
| `detectorVersion` / `profileSchemaVersion` séparés | contrat = champ unique `version` | structure | arbitrer : contrat `version` == `PROFILE_SCHEMA_VERSION` (Phase 11 ajout `detectorVersion`, `policyVersion` à la persistance) |

### 2.3 Conséquence pour la Brique 2

La Brique 2 (émission) n'est **pas bloquée** par ces arbitrages : elle émet selon `EVIDENCE_TYPES` contractés. Les arbitrages 2.1/2.2 conditionnent la Brique 3 (détection), pas l'émission.

---

## 3. Contrat d'émission proposé (Brique 2)

### 3.1 Enveloppe

```text
Evidence {
  schemaVersion: 1,          // EVIDENCE_SCHEMA_VERSION (nouveau, Brique 2)
  sessionId,                 // id rotatif local  (Phase 8 : non réactivable)
  levelId,                   // ex. "N7"
  levelVersion,              // version de la spec du niveau (persistance Existante)
  ruleVersion,               // version des règles (Engine b1)
  type,                      // ∈ EVIDENCE_TYPES (contrat Brique 1)
  atMs,                      // durée de session >= 0 (jamais horloge absolue exploitable)
  seq,                       // compteur séquentiel monotone (déterminisme + ordre)
  payload?                   // objet plat, conforme validateEvidence
  provider?                  // "engine" (seul émetteur en Brique 2)
}
```

L'enveloppe **étend** la forme du contrat Brique 1 (`type/levelId/atMs/payload`) en ajoutant les champs de provenance — aucun champ psychologique/interdit (le garde `validateEvidence` continue de s'appliquer sur la forme complète).

### 3.2 Déterminisme & ordre

- `seq` monotone (par session) → ordre total rejouable ;
- l'émission est une **fonction pure des transitions d'état Engine** → deux rejouées identiques produisent la même séquence (test dédié) ;
- aucun `Math.random()` / `Date.now()` dans le chemin d'émission (le `atMs` est une **durée de session** calculée par le runtime, pas une horloge absolue).

### 3.3 Absence de doublons

Un même fait n'est émis qu'une fois :

- `LEVEL_COMPLETED`/`LEVEL_FAILED` sont **terminaux** (jamais réémis pour le même `LEVEL_STARTED`) ;
- chaque `ACTION_COMMITTED` correspond à exactement un événement Engine (pivot de retour d'`apply`) ;
- `ACTION_INVALID` n'est émis que si `apply`/`evaluate` renvoie une non-validité **et** que l'état après == état avant.

---

## 4. Mapping Game Engine → Evidence (points de couture réels)

Source : `Engine b1` (`src/b1/engine.mjs`, `replay.mjs`) + runtime web (`src/b1/web/b1-web.js`), checkpoint au commit courant.

| Evidence | Source Engine/runtime réelle | Point de couture | Statut |
|---|---|---|---|
| `LEVEL_STARTED` | `createSession(level)` | `b1-web.js:reset()/switchLevel()` (376-383), rendu initial (13) | hook prêt (log `kind:"switch"`) |
| `ACTION_PREVIEWED` | `evaluate(state, act)` ok | `b1-web.js:refreshPreview()` (77-101) | hook prêt (log `kind:"preview"`) |
| `ACTION_INVALID` | `evaluate` → `ok:false` ; `apply` → `null` (refus) | `b1-web.js:78-85` (preview ✗), `commitAction()` (279-282) | hook prêt (log `kind:"invalid"`) |
| `ACTION_COMMITTED` | `apply(state, act)` → nouvel état + événement `{a,op,bCell,result,chainRun,chainBonus,delta}` | `b1-web.js:commitAction()` (277-304) | hook prêt (log `kind:"action"`) |
| `CHAIN_STARTED` / `CHAIN_BROKEN` | transition de `chainRun` dans les événements commités (0→1 / 1→0) | dérivé du `ACTION_COMMITTED` de l'Engine (chaînes B2 `chainRun`) | dérivable |
| `UNDO_USED` | `replay(level, trace.slice(0,-1))` | `b1-web.js` undo (421-430) | hook prêt (log `kind:"undo"`) |
| `LEVEL_COMPLETED` | `isWon(nxt)` + `finalScore` | `b1-web.js:persistVictory()` (220-224) / commit (302) | hook prêt (log `kind:"completed"`) |
| `LEVEL_FAILED` | `isLost(state)` (movesLeft 0) ; abandon (non géré UI) | `b1-web.js` overlay (339-342) | **manque le cas « abandon/quitter »** (à ajouter en Brique 2, comportement UI) |
| `HINT_REQUESTED` / `HINT_USED` | aucun point UI actuel (le Coach arrive en Brique 7) ; contrat déjà actif | — | **aucun hook** : l'émetteur expose l'API, l'UI indice viendra avec le Coach |
| `RETRY_COUNT` (dérivé) + `TIME_TO_*` / `SOLUTION_*` (dérivés) | `atMs`, événements de la partie | calcul au `LEVEL_STARTED`/`LEVEL_COMPLETED` | **dérivés** (§2.1) |

Note Engine : `state` porte `trace`, `events` (avec `chainRun`, `chainBonus`, `delta`) et `score` — la **rejouabilité** des évidences est donc garantie (`replay` reproduit l'état). `INVALID = NO STATE CHANGE` reste l'invariant du kernel (jamais modifié).

---

## 5. Schéma & versionnage (Brique 2)

```text
EVIDENCE_SCHEMA_VERSION = 1      // nouvelle constante (module d'émission)
+ réutilise : PROFILE_SCHEMA_VERSION (Brique 1, non touché)
```

- `levelVersion`, `ruleVersion` → l'évidence reste associative à la version interprétée (Phase 11, pas de translation silencieuse).
- Toute évolution de `EVIDENCE_TYPES` → `EVIDENCE_SCHEMA_VERSION++` + migration (Phase 11).
- La persistance de la Brique 2 est **journal local borné** (Phase 8 : local-first, tampon avec éviction), jamais mêlée à `save.mjs`.

---

## 6. Plan de tests Brique 2 (Gate G1-EVIDENCE)

Module cible : `tests/intel/evidence.test.mjs` (nommage au choix de l'implémentation).

| # | Cas | Vérification |
|---|---|---|
| E-01 | Émission | chaque transition Engine produit exactement l'évidence attendue (type, payload, seq) |
| E-02 | Ordre | `seq` mono-tone, ordre total = chronologie réelle (preview avant commit) |
| E-03 | Absence de doublons | terminal `LEVEL_COMPLETED` non réémis ; pivot unique par transition |
| E-04 | Sérialisation | roundtrip JSON stable (édit-identique), `schemaVersion` conservé |
| E-05 | Déterminisme | deux sessions identiques → même séquence d'évidences (JSON) |
| E-06 | Reset | `LEVEL_STARTED` re-émis sur `restart`/`switchLevel`, ancienne session close proprement |
| E-07 | Niveau abandonné | `LEVEL_FAILED { reason: "quit" }` si abandon (nouveau comportement UI) |
| E-08 | Victoire | `LEVEL_COMPLETED` + `SOLUTION_*` dérivés cohérents avec trace réelle |
| E-09 | Échec | `LEVEL_FAILED { reason: "move_limit" }` à `movesLeft = 0` |
| E-10 | Undo | `UNDO_USED` émis, état après == replay de la trace amputée |
| E-11 | Données interdites | aucun champ `FORBIDDEN_EVIDENCE_FIELDS` dans la séquence émise |
| E-12 | Chaînes | `CHAIN_STARTED`/`CHAIN_BROKEN` alignés sur `chainRun` de l'Engine |
| E-13 | Non-régression | `npm test` 161/161 conservé + build OK |

**Gate G1-EVIDENCE — conditions de sortie** :

- évidence produite depuis un gameplay réel (Engine b1, pas un mock pur) ;
- contrat Brique 1 respecté (`validateEvidence` vert sur la séquence émise) ;
- aucune dépendance inverse (l'émission importe l'Engine, jamais l'inverse) ;
- tests E-01 → E-13 verts ;
- aucun champ psychologique émis.

---

## 7. Exécution (à faire en MISSION 1, hors checkpoint)

```text
MODULE   src/intel/evidence.mjs          (émetteur pur, importe seulement Engine b1)
SHIM     src/b1/web/b1-web.js            (brancher l'émetteur aux points de couture §4)
CONST    EVIDENCE_SCHEMA_VERSION          (versionnage)
TESTS    tests/intel/evidence.test.mjs    (E-01 → E-13)
RAPPORT  docs/design/MATHIC-1-0-PLAYER-EVIDENCE-REPORT.md
```

**Piège à éviter** : ne pas émettre depuis l'UI pour remplacer les `log()` ; l'émetteur reste une couche dédiée `src/intel/`, l'UI appelle une seule API `evidence.emit(...)`.

---

## 8. Décisions checkpoint

**D-CHK1** — la Brique 2 n'est **pas implémentée** ; ce rapport fige contrat, mapping, schéma et plan de tests. **D-CHK2** — divergences roadmap ↔ contrat signalées (§2) et **aucune modification de code** n'en résulte. **D-CHK3** — la MISSION 0 (commit/push Brique 1) est la seule exécution. **D-CHK4** — l'identité « Mageek » et le renommage éventuel de « Momo » ne sont pas gravés dans les nouvelles couches : l'architecture parle de `Coach`/`provider` ; le renommage sera une migration séparée post-architecture (brique à part, hors scope immédiat). Opposables.