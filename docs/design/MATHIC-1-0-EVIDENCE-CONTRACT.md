# MATHIC 1.0 — Intelligence Contract : Player Evidence

**Référence** : Feuille de route MATHIC 1.0 §5.A, §6, §22 · **Consommé par** : Player Profile Detector (Brique 3) · **Consomme** : rien du Game Core (observateur pur) · **Statut** : CONTRAT (socle Brique 1, opposable) · **Révision v1.1** (Brique 2) : LEVEL_RESTARTED, LEVEL_ABANDONED, enveloppe d'émission.

L'évidence est **le seul canal** par lequel l'intelligence joueur observe le gameplay. Elle ne contient que des faits observables dans Mathic. Aucune donnée psychologique, aucune estimation d'intelligence, aucune inférence d'âge.

---

## 1. Principe

```text
PLAYER ──actions réelles──► PLAYER EVIDENCE ──► PROFILE DETECTOR
```

L'évidence est émise **à la frontière** : elle ne modifie aucune règle, aucun score, aucun état. C'est un contrat d'observation pure.

## 2. Norme des événements (liste figée — révision v1.1)

```text
LEVEL_STARTED          LEVEL_RESTARTED         LEVEL_COMPLETED
LEVEL_FAILED           LEVEL_ABANDONED
ACTION_PREVIEWED       ACTION_COMMITTED        ACTION_INVALID
HINT_REQUESTED         HINT_USED               UNDO_USED
CHAIN_STARTED          CHAIN_BROKEN
TIME_TO_FIRST_ACTION   TIME_TO_SOLUTION
SOLUTION_DEPTH         SOLUTION_SCORE
RETRY_COUNT
```

Cette liste correspond à `EVIDENCE_TYPES` de `src/intel/contracts.mjs`. Toute évolution est une **révision versionnée** du plan de contrat, jamais une extension silencieuse.

Sémantique opposable :

- **LEVEL_RESTARTED** = fait de reprise du niveau. `RETRY_COUNT` est une **métrique dérivée** (nombre de LEVEL_RESTARTED), jamais un événement.
- **LEVEL_ABANDONED** = abandon volontaire. Un abandon **n'est pas un échec** : `LEVEL_FAILED` ne porte que l'échec réel du niveau (`reason: "move_limit"`).
- **CHAIN_STARTED** = première transition `chainRun 0 → ≥1` (reprise d'un résultat précédemment calculé) observée sur une **action validée**.
- **CHAIN_BROKEN** = transition valide `chainRun n>0 → 0`. Une action invalide **ne casse jamais** une chaîne.
- Un terminal (`LEVEL_COMPLETED`, `LEVEL_FAILED`, `LEVEL_ABANDONED`) clôt la session : plus aucune évidence ensuite.

## 2bis. Enveloppe d'émission (Brique 2)

`src/intel/evidence.mjs` émet chaque évidence dans une enveloppe versionnée et séquencée :

```text
{ schemaVersion, sessionId, levelId, levelVersion, ruleVersion, seq, type, atMs, payload?, provider }
```

- `schemaVersion` = `EVIDENCE_SCHEMA_VERSION` (actuellement `1`) ; `seq` monotone (1, 2, 3…) ;
- `atMs` = horloge **injectée** (EvidenceClock) : en production temps mono-écoulé de session, en test horloge déterministe — jamais `Date.now()` dans le cœur de l'émetteur ;
- `payload` ne contient que des faits (ids de cellule, résultat, delta, run de chaîne, raison) ;
- chaque évidence est validée par `validateEvidence` à l'émission : une sortie hors contrat est une erreur (TypeError), pas une évidence.

## 3. Forme du contrat

```text
{
  type:    "LEVEL_COMPLETED",          // ∈ EVIDENCE_TYPES
  levelId: "N7",                       // chaîne non vide
  atMs:    12408,                      // durée de session >= 0, finie
  payload: { score: 19, movesLeft: 1 } // optionnel, objet plat
}
```

Garanties contractuelles (`validateEvidence`) :

- `type` appartient à la norme ;
- `levelId` non vide ;
- `atMs` >= 0 et fini (jamais NaN, jamais `Infinity`, jamais négatif) ;
- `payload`, s'il existe, est un objet (jamais un tableau, jamais `null`) ;
- aucun `FORBIDDEN_EVIDENCE_FIELDS` présent (voir §4).

## 4. Anti-collecte (Phase 8, dès le contrat)

Les champs suivants sont **interdits** dans toute évidence :

```text
age  iq  intelligence  gender  name  email  geolocation  deviceId  personality
```

Mathic connaît « comment cette personne joue », jamais « qui est cette personne ».

## 5. Granularité

- Découpage par **partie** (une session de niveau) et par **action** (les événements sont horodatés en début de partie).
- Le profil d'évidence est rejouable : à partir des événements, le détecteur peut rejouer la partie (SOLUTION_DEPTH, SOLUTION_SCORE, chaînes) sans dépendre d'un stockage de chemin personnel.

## 6. Non-objectifs

- ❌ Aucune estimation d'intelligence ou d'âge.
- ❌ Aucune donnée d'appareil / position / identité.
- ❌ L'évidence ne **décide jamais** (elle alimente la projection de profil ; elle n'influence ni GameState, ni objectif, ni score).
- ❌ Pas de suivi multi-session réactivable (identité de session rotative, hors périmètre Brique 1).

---

**D-EV1** — l'évidence est la seule porte d'observation de l'intelligence joueur. **D-EV2** — les champs psychologiques sont interdits par le contrat, pas par bonne volonté. **D-EV3** — l'évidence est rejouable (traçabilité réelle). Opposables.