# MATHIC 1.0 — Rapport de mandat : Runtime Intelligence Adapter (MISSION 5)

**Référence** : Mandat MISSION 5 (G5-RUNTIME) · Méthode : `MATHIC-1-0-RUNTIME-INTELLIGENCE.md` · **Statut** : IMPLÉMENTÉ, TESTÉ, PROVEN — Gate G5-RUNTIME visé.

---

## 1. Objet

Brancher la chaîne **Engine réel → Evidence réelle → Profile → Policy →
Orchestrator** sur les transitions **RÉELLEMENT appliquées** par le vrai
moteur — jamais une simulation parallèle, jamais une prédiction d\u0027intelligence.
Preuve livrée : 16 tests RT (RT-01 → RT-16) branchés sur le moteur b1 réel,
le catalogue N1-N36 réel et le storage réel.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Runtime Intelligence Adapter | Code (ADD) | `src/intel/runtime.mjs` |
| Tests | Test (ADD) | `tests/intel/runtime.test.mjs` (RT-01 → RT-16) |
| Conception | Doc (ADD) | `docs/design/MATHIC-1-0-RUNTIME-INTELLIGENCE.md` |
| Rapport de mandat | Doc (ADD) | `docs/design/MATHIC-1-0-RUNTIME-INTELLIGENCE-REPORT.md` |

**PRÉSERVE (intouché)** : tous les fichiers `src/b1/` (cœur moteur, LADDER,
save), `src/v5/`, GameState, score, objectifs, runtime math, et toutes les
briques intel M1-M4 (evidence, profile, policy, orchestrator).

## 3. IMPLEMENTED — l'Evidence provient des transitions RÉELLES du moteur

- **RT-01** : `createRuntimeAdapter` démarre la VRAIE session (`engine.createSession`)
  et émet `LEVEL_STARTED` avec `provider: "engine"` réel ;
- **RT-02** : frontière §12 — `runtime.mjs` n'importe jamais l'Engine
  (source), il **exige** l'Engine `TypeError` s'il manque ;
- **RT-03** : `ACTION_COMMITTED` est émise depuis l'événement RÉEL du `apply`
  (rejouer la même action hors adapter donne le même événement — jamais une
  prédiction) ;
- **RT-04** : déterminisme — deux sessions identiques (même horloge injectée,
  même niveau, mêmes actions) ⇒ Evidence **byte-à-byte identiques** ;
- **RT-05** : `CHAIN_STARTED` / `CHAIN_BROKEN` proviennent d'une chaîne
  **réellement chaînée par le moteur** (N13, chainRun réel 0→1→0, découverte
  par solveur b1 réel, jamais inventée) ;
- **RT-06** : `LEVEL_COMPLETED` émis une seule fois sur la victoire réelle
  (`isWon` du moteur) ; TERMINAL bloque toute action suivante ;
- **RT-07** : `deriveMetrics` réel sur les Evidence réelles
  (`solutionDepth` réel ≥ 1) ;
- **RT-08** : `detectProfile` réel sur la session (`LOW EVIDENCE` au début,
  profil complet avec confiance + explications ensuite) ;
- **RT-09** : chaîne Policy→Orchestrator réelle : `APPLIED` écrit réellement
  dans le storage (`setCurrent`/`saveNow` injectés), **sans** `unlockTo`, **sans**
  `markCompleted` ;
- **RT-10** : kill-switch `SAFE_DEFAULT` — observateur pur, `stateChanged:
  false`, storage rigoureusement inchangé ; profil à confiance insuffisante ⇒
  `SAFE_DEFAULT_PROGRESSION` réel ;
- **RT-11** : action refusée par le moteur ⇒ `REJECTED_BY_ENGINE`, aucune
  Evidence d'une transition non appliquée, session intacte ;
- **RT-12** : `undo` réel — ré-exécution déterministe via le vrai moteur,
  `UNDO_USED` émis, session tronquée d'une transition ;
- **RT-13** : `restart` réel — `LEVEL_RESTARTED`, `retryCount` réel incrémenté ;
- **RT-14** : terminal pudique `completed()` — `LEVEL_COMPLETED` sans
  court-circuit de l'Evidence ;
- **RT-15** : chaîne COMPLÈTE réelle Engine→Evidence→métriques→profil→
  Policy→Orchestrator avec écriture réelle du storage ;
- **RT-16** : reproductibilité — deux pipelines réels identiques ⇒ mêmes
  metrics + même profil (déterminisme intégral).

## 4. Corrections d'intégrité (brouillon → livrable réel)

- `lastLive` : lecture de la trace `.events` du moteur b1 réel (avec repli
  `.live.events`) au lieu d'un chemin inexistant, de sorte qu'avec le vrai
  moteur injecté l'événement réel est bien reçu par `recorder.committed` ;
- `trace.push(action)` : la trace des transitions réellement appliquées est
  désormais alimentée (socle de l'`undo` réel) ;
- garde terminale dans `commitReal` : une session gagnée/perdue n'accepte
  plus d'action (`TERMINAL`) ;
- `recommendation(inputs)` : les candidats réels fournis (`inputs.candidates`)
  sont transmis à la Policy (au lieu d'un `[]` systématique → `NO_CANDIDATES`).

## 5. Preuve

- `node --test` : **261/261** tests verts (245 M1-M4 + 16 RT) ;
- `node tests/playtest-puzzle.mjs` : verdict Coup Parfait ✅ ;
- `npm run build` : build vite OK (35 modules).

## 6. Gate G5-RUNTIME — critères opposables

| Critère | Preuve |
| --- | --- |
| Evidence depuis transitions réelles (jamais une prédiction) | RT-03, RT-05 |
| Déterminisme du pipeline réel | RT-04, RT-16 |
| Frontière §12 (Engine injecté, jamais importé) | RT-02 |
| Kill-switch SAFE_DEFAULT observateur pur | RT-10 |
| Chaîne complète Engine→Evidence→…→Orchestrator, écriture réelle | RT-09, RT-15 |
| Fail-safe : intel indisponible ⇒ jeu continue normalement | RT-02 (injection obligatoire, TypeError si absente), RT-10/RT-11 (aucune écriture, session intacte) |