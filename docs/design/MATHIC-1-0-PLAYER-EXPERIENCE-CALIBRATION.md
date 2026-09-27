# MATHIC 1.0 — MISSION 11 : Calibration de l'expérience joueur (ADAPTIVE vs ORDINAL)

**Référence** : MISSION 11 — `PLAYER EXPERIENCE CALIBRATION` · Méthode : ce document
**Statut** : IMPLÉMENTÉ, TESTÉ, OBSERVÉ (voir `MATHIC-1-0-PLAYER-EXPERIENCE-CALIBRATION-REPORT.md`).

---

## 1. Objet

Répondre par l'expérience à la question du mandat : **la progression ADAPTIVE
(M6→M10) améliore-t-elle réellement l'expérience du joueur par rapport à la
progression ORDINALE (N→N+1) ?** Cette mission construit un harnais d'expérience
déterministe qui fait jouer les **briques réelles** du jeu (Engine, Solver,
Evidence, Profile Detector, Orchestrateur ADP-ADAPTIVE, fenêtre) par des
**profils comportementaux contrôlés** (3 stratégies de bot), et mesure des
métriques descriptives de l'expérience (difficulté ressentie, friction,
efficacité de résolution, variété, dérive).

Ce qui n'existait pas avant, et que cette mission matérialise :

- un **harnais EXP-01..06** (`scripts/experiment-player-experience.mjs`) qui
  rejoue des trajectoires complètes ORDINAL vs ADAPTIVE (12 niveaux, fenêtre 3)
  sur les mêmes mécaniques réelles, par paires profil×seed ;
- des **métriques descriptives** F_difficulty / R_retry / E_solve / variété /
  driftMean, calculées depuis les traces d'exécution réelles ;
- une **analyse EXP-06 front vs non-front** : chaque étape ADAPTIVE est classée
  (FRONT_BEST_FIT, GRAMMAR_MATCH, PROFILE_MATCH, DIFFICULTY_MATCH,
  NO_MEANINGFUL_DIFFERENCE, FALLBACK) ;
- une **contrainte de déterminisme** : chaque trajectoire est rejouée à
  l'identique, toute divergence lève une erreur — aucun chiffre ne peut naître
  d'un aléa.

## 2. Méthode expérimentale

### 2.1 Population et plan

- **Stratégies joueur** (3) : `arithm` (maximise le delta arithmétique,
  recherche via `deltaActions`), `explorer` (explore l'espace, critère de
  variété de chemins), `chain` (préfère les enchaînements à partir des ancres).
- **Modes progression** (2) : `ORDINAL` (N→N+1 strict : cibles la progression
  ordinale non complétée) vs `ADAPTIVE` (cibles `orchestrate`, qui applique la
  Policy quand la confiance le permet, sinon le front ordinal).
- **Échantillonnage** : 10 seeds × 12 niveaux de progression × 3 profils × 2
  modes = **60 trajectoires** (720 étapes), campagne entière depuis jour 1.
- **Contrôle** : la même paire profil×seed est jouée dans les deux modes —
  comparaison **paire à paire** uniquement.

### 2.2 Déroulé d'une étape

1. rejouer le niveau courant via `playLevelOnce` (Engine+Solver réels) : le
   bot exécute des actions selon sa stratégie, `deriveMetrics` produit
   l'evidence de la manche ;
2. `deduceProfile` met à jour le profil détecté (DETECTION_RULES réelles) ;
3. la cible de l'étape est choisie : front ordinal (premier niveau non
   complété) pour ORDINAL, ou `orchestrate` pour ADAPTIVE ;
4. la victoire consolide la progression (`unlockTo`, fenêtre) — le front
   **après** complétion sert de référence de bande pour l'étape suivante ;
5. chaque étape consigne : niveau joué, front au moment de l'assignation,
   bande attendue (front ±1), position, codes de raison de la cible, repli,
   victoire/défaite, tentatives, mouvements.

### 2.3 Métriques descriptives

| Métrique | Définition | Sens |
| --- | --- | --- |
| **F_difficulty** | (victoires dans la bande attendue ±1 autour du front À L'ASSIGNATION) / tentatives | la difficulté présentée correspond-elle à celle attendue par la progression ? |
| **R_retry** | ((tentatives−1) + restarts) / niveaux joués | friction : rejouer un niveau = frottement perçu |
| **E_solve** | Σ minMoves(niveaux) / Σ movesSpent (toutes tentatives, échecs compris) | efficacité : effort vs effort minimal nécessaire |
| **Variété** | nombre de niveaux distincts atteints dans la campagne | richesse du parcours |
| **driftMean** | positionDelta moyen entre le niveau joué et le front ordinal | distance au fil ordinal |

Les victoires **hors bande** (sauts ADAPTIVE légitimes) sont **exclues de F**
mais **comptées** dans le total de victoires — sinon on pénaliserait la
diversification adaptative elle-même.

### 2.4 Classification EXP-06 (chaque étape ADAPTIVE)

| Classe | Définition |
| --- | --- |
| FRONT_BEST_FIT | cible = front ET une règle `*_MATCH` / raison de difficulté la justifie |
| GRAMMAR_MATCH | cible ≠ front ET code `*_MATCH` (règle de grammaire activée) |
| PROFILE_MATCH | cible ≠ front, pas de règle, le niveau porte la grammaire du profil cible, dérive > 1 |
| DIFFICULTY_MATCH | cible ≠ front, raison de difficulté forte (DIFFICULTY_MATCH / GRADUAL_RAMP / RETRY_MATCH) |
| NO_MEANINGFUL_DIFFERENCE | écart ≤ 1 position sans règle ni raison de difficulté (pas de différence réelle) |
| FALLBACK | repli SAFE_DEFAULT / REJECTED (profil ou confiance insuffisante) |

### 2.5 Déterminisme

Chaque trajectoire complète (ADRESSES, files I/O, indices) est rejouée **une
seconde fois** et comparée octet à octet. Toute différence ⇒ `throw` (le
processus échoue : impossible de publier un chiffre non déterministe).

## 3. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Harnais EXP-01..06 | Code (ADD) | `scripts/experiment-player-experience.mjs` |
| Dataset EXP-01 (60 trajectoires) | Données (ADD) | `docs/experiments/m11/EXP-01-dataset.json` |
| Conception + rapport | Docs (ADD) | `docs/design/MATHIC-1-0-PLAYER-EXPERIENCE-CALIBRATION.md` + `-REPORT.md` |

**PRESERVE** : engine, solver, save, orchestrator, runtime, policy UI adaptive,
B1 gameplay, catalogue M9, Evidence, Profile Detector. Le harnais **importe et
réutilise** ces briques ; il n'en modifie aucune.

## 4. Règles d'interprétation (anti-fiabilité)

1. Les bots sont des **profils comportementaux contrôlés**, pas des humains :
   chaque conclusion EXP-01..04 est **OBSERVÉE sur profils contrôlés**, l'expérience
   humaine relève d'EXP-05 (playthrough UI réelle).
2. **Aucune modification de la Policy, des seuils ou des règles** pour
   améliorer les métriques : le harnais mesure l'existant.
3. Une conclusion doit survivre à la classification EXP-06 : une divergence
   ADAPTIVE qui n'est justifiable par aucune classe est un signal de faille,
   pas un résultat.
4. Les échecs de bots sur des niveaux difficiles sont des **observations
   d'expérience** (friction/réussite), jamais des jugements de qualité des
   niveaux.