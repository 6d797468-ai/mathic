# MATHIC 1.0 — Progressive Adaptation Adaptive (MISSION 6)

**Méthode** : `MATHIC-1-0-ADAPTIVE-PROGRESSION` · **Statut** : IMPLÉMENTÉ · **Gate** : G6-ADAPTIVE.

---

## 1. Objectif

Prouver expérimentalement que le profil détecté **RÉELLEMENT** (depuis les
Evidence du vrai moteur, par l'adaptateur de runtime M5) entraîne une
progression Mathic **DIFFÉRENTE**, **PERTINENTE** et **DÉTERMINISTE** —
sur plusieurs profils de comportement et plusieurs trajectoires.

Ce n'est pas une preuve de gameplay UX : c'est la vérification que la boucle
d'intelligence **réelle** (Engine → Evidence → Profile → Policy → Orchestrator)
fait réellement **évoluer la progression** de façon observable et reproductible.

## 2. Hypothèse de preuve (tests G6-ADAPTIVE)

| Verdict b : « Progression ADAPTIVE » si — |
| --- |
| **DIFFÉRENTE** — des comportements distincts mènent à des trajectoires de niveaux distinctes ET à des profils finals discriminés (Δmax ≥ 0.4 sur les dimensions réelles) |
| **PERTINENTE** — chaque comportement atteint au moins un niveau de la grammaire que `PROFILE_RULES` associe à sa dimension dominante **dès que l'offre débloquée en contient** (une grammaire absente du catalogue est documentée, non fatale) |
| **DÉTERMINISTE** — deux exécutions au même seed produisent une trajectoire et un profil **byte-à-byte identiques** |
| **SÛRE** — toute transition `SAFE_DEFAULT`/`REJECTED` ne change jamais la position (aucune écriture) |

## 3. Montage expérimental — un « bot » qui joue réellement

Un **bot** est un ordre de sélection d'actions qui **joue réellement le niveau**
via `createRuntimeAdapter` (M5) : chaque tour est un `ACTION_PREVIEWED` /
`ACTION_COMMITTED` réel du moteur b1, chaque fin de partie est un terminal
réel (`isWon`/`isLost`/`isBlocked`), le score et les coups restants sont réels.

| Comportement | Heuristique de sélection (lecture du GameState réel + `evaluate` réel) | Dimension cible (PROFILE_RULES) |
| --- | --- | --- |
| `arithm` | commite l'action de **delta maximal**, pas de preview, pas d'undo | arithmetic → COMBINATION / MASTERY |
| `explorer` | **prévisualise toutes** les actions, commite des actions variées, undo fréquent | exploration → MULTI-PATH / DISCOVERY / CHOICE |
| `chain` | poursuit une **chaîne réelle** (`chainRun ≥ 1`), sinon restart | chainAffinity → CHAIN |

Tout est seedé (`mulberry32`), aucun `Math.random`, horloge simulée injectée
(croissante, déterministe, partagée).

## 4. Boucle de progression (par étape du run)

1. **JOUER** réellement le niveau courant (retries réels bornés) ;
2. **COMPLÉTER** comme le vrai jeu : `markCompleted` si victoire réelle
   (`score`/`movesLeft` réels), `unlockTo` d'une **fenêtre de candidats**
   devant le joueur (analogue de l'accès multi-niveaux d'un monde réel) ;
3. **DÉTECTER** le profil sur l'Evidence cumulée réelle (`detectProfile`) ;
4. **RECOMMANDER + APPLIQUER** par `orchestrate` réel (seul écrivain de la
   position ; kill-switch `SAFE_DEFAULT`, invariants §11/§13 intacts) ;
5. **AVANCER** vers la position appliquée par l'IA, sinon le niveau suivant.

Le module `src/intel/adaptive-experiment.mjs` exporte `selfPlayAdaptive`
(retour versionné `{ strategy, seed, trajectory, evidenceCount, finalProfile }`)
et `playLevelOnce` — testable par unités AP-01..AP-08.

## 5. Contrats consommés (inchangés, réels)

- Engine b1 : `createSession/apply/evaluate/enumerateActions/isWon/isLost/isBlocked`
  (injecté, jamais importé par intel — frontière §12) ;
- save b1 : `loadSave/saveNow/markCompleted/unlockTo`, clé `mathic.save.v1` ;
- Evidence : `createClock`, `detectProfile` ; Runtime : `createRuntimeAdapter` ;
- Policy : `PROFILE_RULES/PROPERTY_VOCAB` ; Orchestrator : `orchestrate` (seul
  écrivain de la position dans l'intelligence).

## 6. Découverte d'offre réelle (mesurée sur le catalogue N1-N36)

L'analyse Solver réelle du LADDER montre **où vit chaque grammaire** :

| Propriété | Niveaux qui la portent |
| --- | --- |
| COMBINATION | N13, N14, N20, N23, N24, N29, N33 — **aucune avant N13** |
| MASTERY | **aucun niveau** (offre nulle sur tout le catalogue) |
| CHAIN | pléthorique (N4..N36) |
| MULTI-PATH / CHOICE | dès le premier monde |

**Conséquence documentée** : l'adaptation `arithmetic` ne peut se manifester
que si le joueur a **débloqué une fenêtre atteignant N13+** ; `MASTERY` est une
cible de grammaire absente du catalogue actuel. Le simulateur expose donc le
véritable critère de pertinence : la grammaire est-elle **présente dans l'offre
débloquée** ? Si oui, elle doit être atteinte ; sinon, absence d'offre (notée,
non fatale).

## 7. Usage

```bash
node scripts/simulate-adaptive-progression.mjs                   # niveauCount=7, window=3, seed par défaut
node scripts/simulate-adaptive-progression.mjs --n 9 --window 8 --seed 20261007
node --test tests/intel/adaptive-progression.test.mjs            # AP-01 → AP-08
```

Sortie : trajectoires réelles, profils détectés, matrice de divergence,
grammaires atteintes, **verdict G6-ADAPTIVE** (code de sortie 1 si violation).