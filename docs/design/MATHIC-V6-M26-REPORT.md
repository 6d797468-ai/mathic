# MATHIC V6 — M26 REPORT (METHOD ENGINE)

**Verdict : `M26 = BLOCKED`**

> **Suite donnée en M27.** Le gate `V5-SEMANTIC-WITNESS` a été **fermé** par
> `src/v5/rules/witness.mjs`. Les trois faux positifs du §3 obtiennent désormais
> un verdict **spécifique** — `UNPROVEN`, avec la raison — au lieu du `BLOCKED`
> global. Le corps de ce rapport décrit l'état de M26 **à sa
> livraison** et n'est pas réécrit. Voir
> `MATHIC-V6-M27-SEMANTIC-WITNESS-AUDIT.md`.
>
> Ce qui reste vrai : `valid` reste la légalité primitive, et un `valid: true`
> ne certifie une Méthode que sur un `PROVEN` réellement produit par V5.

Le moteur de Méthodes est publié, câblé, testé et déterministe. Il n'est **pas** prouvé sur le fond. Ce rapport sépare strictement ce qui est acquis de ce qui manque, pour qu'aucun consommateur ne puisse lire un `valid: true` comme une certification de Méthode.

---

## 1. STATUT GLOBAL

| Domaine | État | Nature de la preuve |
|---|---|---|
| Compilation `Intent → PLACE` | **ACQUIS** | Preuve structurelle : sortie déterministe, primitive unique |
| Légalité primitive V5 | **ACQUIS** | Preuve d'autorité : `getMoves()` + `apply()` de V5 |
| Immuabilité du plateau | **ACQUIS** | Preuve d'exécution : `preview()` ne mute pas l'état |
| Déterminisme / pureté | **ACQUIS** | Preuve structurelle : aucun aléa, horloge, réseau, UI, stockage |
| Non-duplication de V5 | **ACQUIS** | Preuve structurelle : aucun interne de `rule-engine-v5` recopié |
| **Accomplissement de la Méthode** | **MANQUANT** | **Aucune postcondition sémantique** |
| Exclusivité de la preuve de Méthode | **MANQUANT** | V5 n'expose pas d'API de témoin |

**Conclusion.** M26 satisfait `M-01` au sens *procédural* — une Méthode ne mute l'état que via une séquence de `PLACE` légaux — mais **pas** au sens *sémantique* : rien n'établit que l'état obtenu résulte bien de la transformation demandée.

---

## 2. CE QUI EST ACQUIS

### 2.1 Pipeline

```
Intent  ->  validateIntent()      (forme, valeurs, arité)
        ->  registry.has()        (méthode enregistrée)
        ->  checkPreconditions()  (bornes, cases vides, réserve)
        ->  compile()             -> [PLACE ...]      déterministe, pur
        ->  prove()               -> getMoves/apply   autorité V5
        ->  preview()             -> rapport structuré, état non muté
```

### 2.2 Invariants tenus

- **Déterminisme** : à entrée égale, sortie identique. Aucune source d'aléa ou d'horloge dans `src/gameplay/`.
- **Poussée descendante stricte** : `src/gameplay/` ne définit aucune règle de jeu. Il consomme V5.
- **Primitivité** : le compilateur n'émet que `PLACE`. Aucune mutation directe d'état.
- **Immuabilité** : `preview()` compare une empreinte JSON de l'état avant/après et lève si divergence.
- **Zéro régression** : les 8 tests de `tests/gameplay/multi-strategy.test.mjs` restent verts.

---

## 3. LE DÉFAUT : TROIS FAUX POSITIFS

`valid: true` signifie « ces `PLACE` sont légaux selon V5 ». Cela ne dit **rien** de la Méthode. Trois contre-exemples le démontrent, et tous trois passent aujourd'hui au vert.

### 3.1 Contre-exemple 1 — multiplication sur une ligne additive

```js
spec.rows[0] = { target: 12, ops: ["+", "+"] }   // ligne 3 + 4 + _
METHOD_FACTORIZE, targets [(0,0), (0,1)], values [3, 4]
```

V5 accepte : la somme de la ligne reste ≤ 12, la colonne est cohérente, aucune ligne n'est complète.
**Résultat : `valid: true`.** Or la ligne porte `+`, pas `*` : **la factorisation n'a pas eu lieu**.

### 3.2 Contre-exemple 2 — décomposition sur une ligne multiplicative

```js
spec.rows[0] = { target: 12, ops: ["*", "*"] }   // ligne 3 * 4 * _
METHOD_DECOMPOSE, targets [(0,0), (0,1)], values [3, 4]
```

**Résultat : `valid: true`.** Or la ligne porte `*` : **la décomposition additive n'a pas eu lieu**. C'est le cas le plus grave : les deux colonnes sont individuellement correctes, ce qui donne l'illusion d'une stratégie valide.

### 3.3 Contre-exemple 3 — facteurs non colinéaires

```js
grid 3x3, toutes lignes additives
METHOD_FACTORIZE, targets [(0,0), (2,2)], values [3, 4]
```

**Résultat : `valid: true`.** `(0,0)` et `(2,2)` ne partagent **ni ligne ni colonne**. Aucune opération n'est jamais effectuée sur ces deux nombres. Aucune postcondition de méthode ne peut être satisfaite.

### 3.4 Cause racine

La Méthode est compilée en « poser deux valeurs à deux positions », et rien ne relie cette action à l'opération mathématique déclarée. Le couplage entre **l'intention** (`METHOD_FACTORIZE`) et **l'effet** (`12 = 3 x 4`) est purement lexical, jamais vérifié.

---

## 4. POURQUOI LE BLOCAGE EST CORRECT

`valid` est aujourd'hui la seule preuve disponible. La postcondition d'accomplissement exigerait de vérifier que la relation mathématique invoquée est satisfaite **dans V5**, avec la sémantique d'opérateur de `rule-engine-v5`.

Or V5 n'expose aucune API permettant cela :

- `rule-engine-v5` n'exporte **aucune** fonction d'évaluation de ligne : ni `evaluateLine()`, ni `verifyLine()`, ni équivalent public.
- Ses fonctions de sémantique (`lineOk`, `evalOp`, `sumFeasible`, `quickReject`, `OPERATORS`) sont **internes** et non contractuelles.

Deux seules voies s'offrent, et **les deux sont interdites dans M26** :

| Voie | Verdict |
|---|---|
| Recopier la sémantique V5 dans `src/gameplay/` | **INTERDITE** — crée une autorité de règles parallèle, interdit par `G-02`/`M-01`, et divergera silencieusement de V5 |
| Élargir `valid` pour englober la sémantique | **INTERDITE** — casse la séparation des responsabilités et rend le vert non vérifiable |

**Il faut donc une nouvelle API V5.** C'est l'objet du gate séparé `V5-SEMANTIC-WITNESS` (voir §6).

---

## 5. RENDU EXPLICITE DU BLOCAGE

Le blocage n'est plus implicite. Il est encodé dans la donnée, de sorte qu'aucun appelant ne puisse l'ignorer.

### 5.1 Dans le Proof Engine

Toute forme de retour porte désormais la même enveloppe :

```js
{
  valid,          // légalité PRIMITIVE uniquement
  engine: "V5",
  scope: "PRIMITIVE_LEGALITY_ONLY",     // portée explicite
  semantic: {
    proven: false,                      // jamais true en M26
    status: "BLOCKED",
    reason: "Postcondition de methode non evaluable : V5 n'expose pas evaluateLine()",
    missingApi: ["evaluateLine"],
    blockedBy: "V5-SEMANTIC-WITNESS",
  },
  steps, finalState,
}
```

`SEMANTIC_PROOF_BLOCKED` est `Object.freeze` : impossible de le basculer à la main. `isSemanticallyProven(result)` est le seul point de lecture, et retourne `false` sur **toutes** les branches, y compris les retours précoces.

### 5.2 Dans le Preview

`preview()` expose trois champs supplémentaires, sur **tous** les chemins y compris les retours précoces (état nul, intent invalide, méthode inconnue, préconditions échouées, échec de compilation) :

- `proofScope` : `PROOF_SCOPE_PRIMITIVE_ONLY` (`"PRIMITIVE_LEGALITY_ONLY"`)
- `semantic: { proven: false, status: "BLOCKED", ... }`
- `methodSemanticsCertified: false`

`methodSemanticsCertified` est le champ destiné aux appelants qui veulent une certification de Méthode. Il est à `false` par construction.

### 5.3 Ce qui n'a **pas** été fait

- `valid` n'a **pas** été redéfini. Aucun comportement existant ne change.
- Aucune interface n'a été élargie pour « faire passer » les faux positifs.
- Aucun solveur, aucune Méthode, aucun élément d'UI ou de Grimoire n'a été touché.
- `src/v5/rules/` n'a **pas** été modifié.

---

## 6. LE BLOCKER, ET SON CHEMIN DE LEVÉE

**Blocker :** V5 n'expose pas de témoin sémantique.

**Chemin de levée (gate séparé, hors M26) :** voir `docs/design/MATHIC-V6-V5-GATE-SEMANTIC-WITNESS.md`.

En résumé, la levée exige, dans cet ordre :

1. Une API publique et contractuelle dans `rule-engine-v5` capable d'attester qu'une relation donnée est satisfaite dans l'état résultant.
2. Un contrat de gate en lecture seule, pur et déterministe, sans dépendance à `src/gameplay/` ni à l'UI.
3. Des tests dédiés auditant le witness lui-même, indépendamment de M26.
4. Seulement alors : `SEMANTIC_STATUS_PROVEN` devient atteignable, et les trois contre-exemples de §3 basculent sur `proven: true` — ce qui **fermera** les tests `SB-01` à `SB-03` et exigera une mise à jour délibérée de ce rapport.

**Tant que ce gate est ouvert, `M26 = BLOCKED`.**

---

## 7. NON-RÉGRESSION

`tests/gameplay/semantic-blocked.test.mjs` — 11 tests, dont 3 qui figent les faux positifs du §3.

Ces tests ne corrigent pas le défaut et ne font pas échouer la suite verte. Ils **échouent si le blocage disparaît silencieusement**, c'est-à-dire si un `valid: true` redevient présenté comme un certificat de Méthode. C'est le garde-fou demandé.

| Test | Verrouille |
|---|---|
| `SB-01` | FACTORIZE sur ligne additive reste non certifié |
| `SB-02` | DECOMPOSE sur ligne multiplicative reste non certifié |
| `SB-03` | Facteurs non colinéaires restent non certifiés |
| `SB-04` | Un faux positif de portée reste distinct d'un rejet V5 réel |
| `SB-05` | `isSemanticallyProven()` est `false` sur toutes les branches |
| `SB-06` | `SEMANTIC_PROOF_BLOCKED` est figé et non falsifiable en place |
| `SB-07` | `src/gameplay` ne duplique aucun interne de V5 |
| `SB-08` | `src/gameplay` reste pur (ni aléa, horloge, réseau, UI, stockage) |
| `SB-09` | M26 n'importe aucun solveur et ne fait aucune recherche |
| `SB-10` | M26 ne redéclare pas la table des opérateurs V5 |
| `SB-11` | Deux stratégies distinctes ne produisent aucune preuve de Méthode |

Les gardes `SB-07` à `SB-10` inspectent le code **après suppression des commentaires et des littéraux** : citer `lineOk()` dans une raison d'erreur est légitime et ne doit pas les faire échouer. Seul du code réellement exécuté compte. Leur capacité à échouer a été vérifiée par injection d'une violation réelle.

---

## 8. SUITE DE VÉRIFICATION

| Commande | Résultat |
|---|---|
| `node --test tests/gameplay/multi-strategy.test.mjs` | 8 / 8 |
| `node --test tests/gameplay/semantic-blocked.test.mjs` | 11 / 11 |
| `npm test` | 506 / 506 |
| `npm run build` | 4 / 4 |
| `git diff --check` | propre |
| `git status` | 3 fichiers attendus |

---

## 9. SUITE

M26 reste `BLOCKED` et **ne peut pas** passer `PROVEN` dans le cadre actuel. La suite immédiate est l'ouverture du gate `V5-SEMANTIC-WITNESS` en M27, puis seulement la semantique. Aucun élément de gameplay, de solveur ou d'interface ne doit être construit sur la base d'un `valid: true` tant que ce gate est ouvert.
