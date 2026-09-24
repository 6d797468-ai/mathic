# MATHIC 1.0 — B2 · Gameplay Core Vertical Slice — Rapport d'implémentation

**Branche** : `kali/v5-gameplay-lab`
**Status** : IMPLEMENTED / AUTOMATED-CERTIFIED / BUILD VERIFIED / HUMAN VALIDATION PENDING
**Date** : 2026-09-24

---

## 1. Objectif

Le mandat B2 demande une **tranche verticale joueable** : la boucle complète
`OBJECTIF → A → op → B → PREVIEW → TRANSFORMER → transformation → nouvel état → CHAIN → SCORE → OBJECTIF → niveau suivant`,
sans nouvelle mécanique fondamentale, sans nouvelle grammaire, et sans toucher aux quatre fichiers
de base (`kernel.mjs`, `engine.mjs`, `solver.mjs`, `replay.mjs`).

Ce rapport décrit factuellement ce qui a ete construit, certifie par automate, joue en live par
l'agent (playthrough autonome), empaquete en APK, et pousse sur Git. Aucune validation humaine
n'est pretendue ici : le test humain est reserve a la version complete jouable installable (APK B2),
conformement a la doctrine : *les micro-tests sont executes et certifies par l'agent codeur ; les
tests humains sont reserves aux versions completes, jouables et installables.*

## 2. Decisions

| N° | Decision | Justification |
|----|----------|---------------|
| D1 | **Aucune modification de `kernel/engine/solver/replay`** | Le contrat existant (evaluate pur, apply atomique, INVALID → NO STATE CHANGE, ancrage sur A) suffit pour tout le contenu B2. Aucune insuffisance contractuelle demontree. |
| D2 | **Pas de nouvelle mecanique** : les 10 niveaux N7–N16 combinent `+ − × ÷`, préparation, chaine, budget et conséquences deja introduits en B1.5 | Mandat B2 : N7–N10 = combinaison des mecaniques introduites, difficulte progressive. |
| D3 | **Niveaux fixes et certifies par le Solver avant publication** : chaque plateau est verifie par enumeration exhaustive (proprietes + chemins signes + scores exacts) dans des tests durables. | Regle MATHIC : « aucun niveau genere publie sans certification ». |
| D4 | **Feedback de causalite minimal et additif** : pop de la cellule resultat (`cell.res`), bump du score et de la chaîne dans le HUD. Aucun nouveau flux, aucune refonte UI. | Les animations expliquent la causalite sans la masquer ; le board reste le hero. |
| D5 | **HUD evolutif par niveau** : `hud` declaratif par niveau (target/moves/score/chain). | Continuite B1.5 (N1 minimal jusqu'a N5–N6 complet). |
| D6 | **Domaine de lecture de la grille** : lrs indices d'action `{a, op, b}` sont des positions de cellules ; le symbole de l'operation est lu dans `cells[op]`. | Contrat `evaluate`/`apply` inchange ; les tests et les chemins signes utilisent exactement ces indices. |
| D7 | **N14 « Le Partage Oblige » exige la division** : le niveau est insoluble sans la tuile `/` (verifie par resolution du plateau prive de `/`). | Pedagogique : la division n'est plus un outil facultatif. |
| D8 | **Aucune version incomplete presentee comme produit** : seule l'APK B2 complete est un artefact de test humain. | Doctrine de validation. |

## 3. Fonctionnalites implementees

1. **10 niveaux nouveaux** N7→N16 ajoutes au LADDER, chacun avec `name`, `idea`, `hud`, `rows`, `cols`, `target`, `maxMoves`, `tiles`.
2. **Boucle verticale jouable de bout en bout** (prevue par le playthrough autonome des 16 niveaux, §7).
3. **Feedback de causalite minimal** :
   - la tuile qui porte le resultat clignote (« pop ») a l'apparition ;
   - score et compteur de chaine « bumpent » quand ils changent (`B2 : causalite minimale` dans `b1-web.css`).
4. **Playthrough autonome** : extension du smoke DOM pour rejouer **les 16 niveaux** avec les chemins certifies du Solver, en passant par la vraie UI (TAP → PREVIEW → TRANSFORMER).
5. **Suite de tests dediee** `tests/b1/b2-levels.test.mjs` (25 tests : proprietes certifiees + chemins signes + invariants transverses par niveau).

Ne sont PAS implementes (perimetre interdit par B2) : Momo, GGUF, drawers, boutique, economie,
boosters, pub, login, backend, reseau, swipe, drag&drop, nouvelle grammaire, nouvelle architecture.

## 4. Niveaux crees (N7–N16)

Grille a 1 ligne ; les cellules sont listees dans l'ordre (numeros puis operateurs, comme dans `LADDER`).

| Niv | Nom | Cellules | Objectif | Coups max | HUD | Idee pedagogique |
|-----|-----|----------|----------|-----------|-----|------------------|
| N7  | Le Choix Precoce | `3 2 24 18 × + −` | 30 | 3 | target·moves·score | la preparation offre deux natures (quel couple multiplier d'abord) |
| N8  | Double Chaine | `2 14 7 5 + ×` | 24 | 3 | + chain | deux chaines differentes vers le meme objectif |
| N9  | La Division Prepare | `16 20 2 14 ÷ × +` | 24 | 3 | + chain | diviser d'abord, ajouter ensuite (chaine par reutilisation) |
| N10 | Pas de Marge | `8 12 9 6 × + −` | 36 | 2 | target·moves·score | budget exact : les deux coups sont obligatoires |
| N11 | Les Detours Payants | `12 5 3 16 × + −` | 60 | 3 | + chain | le detour chaine vaut plus que la victoire directe |
| N12 | Le Detour Sacrifie | `24 4 3 6 + × −` | 30 | 3 | + chain | victoire immediate sans chaine vs route construite |
| N13 | Le Long Courrier | `2 8 6 10 18 + × −` | 84 | 4 | + chain | trois coups prevus, chaque etape reutilisee |
| N14 | Le Partage Oblige | `4 14 20 5 ÷ + ×` | 60 | 3 | + chain | ÷ necessaire : l'ordre des operations change le score |
| N15 | Le Detective | `6 16 18 10 × + − ÷` | 10 | 1 | target·moves·score | une seule formule possible, a deduire |
| N16 | La Synthese | `24 9 4 5 15 + × − ÷` | 72 | 4 | + chain | capstone : × puis ÷, multiples routes, scores etages |

Progression :

- N7–N10 combinent preparation / chaine / budget (aucune mecanique nouvelle) ;
- N11–N13 approfondissent la chaine et l'optimisation ;
- N14 introduit la division comme contrainte necessaire ;
- N15 resserre sur la deduction (solution unique) ;
- N16 capitalise tout (scores etages, multiples routes, aucune victoire en 1 coup).

## 5. Resultats Solver (certification automatique)

Enumeration exhaustive (budget 300 000 nœuds) via `solve(level, { maxMoves, budget })`.

| Niv | solvable | minMoves | routes (1er coup) | postStates | solutions | Victoire en 1 coup |
|-----|-----|-----|-----|-----|-----|-----|
| N7  | oui | 2 | 7 | 12 | 14 | non |
| N8  | oui | 2 | 4 | 6 | 8 | non |
| N9  | oui | 2 | 1 | 2 | 2 | non |
| N10 | oui | 2 | 4 | 6 | 6 | non |
| N11 | oui | 1 | 2 | 11 | 12 | oui (direct) |
| N12 | oui | 1 | 2 | 15 | 29 | oui (direct) |
| N13 | oui | 3 | 2 | 3 | 11 | non |
| N14 | oui | 3 | 1 | 3 | 8 | non |
| N15 | oui | 1 | 1 | 1 | 1 | oui (unique) |
| N16 | oui | 2 | 3 | 18 | 42 | non |

Proprietes specifiques certifiees (verifiees par test automatisé) :

- **N7** : aucune victoire en 1 coup ; 2 premieres actions de nature distincte mènent a des scores differents (20 vs 19).
- **N8** : deux chaines réellement distinctes (`7+5=12 puis 12×2` et `5×2=10 puis 10+14`), toutes deux gagnantes, score 15.
- **N9** : le premier coup est la division (`20÷2=10`) puis `10+14=24`.
- **N10** : `minMoves == maxMoves == 2` (aucune marge) ; 2 routes aux consequences differentes (finals 19 et 15).
- **N11** : detour chaine (22) > direct (16).
- **N12** : immediate sans chaine (13) < route construite (16).
- **N13** : 3 coups tous necessaires, chaque etape reutilisee (score final 40).
- **N14** : `÷` **necessaire** — le plateau prive de `/` est insoluble.
- **N15** : solution unique (`16−6=10`).
- **N16** : aucune victoire en 1 coup ; ≥3 scores finaux distincts (etats post-Objectif : 18).

## 6. Tests

Suite complète `npm test` : **96/96 pass + verdict playtest « Coup Parfait » OK**.

| Dossier | Contenu | Tests |
|---------|---------|-------|
| `tests/b1/b2-levels.test.mjs` (nouveau) | proprietes certifiees N7–N16 + chemins signes + invariants transverses | 25 |
| `tests/b1/b1-5-smoke.test.mjs` (etendu) | smoke B1.5 + **playthrough autonome des 16 niveaux via l'UI** | 2 |
| `tests/b1/b1-5-grammar.test.mjs` (adapte) | LADDER = exactement N1..N16 ; preview pur ; delta preview==apply ; INVALID atomique ; undo/replay | 11 |
| autres suites existantes | runtime, build, certify, replay, getState, isSolved, etc. | reste vert |

Invariants etendus a la totalite du LADDER (N1–N16) par les tests transverses existants :

- `evaluate()` pur : aucune mutation (positions, valeurs, score, trace), preview jamais dans la trace ;
- `preview.delta == apply().events[-1].delta` ;
- INVALID (op confondu, a==b, hors bornes, op confondu avec B) → `apply()` retourne `null`, l'etat est inchange ;
- l'undo reconstruit un etat identique au jeu direct (relecture de la trace).

## 7. Resultats du playthrough autonome

Le smoke DOM (shim) rejoue **les 16 niveaux** avec les chemins min-depth issus du Solver, en
utilisant exactement la grammaire de la vraie UI : `tap(A) → tap(op) → tap(B)` puis `TRANSFORMER`.

Verifications effectuees coup par coup, pour chaque niveau :

1. le niveau est charge (HUD = id attendu) ;
2. le preview affiche le resultat exact de `evaluate()` (texte `result` ; `result ✓` uniquement sur le dernier coup) ;
3. `TRANSFORMER` est actif apres le 3e appui, et seulement apres ;
4. seul le commit consomme un coup (`moves` decremente de 1) ;
5. l'overlay de victoire n'apparait qu'au dernier coup ;
6. l'overlay affiche `Score N` = `finalScore()` du moteur = relecture `replay(trace)`.

Resultat : **16/16 niveaux joues et gagnes via l'UI, scores UI == scores moteur == scores replay,**
aucune formule invalide sur les parcours propres (log `B1|invalid` vide sur ces chemins).

Note methodologique : ceci est une verification technique (la « machine », cf. doctrine). Elle
prouve que de l'autre cote de l'interface, le jeu fonctionne ; elle ne pretend pas rendre un
jugement humain sur le ressenti.

## 8. Score

Moteur inchange (`engine.mjs`). Rappel du contrat applique sur toute la duree :

- `base = floor(|result| / 10)` (0 si resultat < 10) ;
- `chainBonus = chainRun × 2` en cas de reutilisation ;
- `delta = base + chainBonus` ;
- `OBJECTIVE_BONUS = 10` ajoute au score final en cas de victoire.

Scores des chemins signes B2 (au plus court) : N7 20 / 19 · N8 15 / 15 · N9 15 · N10 19 / 15 ·
N11 16 (direct) vs 22 (detour) · N12 13 (immediat) vs 16 (construit) · N13 40 · N14 55 / 27 ·
N15 11 · N16 55 / 19.

Des coups prepares a `+0` restent presents et voulus (ex. `12−8=4` en N10, `15÷5=3` en N16,
`4+6=10` en N12) : le gain vient de la consequence, pas du premier coup.

## 9. Chaine

La chaine (reutilisation d'un resultat pose sur la grille) est operationnelle sur N7–N16 et
l'affichage `Chaîne` du HUD est actif pour tous les niveaux a l'exception de N7 et N15 (choix
declaratif via `hud`, pour ne pas braquer l'attention sur ce qui n'est pas le propos du niveau).

Cas verifies par tests :

- **N8** : deux chaines distinctes, `chainRun=1` sur le dernier evenement des deux routes ;
- **N11** : detour chaine (`3×16=48` reutilise) → `chainRun≥1`, score 22 > direct 16 ;
- **N12** : route construite (`4+6=10` reutilise) → `chainRun≥1`, score 16 > immediate 13 ;
- **N13** : trois etapes reutilisees (`8×10 → 80+6 → 86−2`), `chainRun` croit a chaque etape.

## 10. Objectifs (Objectif / victoire / echec / progression)

- Chaque niveau porte `target` et `maxMoves` ; le target atteint = victoire ; plus de coups sans
  target = echec ; etat bloque (aucune formule valable) ≠ echec (message dedie dans l'overlay).
- L'overlay de victoire propose **Rejouer** et **Niveau suivant** (a partir de N1, jusqu'a N16).
- La progression est lineaire le long du LADDER : le prochain niveau est accessible depuis
  l'overlay de victoire ET la barre de navigation par id (deja presente en B1.5).
- La transition est rejouee par le playthrough autonome (le test fait `ov-next`/navigation pour
  enchaîner les 16 niveaux sans restauration manuelle).

## 11. Transformations

- Une seule porte de commit : `TRANSFORMER` ; le 3e appui ne declenche jamais `apply()` (regression
  couverte par le smoke, N1 et tous les niveaux du playthrough).
- PREVIEW ≠ STATE : le preview est calcule par `evaluate()` et ne modifie rien.
- INVALID → NO STATE CHANGE : une formule refusee ne consomme rien (arie testee sur tout le LADDER).
- La transformation ancre le resultat sur la position A ; l'operateur et B sont consommes.
- **Causalite visible** : pop de la tuile resultat, bump numero de score/chaîne, et le feedback
  textuel `A op B = R · +delta (· chaine)` deja en place. Rien de nouveau qui trompe.

## 12. Etat Git

Branche `kali/v5-gameplay-lab`, remote `git@github.com:6d797468-ai/mathic.git`.

```
4d26bf7 test: smoke DOM B1.5 promu en test reproductible (anomalie documentaire close)
f976fb1 docs: corriger SHA du commit documentaire dans le rapport B1.5
566ed8d docs: rapport B1.5 Grammar & Onboarding (implementation) + revue interaction/onboarding
abfa294 b1.5: grammaire TAP->PREVIEW->TRANSFORMER + onboarding N1-N6 (decision architecte)
18af8a2 docs: rapport evaluation autonome B1 + build Android (verif. 452bb998)
```

Puis, dans cette session B2 (voir §13) : le commit de code `aaebfc0` et le commit documentaire de ce
rapport seront pousses sur la branche. Arbre de travail final : propre.

## 13. SHA des commits

| Commit | Contenu |
|--------|---------|
| `4d26bf7` | cloture de l'anomalie documentaire B1.5 (smoke promu en test durable du repo) |
| `aaebfc0` | B2 gameplay core : N7–N16 + feedbacks causalite + playthrough autonome (tests) |
| commit doc | ce rapport + artefacts d'evidence (victoire UI==moteur==replay demontree par les tests) |

Pour verifier tout le contenu B2 : `git show aaebfc0`. Les tests sont executables via
`npm test` (96/96) et `node tests/playtest-puzzle.mjs`.

## 14. APK

- Chemin : `artifacts/b2/MATHIC-B2-1.0-debug.apk`
- Taille : 4 487 734 octets
- Fabrique : `npm run build:b1` → `npx cap copy android` → `./gradlew assembleDebug
  -Pandroid.aapt2FromMavenOverride=/usr/lib/android-sdk/tools-x86/aapt2` (BUILD SUCCESSFUL).
- Verifications : `unzip -t` OK ; contient bien `assets/public/{index.html,b1-web.js,b1-web.css}` ;
  les bundles web du APK sont **identiques** (`diff`) a `dist-b1/` ; les marqueurs B2 y figurent
  (N16, « La Synthese », « Le Partage Oblige », pop CSS).

## 15. SHA-256 de l'APK

```
274260832686dd594de6e404f253a358fab75ac57e7622ca983340129c80aeb0  artifacts/b2/MATHIC-B2-1.0-debug.apk
```

## 16. Limites connues

1. **Barre/cartouche de niveaux** : le titre de page et l'aria de la navigation restent libelles
   « B1.5 » alors que le LADDER couvre maintenant N1–N16 ; neutralite cosmétique, sans consequence
   fonctionnelle.
2. **N8** : les deux chaines gagnent 15 toutes les deux ; la lecon visée est « deux chaines », pas
   « consequences differentes » (ce contraste est porte par N7/N10/N11/N12/N14/N16). Assume.
3. **Pas de progression persistee** : le score/target preparatoire et la difficulte restent du
   B2 1.0 sans sauvegarde d'etat (hors perimetre).
4. **Niveaux fixes** : aucun generateur publie (seul le Solver certifie des niveaux « a la main »).
5. **Scores conceptuels** : les coefficients de score restent experimentaux et INCHANGES (aucun
   nouveau parametre introduit en B2).
6. **Test humain en attente** : conformement a la doctrine, seul l'APK B2 (version complete
   jouable) est un candidat au test humain ; aucun micro-test humain demande.

## 17. Anomalies observees

- **Interne recherche** (sans impact produit) : dans le tout premier script de recherche de
  niveaux, le compteur `postStates` comptait des snapshots absents (toujours 1) — toutes les
  planches etaient donc filtreees. Corrige avant selection ; aucune planche sélectionnée n'a
  ete affectee (les 10 plateaux ont ete recertifies par le script final puis figes dans les tests).
- **Cloture B1.5** : l'anomalie documentaire signalee par l'architecte (le rapport B1.5 mentionnait
  un smoke « N1→N5 » sans test durable) est close : le smoke est maintenant un test du repo
  (`tests/b1/b1-5-smoke.test.mjs`), commit `4d26bf7`, et le rapport B1.5 reste tel quel.

Aucune anomalie produit bloquante constatee sur le contenu B2.

## 18. Recommandations de correction strictement necessaires

Aucune correction de fond n'est exigee : `kernel.mjs`, `engine.mjs`, `solver.mjs`, `replay.mjs`
n'ont pas ete modifies (aucune insuffisance contractuelle demontree).

Recommandations non bloquantes :

1. **Anticiper le test humain APK B2** : institutionnaliser le protocole du prochain test humain
   sur une version complete jouable installee (ce que la doctrine de validation impose dorenavant).
2. **Neutraliser le libelle « B1.5 »** (titre de page / aria navigation) au moment du prochain
   changement de contenu — cosmétique.
3. **Etendre (optionnel, B3) la progression** : enchaînement persisté et objectifs score/chain
   prepares pour B2.4, sans nouvelle mecanique tant que le socle ne l'exige.