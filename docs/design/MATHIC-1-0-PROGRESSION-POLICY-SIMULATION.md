# MATHIC 1.0 — Simulation de masse : Progression Policy (MISSION 3)

**Référence** : Méthode `MATHIC-1-0-PROGRESSION-POLICY.md` · Outil : `scripts/simulate-policy.mjs` · **Statut** : EXÉCUTÉ (seed 20260924, 5 000 profils + 500 corrompus) — preuve complémentaire au Gate G3-POLICY, **aucun code modifié**.

---

## 1. Objet

La Policy est une **fonction pure** (mandat MISSION 3) : elle doit pouvoir être
simulée sur des milliers de profils sans toucher au jeu. Ce document consigne la
première campagne de simulation à grande échelle : propriétés de sécurité
vérifiées sur chaque recommandation, distribution des recommandations,
différenciation par archétype comportemental.

## 2. Protocole

- **Outil** : `node scripts/simulate-policy.mjs [--n 5000] [--seed 20260924]`.
- **Déterminisme du générateur** : PRNG mulberry32 seedé — **aucun
  `Math.random`** ; ré-exécuter la même commande reproduit exactement les
  chiffres ci-dessous.
- **Catalogue réel** : N1-N36 analysés par le Solver (`analyzeAll`) ;
  métadonnées réelles (`properties`, `stage`, `facts`), difficulté = index N.
- **Profils** : 60% ancrés sur 7 archétypes (EXPLORER, STRATEGIST, EFFICIENT,
  CHAIN, ARITHMETIC, HINTED, NEUTRAL — dimension signature ∈ [0.7, 1]), 40%
  uniformes sur [0,1] ; `retryTolerance`/`difficultyResponse` pleine plage ;
  confiance tirée sur trois tiers pondérés (15% < 0.55, 35% < 0.8, 50% ≥ 0.8) ;
  `evidenceWindow` ∈ [0, 80].
- **États de progression** : fenêtre débloquée uniforme N1 → N36 (état
  `save.mjs` réel : tout débloqué sauf le front, front non terminé).
- **Audit systématique** : chaque recommandation est vérifiée contre
  existant ∧ certifié ∧ débloqué (mandat §6/§18) ; toute violation est fatale
  au script (code de sortie 1).

## 3. Résultats — 5 000 recommandations

### Légalité (existant ∧ certifié ∧ débloqué)

```text
recommandations auditées : 5000
violations               :    0  ✅ 0 bypass
exceptions levées        :    0
```

Aucune recommandation n'a jamais quitté le périmètre d'éligibilité — la
propriété « jamais de bypass » est prouvée à l'échelle, pas seulement par tests
unitaires.

### Modes

```text
ADAPTIVE      4691   93.8%
SAFE_DEFAULT   309    6.2%   (confiance < gradual)
```

### Tiers d'adaptation (ADAPTIVE)

```text
light     795   16.9%
full     1452   31.0%
specific 2444   52.1%
```

Lecture : la pondération du générateur (50% de confiances ≥ 0.8) explique la
dominance `specific` — c'est un artefact d'échantillonnage, pas une prédiction
de population joueur.

### Distance au front (0 = niveau débloqué le plus avancé)

```text
au front       3589   71.8%
1-2 derrière   1256   25.1%
3-5 derrière    125    2.5%
>5 derrière      30    0.6%
```

Lecture : le bump/drop transversal (`DIFFICULTY_MATCH`/`GRADUAL_RAMP`) et la
recherche de grammaire décalent la cible, mais la composante proximité ramène
la majorité des recommandations au voisinage du front — la progression reste
naturelle, l'adaptation est une nuance, pas un téléporteur.

### Niveaux recommandés

```text
niveaux distincts : 36/36 (tout le catalogue certifié est atteignable)
top 3             : N29 (7.1%) · N24 (6.0%) · N10 (4.8%)
queue             : N11 (1.0%)
```

Aucune zone morte : la distribution couvre tout le catalogue au fil des états
de progression, sans monopolisation par un niveau.

### Reason codes

```text
DIFFICULTY_IN_BAND          4123   82.5%
HIGH_CONFIDENCE_SPECIFIC    2444   48.9%
DIFFICULTY_MATCH            1914   38.3%
GRADUAL_RAMP                1135   22.7%
LOW_CONFIDENCE_ADAPTATION   1104   22.1%
EXPLORATION_MATCH           1098   22.0%
STRATEGY_MATCH              1086   21.7%
CHAIN_MATCH                 1053   21.1%
EFFICIENCY_MATCH             943   18.9%
ARITHMETIC_MATCH             582   11.6%
SAFE_DEFAULT_PROGRESSION     309    6.2%
RETRY_MATCH                  222    4.4%
```

Chaque règle du mandat §8 s'exécute réellement en volume (11.6% → 22.0% selon
la dimension) ; `DIFFICULTY_IN_BAND` confirme le garde-fou de difficulté presque
systématique ; aucune raison « inventée » n'apparaît.

### Policy confidence

```text
min 0.200 · moyenne 0.741 · max 1.000
```

## 4. Différenciation par archétype (état fixe : 14 niveaux débloqués)

500 profils supplémentaires sur un état de progression figé :

```text
ARITHMETIC (n=49)  → N14 (100.0%)                 [1 niveau distinct]
CHAIN      (n=54) → N14 (100.0%)                 [1 niveau distinct]
EFFICIENT  (n=43) → N14 (100.0%)                 [1 niveau distinct]
NEUTRAL    (n=37) → N14 (100.0%)                 [1 niveau distinct]
STRATEGIST (n=34) → N14 (100.0%)                 [1 niveau distinct]
EXPLORER   (n=49) → N13 (87.8%) · N14 (12.2%)    [2 niveaux distincts]
HINTED     (n=32) → N14 (56.3%) · N13 (43.8%)    [2 niveaux distincts]
UNIFORM    (n=202)→ N14 (55.0%) · N13 (45.0%)    [2 niveaux distincts]
```

### Lecture (importante pour la suite)

- **Convergence N13/N14** : ces deux niveaux concentrent 11 des 9 tokens de
  grammaire entre eux (N13 = MULTI-PATH, CHOICE, CONSEQUENCE, CHAIN,
  OPTIMIZATION, COMBINATION · N14 = SINGLE-PATH, CONSEQUENCE, CHAIN,
  OPTIMIZATION, COMBINATION). À l'état « 14 débloqués », ils sont
  grammaticalement adéquats pour presque tous les profils — la convergence est
  une propriété du **catalogue**, pas un défaut de différenciation de la Policy.
- **Différenciation réelle quand elle existe** : `EXPLORER` bascule vers N13
  (MULTI-PATH, son token signature absent de N14) ; `HINTED` se répartit selon
  la force du `hintDependency` (reach.drop). Les profils sans affinité
  dominante (UNIFORM) restent répartis.
- **Implication MISSION 4+** : si l'on veut une différenciation plus marquée au
  milieu de curriculum, le levier est le **design de niveaux** (plus de niveaux
  à signature pure dans les mondes intermédiaires), pas un durcissement des
  poids de la Policy. Ne pas tuner la Policy contre un artefact de catalogue.

## 5. Robustesse — 500 profils corrompus

Forme v2 violée (dimensions NaN/Infinity/hors [0,1]/non numériques, confiance
invalide, version inconnue, clé intruse, profil non-objet) :

```text
SAFE_DEFAULT          : 500/500 (100.0%)  ✅
exceptions levées     : 0                 ✅
sorties sans code de
repli documenté       : 0                 ✅
```

Aucune corruption ne produit jamais une recommandation adaptative : le repli
est total et toujours expliqué (`NO_PROFILE`/`INVALID_PROFILE`/
`SAFE_DEFAULT_PROGRESSION`).

## 6. Déterminisme

```text
250 entrées ré-exécutées (échantillon 5%) : 0 divergence ✅
```

Propriété §14 du mandat confirmée en volume : mêmes entrées + même version ⇒
même recommandation.

## 7. Verdict

```text
✅ AUCUNE VIOLATION — légalité, déterminisme et replis prouvés à l'échelle
```

Propriétés **PROVEN** ajoutées par cette campagne (complément au rapport
G3-POLICY) : zéro bypass sur 5 000 tirages, couverture complète du catalogue,
toutes les règles §8 exécutées en volume, repli 100% sur corruption,
reproductibilité du générateur lui-même (seed).

Restent **NOT PROVEN** (inchangés) : la pertinence pédagogique des règles
(playtest humain G13) et l'application réelle (Orchestrator, MISSION 4).

## 8. Reproduire

```bash
node scripts/simulate-policy.mjs                 # 5000 profils, seed 20260924
node scripts/simulate-policy.mjs --n 20000 --seed 42
```

Code de sortie 1 si une violation de légalité, de déterminisme ou de repli est
détectée — le script est directement intégrable dans une pipeline de
vérification.
