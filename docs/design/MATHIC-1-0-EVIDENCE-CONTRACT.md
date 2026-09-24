# MATHIC 1.0 — Intelligence Contract : Player Evidence

**Référence** : Feuille de route MATHIC 1.0 §5.A, §6, §22 · **Consommé par** : Player Profile Detector (Brique 3) · **Consomme** : rien du Game Core (observateur pur) · **Statut** : CONTRAT (socle Brique 1, opposable).

L'évidence est **le seul canal** par lequel l'intelligence joueur observe le gameplay. Elle ne contient que des faits observables dans Mathic. Aucune donnée psychologique, aucune estimation d'intelligence, aucune inférence d'âge.

---

## 1. Principe

```text
PLAYER ──actions réelles──► PLAYER EVIDENCE ──► PROFILE DETECTOR
```

L'évidence est émise **à la frontière** : elle ne modifie aucune règle, aucun score, aucun état. C'est un contrat d'observation pure.

## 2. Norme des événements (liste figée)

```text
LEVEL_STARTED          LEVEL_COMPLETED         LEVEL_FAILED
ACTION_PREVIEWED       ACTION_COMMITTED        ACTION_INVALID
HINT_REQUESTED         HINT_USED               UNDO_USED
CHAIN_STARTED          CHAIN_BROKEN
TIME_TO_FIRST_ACTION   TIME_TO_SOLUTION
SOLUTION_DEPTH         SOLUTION_SCORE
RETRY_COUNT
```

Cette liste correspond à `EVIDENCE_TYPES` de `src/intel/contracts.mjs`. Toute évolution est une **révision versionnée** du plan de contrat, jamais une extension silencieuse.

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