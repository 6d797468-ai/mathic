# MATHIC 1.0 — Brief produit & référence de conception

**Statut** : RÉFÉRENCE PRODUIT · **Date** : 2026-09-23 · **Source** : décision de cadrage équipe projet.
**Cadre** : V4 = fondation technique historique (immuable) · V5 = laboratoire de recherche gameplay (acquis réutilisables) · **MATHIC 1.0 = première vraie version complète, jouable de A à Z sur téléphone.**

Règle de cadrage fondamentale : **une seule trajectoire produit**. Pas de V5→V6→V7 à chaque correction : on construit MATHIC 1.0, on le gèle, on ne renumérote jamais un correctif en « nouvelle version ».

Condition de sortie MATHIC 1.0 : la boucle complète existe de A à Z **et** a été réellement jouée sur téléphone par un joueur hors développement.

---

## 0. Identité produit (ce que MATHIC n'est PAS)

- ❌ Pas « un 2048 avec des opérations » (depth 2048 = espace/fusion de tuiles identiques — pas notre pari).
- ❌ Pas un jeu où « deux nombres identiques → addition automatique » est la règle centrale.
- ✅ MATHIC : **Mathematical Combination Puzzle** — le joueur manipule nombres et opérateurs pour construire des **transformations mathématiques** vers un objectif.
- Définition : *« le joueur choisit mathématiquement comment transformer le plateau. »*

**Test d'exclusivité (valeur de garde) :**
- Si on remplace les nombres par des bonbons → Candy Crush presque pareil ⇒ MATHIC n'est pas assez distinctif.
- Si on remplace les nombres par des tuiles 2048 → 2048 presque pareil ⇒ MATHIC n'est pas assez distinctif.
- MATHIC doit dépendre de sa propriété fondamentale : **il existe plusieurs chemins mathématiques possibles vers un objectif, avec des conséquences différentes en score, combo, ressources, progression — et c'est le joueur qui choisit.**

## 1. La boucle (le verbe du jeu)

```
OBJECTIF
  ↓
OBSERVER LE PLATEAU
  ↓
CHOISIR UNE OPÉRATION
  ↓
CONSTRUIRE UNE EXPRESSION
  ↓
CALCULER
  ↓
TRANSFORMER LE PLATEAU
  ↓
NOUVELLES POSSIBILITÉS
  ↓
CHAÎNE / COMBO
  ↓
SCORE + RÉCOMPENSE
  ↓
(OBJECTIF ATTEINT) → NIVEAU SUIVANT
```

Cette boucle doit fonctionner **sans IA**. L'IA intervient après pour améliorer l'expérience. C'est une distinction architecturale obligatoire.

## 2. Mécanique cœur

- Plateau de petits carreaux : des **nombres** (2, 3, 4, 5, 6, 8, 10, 12…) et des **opérateurs** (+ − × ÷) ; zone de **réserve / prochain élément**.
- Le joueur construit des opérations : `6 × 4 = 24`, `8 − 5 = 3`, `50 − 2 = 48`, `96 ÷ 2 = 48`…
- **La transformation modifie réellement le jeu** : le résultat devient une nouvelle ressource exploitable (opération 1 → nouveau nombre → opération 2 → …).
- **Multi-solutions volontaires** : toutes les routes sont mathématiquement correctes mais de conséquences différentes (rapide / complexe / combo / chaîne / rare ressource). Le jeu demande : *« Quelle solution vas-tu choisir ? »* — jamais « voici la bonne réponse ».

## 3. Chaînes & combos (cause mathématique uniquement)

- Chaîne : `6 × 4 = 24` → `24 − 8 = 16` → `16 × 3 = 48` → `48 ÷ 2 = 24`. Le système mesure `chainLength`, `operations`, `complexity`, `efficiency`, `targetDistance`.
- Combo : jamais un « COMBO ×4 » décoratif. Il est déclenché uniquement quand il y a une **raison mathématique** (résultat réutilisé, efficacité, objectif, complexité).
- Le joueur arbiter : **RAPIDITÉ vs COMPLEXITÉ vs COMBO vs SCORE vs PRÉPARATION DU COUP SUIVANT**.

## 4. Score (récompenser la pensée)

Modèle initial (hypothèse, **coefficients calibrés par simulation + tests humains**, jamais gravés par intuition) :

```
Score = Base (valeur du résultat)
      + Complexity (nombre/type d'opérations)
      + Chain (transformations consécutives)
      + Objective (cible atteinte)
      + Efficiency (ressources/mouvements utilisés)
```
ou en variante multiplicative `Base × Complexity × Chain × Objective × Efficiency` — à trancher par les mesures.

Dimensions à mesurer ensuite : distribution des scores, écart entre joueurs, stratégie dominante abusive, intérêt de chaque opérateur, fréquence des combos, répétitivité, failles exploitables. **Objectif du score = rendre les choix intéressants, pas les calculs compliqués.**

## 5. Progression pédagogique (mondes = unités cognitives, pas décors)

- W1 Découverte (addition) · W2 Addition · W3 Soustraction · W4 Multiplication · W5 Division · W6 Combinaisons (+−×÷ ensembles, plusieurs routes) · W7 Chaînes (résultat → calcul suivant) · W8 Optimisation · W9 Multi-objectifs · W10 Maîtrise.
- Chaque monde introduit **une** idée cognitive ; le nombre d'opérateurs/paramètres ne doit **jamais** tous apparaître d'un coup (anti-piège : explosion illisible des possibilités).

## 6. Objectifs & contraintes de niveau

Le niveau = **équation de contraintes** :
```json
{
  "target": 48,
  "allowedOperators": ["+", "-", "*"],
  "maxMoves": 12,
  "minCombo": 2,
  "minScore": 300
}
```
Objectifs progressifs : atteindre X · atteindre X ≤ 5 actions · chaîne ≥ 3 · score ≥ N · objectifs **multiples** (atteindre 96 + ≥ 4 opérations + finir en combo). La profondeur stratégique vient de là.

## 7. Spécials & boosters (secondaires, jamais nécessaires)

- Opérateurs spéciaux (introduits **tardivement, un par un**, chacun avec une fonction mathématique précise) : ×2, ÷2, ², √, %, puis éventuellement DOUBLE, COPY, SWAP, CHAIN, POWER. Interdiction : « POWER parce que c'est joli ».
- Boosters : CALCULATEUR (révèle les résultats possibles), DOUBLE (double le score d'une formule), SWAP (échange deux éléments), FREEZE (conserve un carreau), REVERSE (annule la dernière transformation), MULTIPLIER (combo). Le jeu reste parfaitement jouable sans eux.

## 8. Récompenses & Math Mastery

- Étoiles : ⭐ objectif · ⭐⭐ contrainte/score · ⭐⭐⭐ maîtrise/optimisation → XP, déblocages, nouveaux opérateurs, nouveaux mondes.
- **Math Mastery** : statistiques personnelles par opérateur/technique (Addition 94 %, Soustraction 82 %, Multiplication 71 %, Division 63 %, Combos 48 %, Optimisation 39 %) — progression personnelle, pas seulement « niveau 27 ».

## 9. Momo = Math Coach (jamais le cerveau du jeu)

- Momo **observe** : état, objectif, possibilités, historique, erreurs, performance (profil de maîtrise). Il **ne calcule jamais différemment du moteur** et n'écrit jamais dans le GameState.
- Aide progressive mesurée (jamais « LA SOLUTION » d'emblée) :
  - L1 indice léger (« regarde les deux nombres près du 4 »)
  - L2 stratégique (« tu peux obtenir 24 de deux façons »)
  - L3 mathématique (« 6 × 4 produit 24 »)
  - L4 guidée (« place le 6 avec × puis le 4 »)
  - L5 explicative avec pédagogie (« cette solution donne moins de points car pas de chaîne »)
- Le système mesure combien d'aide a été nécessaire → alimente le MasteryScore. Adaptation : joueur rapide → moins d'explication ; hésitant → étape intermédiaire ; erreurs répétées → rappel conceptuel.

## 10. Règles avancées (réservées tard) — inspiré Baba Is You sans copie

`OPERATOR RULE` : `× = DOUBLE`, `÷ = HALF`, contrainte `ONLY ×`… le joueur doit comprendre que **la règle du niveau modifie sa stratégie**. Mécanique avancée, hors vertical slice.

## 11. Formalisation mathématique (le noyau)

- Opérations définies formellement : `a op b = c` pour + − × ÷ ; division : `b ≠ 0` ; V1 : **entiers exacts**, pour `/` : `a mod b = 0` (éviter fractions et IEEE-754 ; combattre `0.1 + 0.2`).
- Gestion explicite : division par zéro, résultats négatifs, fractions, entiers, overflow, ordre des opérations, valeurs interdites, limites de niveau.
- **Les règles ne doivent jamais dépendre de l'interface.**

## 12. Solver = pièce industrielle (pas un gadget)

Réponses attendues pour tout niveau :
```
solvable ?  combien de solutions ?  plus courte ?
alternatives ?  chemins critiques ?  impasses ?
score maximal raisonnable ?  comboPotential ?  difficultyScore ?
```
→ détection des mauvais niveaux **avant** le joueur.

Certification par niveau : `solutionCount, shortestSolution, longestUsefulSolution, decisionPoints, branchingFactor, deadEnds, comboPotential, scoreRange, difficultyScore`.

## 13. Difficulté multidimensionnelle

Augmente selon **D1 nb de possibilités · D2 nb d'opérateurs · D3 nb de résultats intermédiaires · D4 nb de solutions · D5 profondeur de meilleure chaîne · D6 contrainte de mouvements · D7 valeur du score · D8 interactions spéciales**.

Classification Easy→Normal→Advanced→Expert→Master **dérivée des mesures**, jamais de l'intuition du développeur. Deux niveaux peuvent être « simples numériquement » mais profonds (beaucoup de décisions) et inversement.

## 14. Pipeline contenu (le générateur est subordonné au solver)

```
DESIGN → SIMULATION → SOLVER → VALIDATION MATHÉMATIQUE → ANALYSE DE DIFFICULTÉ
→ ANALYSE DES SOLUTIONS → QUALITY FILTER → HUMAN PLAYTEST → CERTIFICATION → PUBLISH
```
Génération procédurale possible mais **encadrée** : 10 000 candidats → filtres (solvabilité, unicité/intérêt, difficulté, branching, score, qualité) → ~100 → sélection humaine → 20 excellents. Un niveau ne passe jamais « générateur → production » directement.

## 15. Architecture cible (8 domaines, responsabilités séparées)

```
core/:      formula · board · transformation · chain · combo · score · objectives · game-state
solver/:    search · certification · difficulty · simulation
content/:   levels · generators · validation
ai/:        momo · hints · explanations
progression/: worlds · rewards · mastery
ui/:        board · hud · animations · momo
persistence/  telemetry/  platform/android/
```

Frontières NON-négociables :
```
MATHEMATICS ≠ GAMEPLAY ≠ UI ≠ AI ≠ PERSISTENCE ≠ TELEMETRY
```
Exemples : le Formula Engine ne sait pas qu'un bouton existe ; Momo ne calcule pas différemment du moteur ; le score n'est pas codé dans l'animation ; la sauvegarde ne décide pas de la validité mathématique.

## 16. Gates d'industrialisation

G0 Math Integrity → G1 Gameplay Core → G2 Strategic Choice → G3 Chain/Combo → G4 Scoring → G5 Content → G6 Solver → **G7 Human Gameplay** → **GAMEPLAY FREEZE** → G8 UX → G9 AI → G10 Mobile → G11 Stability → G12 Release Candidate.

- **GAMEPLAY HUMAN GATE (le gate dominant)** : le joueur comprend-il ? sait-il quoi faire ? doit-il réfléchir ? ses décisions ont-elles des conséquences ? comprend-il pourquoi il gagne/perd ? a-t-il envie d'améliorer son score, de recommencer ? Un jeu mathématiquement parfait peut être ennuyeux — ce gate le détecte.
- **GAMEPLAY FREEZE** (après G7) : autorisé ✓ bugs, équilibrage, UX, performance, accessibilité, contenu, sécurité, stabilité · interdit ✗ nouvelle mécanique fondamentale, nouveau score, nouveau modèle de progression, changement radical du board.

## 17. Métriques qualité gameplay (tableau de contrôle)

Compréhension (temps avant première action) · Décision (choix significatifs) · Math (diversité des opérations) · Stratégie (diversité des chemins) · Difficulté (taux de réussite) · Rejouabilité (nouvelles solutions) · Combo (fréquence) · Score (dispersion) · Momo (taux d'utilisation) · Abandon (par niveau) · Performance (FPS/latence) · Stabilité (crash-free sessions).

**Équilibrage scientifique** : mesurer `Operator Usage` (+ 31 %, − 24 %, × 38 %, ÷ 7 %…) et en comprendre les causes ; les quatre opérations doivent avoir des situations où elles deviennent intéressantes — un opérateur quasi jamais utilisé est un élément décoratif (donc inutile).

## 18. Vertical slice (prochaine cible concrète)

**20 niveaux** en 5 catégories : 4 découverte (addition) · 4 choix (addition vs soustraction) · 4 combinaison (× / ÷) · 4 chaînes (résultat → calcul suivant) · 4 maîtrise (objectif + score + combo + contrainte).

Contient : numbers, operators, formulas, transformations, chains, combos, score, objectives, stars, rewards, progression, hints, Momo — et une interface **suffisamment bonne pour jouer réellement**.

## 19. Le test décisif (acceptation ultime)

Donner le téléphone à quelqu'un qui n'a jamais vu MATHIC, ne rien expliquer, observer la trajectoire :
1. « Je dois utiliser ces nombres et ces signes pour faire des calculs. »
2. « Je peux choisir entre plusieurs calculs. »
3. « Si je prépare bien mon calcul, je peux faire une chaîne. »
4. « Je peux faire plus de points si je joue intelligemment. »
5. « Attends, je peux essayer de battre mon score. »

**La phrase n°5 vaut plus que 500 tests unitaires.**

## 20. Périmètre V1 (ce qui N'EST PAS dedans)

❌ PvP · clans · chat · marketplace · NFT/blockchain · économie complexe · battle pass · 500 boosters · backend obligatoire · dépendance réseau pour jouer · IA obligatoire pour résoudre · microservices/Kubernetes/cloud gigantesque. MATHIC 1.0 est **excellent jeu d'abord**, plateforme ensuite.

## 21. Extensions futures (hors V1, mais architecture doit les permettre)

MATHIC 1.x : events · daily challenges · endless mode · advanced operators · adaptive difficulty · social · cloud.

## 22. Mapping vs acquis (laboratoire V5) — ce qui se réutilise, ce qui se construit

**Décision honnête (contradiction explicite avec GATE 1)** : le brief re-sélectionne une mécanique de **construction de formules** (choix du nombre ET de l'opérateur, chaînes, combos, score multidimensionnel) — structurellement distincte du Concept B « Grille croisée » (placement de valeurs sur lignes/colonnes à opérateurs fixes) que le lab avait couronné G0 8/8. **Le moteur B n'est donc PAS le noyau produit MATHIC 1.0.** Il reste un résultat de laboratoire et un outil de mesure.

**Réutilisables tels quels (à industrialiser) :**
| Acquis V5 en place | Usage MATHIC 1.0 |
|---|---|
| Kernel entier exact +−×÷ (`oprel.mjs`, `b≠0`, `/` entier) | Fondation du Formula Engine |
| Solver `minMoves/countSolutions/certify` (BFS budgeté, dedupe) | Solver §12 (à étendre : solutions alternatives, chemins critiques, score max) |
| `validateSpec` fail-fast + `replay` + `canonical` | Contrats de base de `core/game-state` |
| Métriques G0 (branching, decision, multi, dead-end, trivial, diversity) | Base du tableau de contrôle §17 |
| Sonde anti-MTH-001 (génération naïve 87 % insolvable) | Justification pipeline §14 (générateur subordonné) |
| Contrats docs (`CONTRACT-RULES-B`, `ARCHITECTURE`) | Historique ; seront remplacés par les contrats MATHIC 1.0 |
| `playtest` console + `game-adapter-v5` | Ratio de démo du slice, pas le produit |

**À construire (nouveau noyau produit, pur, dans `core/`) :** Formula Engine (selection de 2 carreaux + opérateur, parsing si expressions), Transformation Engine (résultat = ressource), Chain Engine, Combo Engine, Score Engine, Objective Engine, Level System + certification, puis contenu/solver/simulation (phases du roadmap ci-dessous).

## 23. Feuille de route unique

```
PHASE 0  Baseline V5 (lab, acquis)
PHASE 1  Math Kernel (formula, exact, déterministe)
PHASE 2  Board + Formula (état, commandes, événements)
PHASE 3  Transformation
PHASE 4  Chain
PHASE 5  Combo
PHASE 6  Score
PHASE 7  Objectives
PHASE 8  Strategic Choice (multi-chemins, conséquences)
PHASE 9  Solver (certification, difficulté, simulation)
PHASE 10 Level Authoring (design + pipeline, pas de générateur→prod)
PHASE 11 Simulation (stratégies dominantes, équilibrage)
PHASE 12 Human Gameplay (vertical slice joué)
         → GAMEPLAY FREEZE
PHASE 13 UI/UX Production
PHASE 14 Progression (mondes, étoiles, déblocages)
PHASE 15 Rewards / Mastery
PHASE 16 Momo (coach L1–L5, adaptatif)
PHASE 17 Persistence
PHASE 18 Telemetry
PHASE 19 Android
PHASE 20 Device QA
PHASE 21 Performance
PHASE 22 Release Candidate
         → MATHIC 1.0
```

Ordre de travail conception (Phase A du brief) : formaliser règles → états → commandes → événements → modèle de niveau → système de score → objectifs → combos. **Aucun code avant design validé ; aucun lien UI avant G7.**

## 24. Ce que « MATHIC 1.0 terminé » signifie (définition non anodinée)

Installer → lancer → apprendre → jouer → progresser → maîtriser → rejouer → **terminer le contenu 1.0**, sans développeur derrière. ≠ « npm test passe », ≠ « APK généré ». Le produit complet : gameplay, contenu, UX, Momo, infrastructure (sauvegarde/stats/config), mobile (tactile, offline, reprise), performance, stabilité documentée.

---

*Ce document est la référence unique de conception. Toute décision ultérieure s'y réfère ; toute divergence de gameplay est arbitrée par le §0 (identité) et le §19 (test décisif), sous GAMEPLAY FREEZE (§16).*