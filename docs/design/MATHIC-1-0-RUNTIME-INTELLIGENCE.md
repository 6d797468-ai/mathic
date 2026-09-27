# MATHIC 1.0 — Runtime Intelligence Adapter (MISSION 5)

**Référence** : Mandat MISSION 5 (G5-RUNTIME) · Méthode : `MATHIC-1-0-INTELLIGENCE-ARCHITECTURE.md` · **Statut** : IMPLÉMENTÉ, TESTÉ — Gate G5-RUNTIME visé.

---

## 1. Objet

Raccorder la chaîne **Engine réel → Evidence → Profile → Policy →
Orchestrator** sur les transitions **RÉELLEMENT appliquées** par le moteur
réel — jamais une simulation parallèle, jamais une prédiction d'intelligence.
L'adapter est le **pont d'observation autorisé** (§12) : il pilote la vraie
session de jeu via le moteur injecté et **observe** l'événement réel de chaque
transition pour émettre l'Evidence.

## 2. Frontière (§12) — non négociable

```text
GAME CORE (Engine RÉEL) ──▶ EVIDENCE ──▶ PROFILE ──▶ POLICY ──▶ ORCHESTRATOR
```

- L'Engine RÉEL est **injecté** (paramètre `engine`), **jamais importé**
  statiquement par `intel/` — exactement comme `storage` est injecté à
  l'Orchestrator ; vérifié statiquement (RT-02) et contractuellement.
- Direction autorisée : **Game Core → Evidence Observation**. L'inverse
  (Intel → Engine) est interdite : l'intelligence n'a jamais de main sur le
  moteur.
- Kill-switch (§10) : où la politique est en mode `SAFE_DEFAULT` ou que le
  profil est absent/invalide, l'adapter reste un **observateur pur** — aucune
  écriture, le jeu continue normalement.

## 3. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Runtime Intelligence Adapter | Code (ADD) | `src/intel/runtime.mjs` |
| Tests | Test (ADD) | `tests/intel/runtime.test.mjs` (RT-01 → RT-16) |
| Conception | Doc (ADD) | `docs/design/MATHIC-1-0-RUNTIME-INTELLIGENCE.md` |
| Rapport de mandat | Doc (ADD) | `docs/design/MATHIC-1-0-RUNTIME-INTELLIGENCE-REPORT.md` |

**PRÉSERVE (intouché)** : `src/b1/kernel.mjs`, `engine.mjs`, `solver.mjs`,
`replay.mjs`, `levels.mjs`, `save.mjs`, `design.mjs`, `level-design.mjs`,
`src/v5/`, N1-N36, score, objectifs, GameState, runtime math,
`src/intel/contracts.mjs`, `src/intel/evidence.mjs`, `src/intel/profile.mjs`,
`src/intel/progression-policy.mjs`, `src/intel/progression-orchestrator.mjs`.

## 4. IMPLEMENTED — `src/intel/runtime.mjs`

- **`createRuntimeAdapter(options)`** — pilote la VRAIE session du moteur :
  - `{ engine, level, sessionId, clock?, storage?, recorderOptions?, onEvidence? }` ;
  - exige `engine.createSession` + `engine.apply` ; refuse sinon (`TypeError`) ;
  - exige `level.id` réel certifié et `sessionId` chaîne.
- **`commitReal(action)`** — cancrode la transition réelle via `engine.apply`
  (moteur injecté) ; lit l'événement réel via `lastLive(nxt)` (trace
  `.events` du moteur b1, ou `.live.events` si présent) ; émet
  `recorder.committed(...)` **depuis l'événement réel** (jamais une
  prédiction) ; gère `CHAIN_STARTED` / `CHAIN_BROKEN` réels ; détecte les
  terminaux réels via `engine.isWon` / `engine.isLost`.
- **API publique** : `version`, `method`, `sessionId()`, `started()`,
  `preview(action)`, `apply(action)`, `completed(summary)`, `failed(reason)`,
  `undo()`, `restart()`, `events()`, `evidence()`, `metrics()`,
  `profile(overrides)`, `recommendation(inputs)`, `orchestrate(inputs)`,
  `recorder`, `session()`. Aucune de ces méthodes n'écrit hors du contrat :
  l'ouverture est totale sur l'observation, **zéro écriture de progression**
  depuis l'adapter.
- **Undo réel** — ré-exécution déterministe : nouvelle session créer + rejeu
  de la trace tronquée via le vrai moteur (jamais un état fantôme).
- **Kill-switch réel** — `RUNTIME_KILL_SWITCH = "SAFE_DEFAULT"` : le mode
  `SAFE_DEFAULT` de l'Orchestrator est propagé sans écriture
  (`stateChanged: false`).

## 5. Constantes opposables

| Constante | Valeur |
| --- | --- |
| `RUNTIME_ADAPTER_VERSION` | `1` |
| `RUNTIME_ADAPTER_METHOD` | `"runtime:live-engine-v1"` |
| `RUNTIME_KILL_SWITCH` | `"SAFE_DEFAULT"` |

## 6. Pipeline opposable (briques RÉELLES uniquement)

```text
Engine RÉEL (apply) ──▶ ACTION_COMMITTED (événement réel)
   ──▶ deriveMetrics (evidence.mjs réel)
   ──▶ detectProfile (profile.mjs réel)
   ──▶ recommend (progression-policy.mjs réel)
   ──▶ orchestrate (progression-orchestrator.mjs réel, SEUL écrivain)
```