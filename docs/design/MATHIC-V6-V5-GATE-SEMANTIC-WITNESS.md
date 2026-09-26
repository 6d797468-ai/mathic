# MATHIC V6 — GATE `V5-SEMANTIC-WITNESS` (CONTRAT)

**Statut du gate : `OPEN` — non implémenté. Contrat uniquement.**

Ce document ne fait **pas** partie de M26. Il décrit ce qui manque, ce qui sera
exigé, et ce qui est explicitement interdit, afin que la levée du blocage
`M26 = BLOCKED` soit un acte délibéré et vérifiable plutôt qu'un élargissement
silencieux d'un indicateur.

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

Le witness vit dans `src/v5/rules/` et n'est nommé qu'après conception
complète. Forme attendue :

```
witnessRelation(state, relation) -> verdict
```

### 3.2 `relation`

Décrit la relation à attester, dans les seuls termes que V5 connaît déjà.

| Champ | Type | Rôle |
|---|---|---|
| `kind` | énumération | Forme de la relation à vérifier |
| `a`, `b`, `op`, `c` | `number` | Opérandes et résultat attendus |
| `cells` | liste de `{ r, c }` | Localisation des cellules dont les valeurs portent les opérandes |

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

- [ ] L'API existe dans `src/v5/rules/` et est exportée publiquement.
- [ ] Aucun code de sémantique n'est dupliqué hors de `src/v5/`.
- [ ] Les tests du witness passent **sans** importer `src/gameplay/`.
- [ ] Les trois faux positifs de §1 rendent `UNPROVEN` via le witness.
- [ ] Une relation satisfaite rend `PROVEN`, sur au moins une forme couverte.
- [ ] `UNSUPPORTED` est rendu pour une forme non couverte, et jamais `PROVEN`.
- [ ] Non-mutation vérifiée par test.
- [ ] Déterminisme vérifié par exécution répétée.
- [ ] Contrat de `rule-engine-v5` mis à jour.

---

## 7. CONSÉQUENCE SUR M26

Tant que ce gate est `OPEN` :

- `M26 = BLOCKED`.
- `isSemanticallyProven()` retourne `false` sur toutes les branches.
- `SEMANTIC_STATUS_PROVEN` est inatteignable.
- `methodSemanticsCertified` est `false` par construction.
- Les tests `SB-01` à `SB-06` restent verts et **doivent le rester**.

À la fermeture du gate, `SEMANTIC_STATUS_PROVEN` devient atteignable. Les
tests `SB-01` à `SB-03` échoueront alors **par construction**, ce qui est le
comportement voulu : la réouverture de M26 doit être un acte conscient, avec
mise à jour de `MATHIC-V6-M26-REPORT.md`, et ne peut pas résulter d'un
glissement de code.

---

## 8. RAPPEL DE PÉRIMÈTRE

Ce gate est **séparé de M26**. Il n'autorise aucun travail de gameplay, de
solveur, d'interface ou de Grimoire. Aucun élément ne doit être construit sur
la base d'un `valid: true` de M26 tant que le gate est ouvert.
