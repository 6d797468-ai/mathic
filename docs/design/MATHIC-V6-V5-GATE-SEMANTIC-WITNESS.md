# MATHIC V6 — GATE `V5-SEMANTIC-WITNESS` (CONTRAT)

**Statut du gate : `CLOSED` en M27.**

Implémenté par `src/v5/rules/witness.mjs`. Audit préalable et relevé des résultats :
`docs/design/MATHIC-V6-M27-SEMANTIC-WITNESS-AUDIT.md`.

Ce document décrit ce qui manquait, ce qui est exigé, et ce qui est
explicitement interdit. Il a servi de contrat à M27, qui l'a satisfait.

**Écart assumé par rapport au contrat initial :** la relation proposée était
`{ a, b, op, c }`, c'est-à-dire une identité binaire. L'audit a montré que
cette forme était **falsifiable** — une ligne additive résolue aurait satisfait
une réclamation `3 * 4 = 12`. La forme retenue est
`{ values, cells, requiredOp, target }` : une **saturation de ligne déclarée**,
non calculable et donc non falsifiable. Voir §2.1 du rapport M27.

---

## 1. POURQUOI CE GATE EST NÉCESSAIRE

M26 prouve la **légalité primitive** d'une séquence de `PLACE` via
`getMoves()` + `apply()`. Il ne prouve pas l'**accomplissement de la Méthode**.

Trois faux positifs sont figés dans `tests/gameplay/semantic-blocked.test.mjs` :

| # | Intention | Structure V5 | `valid` | Réalité |
|---|---|---|---|---|
| 1 | `METHOD_FACTORIZE(12 = 3 x 4)` | ligne additive `["+","+"]` | `true` | pas de multiplication |
| 2 | `METHOD_DECOMPOSE(7 = 3 + 4)` | ligne multiplicative `["*","*"]` | `true` | pas d'addition |
| 3 | `METHOD_FACTORIZE(12 = 3 x 4)` | facteurs non colinéaires | `true` | aucune opération commune |

La cause est structurelle : `rule-engine-v5` n'expose **aucune** API permettant
d'attester qu'une relation mathématique est satisfaite dans un état donné. Ses
fonctions de sémantique (`lineOk`, `evalOp`, `sumFeasible`, `quickReject`,
`OPERATORS`) sont internes.

Créer cette API dans `rule-engine-v5` est le seul chemin légitime. C'est
précisément ce que ce gate décrit.

---

## 2. PRINCIPES DIRECTEURS

| # | Principe | Conséquence |
|---|---|---|
| `W-01` | **V5 reste l'unique autorité** | La sémantique vit dans `src/v5/`, jamais dans `src/gameplay/` |
| `W-02` | **Lecture seule** | Le witness n'applique aucun coup, ne mute aucun état |
| `W-03` | **Pur** | Pas d'aléa, d'horloge, de réseau, d'UI, de stockage |
| `W-04` | **Déterministe** | Mêmes entrées ⇒ même verdict, y compris sur l'ordre |
| `W-05` | **Autonome** | Le witness ne connaît ni Intent, ni Méthode, ni Grimoire |
| `W-06` | **Contractuel, pas opportuniste** | Une API interne réexposée n'est pas un témoin ; l'API est ajoutée à `rule-engine-v5` comme surface publique |
| `W-07` | **Testé indépendamment** | Les tests du witness ne dépendent pas de `src/gameplay/` |
| `W-08` | **Échec fermé** | Toute incertitude ⇒ `UNPROVEN`. Jamais de `PROVEN` par défaut |

`W-08` est la contrepartie obligatoire de `W-04` : un témoin qui ne peut pas
répondre doit répondre « non », sinon l'absence d'information redevient un
feu vert.

---

## 3. CONTRAT PROPOSÉ

> Nomenclature indicative. Seule l'`intent` du gate est normative ici.

### 3.1 Signature

**Implémenté tel quel.** Le witness vit dans `src/v5/rules/witness.mjs` et ne
connaît rien du gameplay.

```js
witnessRelation(state, relation) -> verdict
```

### 3.2 `relation`

Décrit la relation à attester, dans les seuls termes que V5 connaît déjà.

| Champ | Type | Rôle |
|---|---|---|
| `kind` | `"LINE_SATISFACTION"` | Forme de la relation à vérifier |
| `values` | `[number, number]` | Valeurs que la Méthode prétend placer |
| `cells` | `[{ r, c }, { r, c }]` | Localisation de ces valeurs |
| `requiredOp` | `string` | Opérateur V5 que la Méthode prétend utiliser |
| `target` | `number` | Cible que la Méthode prétend atteindre |

> **Écart de forme, assumé.** Le contrat initial prévoyait `{ a, b, op, c }`.
> Une identité binaire aurait exigé de recalculer l'expression, donc de
> dupliquer la sémantique V5, et aurait produit un faux `PROVEN` sur une ligne
> additive résolue. La forme retenue porte sur la **ligne** : c'est ce que
> l évaluateur souverain sait trancher.

Aucune notion de « Méthode », « Intent » ou « strategie » n'entre dans cette
structure : c'est `W-05`.

### 3.3 `verdict`

```
{
  status:   "PROVEN" | "UNPROVEN" | "UNSUPPORTED",
  kind,
  reason,             // stable, testable, non textuel-dépendant
  missingApi: [...],  // rempli si status === "UNSUPPORTED"
  checkedCells: [...] // cellules effectivement examinées, pour audit
}
```

| Statut | Signification |
|---|---|
| `PROVEN` | la relation est satisfaite dans l'état, selon la sémantique V5 |
| `UNPROVEN` | la relation est évaluable et n'est pas satisfaite |
| `UNSUPPORTED` | la forme demandée n'est pas couverte par le witness |

`UNSUPPORTED` est distinct de `UNPROVEN` pour que l'absence de couverture reste
visible et ne se confonde pas avec un échec mathématique.

---

## 4. OBLIGATIONS DU WITNESS

1. **Interroger la sémantique existante, pas la recréer.** Le witness doit
   appeler la logique d'opérateurs de `rule-engine-v5`. Il ne doit contenir
   aucune table d'opérateurs, aucun `switch` sur `+ - * /`.
2. **Renvoyer les cellules examinées.** Un verdict sans localisation
   vérifiable n'est pas auditable.
3. **Raison stable.** La même relation défectueuse doit produire la même
   `reason`. Les tests s'appuient dessus.
4. **Ne jamais muter.** L'état reçu doit être structurellement inchangé en
   sortie ; à vérifier par comparaison avant/après.
5. **Déterminisme de l'ordre.** Énumérer des cellules dans un ordre arbitraire
   produirait des verdicts non reproductibles sur un plateau symétrique.

---

## 5. INTERDITS ABSOLUS

Ces interdits font partie du contrat, pas de son implementation.

| Interdit | Raison |
|---|---|
| Implémenter le witness dans `src/gameplay/` | Crée une autorité de règles parallèle ; diverge de V5 sans signal |
| Réexposer `lineOk`/`evalOp`/`sumFeasible` telles quelles | Ce sont des internes, pas un contrat ; leur signature n'est pas stable |
| Élargir `valid` pour englober la sémantique | Rend le vert non vérifiable et casse la séparation des responsabilités |
| Faire dépendre le witness de `src/gameplay/` | Inverse la dépendance descendante |
| Rendre `UNSUPPORTED` → `PROVEN` par défaut | Réintroduit exactement le défaut corrigé |
| Utiliser le witness pour certifier la **solvabilité** | Hors périmètre. La solvabilité est un gate distinct |

---

## 6. CRITÈRES D'ACCEPTATION DU GATE

Le gate ne peut passer `CLOSED` que si toutes ces conditions :

- [x] L'API existe dans `src/v5/rules/` et est exportée publiquement.
- [x] Aucun code de sémantique n'est dupliqué hors de `src/v5/`.
- [x] Les tests du witness passent **sans** importer `src/gameplay/`.
- [x] Les trois faux positifs de §1 rendent `UNPROVEN` via le witness.
- [x] Une relation satisfaite rend `PROVEN`, sur au moins une forme couverte.
- [x] `UNSUPPORTED` est rendu pour une forme non couverte, et jamais `PROVEN`.
- [x] Non-mutation vérifiée par test (`W-12`).
- [x] Déterminisme vérifié par exécution répétée (`W-13`).
- [x] Contrat de `rule-engine-v5` mis à jour (ce document).

**Résistance à l'affaiblissement.** Trois truquages ont été injectés puis
annulés : forcer `PROVEN` inconditionnellement (3 échecs), supprimer le
garde-fou d'opérateur (3 échecs), introduire une table d'opérateurs miroir
(1 échec). Le gate ne peut pas être ouvert par une modification locale.

---

## 7. CONSÉQUENCE SUR M26

Le gate est `CLOSED`. `SEMANTIC_STATUS_PROVEN` est **atteignable**, et ne l'est
que par un verdict réel du témoin.

Ce qui a changé pour M26 :

- `isSemanticallyProven()` retourne `true` uniquement sur `PROVEN`.
- `methodSemanticsCertified` peut valoir `true`, sur preuve seulement.
- `SEMANTIC_PROOF_BLOCKED` est désormais réservé au cas où **aucune
  réclamation n'a pu être formulée** : il ne masque plus un cas particulier.
- Les trois faux positifs de M26 rendent `UNPROVEN` avec une raison
  **diagnostique**, au lieu d'un `BLOCKED` global. C'est plus fort, pas plus
  faible : la non-certification est désormais expliquée.

Ce qui n'a **pas** changé : `valid` reste la légalité primitive, et un
`valid: true` sans `PROVEN` ne certifie toujours aucune Méthode.

La réouverture de `M26` comme jalon `PROVEN` exigerait un second gate, sur la
**solvabilité**, qui reste ouvert et n'a pas été touché.

---

## 8. RAPPEL DE PÉRIMÈTRE

Ce gate est **séparé de M26**. Il n'autorise aucun travail de gameplay, de
solveur, d'interface ou de Grimoire. Aucun élément ne doit être construit sur
la base d'un `valid: true` de M26 tant que le gate est ouvert.
