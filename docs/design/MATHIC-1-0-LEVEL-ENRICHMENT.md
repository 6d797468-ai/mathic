# MATHIC 1.0 — ENRICHISSEMENT DU CATALOGUE : GRAMMAIRE & MASTERY (MISSION 9)

**Statut : TERMINÉE** — Mission : `M9 LEVEL GRAMMAR + CONTENT ENRICHMENT`.
**Décisions produit** : 5 nouveaux niveaux · désert médian W4/W5 comblé · MASTERY réelle en fin de ladder · police MASTERY inchangée.

---

## 1. Problème (contexte M8)

M8 a ouvert la fenêtre d'anticipation k=3 : chaque complétion débloque de façon
déterministe {N+1 … N+k}, la Policy (M3) recommande l'argmax dans cette fenêtre.
L'audit de diversité de contenu (analyses `analyzeAll`, Solver réel) a révélé :

```
COMBINATION (propriété Solver) = { N13, N14, N20, N23, N24, N29, N33 }  — 7/35
MASTERY     (propriété Solver) = ∅                                    — 0/35
```

Correction d'une croyance antérieure : la lecture « COMBINATION à partir de N13 »
était fausse (elle mesurait le stage clampé par monde, pas la propriété Solver).
En fenêtres de k=3 (signature exacte Policy = props + stage.name), seul
**19/35** niveaux différenciaient réellement les candidats de leur fenêtre.

```
Fenêtre non discriminante         Cause                   Décision
────────────────────────────────  ──────────────────────  ──────────────────────
N1–N9  (onboarding)               contiguïté faible       LAISSER (pédagogie : montée en douceur)
N24–N28 (désert médian W4/W5)     N25…N27 quasi-identiques  COMBLER  ← objet de M9
N35    (fin de ladder)            uniquement N36          LAISSER (couronnement)
```

Le désert médian était un **trou de contenu sémantique** : dans la fenêtre de
N24 (mondes W4÷ puis W5 budget), la Policy ne pouvait pas différencier les
candidats (tous MULTI-PATH sans notion arithmétique combinée).

## 2. Objectif

Enrichir le catalogue **réel et certifié** pour que les fenêtres du désert
médian offrent à la Policy de vraies alternatives de grammaire, et donner à la
fin de ladder (W6) une **MASTERY réellement certifiée par le Solver** — sans
toucher au pipeline (GENERATION → SOLVER → MATH VALIDATION → STRATEGY →
GLOSSARY → DIFFICULTY → CERTIFICATION → CATALOGUE → POLICY), sans ajouter de
layer IA, et sans aucun niveau « fabriqué pour satisfaire le profil ».

La règle non négociable (mandat) : chaque ajout **naît de l'énigme** et doit
passer la certification réelle. Le profil ne pilote jamais le contenu — il ne
fait que choisir dans des fenêtres dont la composition est une question de
contenu, pas de personnalisation.

## 3. Décisions de conception

| Décision | Valeur | Justification |
| --- | --- | --- |
| Nombre de niveaux | **5** (3 en W4/W5 + 2 en W6) | fourchette validée 4–6 ; 3 comblent le désert, 2 donnent la MASTERY |
| Police MASTERY | **inchangée** | `world=W6 ∧ routes≤2 ∧ consequenceEvidence ∧ chainDepth≥1 ∧ (comb ∨ minMoves≥3)` — aucun code de pipeline modifié |
| Positions d'insertion | après N24, après N27, après N29, avant N36 | chaque insertion met un COMBINATION DANS la fenêtre du niveau précédent |
| N36 « Le Maître » | **garde sa place de dernier niveau** | le couronnement reste le sommet déclaré de la ladder (recadrage M8 préservé) |
| Noms / sequelles | pédagogiques, alignés sur les mondes | générés depuis les routes réelles du Solver, jamais inventés |

### Positionnement (fonction d'insertion `LADDER[anchor]` → nouvelle position)

```
… N24 → N37 (W4, ÷d) → N25 → N26 → N27 → N38 (W4) → N28 → N29 → N39 (W5) → N30 …
… N34 → N35 → N40 (W6 MASTERY) → N41 (W6 MASTERY) → N36 (couronnement) …
```

Chaque fenêtre ouverte par la complétion d'un niveau du désert (N23..N29)
contient désormais au moins un COMBINATION :
`windowOf(N23)={N24,N37,N25}`, `windowOf(N25)={N26,N27,N38}`,
`windowOf(N26)={N27,N38,N28}`, `windowOf(N27)={N38,N28,N29}`,
`windowOf(N28)={N29,N39,N30}`, `windowOf(N29)={N39,N30,N31}`.

Fin de ladder : `windowOf(N35)={N40,N41,N36}` — les deux pinnacles MASTERY SONT
dans la fenêtre du niveau qui mène au couronnement. Le recadrage de fin (W-01/
W-09) est conservé : `windowOf(N36)=[]`.

## 4. Niveaux ajoutés (tous certifiés par le pipeline réel)

| Id | Monde | Nom | Idée pédagogique | Propriétés Solver |
| --- | --- | --- | --- | --- |
| N37 | W4 | Le Double 24 | deux façons de faire 24 (6×4 et 48÷2) puis 24+24 | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, **COMBINATION** |
| N38 | W4 | Deux Ordres pour 96 | additionner pour créer 10, puis diviser ou multiplier : deux routes, deux scores | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, **COMBINATION** |
| N39 | W5 | La Route Exacte | une seule suite menant au but (30÷5, +9, ×8) : déduction sous budget | SINGLE-PATH, CHAIN, **COMBINATION** |
| N40 | W6 | Les Deux Maîtrises | deux chemins maîtrisés vers 96, choix du plus sûr | MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION, **MASTERY** |
| N41 | W6 | La Maîtrise Déduite | une seule suite déduite (24÷4, ×13, +6) | SINGLE-PATH, CONSEQUENCE, CHAIN, OPTIMIZATION, COMBINATION, **MASTERY** |

Certification réelle (Solver, budget 40000) : N37 routes=6 · N38 routes=2 ·
N39 routes=1 · N40 routes=2 · N41 routes=1. Aucun doublon de grille
(`numMultiset+opMultiset`) avec le catalogue existant (contrôle workflow M9).

## 5. Adaptation du pont UI — DIFFICULTY par position

Les ids N37..N41 **ne sont plus alignés sur leur ordinal** (N37 est en 25e
position de LADDER). `DIFFICULTY()` (pont `src/b1/web/intel-navigation.mjs`)
indexait la difficulté par `Number(id.slice(1))` : un N37 en position 25 aurait
reçu l'index « 37 » — hors bande de difficulté de la Policy, penalty fantôme
systématique. Le pont produit désormais l'index par **position LADDER**
(`i+1`, N1→1) : la bande de difficulté reflète la distance pédagogique réelle.

## 6. Non-régression

- **Pipeline** : aucun changement dans `level-design.mjs`, `engine.mjs`,
  `solver.mjs`, `save.mjs`, policy/orchestrator/runtime — seule la *composition* du
  catalogue (donnée) et l'*index* de difficulté (métadonnée de position) changent.
- **N36 « Le Maître »** reste le **dernier** niveau de LADDER : tous les
  invariants de fin de ladder M8 (recadrage W-01/W-09) sont préservés.
- Les tests figés du catalogue ont été **mis à jour** (et non pas affaiblis) :
  N1..N41 en ordre pédagogique, perWorld élargi, signatures Solver des 5 nouveaux,
  distribution LD/NM/d'analyse augmentée, MASTERY désormais attendue (2), W-01/
  W-09/AP-06 ré-écrits sur la nouvelle fin de ladder.
- Suite complète : **294/294** PASS · playtest 50/50 · `npm run build` PASS ·
  `npm run build:b1` PASS.

## 7. Résultat produit (audit final)

```
Fenêtres discriminantes : 22/40 (vs 19/35 avant M9 ; désert médian comblé)
Désert médian N24–N29   : 100 % comblé (chaque fenêtre embarque un COMBINATION)
MASTERY (propriété)     : 2 niveaux (N40, N41) — certifiés SOLVER, plus seulement d'intention
Reste non discriminante : N1–N9 (onboarding, par conception), N14–N16/N22 (intermédiaires
                           à contenu déjà typé), N35/N37/N39/N40/N41 (extrêmes de ladder /
                           niveaux dont la fenêtre suite est elle-même riche)
```

Ce qui compte : **le désert médian n'est plus un désert**. La fenêtre adaptative
M8 dispose enfin de vraies alternatives de grammaire là où elle en avait besoin —
et le couronnement W6 s'appuie sur une MASTERY réelle au lieu d'une intention.