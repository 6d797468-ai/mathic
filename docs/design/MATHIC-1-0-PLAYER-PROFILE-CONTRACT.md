# MATHIC 1.0 — Intelligence Contract : Player Profile

**Référence** : Feuille de route MATHIC 1.0 §5.B, §6, §7 (Phase 7 : versionnage/migration) · **Dépend de** : Player Evidence (Brique 2) · **Produit par** : Player Profile Detector (Brique 3, `src/intel/profile.mjs`) · **Consommé par** : Progression Policy, Coach, Orchestrator · **Statut** : CONTRAT (opposable) · **Révision v2** (MISSION 2).

Le profil est un **état dérivé**, pas une identité permanente. Il décrit des **propriétés de comportement dans Mathic**, jamais la personne dans son ensemble.

---

## 1. Principe

```text
EVIDENCE ──détection──► PROFILE ──recommandation──► POLICY ──► ALLOWED LEVEL
```

Le profil ne choisit jamais directement un niveau. Il produit une recommandation ; la policy décide.

## 2. Schéma (révision v2 — vocabulaire du détecteur)

```text
PlayerProfile
{
  arithmetic          // [0,1]  aisance aux opérations exactes (objectif atteint, score)
  exploration         // [0,1]  essaie plusieurs formules / chemins
  strategy            // [0,1]  planifie (preview, chaînes intentionnelles)
  efficiency          // [0,1]  routes au meilleur score, chaînes productives
  chainAffinity       // [0,1]  usage et protection des chaînes
  hintDependency      // [0,1]  dépendance aux indices
  retryTolerance      // [0,1]  acceptation de la reprise / re-essai
  difficultyResponse  // [0,1]  réaction constructive à la difficulté
  confidence          // [0,1]  confiance du détecteur dans le profil
  evidenceWindow      // >= 0   nombre d'évidences observées
  version             // = PROFILE_SCHEMA_VERSION
}
```

**Révision v1 → v2 (explicite, versionnée)** : les dimensions `arithmeticAffinity`, `explorationTendency`, `strategyTendency`, `efficiencyTendency` (Brique 1) sont remplacées par `arithmetic`, `exploration`, `strategy`, `efficiency` — vocabulaire canonique de la MISSION 2 (Player Profile Detection). Même nombre de dimensions, même sémantique ; aucune donnée supplémentaire collectée.

**`comprehension` reste HORS schéma v2** : la liste v1 du mandat ne l'inclut pas. Toute inclusion future est une révision explicite du schéma (Phase suivante), jamais une extension silencieuse.

Le **détecteur actif** est versionné par `DETECTOR_VERSION` (méthode v1 : règles déterministes à fenêtre pondérée récente — voir `MATHIC-1-0-PLAYER-PROFILE-DETECTION.md`).

## 3. Contraintes du contrat

- **Dimensions dans [0,1]** : toute valeur hors intervalle, NaN, `Infinity` ou non numérique est une **corruption** (`validateProfile` la rejette).
- **`confidence` dans [0,1]** : un profil rejete sans détection (`DEFAULT_PROFILE`) doit avoir `confidence = 0`. Un profil stable a une confiance haute — la policy utilise cette valeur comme condition de bascule (voir §5).
- **`evidenceWindow >= 0`** : compteur d'observations, jamais négatif.
- **Versionné** : `version = PROFILE_SCHEMA_VERSION`. Une ancienne version est rejetée par le profil actuel → **migration** demandée. Une sauvegarde historiquement ancienne ne devient jamais absurde : elle est migrée ou remise à zéro (initiative Phase 7).
- **Explicable** : chaque dimension porte un libellé produit (tableau §2). Un joueur peut toujours voir « ce que Mathic croit savoir de sa manière de jouer ».
- **Dynamique** : profil partiel après 1 partie, enrichi après N parties, réévalué en continu. **Jamais de diagnostic définitif après 3 niveaux.**

## 4. Prohibition

Le profil ne contient **aucune** donnée d'identité, d'âge, d'intelligence, de personnalité, de position. Seules des propriétés de comportement **dans Mathic**.

## 5. Lien avec la policy (contrat séparé)

```
PROFILE
   ↓
RECOMMENDATION            // le profil suggère
   ↓
POLICY VALIDATION         // la policy décide
   ↓
ALLOWED LEVEL
```

Si `confidence` est basse, le profil est contradictoire, ou aucun provider n'est disponible → **DETERMINISTIC DEFAULT POLICY** (Brique 1 fournit la fonction de repli).

---

**D-PP1** — le profil est un état dérivé reproductible, jamais une identité. **D-PP2** — les valeurs hors contrat sont des corruptions, pas des approximations. **D-PP3** — le profil suggère, la policy décide. Opposables.