# MATHIC 1.0 — MISSION 10 : Discrimination adaptative de la Policy

**Référence** : MISSION 10 — `ADAPTIVE POLICY DISCRIMINATION` · Méthode : ce document
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVE (voir `MATHIC-1-0-ADAPTIVE-POLICY-DISCRIMINATION.md`).

---

## 1. Objet

Prouver que la recommandation ADAPTIVE de la Progression Policy **discrimine
réellement** : elle choisit un niveau parce que le **profil** du joueur diffère,
que les **candidats** diffèrent sémantiquement (grammaire, position, difficulté),
et elle le **justifie**. Jamais parce que l'ordre d'entrée, l'ID numérique, un
aléa ou une fabrication l'ont imposé.

Ce qui n'existait pas avant, et que cette mission matérialise :

- un **modèle `LevelCandidate` explicite**, consommé par la Policy, où la
  position (ladderPosition) n'est **jamais dérivée de l'ID** ;
- une **sémantique de position** : la Policy calcule front, bande de difficulté,
  distance et tie-break depuis la **ladderPosition canonique**
  (DifficultyMetadata), jamais depuis l'ordre d'entrée ni depuis
  `Number(id.slice(1))` ;
- une **suite de tests PD-01..PD-15** qui verrouillent chaque propriété ;
- une **expérience corpus** (≥10 fenêtres × 3 profils) mesurant
  F / D / G / fallback de manière **observationnelle** et déterministe.

## 2. Rappel du contexte M9

- Succession LADDER : `N1..N24, N37, N25, N26, N27, N38, N28, N29, N39, N30..N35, N40, N41, N36`.
- **N37 id=37, position LADDER=25** — le cas d'école qui a déclenché la mission.
- Grammaire réelle (Solver) : COMBINATION sur 12 niveaux (N13,N14,N20,N23,N24,
  N37,N38,N29,N39,N33,N40,N41), MASTERY sur N40 et N41.
- Règle : `LevelId ≠ LadderPosition ≠ WorldPosition ≠ DifficultyIndex`.

## 3. Modèle LevelCandidate

Exporté par `src/intel/progression-policy.mjs` :

```
levelCandidate(id, metadata, difficulty) → frozen {
  id,
  ladderPosition,      // difficulty[id].index (canonique LADDER, jamais id.slice)
  world,               // metadata[id].world
  difficulty,          // = ladderPosition
  stage,               // metadata[id].stage
  properties,          // metadata[id].properties
  chainDepth, consequenceEvidence, routeCount, minMoves, scoreRange  // faits design
}
```

La Policy **ne reconstitue plus aucune information depuis l'ID**. Quand le
DifficultyMetadata est absent (appels rétro-compatibles, PP-15), elle retombe sur
la position dans la liste d'entrée — comportement identique à l'ancien code.

## 4. Position canonique

| Aspect | Avant (M≤9) | Après (M10) |
| --- | --- | --- |
| Position d'un candidat | `indexOf` dans la liste d'entrée | `ladderPosition` (difficulty.id.index) |
| Front (candidat le plus avancé) | dernier de la liste d'entrée | candidat de position canonique max |
| Span (dénominateur proximité) | `ceil(liste/4)` | `ceil((maxPos−minPos+1)/4)` |
| Base de difficulté | `difficulty[frontierId].index` | inchangé mais frontier canonique |
| Tie-break | `indexOf` | `posOf` canonique |

Invariants démontrés (tests) :
- **PD-11** — réordonner les candidats ⇒ résultat byte-identique (ordre d'entrée sans effet) ;
- **PD-12** — N37 à la position 25 ⇒ distance −1 (jamais −12) ;
- **PD-13** — renommer N37→N77 (position inchangée) ⇒ même décision.

## 5. F/D/G/fallback — définitions observationnelles

- **F (frontSelectionRate)** : part des recommandations strictement égales au
  front ordinal (premier admissible non terminé — la valeur que SAFE_DEFAULT
  livrerait). Ce n'est PAS un KPI à maximiser/minimiser : le mandat interdit de
  choisir N+2/N+3 « pour réduire F ». Mesure : `scripts/experiment-policy-discrimination.mjs`.
- **D (profileDivergenceRate)** : part des cellules (fenêtre × tier) où ≥2 profils
  divergent.
- **G (grammarSelectionRate)** : part des sélections ADAPTIVE portant un `*_MATCH`
  (justification grammaticale réelle).
- **fallbackRate** : part des recommandations en SAFE_DEFAULT (confiance < 0.35).

## 6. Justification de `S(l, p) = w_E·E + w_G·G + w_C·C − w_D·D`

Le score de classement existant (déterministe, M6) est déjà décomposable en
quatre composantes, chacune ancrée dans des données **réelles** :

| Terme | Teneur actuelle (implémentée) | Donnée réelle |
| --- | --- | --- |
| E (engagement/expérience) | `retryBonusWeight` si retryTolerance ≥ seuil et candidat > cible | profil observé |
| G (grammaire) | `weight` × nb de `*_MATCH` (règles ARITHMETIC/EXPLORATION/STRATEGY/EFFICIENCY/CHAIN) | grammaire Solver du niveau |
| C (confiance/cohérence) | stabilité (`stabilise`), bande difficité (`difficultyBand`) | historique réel |
| D (décalage/difficulté) | `proximityWeight × (1 − |dist|/span)` ; distance depuis position canonique | position LADDER |

La hiérarchie documentée (§8 du mandat) : **la grammaire domine**, la proximité et
la bande sont des garde-fous — jamais l'inverse. Chaque terme est observé sur le
corpus, aucun n'a été « réglé » pour produire le résultat du rapport.

## 7. Non-régression

Aucune modification de moteur, solveur, save, orchestrateur, runtime, pont UI.
Seules changent : la **donnée consommée** (DifficultyMetadata positionnel) et le
**classement interne** de la Policy (canonique). Suite complète : 311/311 PASS
(294 avant + 17 PD). Playtest 50/50 PASS. Builds PASS.