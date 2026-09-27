# MATHIC V5 — GAMEPLAY EXPLORATION

**Document de conception — PHASE 0/1/2 de la mission V5**
**Date** : 2026-09-23 · **Statut** : EXPLORATION (aucun code produit à part ce document)
**Contrat de vérité** (d'après la mission §18) — chaque affirmation importante est classée :
`FACT` (preuve existante) · `DESIGN` (décision argumentée) · `IMPL` (fait d'implémentation) · `RUNTIME` (preuve d'exécution).

Ce document est la **réponse à la « PREMIÈRE ACTION À EFFECTUER » (§24)** : aucun moteur, aucune UI, aucun APK modifié. Seul livrable : exploration + proposition de prototype conceptuel.

---

## 0. Base factuelle utilisée (rappels AUDIT V4 — preuves en `/tmp/audit/`)

| Fait | Preuve |
|---|---|
| Moteur V4 déterministe (T1==T2, 10 seeds × 200 coups), règles à source unique, core 0 DOM | `oracle.mjs`, suite `npm test` 512 checks / exit 0 |
| Mécanique : glisser-`merge` avec roue d'opérateurs `+ − × ÷`, cible sur la roue, cap 999, spawn [1–5] | suite + `logic.test.mjs` (analyse statique) |
| 2 variantes : classique (6 tuiles, score) et puzzle (budget M de mouvements, cible) | `playtest-puzzle.mjs`, suite G1/G2 |
| Branching moyen **14,6/16** commandes valides/état ; jeu aléatoire tient 600+ coups sans game-over | `math.mjs` |
| Tutorials-01/02/03 certifiés BFS (3/4/5 exacts) ; solvabilité 30/30 en dynamique | `math.mjs` |
| Générateur dégénéré : `moves:0` possible (cible déjà posée) — **écart MTH-001 (P2)** | `repro.mjs` (`tutorial-03x2` → `{moves:0,[42]}`) |
| Architecture : `src/core` pur / runtime ; session → `applyCommand` (pas de double-règles) ; RNG mulberry32 3 flux ; snapshot/undo/replay opérationnels | audit Niveau C |
| Dette : `loader.js` mort (fetch latent), `INTERNET` non utilisé, `Math.random` dans 2 tests (TST-001) | audit |
| Topologie git : **`main` = ancienne ligne `1d614e8` (k1-k4)** ; moteur validé = `kali/v4-engine` @ `6cd2cd3` | `git log/branch` |

> `IMPL` : ce document est écrit sur `main` mais **la branche de travail V5 sera `kali/v5-gameplay-lab`** (gouvernance §20). Seul ce fichier est créé ; aucun commit n'est effectué sans autorisation.

---

## 1. Diagnostic du gameplay V4 (honnête, basé sur les preuves ci-dessus)

### 1.1. Ce que V4 est réellement
- Un **glisser-fusionner numérique** : on déplace des tuiles, on les fait fusionner en appliquant l'opérateur **tiré aléatoirement** par la roue, pour atteindre une **cible de la roue**.
- La **décision y est faible/moyenne** : les actions valides sont nombreuses (14,6/16) mais **de qualité… indiscernable pour la plupart**. La mécanique dominante est le *mouvement* (positionnement), pas la *transformation*. Les opérateurs sont des **événements subis** (la roue les impose), pas des choix exploitables.
- La **progression** repose surtout sur : cible qui monte (42→…), budget de mouvements qui descend (mode puzzle), valeurs plus grandes.
- L'**anticipation** est quasi nulle : on ne voit pas le prochain opérateur ni le prochain spawn — le joueur réagit plus qu'il ne planifie.
- La **résolution de problème** existe au niveau du positionnement (gérer le risque de plafond, la densité), mais **pas au niveau mathématique** : les maths (calcul) sont exécutées par le moteur derrière l'écran.

### 1.2. Diagnostic en trois phrases
1. **V4 est un jeu spatial correct et un calculateur silencieux** : la fusion fait le calcul, le joueur fait du placement.
2. La mécanique de la roue tue la causalité : « j'ai fusionné → résultat aléatoire » est **incompréhensible comme conséquence** (violation évidente du §3.2 de la mission ; random = FOE).
3. Il n'y a donc **pas encore d'identité « relation mathématique manipulée par le joueur »** : il y a une identité de jeu de fusion.

### 1.3. Ce qui doit changer de nature (et pas seulement de valeur)
Le passage V5 consiste à faire passer la **transformation mathématique du statut d'événement (roue) au statut de décision du joueur**, tout en gardant la boucle spatiale qui fait le charme de V4.
C'est un changement de **nature de la mécanique**, pas un changement de numbers.

---

## 2. Ce qui fonctionne dans V4 (à conserver tel quel ou presque)

| Élément | Pourquoi | Classe |
|---|---|---|
| **Core pur 0 DOM + RNG seedé + commandes purs** | socle validé (déterminisme, replay, snapshot, undo) | FACT |
| **Un seul chemin de règles** (session → `applyCommand`) | aucune dérive possible entre runtime et moteur | FACT |
| **Glisser sur couloirs** (surface tactile simple, une action = un mouvement) | bonne base d'interaction « mobile first » | FACT |
| **Mode puzzle à budget (M mouvements)** | crée une contrainte de ressource simple et lisible | FACT |
| **Undo + snapshot + reprise** | filet de sécurité indispensable en jeu de réflexion | FACT |
| **Tutorials à seeds certifiés** (3/4/5) | onboarding calibré et reproductible | FACT |
| **Solver BFS + analytics** utilisés comme instruments de design | déjà en place, à étendre (§11 de la mission) | FACT |
| **Momo en couche auxiliaire non-autoritaire** | il ne touche jamais le GameState — à conserver (§13) | FACT |
| Infra CI Android, build web, audio, worker | socle technique ; ne pas réécrire sans cause | FACT |

---

## 3. Ce qui ne fonctionne pas (à corriger par le design V5)

1. **La roue d'opérateurs = hasard non contrôlé** : la transformation est subie, la causalité est brisée → à remplacer par un **choix du joueur** (avec transparence). `DESIGN`.
2. **Pas d'anticipation** : rien n'annonce l'avenir (opérateur suivant, spawn suivant, événement) → V5 expose **au minimum la file des 2-3 prochains opérateurs** si le gameplay les consomme (§3.3). `DESIGN`.
3. **La cible est régulièrement atteignable par inertie** : jeu aléatoire viable 600+ coups, branching sans intention → il manque des **contraintes qui forcent le raisonnement** (MAX_MOVES serré, opérateurs requierts/interdits, valeur exacte, préservation). `FACT` (math.mjs) + `DESIGN`.
4. **Les maths sont invisibles** : le calcul est dans le moteur → V5 doit **rendre la relation lisible** (chaînes type `3 → +2 → ×2 → −1`, valorisation pas à pas). `DESIGN`.
5. **Générateur dégénéré (MTH-001)** : solutions 0-mouvement ou triviales possibles → **obligation de certification par le solver** pour toute génération dynamique (§12 de la mission). `FACT`.
6. **Progression par « nombres plus grands »** : les valeurs montent mais la difficulté conceptuelle stagne → V5 fait progresser la difficulté par **ajout de mécaniques/contraintes**, pas par taille des nombres (§3.4, G0.6). `DESIGN`.
7. **Fin de partie floue / satisfaction faible** : « avoir atteint une valeur » n'est pas « avoir construit une solution » → V5 introduit des **objectifs de nature relationnelle** (créer une chaîne exacte, éteindre des zones, équations croisées). `DESIGN`.

---

## 4. Mécaniques à conserver (immédiatement réutilisables)

- Boucle **mouvement → commande → règles → nouvel état → événements** (pur, seedé).
- **Undo, snapshot, replay, persistence** tels quels.
- **Solver BFS / analytics / profiler** comme instruments de Game Design.
- **Session unique de règles** (pas de double implémentation).
- **Tutorials à seeds fixes certifiés** (le mécanisme, pas les niveaux).
- **Momo non-autoritaire** (consultation seule du GameState).
- **Grille/couloirs en support spatial** (le « spatial » de la signature) — des couloirs peuvent évoluer librement au sein d'un niveau (multi-couloirs, lignes).
- **Build/CI/wasm/wllama** (non concernés tant que le gameplay est pur).

---

## 5. Mécaniques à abandonner ou repositionner

| Mécanique V4 | Verdict | Raison / devenir |
|---|---|---|
| **Roue d'opérateurs (hasard)** | **ABANDON** | le hasard est le FOE de V4 (§3.1) ; remplacé par des opérateurs **choisis** (pièces ou file prévisible) |
| **Cible = valeur seule** | REPOSITIONNER | l'objectif devient **relationnel** (créer la valeur exacte, éteindre une zone, remplir une équation) ; la valeur reste une sortie, pas le but |
| **Game over par plafond implicite** | REPOSITIONNER | le « risque valeur » reste comme **contrainte optionnelle**, plus comme pilote unique de fin de partie |
| **Mode classique « score infini »** | GARDER en *mode détente*** | secondaire : il ne doit pas être le cœur V5, sinon on régresse vers 2048 |
| **Fusion « bulk » du range entier** | ADAPTER | les couloirs restent le geste de base, mais l'**association nombre↔opérateur** devient l'acte de décision |
| **Spawn aléatoire [1-5]** | REPOSITIONNER | restreindre/paramétrer par niveau (spawnRules) pour servir les contraintes, et **l'annoncer** |

---

## 6. Principes de conception V5 (traduits de la mission §3, applicable dans le lab)

1. **DECISION** — une action = une intention. On n'aura jamais « 14 actions équivalentes » (atteint via : opérateurs rares, coût de mouvement, contraintes de préservation).
2. **CAUSALITY** — « j'ai fait X ⇒ le système a produit Y » *et rien d'autre*. Bannir tout résultat non lu.
3. **ANTICIPATION** — tout « prochain » critique est affiché : file d'opérateurs, spawn, événement bord, zone en écart.
4. **CONSTRAINTS** — la difficulté vient des contraintes (`MAX_MOVES`, `REQUIRED_OPERATOR`, `FORBIDDEN_OPERATOR`, `EXACT_VALUE`, `PRESERVE_VALUE`, `SEQUENCE`, `MULTIPLE_OBJECTIVES`, `CLEAR_VALUE`), jamais des seules valeurs.
5. **TRANSFORMATION** — l'application d'un opérateur est un **choix** (pas un événement) dès que le design du niveau le permet.
6. **CHAINS** — les expressions sont **lisibles en continu** : `3 → +2 → ×2 → −1 = 9` est une première-class du vocabulaire.
7. **OPTIMIZATION** — « valide » ≠ « efficace » ≠ « optimale » : niveaux à solution multiple avec **récompense de parcimonie** (étoiles/score best-effort).

---

## 7. Trois concepts de gameplay distincts

Trois directions **radicalement différentes**, toutes compatibles avec la signature `Spatial + Maths + Stratégie + Contraintes + Anticipation` et avec le socle technique (pureté, déterminisme, solver).

| | **A — CHAÎNES & OPÉRATEURS-CONSOMABLES** | **B — GRILLE D'ÉQUATIONS CROISÉES** | **C — ZONES DE CONVERGENCE** |
|---|---|---|---|
| Verbe principal | **composer** (glisser un opérateur sur une suite) | **croiser** (smallest placement satisfaisant 2 équations) | **équilibrer** (projeter chaque zone sur sa cible) |
| Objet mobile | tuiles-nombres + tuiles-opérateurs | tuiles-nombres (reserve → cases) | tuiles-nombres (+ budget d'opérateurs) |
| Le hasard playable | **zéro** (files déterministes) | zéro (énoncé clos) | file d'opérateurs visible |
| Profondeur forte | la **préséance** (l'ordre des transformations change le résultat) | la **mutualité** ligne∩colonne | le **routage** d'opérateurs rares |
| Risque dominant | dérive « pipeline de calcul » | dérive « sudoku/kenken » | dérive « whack-a-mole » |
| Greffe V4 | très bonne | moyenne (nouveau tablier) | bonne |
| Solver/simu | BFS sur arbres d'expressions bornés | solveur de contraintes + BFS | heuristique d'écart + BFS |

### Chaque concept est développé dans la section 8 avec : boucle, règles, décisions, progression, contraintes, exemples de niveaux, risques, avantages, possibilités de simulation.

---

## 8. Détail des trois concepts

---

### CONCEPT A — « CHAÎNES » : composer des relations sur des lignes d'expression

#### 8.A.1. Boucle de jeu (un tour)
1. Le joueur voit **une ligne de slots** contenant des tuiles-nombres et, en tête, **la file déterministe des opérateurs à venir** (`+ × − ÷`, les 3 prochains visibles).
2. **Action disponible** : il choisit un opérateur (pièce en main ou glissée depuis la file) et **l'applique sur une tuile** ou **entre deux tuiles adjacentes** → la relation s'instancie : `a op b = r`.
3. Le moteur évalue la **relation locale** et **recompose la chaîne** ; le résultat `r` se soude à la chaîne (`3 → +2 → ×2`) ; l'opérateur est **consommé**.
4. Nouvel état + événements (`chain updated`, `value created`, `op exhausted`) → retour en 1.

#### 8.A.2. Règles précises
- `chain` = suite ordonnée `(v0 op1 v1 op2 v2 …)` où chaque `op` a été **choisi par le joueur** et **consommé**.
- **Évaluation progressive visible** : la chaîne est re-affichée à chaque étape (pas d'évaluation cachée).
- **Préséance par parenthésage matériel** : composer `(a×b)+c` ≠ `a×(b+c)` — le joueur décide de la séquence.
- **Division** : `a ÷ b` n'est valide que si **divisibilité exacte** (sinon l'action est refusée avec un message utile).
- **Cap de valeur** (paramètre de niveau, défaut 999) : dépasser = `overload` (perte de la tuile) — contrainte, pas mécanique unique.
- **Spawn** : régi par `spawnRules` du niveau (valeurs et positions fixées par seed).
- Jamais de `Math.random()` dans la boucle : tout est **déterminé par seed + actions** (file de opérateurs générée par le RNG seedé à la création du niveau). `FACT` anti-MTH-001.

#### 8.A.3. Décisions du joueur
- **Quel opérateur je dépense maintenant** (lequel de la file, ou je passe → thésauriser) — ressource rare par niveau.
- **Sur quel nombre** je l'applique (le « bon » nombre pour une division propre, éviter de détruire un nombre utile).
- **Séquence de transformations** (l'ordre change le résultat → la chaîne est la vraie décision mathématique).
- **Longueur de la chaîne** : trop courte = raté la cible, trop longue = budget épuisé (`MAX_MOVES`).

#### 8.A.4. Progression de difficulté (par concepts, pas par valeurs)
1. Ligne simple, file conforme (+ seulement).
2. + opérateur mixte (÷ exige planification de divisibilité).
3. + `EXACT_VALUE` (pas « ≥ », pas « = » avec relâchement).
4. + `FORBIDDEN_OPERATOR` / `REQUIRED_OPERATOR`.
5. + multi-lignes / couloirs croisés (une tuile peut circuler d'une ligne à l'autre).
6. + `SEQUENCE` (les opérateurs doivent être consommés dans l'ordre listé).
7. + `OPTIMIZATION` (moins d'opérateurs que la solution minimale → étoiles).

#### 8.A.5. Exemples de niveaux (niveau-spec provisoire — schéma §5 de la mission, RESTE A DÉRIVER DES TESTS)
```jsonc
// N1 « Découverte » — 3; +2; ×2
{ "id": "v5-01",
  "objective": { "type": "EXACT_VALUE", "value": 10 },
  "constraints": [ { "type": "MAX_MOVES", "value": 2 } ],
  "initialState": { "line": "3 + 2", "operatorsQueue": ["×2"] },
  "spawnRules": { "fixedBySeed": true, "seed": "v5-01" } }

// N2 « Priorité » — 24 depuis {6,6,2} : 6×2=12, 12+6 ? non → la préséance compte
{ "id": "v5-02",
  "objective": { "type": "EXACT_VALUE", "value": 24 },
  "constraints": [ { "type": "MAX_MOVES", "value": 2 } ],
  "initialState": { "line": "6 6 2", "operatorsQueue": ["×","+"] } }

// N3 « Division propre » — 48 → 2 sans jamais soustraire
{ "id": "v5-03",
  "objective": { "type": "EXACT_VALUE", "value": 2 },
  "constraints": [ { "type": "FORBIDDEN_OPERATOR", "ops": ["−"] } ],
  "initialState": { "line": "48 4 6", "operatorsQueue": ["÷","÷"] } }

// N4 « Séquence » — 2 → (×3) → (+2) → (×2) = 16 ; cible 16
{ "id": "v5-04",
  "objective": { "type": "EXACT_VALUE", "value": 16 },
  "constraints": [ { "type": "SEQUENCE", "ops": ["×3","+2","×2"] } ],
  "initialState": { "line": "2", "operatorsQueue": ["×3","+2","×2"] } }

// N5 « Cible préservée » — ne jamais toucher la tuile 7 ; jamais de multiplication
{ "id": "v5-05",
  "objective": { "type": "EXACT_VALUE", "value": 9 },
  "constraints": [ { "type": "PRESERVE_VALUE", "value": 7 }, { "type": "FORBIDDEN_OPERATOR", "ops": ["×"] } ],
  "initialState": { "line": "7 4 5", "operatorsQueue": ["−","+"] } }

// N6 « Parcimonie » — valide en 2 ops, optimale en 1
{ "id": "v5-06",
  "objective": { "type": "EXACT_VALUE", "value": 24 },
  "constraints": [ { "type": "OPTIMIZATION", "best": 1 } ],
  "initialState": { "line": "2 3 4 6", "operatorsQueue": ["×","+","×"] } }
```

#### 8.A.6. Risques
- **Dérive « pipeline »** : si les opérateurs sont toujours « évidents », on retombe sur un exercice. → Atténuation : rareté des opérateurs + multi-lignes croisées + contraintes de préservation qui forcent des **détours**.
- **Fragilité de la division** : niveaux non validés → **certif** par le solver avant publication (obligatoire §12).
- **Touche spatiale faible** si la ligne est le seul support → la variante **multi-couloirs croisés** (concept B en extension) est le garde-fou.

#### 8.A.7. Avantages
- **Anticipation maximale** (file visible = « prochain élément » §3.3).
- **Causalité parfaite** (résultat = fonction de mon choix d'opérateur, aucune roue).
- **Identité « composer des relations »** : exactement la signature demandée.
- **Solver trivial** (BFS sur arbre d'expressions borné) → certification/difficulté mesurables.
- **Greffe V4 la moins coûteuse** (le geste glisser reste central).

#### 8.A.8. Simulation possible dès le lab
- Génération de specs → BFS : `#solutions`, `min/avg length`, `branching`, solutions triviales (longueur=1, valeur déjà posée), **diversité** (déjà écrivons), opérateurs réellement utilisés, contraintes réellement contraignantes (activation/désactivation on/off).

---

### CONCEPT B — « GRILLE CROISÉE » : équations de lignes ET de colonnes en un placement

#### 8.B.1. Boucle de jeu
1. Énoncé : gille `n×n` où **chaque ligne et chaque colonne porte une équation-objectif** (`L1 : a+b+c = 12`, `C1 : a+d+g = 7`, …).
2. Le joueur reçoit une **réserve de tuiles-nombres** et des **cases vides**.
3. **Action** : il déplace une tuile vers une case (geste glisser), respectant le couloir du support.
4. **Validation** : une ligne/colonne est **éteinte** (résolue) quand son équation devient vraie ; la résolution est **simultanée** (une place doit satisfaire ligne ET colonne).
5. Nouvel état + événements (`line solved`, `combo` si 2 contraintes satisfaites d'un même coup).

#### 8.B.2. Règles
- Chaque case appartient à **une ligne + une colonne** : la valeur placée doit être « compatible » avec les objectifs des deux.
- Équations sur `(+, −)` puis `(×, ÷)` selon le niveau.
- **Exactitude stricte** ; aucune case « en trop » (sinon échec de résolution).
- Spawn : réserve finie donnée dans le niveau (aucun random ou seedé).

#### 8.B.3. Décisions
- **Quelle tuile à quelle intersection** (contrainte double).
- **Ordre de placement** (mauvais ordre = remplacement coûteux en mouvements).
- **Gestion des surplus** (recyclage, cases bonus) selon la variante.

#### 8.B.4. Exemple concret (grille 2×2, vérifié)
```
 L1 : a + b = 10        L2 : c × d = 12
 C1 : a + c = 7         C2 : b − d = 2
 Réserve {4, 6, 3, 4}  →  a=4 b=6 c=3 d=4  ✓ (L1 10, L2 12, C1 7, C2 2)
```

#### 8.B.5. Risques
- **Dérive « sudoku/kenken »** (le risque déclaré); atténuation : geste mécanique de **glissement** (pas de tap-place), **retour d'écho physique** (ligne qui s'éteint), **combo**, objectif **optimization** (minimiser les déplacements).
- **Tablier nouveau** : moins de réutilisation directe de la logique V4 (mais le **standard pure/déterminisme** reste identique).
- **Résolution trop « lecture » et pas assez « manipulation »** si le solver mental fait tout → contre-mesure : borner la lisibilité (petites tailles, 2 opérateurs).

#### 8.B.6. Avantages
- **Identité spatiale + math sure et unique** (personne ne confondra avec 2048/Threes).
- **Résolution de problème pure et intense**, énigme de contraintes.
- **Solver d'énoncés** classique (solveur contraintes) disponible pour la certification.
- **Rejouabilité** par génération de systèmes d'équations consistants et non triviaux.

#### 8.B.7. Simulation
- Génération du système d'équations + solveur contraintes : `#solutions`, symétries, unicité, trivialité (0/1 case), **diversité des placements**.

---

### CONCEPT C — « ZONES DE CONVERGENCE » : projeter chaque zone sur sa cible

#### 8.C.1. Boucle de jeu
1. Plateau (ex. 4×4) **découpé en zones colorées**, chacune avec une **cible** (`zone → value`) ; une réserve partagée d'opérateurs ; la **file des prochains opérateurs est visible**.
2. **Action** : le joueur transforme une tuile de la zone (`n op op = n'`), l'opérateur étant **pris dans la file (choix)**.
3. Nouvel état : les zones sont **re-teintées selon leur écart** `|valeur − cible|` (feedback chaud/froid) ; une zone `écart = 0` **se fige**.
4. Objectif : **toutes les zones figées** avant épuisement du budget global d'opérateurs.

#### 8.C.2. Décisions
- **Quelle zone d'abord** (urgence vs opportunité), **ordre de traitement**.
- **Quel opérateur router vers quelle zone** (rareté).
- **Accepter un détour** (écarter temporairement une zone pour en sauver une autre).

#### 8.C.3. Progression
- 2 zones → 4 zones ; opérateurs requis par zone ; `PRESERVE_ZONE` ; dépassement de cap en zone = perte.

#### 8.C.4. Risques
- **Whack-a-mole** (équilibrer des chiffres plutôt que réfléchir) ; atténuation : cibles qui **percent** (pas « s'écrivent dans la zone » mais « s'extirpent »), chevauchements de zones (une tuile appartient à 2 zones → choix vrai).
- **Feedback d'écart trop lisible** → devient mécanique → borner l'information (montrer l'écart seulement avant action, pas en continu).

#### 8.C.5. Avantages
- **Tension stratégique et routage**, anticipation lisible, grande variété structurelle de plateaux.
- Analytics trivials : **distance à la solution** = somme des écarts (heuristique Momo parfaite).

#### 8.C.6. Simulation
- BFS/IDA sur distance d'écart ; `#plateaux solvables`, profondeur min/moyenne, ramification, **difficulté par structure de zones**.

---

## 9. Proposition du Gameplay Laboratory

**But** : tester toutes les mécaniques sur papier puis sur le tas, **sans DOM/React/Capacitor/réseau/téléphone/audio** (mission §6).

### 9.1. Forme
- Module **Node pur** (comme le socle V4 `src/core`) + CLI de simulation.
- Entrée : **niveau-spec JSON** (schéma provisoire §8, schéma final dérivé des mécaniques validées — mission §5).
- Sortie : **traces d'événements** (`initial → command → state → events`) + **mesures**.
- Aucun `Math.random()` hors RNG seedé.

### 9.2. Fonctionnalités minimales (MVP lab)
- `apply(board, cmd)` — commandes valides pour **les trois concepts** (spécifiques).
- **Runner** : replay d'une seed, undo/snapshot inclus.
- **Solver BFS** borné (longueur ≤ 12) → `#solutions`, `min_length`, `avg_length`, `branching`.
- **Détecteur de trivialité** : solution de longueur 1 ; valeur-objectif déjà présente dans l'état initial (**anti-MTH-001**).
- **Détecteur d'impossibilité** : BFS complet → 0 solution.
- **Analyse de contraintes** : résolution du même niveau avec/sans chaque contrainte → mesure de la **contribution réelle** de la contrainte.
- **Courbe de difficulté** : batch de niveau → courbe (min_length vs n° de niveau).

### 9.3. Placement des mesurandes (mission §6)
| Mesure | Concept A | B | C |
|---|---|---|---|
| `#solutions / min / avg / branching` | BFS arbre d'expressions | solveur contraintes + BFS | BFS/IDA |
| trivial / impossible | BFS (revient à 1 / 0) | comptage de solutions | BFS |
| opérateurs utilisés / contraintes réellement utiles | toggle on/off | toggle | toggle |
| courbe de difficulté | batch | batch | batch |

> `IMPL` : le lab sera hébergé **hors dépôt produit** (ex. `/tmp/opencode/v5-lab`, ou branche `kali/v5-gameplay-lab` une fois le prototype retenu) ; **l'arbre de production V4 reste intouché** pendant la phase 3-4.

---

## 10. Critères GAMEPLAY-G0 (exactement ceux de la mission §7) — cibles « évaluables par le lab/sim »

| Critère | Formulation mission | Cible de preuve quantitative dans le lab |
|---|---|---|
| **G0.1 Compréhension** | le joueur comprend la tâche | sp énoncé ≤ 3 lignes par niveau ; tests « compréhension » : un agent solutionniste avec la spec lit le niveau (méthode : trace béhaviourale d'un *novice simulé*) |
| **G0.2 Décision** | plusieurs actions plausibles | `branching` ≥ 3 actions « non stupides » moyennes (lab) ET diversité des solutions ≥ 2 dans les niveaux à solution multiple |
| **G0.3 Conséquence** | conséquences lisibles | causalité totale (0 aléa non-annoncé) ; événements `chain/value/zone` explicites ; preuve : traces |
| **G0.4 Raisonnement** | résolution efficace ⇒ réfléchir | `min_length` > 1 et `best≠min` sur une famille de niveaux (OPTIMIZATION) |
| **G0.5 Non-trivialité** | la stratégie naïve ne gagne pas | aucune solution de longueur 1 ; taux de succès d'un *agent glouton* < 100 % |
| **G0.6 Progression** | difficulté par nouvelles contraintes/mécaniques | courbe batch : même si valeurs constantes, difficulté croît via contraintes |
| **G0.7 Rejouabilité** | optimisation / plusieurs solutions | `#solutions ≥ 2` sur ≥ 1/3 des niveaux de chaque lot ; score best-effort |
| **G0.8 Identité** | distinct d'un clone numérique | exercice de design : cartographie mécanique A/B/C vs 2048/Threes/Sudoku/Candy (tableau §24 de l'audit) → case « pas de copie » |

Déclencheur : **toute case G0 en échec ⇒ STOP → ANALYSE → CORRIGE LE DESIGN → RETEST** (§7 missions). Aucune compensation par animation.

---

## 11. Ce qui NE doit PAS être codé maintenant (liste explicite)

- ❌ `main.js`, `ui.js`, `input.js`, `style.css` — **aucune UI**.
- ❌ `board.js` / `diff.js` / `game.js` / moteur V4 — **aucune réécriture** (gouvernance §11.6 : réécriture d'un module validé interdite sans autorisation ; ici autorisée… après validation G0 seulement, cf. §12).
- ❌ `GameAdapter`, Capacitor, Android, build, packager — rien de mobilien.
- ❌ Audio, profiler runtime, persistance applicative, Momo **en tant que produit** (Momo n'existe que comme *consommation du lab*, non autoritaire).
- ❌ toute nouvelle dépendance npm (gouvernance §19).
- ❌ `Math.random()` / `Date.now()` dans toute boucle gameplay (mission §10).
- ❌ génération dynamique de niveau **sans certification solver** (mission §12 / MTH-001).
- ❌ commits/pushes ; `main` reste intouché ; la branche de travail est `kali/v5-gameplay-lab` (gouvernance §20).
- ✅ **Seul autorisé** : documents de design (ce fichier), **et plus tard** le Gameplay Laboratory dans une sandbox hors-produit.

---

## 12. Prototype conceptuel retenu — PROPOSITION

> Cette section est une **proposition** ; le passage en implémentation exige le feu vert de la gouvernance (§19).

### 12.1. Choix : **CONCEPT A — « CHAÎNES »** (avec garde-fou Concept B)

**Raisons (ordre de poids) :**
1. **G0.3/G0.1 : causalité et compréhension maximales.** La file d'opérateurs visible + la chaîne re-affichée à chaque étape font que « le résultat est fonction de mon choix » est *matériellement évident*. C'est LE critère qui élimine V4.
2. **G0.2 : décision réelle.** L'opérateur devient un objet rare à dépenser → `branching` qualitatif, contrairement aux 14,6/16 de V4.
3. **G0.6 : progression par mécaniques.** `EXACT_VALUE → FORBIDDEN → SEQUENCE → OPTIMIZATION` fait monter la difficulté sans toucher aux tailles.
4. **Greffe V4 la moins chère** : le geste « glisser », la pureté, le RNG, le solver et l'undo sont réutilisés **quasi tels quels** → baisse massive du risque de régression (vs Concept B = nouveau tablier).
5. **Solver trivial** → certification / difficulté / diversification PAR DESIGN, pas par accident.
6. Situation la plus éloignée d'un clone : le joueur ne « poursuit pas une tuile » (→2048), il **constitue une relation exacte**.

**Garde-fou : Concept B (Grille croisée) entre au lab en « candidat secondaire »** pour trois lots de simulation comparés (lots A et B sur mêmes cibles G0). Le **GATE** décidera A, B, ou A∪B par un tableau de scores G0 (pas par l'enthousiasme).

### 12.2. Évolutions de contrat pressenties (gouvernance §8 — à documenter OLD→PROBLEM→NEW→MIGRATION→TESTS au moment de PHASE 6)
- `GAME-RULES-V1` (roue-op) : `OLD` = op appliqué par la roue à la fusion ; `PROBLEM` = hasard non causant (FOE) ; `NEW` = opérateur choisi/consommé, file déterministe ; `MIGRATION` = nouveaux events `OPERATOR_SPENT`/`CHAIN_EVALUATED`, suppression de l'injection roue ; `TESTS` = suite V4 conservée **en parallèle** (régression zéro-cassure) + nouveaux tests V5.
- `LEVEL` : le schéma §5 (objectif/contraintes/état/spawn/protégés) est **le squelette que les tests valideront** — rien n'est figé avant les mesures du lab.
- **Aucun autre contrat V4 ne bouge avant PHASE 6** (undo/snapshot/replay/persistence/déterminisme restent inchangés).

### 12.3. Pré-screen G0 (provisoire, à confirmer par le lab)
| G0 | Concept A (provisoire) | Preuve prévue |
|---|---|---|
| Compréhension | ✔ forte | file visible, énoncé ≤ 3 lignes |
| Décision | ✔ forte | branching ≥ 3 non-trivial (lab) |
| Conséquence | ✔ totale | 0 aléa non annoncé |
| Raisonnement | ✔ forte | OPTIMIZATION, divisions propres |
| Non-trivialité | ✔ (MIN_LEN ≥ 2) | BFS |
| Progression | ✔ (contraintes) | batch |
| Rejouabilité | ✔ (`#solutions ≥ 2` sur ≥ 1/3) | BFS |
| Identité | ✔ (chaînes vs 2048/Threes/Candy/Sudoku) | cartographie §24 audit |
> Toute case en échec au lab ⇒ STOP design.

### 12.4. Prochain Gate (une seule étape logique suivante)
**GATE 1 — CONCEPT VALIDATION LAB :**
1. Créer `kali/v5-gameplay-lab` (gouvernance §20).
2. Implémenter le **lab minimal §9** (index = commandes + BFS + métriques) en 1 commit testable.
3. Charger **2 lots de ~10 niveaux-spec A et ~10 B** (seeds fixes, spécs comme §8).
4. Produire le **rapport G0** (tableau §10) + courbes de difficulté + hits anti-MTH-001.
5. **STOP → analyse → décision A/B/A∪B** avant le moindre lien UI/UI/engine.

**Quand GATE 1 est vert**, la PHASE 6 (Rule Engine V5) commence, avec le contrat de migration §12.2 formalisé et la suite V4 toujours verte en parallèle.

---

## 13. Annexe — rappel de la « liste des non-codés » au sens strict (§24)

- Aucun code de jeu, d'UI, d'engine, de build.
- Aucun commit, aucun push.
- **Seul ce document** est produit, dépourvu de scope fonctionnel.
- Ce document **ne modifie pas** `src/`, `tests/`, `android/`, `workflows/`.

*Fin du document d'exploration V5.*