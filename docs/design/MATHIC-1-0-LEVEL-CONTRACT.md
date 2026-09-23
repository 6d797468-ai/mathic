# MATHIC 1.0 — Contrat A9 : Level

**Référence** : BRIEF §6 (niveau = équation de contraintes), §14 (pipeline), §22 · **Dépend de** : A2, A3, A8, A7 (config) · **Consommé par** : A10, A11, A13, A15 · **Statut** : DESIGN (à valider).

## 1. Le niveau est une donnée versionnable, pas du code

Un niveau est un **objet pur de contenu**. Il ne contient aucune logique. Il est lu par : game-state (exécution), solver (certification), Momo (explications), differential telemetry.

## 2. Schéma de niveau (champs)

```jsonc
{
  "id": "w4-012",
  "version": 3,                // version de DESIGN (itérations du niveau)
  "ruleVersion": 1,            // version du CONTRAT d'interprétation (A1→A8) — cf. §4
  "seed": "seed-constante",    // identifiant stable de construction (déterminisme content)
  "board": { "w": 4, "h": 4, "cells": [ "9", "2", "×", "6", "4", … ] },  // tuiles initiales
  "availableOperations": ["+", "−", "×"],        // tuiles-opérateurs présentes = sous-ensemble
  "objective": {
    "target": 48,
    "maxMoves": 12,
    "conditions": { "chain": null, "combo": null, "minScore": null }   // experimental : null désactivé
  },
  "constraints": { "maxComboMultiplier": 4, "valueMin": -1024, "valueMax": 4096 },
  "scoreConfiguration": { "policy": "additive", "coefficients": { "base": 1, "complexity": 0, "chain": 0, "combo": 0, "efficiency": 0, "objective": 0 } },
  "rewardConfiguration": { "stars": { "1": 1, "2": 3, "3": 6 } },  // conditions de score → A13
  "difficulty": { "class": "proposed", "metrics": null },   // rempli par A11/A12 à la certification
  "certification": { "status": "uncertified", "by": null, "date": null, "report": null }
}
```

## 3. Règles de validité (fail-fast, A1 §7)

1. `board.cells` : tuiles typées correctement, bornes respectées, rectangle w×h cohérent (A2 §2).
2. `availableOperations ⊆ OPS` ; toute tuile-opérateur du board ∈ `availableOperations` (sinon tuile intouchable → spec invalide).
3. `objective.target` : entier, et **≠ simple répétition d'une valeur initiale** (test de trivialité appliqué en phase d'auteur, A11).
4. `maxMoves` ≥ 1, entier.
5. `scoreConfiguration.coefficients` : réels ≥ 0 ; `base.c ≥ 1` (A7 §2).
6. `rewardConfiguration.stars` : conditions croissantes et **censées atteignables** (contrôle par A10 enveloppe de score).
7. `difficulty.metrics` et `certification.status` sont **les seuls champs modifiables POST-certification**, et uniquement par certification (A11) — jamais par l'auteur sauf re-spec.
8. Un niveau sans certification valide = **non-production** (A11) : le contenu livré n'embarque que des niveaux `certified`.

## 4. Versionnage & compatibilité (le mandat §13 est strict)

- `ruleVersion` : numéro du contrat d'interprétation. **Toute évolution de sémantique** (A1→A8 qui change un résultat, une borne, une conséquence) incrémente `ruleVersion`, **jamais silencieusement**.
- À la chargement : `ruleVersion` du niveau **doit** correspondre au `ruleVersion` courant du moteur, sinon → **migration déclarée** (élévée) ou **refus clair**, jamais interprétation ambigu.
- **Règle d'or** : aucun changement de règle n'altère la signification d'un ancien niveau sans que ce niveau soit **ré-certifié**, n° de version incrémenté et **statut certification remis à zéro** (`uncertified`).
- Traçage : l'ensemble {id, version, ruleVersion} est l'identité formelle d'un niveau en télémétrie/persistance (jamais l'ID seul).

## 5. Le niveau en production : pipeline

```
auteur   → spec (A9)           → stats "proposed"
A10 (solver) + A12 (difficulté) → stats "analyzed"
A11 (certification)            → stats "certified"      ← seul autorisé en contenu
G7 (test humain)               → stats "playtested"     ← au moins échantillon représentatif
Publish                        → stats "published"
```

Aucun niveau n'entre en production sans `status == certified` (A11 §5) — et la **vertical slice 1.0** exige un échantillon `playtested` (G7).

## 6. Reproductibilité

- `seed` + `ruleVersion` permettent de **reconstruire exactement** le même niveau à l'identique (tooling d'authoring et de certification) — déterministe, sans base de données requise pour la reproductibilité des tests/résultats.
- La **partie** (trace, A15) référence `{id, version, ruleVersion, seed}` — un replay ancien se rejoue à l'identique SI ruleVersion correspond (sinon : rapport de désynchronisation explicite).

## 7. Interactions contractuelles

- **α A10** : le solver attend `board` + `objective` + `constraints` (fonction de coût par coups MAX, enveloppe).
- **α A11** : certification écrit `difficulty.metrics` + `certification`.
- **α A13** : `rewardConfiguration.stars` définit les étoiles ; `progression` référence `level.id` (et version) pour l'historique joueur.
- **α A15** : la sauvegarde persiste `{levelId, levelVersion, ruleVersion}` par niveau terminé — la version du niveau est **collectée**, pas reconstructive par hypothèse.

---

D-L1 — **certification as data, non-editable par l'auteur** (excepté re-spec + re-certification). D-L2 — `ruleVersion` = contrat d'interprétation versionné. D-L3 — pas de « niveau de démo » : tout niveau shipping a status ≥ certified. Opposables.