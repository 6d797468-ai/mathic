# MATHIC 1.0 — Rapport de mandat : Discrimination adaptative de la Policy (MISSION 10)

**Référence** : MISSION 10 — `ADAPTIVE POLICY DISCRIMINATION` · Méthode : `MATHIC-1-0-ADAPTIVE-POLICY-DISCRIMINATION.md`
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVE.

---

## 1. Objet

Répondre à la question du mandat : **la Policy discrimine-t-elle RÉELLEMENT ?**
— ou se contente-t-elle de redonner le front ordinal ? La réponse démontrée :
**oui**, la sélection ADAPTIVE change en fonction du profil ET des candidats, mais
la divergence n'est **jamais fabriquée** (ordre d'entrée, ID numérique, aléa) :
elle est à chaque fois justifiée par une règle de grammaire réellement portée par
le niveau gagnant. Les positions et la difficulté sont désormais **canoniques**
(position LADDER via DifficultyMetadata), jamais dérivées de l'ID. Zéro nouvelle
architecture, zéro LLM, zéro modification du pipeline de jeu.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Modèle `LevelCandidate` + classement canonique | Code (MOD) | `src/intel/progression-policy.mjs` (`levelCandidate`, `positionOf`, `rankedRecommendation` rempli) |
| Position unique de vérité | Code (ADD) | `src/b1/levels.mjs` (`ladderPosition(id)`, `ladderDifficulty()`) |
| Fixtures canoniques partout | Code (MOD) | `scripts/simulate-policy.mjs`, `simulate-adaptive-progression.mjs`, `tests/intel/{runtime,progression-policy,progression-orchestrator}.test.mjs` (`DIFFICULTY = ladderDifficulty()`) |
| Suite de tests PD-01..PD-15 | Test (ADD) | `tests/intel/policy-discrimination.test.mjs` (17 tests) |
| Expérience F/D/G/fallback | Code (ADD) | `scripts/experiment-policy-discrimination.mjs` (15 fenêtres × 3 profils × 4 tiers) |
| Conception + rapport | Docs (ADD) | `docs/design/MATHIC-1-0-ADAPTIVE-POLICY-DISCRIMINATION.md` + `-REPORT.md` |

**PRESERVE (intouché)** : engine, solver, save, orchestrator, runtime, pont UI,
policy UI adaptive, B1 gameplay. Le bord de la Policy (API `recommend`) est
identique ; seuls ses calculs internes de position et ses fixtures d'entrée
changent.

### Corrections effectuées en route (audit DANGER / positional / safe)

Audit complet `id.slice(1)` sur le repo :

| Usage | Danger | Corrigé |
| --- | --- | --- |
| `scripts/simulate-policy.mjs:67` | DANGEROUS (catalogue complet, N37→id37≠pos25) | `DIFFICULTY = ladderDifficulty()` |
| `scripts/simulate-adaptive-progression.mjs:46` | DANGEROUS | `ladderDifficulty()` |
| `tests/intel/runtime.test.mjs:41` | DANGEROUS | `ladderDifficulty()` |
| `tests/intel/progression-policy.test.mjs:35` | positionnel, inoffensif (N1..N16) — corrigé par cohérence | `ladderDifficulty()` |
| `tests/intel/progression-orchestrator.test.mjs:34` | idem | `ladderDifficulty()` |
| `tests/b1/b1-5-smoke.test.mjs:52` | SAFE (sélecteur CSS) | — |
| `tests/b1/cg-levels.test.mjs:108` | SAFE (validation format) | — |

## 3. Réponses aux questions du mandat (style §16)

### Q1 — La Policy discrimine-t-elle par profil ?

**PROUVÉ.** Corpus réel, 192 paires profil→recommandation :
**D = 0.41** (26/64 cellules fenêtre × tier où ≥2 profils divergent) ;
128 sélections ADAPTIVE portent un `*_MATCH` (G = 0.89). Exemples :

```
N14-COMBINATION-decision : arithmetic→N14 ARITHMETIC_MATCH, explorer→N13, chain→N14
N20-COMBINATION-vs-exploration : arithmetic→N20(COMBINATION), explorer→N19(MULTI-PATH/CHAIN)
MASTERY fenêtre N40-N41 : arithmetic→N41(MASTERY), explorer→N40
```

### Q2 — La divergence est-elle réelle ou fabriquée ?

**PROUVÉ NON-fabriquée** :
- **PD-11** : réordonner les candidats ⇒ sortie byte-identique ;
- **PD-13** : renommer N37→N77 sans changer la position ⇒ même décision ;
- **PD-02** : 5 exécutions ⇒ sortie byte-identique (aucun aléa) ;
- **PD-04** : candidats de grammaire STRICTEMENT identique (N7/N10/N16) ⇒ tous les
  profils convergent vers le même niveau (front de proximité), aucune divergence
  inventée par le profil ;
- chaque gagnant ADAPTIVE porte la grammaire de la règle qui l'a élu (PD-03, PD-07,
  PD-08) : jamais de `*_MATCH` sans propriété Solver correspondante.

### Q3 — Le front ordinal n'est-il pas toujours gagnant par inertie ?

**PROUVÉ.** F global = **0.83** sur 192 recommandations ; en ADAPTIVE F = 0.77
(alors que SAFE_DEFAULT F = 1.00 par définition du repli). 33 ADAPTIVE s'écartent
de l'ordinal, **toujours** parce qu'une règle grammaticale le justifie (PD-10 :
le niveau grammaticalement adéquat bat ceux qui n'ont pas la grammaire, même près
du front). Aucun écart « pour faire baisser F » : le mandat l'interdit, et aucun
choix N+2/N+3 n'est produit en l'absence de justification grammaticale (PD-04).

### Q4 — La difficulté est-elle correctement calculée sur tout le catalogue ?

**PROUVÉ.** La bande de difficulté utilise désormais la **position canonique** :
N37 (id 37) est traité à la position **25** (PD-12). PD-09 : avec une cible relevée
(difficultyResponse), N37 (pos 25, distance −1) est DANS la bande, N24 (pos 24,
distance −2) ne l'est pas. Avant M10, `Number(id.slice(1))` aurait placé N37 hors
bande de façon fantôme (comme diagnostiqué en M9).

### Q5 — Le repli sûr reste-t-il le pivot ?

**PROUVÉ.** confiance < 0.35 ⇒ SAFE_DEFAULT (F = 1.00, G = —) ; SAFE_DEFAULT
configuré ⇒ aucun classement, front ordinal pour tous (PD-05, PD-06). Les
45 recommandations à confiance faible du corpus sont toutes sur le front.

### Q6 — Non-régression / architecture ?

**PROUVÉ** : suite complète **311/311** PASS (294 antérieurs non-régressés + 17
PD), playtest 50/50 PASS, `npm run build` PASS, `npm run build:b1` PASS.
**PD-14** : la Policy n'écrit jamais dans la Save (scan source + exécution) ;
**PD-15** : aucun accès Engine, aucun import Game Core (`../b1/`, `src/b1`,
`solver`, `engine`, `Math.random`, `Date.now`, `fetch`) — frontière §21 conservée.

## 4. Résultats de l'expérience corpus (observationnels, déterministes)

```
Corpus : 16 fenêtres réelles × 3 profils × 4 tiers = 192 recommandations
F = 0.83 (SAFE_DEFAULT 1.00 · ADAPTIVE 0.77)
D = 0.41  (26/64 cellules divergent · SAFE_DEFAULT : 0/16 divergent)
G = 0.89  (128 ADAPTIVE justifiées par la grammaire)
fallback : 48/192 SAFE_DEFAULT confiance < 0.35 (= le pivot)
```

| Tier | F | G (adaptatives) | fenêtres divergentes |
| --- | --- | --- | --- |
| HIGH_CONFIDENCE | 0.75 | 0.92 | 10/16 |
| SUFFICIENT_CONFIDENCE | 0.77 | 0.90 | 9/16 |
| LOW_CONFIDENCE | 0.79 | 0.85 | 7/16 |
| SAFE_DEFAULT | 1.00 | — | 0/16 |

La fenêtre **EQUIV-N7-N10-N16** (grammaire strictement identique) : **divergence
nulle** à tous les tiers — les profils convergent, y compris quand leurs règles
frappent toutes (le profil ne crée pas de différence là où la matière n'en a pas).

## 5. Ce qui reste NON PROUVÉ (honnêteté du rapport)

- **Causalité éducative** (impact d'apprentissage réel d'une recommandation
  discriminante) : non testable sans A/B longitudinal — hors périmètre M10.
- La **supériorité pédagogique** d'une branche particulière : les règles
  PROFILE_RULES sont des correspondances produit documentées, pas des vérités
  psychologiques (§6 de la méthode).
- Le **tuning** des poids : la hiérarchie grammaire>proximité>bande est
  documentée et observée, mais aucune optimisation paramétrique n'a été faite
  « pour produire » les chiffres ci-dessus.

## 6. Chiffres clés

- 311/311 tests PASS (17 nouveaux PD)
- 16 fenêtres × 3 profils × 4 tiers = 192 mesures, déterministes
- D = 0.41 · F_ADAPTIVE = 0.77 · G = 0.89 · repli = 48/192
- 7 usages `id.slice(1)` audités : 3 DANGEREUX fermés, 2 positionnels corrigés, 2 SAFE conservés
- 0 ligne du pipeline de jeu modifiée