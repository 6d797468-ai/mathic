# MATHIC 1.0 — Contrat A11 : Certification

**Référence** : BRIEF §14 (pipeline), §12 · **Dépend de** : A9 (niveau), A10 (solver), A12 (difficulté) · **Statut** : DESIGN (à valider).

**Règle de fer** : un niveau **non certifié n'existe pas en production** (BRIEF §14, mandat §15). La certification est le seul passeport d'un niveau vers le contenu 1.0.

---

## 1. Pipeline de certification

```
DESIGN (authoring A9 spec)
  ↓
GENERATE / AUTHOR                (auteur humain ou générateur encadré §14 BRIEF)
  ↓
MATH VALIDATION                  (validation structurelle A9 §3, fail-fast — zéro NaN, bornes, types)
  ↓
SOLVER (A10)                     (solvable, shortest, alternatives, dead ends, enveloppe)
  ↓
DIFFICULTY ANALYSIS (A12)        (classe de difficulté + métriques, bornées)
  ↓
STRATEGY ANALYSIS                (tests §24-27 du mandat : domination, trivialité, profondeur)
  ↓
QUALITY FILTER                   (seuils : unicité, clarté, plage de scoring, anti-farm)
  ↓
HUMAN TEST (G7)                  (échantillon : compréhension + jouabilité + intérêt)
  ↓
CERTIFIED → status="certified"   (écrit dans A9.certification, daté, signé-objet)
```

Chaque étape **émet/write des artefacts** : chaque étape SSL verbose en `A9.difficulty`/`A9.certification`.

## 2. Critères de sortie par étape

| Étape | Sort valide si… |
|---|---|
| MATH VALIDATION | spec valide (0 violation de A9 §3) |
| SOLVER | `solvable=true`, `shortest ≤ maxMoves`, enveloppe score cohérente (§10 A10) |
| DIFFICULTY | `difficulty.class` attribuable (A12 §5) et **dans la plage du monde** (A13 : W4 ne doit pas attribuer Expert) |
| STRATEGY | **test de domination** (mandat §25) passe : aucune stratégie dominante ; **test de trivialité** (§26) passe ; **test de profondeur** (§27) passe (decisionPoints ≥ seuil) |
| QUALITY | pas de stratégie « farm » (boucle de combo infinie §6 A6), clarté multi-solutions atteinte, scoreRange > 0 |
| HUMAN TEST | jeu-vrai (G7) : compréhension objectif/ops/résultat/chaîne/combo/score ; envie de rejouer |

Seul **HUMAN TEST** est un gate obligatoire pour la vertical slice (un sous-ensemble représentatif par monde, pas nécessairement 100 % des niveaux).

## 3. Évidence & reproductibilité

- Chaque certification produit un **rapport** `certification.report` immuable : version solver, niveau `{id,version,ruleVersion}`, métriques A12, résultats A10, verdict par étape, date, outils.
- **Re-certification obligatoire** à chaque `ruleVersion`/`version` changeante (A9 §4) : un vieux rapport n'vaut que pour le niveau parfaitement identique.
- Les rapports sont **conservés** (traçabilité §18-A mandate) — jamais de nettoie destructif (§32).

## 4. Verdicts de décision

Chaque étape rend `PROVEN` | `BLOCKED` | `NO-GO` (mandat §31) :
- `PROVEN` : critères remplis (preuves en pièces jointes).
- `BLOCKED` : incertitude (contradiction de contrats, hypothèse expérimentale nécessaire) → déclenche un **STOP condition** §33 du mandate, jamais résolu par invention.
- `NO-GO` : critère explicite non rempli (insolvable, trivial, domine) → le niveau retourne au DESigne/Loom (avec la raison chiffrée : `solvable=false`, raison `domination: [strat]`).

## 5. Statut de sortie (champs A9)

`uncertified → analyzed → certified → playtested → published`. Règle : **certified minimum pour le contenu**, playtested minimum pour la slice, published pour la boutique 1.0.

## 6. Anti-inversion de responsabilité

- **La certification n'invente pas la mécanique** : si un niveau nécessite un **changement de règle** pour être faisable, ce n'est pas une « correction mineure » — c'est **NO-GO + STOP §33** (mécanique non définie / contrat à modifier). Les niveaux doivent rester dans les règles écrites (dette zéro).
- **La génération n'est pas la certification** : « généré » ≠ « certifié ». Les 10 000 candidats (§14) descendent par les QUALITY FILTER puis humain → ~20 certifiés.

## 7. Différentiel certification / runtime

- La **certification** est exhaustive/sous-budget large (par niveau, offline).
- Le **runtime** (le jeu quand on joue) n'est PAS certifiant par partie : il exécute, vérifie « seul les invariants locaux » (A1 §5) et s'en remet à la certification pour la global. C'est économiquement juste : la certification a déjà établi la solvabilité avant shipping.



D-CER1 — le pipeline exige human test **au minimum par monde** (échantillon représentatif) pour la slice 1.0 ; volume étendu en phase contenu. D-CER2 — tout changement de règle in-format = STOP + NO-GO, jamais « patch content ». Opposables.