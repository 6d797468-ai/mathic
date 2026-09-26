# MATHIC 1.0 — Review architecturale croisée des contrats (Phase B / Gate B0)

**Référence** : directive Phase B · **Base** : commit `d385b5d` (Phase A) · **Date** : 2026-09-23 · **Statut** : BLOCKED → CORRECTIONS → PROVEN (gate B0, verdict §15).

**Déclaration de méthode** : cette revue vérifie que les contrats décrivent **le même modèle de jeu** — pas chacun de leur côté. Chaque interaction est analysée avec des **scénarios concrets exécutés conceptuellement de bout en bout**. Une contradiction trouvée est corrigée **minimalement** (jamais de réécriture pour le mouvement documentaire). Les hypothèses de gameplay restent **EXPÉRIMENTALES** tant que B1 ne les prouve pas.

---

## 1. Matrice de compatibilité (18 paires)

| Système A | Système B | Vérification | Verdict | Notes / Décision |
|---|---|---|---|---|
| Kernel | Formula | même sémantique math | **FLAW K-0** | kernel §3 définit `−` par `b ≠ a ? a−b : null` — contredit la sémantique lab prouvée (`a−b≥0`), son commentaire et le §39. **Corrigé** (voir annexe 1). |
| Formula | Board | représentation compatible | COHERENT | tokens = 3 tuiles distinctes (A2 §5) → expr `a op b` (A3). Vérifié : cellules distinctes exigées avant éval. |
| Formula | Transformation | résultat déterministe | **FLAW C-3** | A3 §6 canonise `a,b` **par valeur** pour `+`/`×` ; or A4 ancre le résultat **sur la cellule de l'opérande A**. Réordonner par valeur ignore la cellule → deux états différents confondus (génome de chaîne faussé). **Corrigé** : clé de dédup = paire de **cellules** (non ordonnée) pour `+`/`×`, cellule d'ancrage conservée. |
| Board | Transformation | état avant/après cohérent | COHERENT | Seules A, O, B bougent (3→1). Rectangle, bijection, bornes préservés (A4 §4, A2 §2). A≠O≠B par sélection. |
| Transformation | Chain | événement correctement défini | COHERENT | chaîne = réutilisation du **résultat** d'une transformation (A5 §3). La tuile-résultat est ancrée (A4) → identifiable sans ambiguïté. |
| Chain | Combo | déclenchement cohérent | **AMBIG C-1** | « le combo retombe à sa valeur de maintien » (§4 A6) est indéfini. **Corrigé** : accumulation monotone dans le niveau (nouveaux triggers multiplient), reset seulement sur `undo`/fin de niveau/recommencer. |
| Combo | Score | absence de double comptage | COHERENT (resserré) | multiplicateur s'applique à `score_n` (A7 §3) ; le bonus `objective` est un **ajout fixe en fin de partie** (A7 §2). Règle anti-double : le trigger `TARGET` ne s'ajoute jamais à un bonus `objective` de la même action — précisé. |
| Score | Objective | seuils cohérents | COHERENT | `minScore` (expérimental) ≤ `scoreEnvelope.max` certifié (A10 §6, A9). Les étoiles dérivent de l'enveloppe, jamais inventées (A13). |
| Objective | Progression | victoire correctement déterminée | COHERENT | win/fail/blocked purs (A8 §3) → étoiles 1 sur `completed` (A13). `blocked` ≠ `failed` ≠ victoire. |
| Board | Solver | état représentable | COHERENT | état = board hash + moveCount + trace (A10 §2). Ressources tuiles modélisées → `deadEnds` réel. |
| Formula | Solver | même calcul | COHERENT | le solver **importe** le kernel (A10 §2, R18) — jamais une copie. Table d'équivalence en test. |
| Transformation | Solver | même transition | FLAW **C-3** (voir) | résolu par la clé cellulaire ; + exigence `solver-transition ≡ applyTransformation` (test de conformité, §9). |
| Chain | Solver | chaîne simulable | COHERENT | `usefulChains`, `comboOpportunities` = même règle de réutilisation (A5). Solver calcule chainMax comme borne de certif (A5 §4). |
| Combo | Solver | score/combo analysables | COHERENT (après C-1) | enveloppe intègre la règle monotone + `comboThreshold` config. |
| Level | Solver | niveau entièrement déterministe | **DIVERG C-2** | `availableOperations` déclaré ET tuiles-opérateurs sur le board → **double source de vérité**. **Corrigé** : source unique = tuiles du board ; `availableOperations` dérivé et revalidé au chargement. |
| Momo | Solver | conseils fondés sur une vérité vérifiable | COHERENT (+ fail-soft) | chaque indice ↔ `solverFactId` (A14 §4). Ajout : **fail-soft** — si aucun fait solver au runtime (budget), Momo se tait, n'invente jamais. |
| Persistence | Game State | replay/reprise cohérents | COHERENT | checkpoint = **trace** (A15 §4) ; relecture via le moteur ; désynchro signalée, jamais réparée en silence. |
| Telemetry | Game State | événements non ambigus | COHERENT | événements normés (A16 §2), observateur pur, `traceRef` rejouable. |

Résumé : **0 contradiction irréparable · 3 défauts réparés (K-0, C-3, C-2) · 1 ambiguïté résolue (C-1) · 1 précision ajoutée (Momo fail-soft)**. Plusieurs **risques gameplay** ne sont PAS des contradictions et restent ouverts à la preuve B1 (C-4, C-5, C-6 ci-dessous).

---

## 2. Tests du modèle de jeu — scénarios exécutés de bout en bout

Notation : tuiles `(r,c)`. Scores avec coefficients **d'étude** (A7/A6 placeholders, non calibrés). `apply` = kernel. **Note sur les multiplicateurs de scénario** : les valeurs numériques de S1/S9 utilisent l'ancien modèle « produit des coefs déclencheurs » à des fins **illustratives de la dynamique** ; le modèle contractuel retenu post-C-1 est le **modèle à paliers** `stepMultiplier^⌊eventsCumul/comboThreshold⌋` (A6 §3), lui-même EXPÉRIMENTAL. Les deux servent la mesure B1, aucun n'est calibré.

### S1 — « Immédiat vs préparation » (le cas du bridge du verdict)
**Board B1** (2×3) : `(0,0)=12 (0,1)=4 (0,2)=3 / (1,0)=× (1,1)=+`. Niveau L1 : target=48, maxMoves=2, ops {+,×}, maxComboMultiplier=4.

**Chemin A (immédiat)** — action `(0,0)=12 ✕ (1,0)=×, (0,1)=4` :
```
état initial → expr 12×4=48 → apply=48 (bornes ok)
tuiles consommées : 12(0,0), ×(1,0), 4(0,1)   tuile créée : 48 à (0,0)
board après : (0,0)=48, (0,2)=3, (1,1)=+   moveCount=1
chaîne : 1 (première)   combo : {TARGET, EFFICIENCY, DIVERSITY} → mult = 1.25×1.5×1.1 = 2.0625
score_n ≈ (base 4 + cplx 1 + chain 0) × 2.0625 ≈ 10   objectif : 48 présent → VICTOIRE (move 1)
état final : solved (1/2 mouvements)
```

**Chemin B (préparation)** — move1 `12+4=16` à (0,0) [combo {DIVERSITY} → ×1.1] ; move2 `16×3=48` à (0,0), 16 réutilisé → chaîne=2, combo {REUSE, DIVERSITY(×), TARGET} mais **PAS EFFICIENCY** (optimum=1, chemin B = 2) :
```
score_n(move1) ≈ (4+1+0)×1.1 ≈ 5   ;  score_n(move2) ≈ (4+2+2)×(1.1×1.1×1.25) ≈ 13
totalScore ≈ 18   objectif : atteint au move 2   → VICTOIRE (2/2)
```

**Interprétation (répond à la question 3→1)** : le plateau se simplifie mais la **préparation** rapporte plus (chaîne+), la solution **immédiate** épargne les mouvements — exactement l'arbitrage voulu : `maxMoves=1` rend A seule possible ; `maxMoves=2` rend B plus rentable. **La mécanique 3→1 produit bien de la décision** sur ce cas. **Mesurer** la frustation/entendement sur B1 ¶.

### S2 — Rejet atomique (formula_rejected)
**Board B2** : `(0,0)=50 (0,1)=4 / (1,0)=÷`. Action `50 ÷ 4` → `apply` = **null** (50 mod 4 ≠ 0).
```
aucune tuile consommée ; moveCount inchangé ; board identique ; événement telemetry formula_rejected{division_non_exacte}
```
Vérifie A3/A4 (rejet ≠ mutation), A2 §7. ✅ Déterminisme : rejouer → même null.

### S3 — Coupure de chaîne
**Board B3** : `10 6 4 / × − +`, target=20, maxMoves=3.
move1 `10+6=16` [chaîne 1] ; move2 `6×4=24` (résultat 24 ≠ 16 → **radicalement coupée**, chaîne redémarre à 1) ; move3 `24−4=20` → target, VICTOIRE.
A5 §3 vérifié : la dépendance porte sur la **tuile** produite, pas la valeur seule.

### S4 — Bloqué ≠ échec (et piège de mauvaise décision)
**Board B4** : `5 7 / + ×`, target=35, maxMoves=2.
Si le joueur joue `5+7=12` (move1) : board = `12  / ×` → **plus aucune action légale** (1 nombre, 0 opérateur utile) → **BLOCKED** à moveCount=1. Objectif 35 hors de portée. Le joueur **undo** → rejouer `5×7=35` move1 → VICTOIRE.
- Constitue **Cas E** (§4) : une transformation bloque une meilleure solution future.
- A8 §3 vérifié : `blocked` n'est pas un échec-punition, c'est un état rejouable. **À mesurer** : la lisibilité de `blocked` (le joueur comprend-il qu'il peut annuler ?).

### S5 — Victoire « au contact » (win-on-touch)
Niveau L1 : `12×4=48` → la cible est satisfaite **à l'évaluation de cette action** (A8 §2.1) → VICTOIRE **immédiate** ; le joueur ne peut pas "continuer après la cible" (sauf refus volontaire de jouer la cible). Conséquence de design assumée : pour encourager « scorer plus », un niveau devra passer par **multi-objectif** (EXP) — sinon racing du target est la seule fin. **Signalé C-6.**

### S6 — Undo : recalcul pur
Chemin B de S1 : `undo` après move1 → trace vide, board initial, chaîne=0, combo=0 recomputés — pas d'état fantôme. ✅ A5 §5, A6 §2.

### S7 — Épuisement d'opérateur (Cas E, ressources)
**Board B5** : `24 96 2 / × ÷ ÷`, target=48, maxMoves=2, ops {×,÷}.
R1 `24×2=48` OU R2 `96÷2=48` : **l'unique 2 partagé** → les deux routes s'excluent mutuellement dans une même partie. Jouer R1 « brûle » R2. Le joueur qui joue `96÷2` n'aura **plus de ÷ ni de 2** pour la suite. Decision réelle de parcimonie d'opérateur. ✅ Test consommation §5.

### S8 — Multi-solutions : test des 4 routes vers 48 (mandat §4)
**Board B6** (4×3) : `24 2 50 12 / 4 96 3 · / × × − ÷`, target=48, maxMoves=2.
```
R1 : 24×2  = 48   (24,×,2)   — consomme le 2
R2 : 50−2  = 48   (50,−,2)   — consomme le 2
R3 : 12×4  = 48   (12,×,4)
R4 : 96÷2  = 48   (96,÷,2)   — consomme le 2
```
- **Représentabilité légale** : ✅ 4/4 (kernel + board).
- **États produits** : tous différents (blocs restants différents — R1/R2/R4 brûlent le 2 ; R3 garde le 2).
- **Coûts** : tous 1 action (shortest=1) → pas de différentiation de coût ici.
- **Chaînes** : chaîne=1 sur chacune (aucune réutilisation).
- **Score** : `base(48)` idem pour les 4 ; `DIVERSITY` = 1.1 pour chaque « première utilisation » (coef identique) ; `EFFICIENCY` idem (toutes shortest) ; `TARGET` idem. → **score immédiat quasi identique pour les 4 routes.**

**CONCLUSION MAJEURE (répond au mandate §4)** : sur un niveau « win en 1 coup », les 4 solutions sont **fonctionnellement équivalentes en score immédiat**. La différentiation du système vient d'ailleurs : (a) **état du board après coup** (le 2 brûlé ou non), (b) capacité de chaîne suivante, (c) prochain coup possible. → Le system n'exploite le concept central **que si les niveaux sont façonnés pour que les routes diffèrent post-coup**. Recommandation B1 : la différence « immédiat/long » (S1) et « ressources partagées » (S7) DOIVENT être les matrices des niveaux de test, pas le score de coup unique. Un niveau où les 4 routes mènent à des états identiques serait trivial (§26) → à exclure à la certification.

### S9 — Score : chemins A / B / C (mandat §9)
- **Path A** (S1-A) : ~10, efficient.
- **Path B** (S1-B) : ~18, chain mais moins efficace.
- **Path C** (Board B7 : `6 4 2 / × × +`, target=48, maxMoves=3) : move1 `6×4=24` → move2 `24×2=48` : chaîne 2, {REUSE, TARGET, EFFICIENCY(depth2 ≤ opt2), DIVERSITY} → multiplier ≈ 1.1×1.25×1.5×1.1≈2.27, score_n(move2) ≈ (4+2+2)×2.27 ≈ 18 ; total ≈ 5+18 ≈ 23.

**Verdict score** : les coefficients directs (base, chain, combo) **favorisent déjà** le chemin stratégique long-si-bien-mené, et `EFFICIENCY` recompense le chemin court-bien-mené. **Équilibrage en data** (A7) : le rapport `chain bonus / efficiency penalty` décidera si « le jeu récompense ce qu'il dit récompenser ». **Risque mesurable** : si base(|r|) croît avec r, `×`/`+` deviennent favorisés sur tout niveau à grand nombre (dérive C-4). Contrôler par coefs + test de domination (§7).

### S10 — Conformité solver↔moteur (mandat §10) — mise à l'épreuve C-3
L'action légale `(12@(0,0), ×, 4@(0,1))` du joueur doit être la même **transition** pour le solver. Précision C-3 : le solver NE doit PAS réordonner par valeur — `(4@(0,1), ×, 12@(0,0))` est un AUTRE état (résultat ancré en (0,1)). Test de conformité requis (propriété : pour toute action valide, `moteur.applyTransformation(state,action)` ≡ `solver.transition(state,action)`). Sans cela : **PLAYER CAN DO X mais SOLVER pense X illégal** (en dédoublonnant à tort).

### S11 — Momo : matrice des conseils (mandat §12)
Tableau à couvrir en test : hint correct (fait `apply`), hint inutile (fait déjà évident), hint impossible (aucun fait — fail-soft), solution alternative (Alternatives count), erreur du joueur (cat. invalidation A1), absence de solution (niveau non solvable → pas d'indice, signale), état terminal (solved/failed/blocked → pas d'indice). Chaque sortie porte son `solverFactId`.

### S12 — Persistance / reprise (mandat §14)
Sur S1 chemin B : 1 move joué → save (trace + levelVersion + ruleVersion) → close → reopen → restore (replay trace) → état bit-à-bit identique (board, moveCount=1, chaîne=1, combo) → continue move2 → même résultat que la partie témoin. Cas désynchro (ruleVersion changée) : refus explicite + rapport, jamais de « réparation » silencieuse.

### S13 — Progression sans dépendance UI (mandat §13)
Boucle complète demandée : Level Start → Actions → Objective → Completion → Score → Stars → Reward → Unlock → Next Level. **Tout est data** : étoiles ← objectif+scoreEnveloppe ; déblocages ← cumul étoiles ; maîtrise ← traces. **Aucun événement UI requis** pour la détermination de progression. ✅ Verify par scenario-driven test (niveau → étoiles → unlock calculables sans couche graphique).

### S14 — Dominance × (mandat §7) — le risque chiffré
Sur B1, `×` est systématiquement meilleur pour atteindre 48 vite. Sur un niveau générique à base(|r|) croissante, `×` et `+` produisent les résultats les plus grands → domination probable si non contrebalancée. ⚠️ **Le solver mesurera** la part d'opérateur dans les chemins optimaux (A12 §6) ; si `× ≥ 90% des optimums`, rebalance (coefs ou composition de boards). **Ce n'est PAS une contradiction de contrat, c'est un équilibrage à prouver** — pointant que les coefficients de score ne sont PAS affaire de document.

---

## 3. Test 3→1 (hypothèse de gameplay — 5 cas)

| Cas | Énoncé | État du board | Décision créée ? | Verdict |
|---|---|---|---|---|
| A — résultat gagnant | `12×4=48` win move1 | résultat = cible | victoire immédiate | ✅ oui, mais ferme le niveau (S5) |
| B — intermédiaire de chaîne | `12+4=16 → 16×3=48` | 16 réutilisable | arbitrage immédiat vs préparation | ✅ **décision réelle** (S1) |
| C — valide mais stratégiquement mauvais | jouer `5+7=12` sur B4 (target 35) | le board se fige (blocked) | piège choisi | ✅ (pose la valeur éducative de l'erreur — mesurer frustration) |
| D — plusieurs transformations sur un même plateau | B1 : `12+4, 12×4, 4+3, …` | plusieurs routes simultanées | branching, choix de voie | ✅ branching réel |
| E — une transformation bloque une meilleure | `96÷2` avant `24×2` (B5) | le 2 est brûlé | parcimonie ressource | ✅ **décision coûts** (S7) |

**Réponse au mandat §5** : la méchanique 3→1 ne réduit PAS mécaniquement le plateau — elle **change l'espace de décision** (les cas B/E le prouvent conceptuellement). Mais ceci reste **EPXÉRIMENTAL** : la preuve vient de B1 (humain qui choisit), pas du papier. **Pas de changements de contrat pour « améliorer » ; mesure d'abord.**

## 4. Test consommation d'opérateurs (mandat §6)

Situations analysées sur les boards ci-dessus :
- **aucun opérateur utile** : possible (B4 : après `5+7`, il reste `×` seul → inutile sans 2e nombre) → bloque légal, certifié par le solver (dead-end). L'auteur doit éviter les niveaux où l'épuisement est involontaire (certification PEST).
- **plusieurs opérateurs utiles** : B1 (× et +) → bifurcation réelle.
- **opérateur rare** : B5 (÷ unique) → consigné comme « trésor » : utiliser ÷ tôt ou le garder = décision. Risque frustation si l'usage requis par le chemin optimisé est 2× (la rareté doit être certifiée suffisante, A11).
- **disponible mais sous-optimal** : B1 `12×4=48` vs `12+4=16` : le + est « disponible sous-optimal » sur le coup, mais prépare la chaîne → la sous-optimalité est appart de la décision. ✅

Dimensions (fréquence, rareté, accessibilité, blocage, intérêt, frustration, lisibilité tactile) = **mesure B1** — pas de modification de règle sans preuve, pas non plus de validation automatique parce que contractualisée.

## 5. Test de domination op (mandat §7)

Le solver calcule par dataset certifié : usage / taux de succès / valeur stratégique / contribution score / contribution chaîne par op. Base de départ des métriques : B1→B7 (dataset de calibration à construire). **Risque** : base(`r`) monotone → penchant `×`/`+`. **Mise en garde re-écrite** : ne pas « forcer » un opérateur dans les solutions ; agir sur coefs/boards si domination ≥ 90 %.

## 6. Test combo — le seuil (mandat §8)

La décision « 5 » est **EXPÉRIMENTALE**, jamais INVARIANT. Correction C-1 appliquée :
- `comboThreshold = N` : seuil de cumul de trigger-events requis pour l'étape supérieure de multiplicateur ; **N configurable par niveau** (`constraints.comboThreshold`), initial N=5 à tester {3,4,5,6}.
- Mesures requises pour trancher N : combo frequency, compréhension joueur, inflation de score, intérêt stratégique, longueur moyenne de chaîne, impact progression (mandat §8).
- Valeur retenue seulement après simulation + playtest. Tant que non retenue : `5` est une **hypothèse** de revue, pas un câblage.

## 7. Tests replay / solvabilité / Momo / progression / persistence

- **Replay (mandat §11)** : `(seed, levelDef, actionSeq)` → états, score, chaîne, combo, objectif identiques. Fondé sur pureté kernel (A1 §5) + pureté transformation (A4 §4) + premier incontournable du runtime. Avec la clé cellulaire (C-3), le replay inclut la **position** du résultat — QA automatique (propriété).
- **Solvabilité (mandat §10)** : garanti par la règle « solver importe le kernel » + test de conformité `transition` (S10). La seule ouverture possible (PLAYER CAN vs SOLVER CAN'T) serait une déviation sémantique — interdite par test d'équivalence par niveau (R18).
- **Momo (mandat §12)** : matrice S11 + fail-soft (ajout C-7).
- **Progression / Persistence** : S13 / S12 — cohérents, à automatiser en tests de cycle.

---

## 8. Classification des décisions (mandat §15)

| Décision | Statut attribué | Justification |
|---|---|---|
| Opérateur = tuile sur le board | **EXPERIMENTAL (H-B1)** | hypothèse lourde (position+ressource vs чист math) — preuve B1 ; variantes EXP (palette) conservées |
| Consommation des opérateurs | **EXPERIMENTAL (H-3→1)** | crée rareté → décision, mais frustration possible |
| Résultat ancré sur opérande 1 | **EXPERIMENTAL (H-AN)** | prévisibilité vs placement libre ; jauger humainement |
| Transformation fixe 3→1 | **EXPERIMENTAL (H-3→1)** | étudié §3 ; produit de la décision sur cas B/E — pas prouvée |
| Formule binaire fixe `a op b` | **PROPOSED** | simplification industrielle acceptée pour 1.0 ; profondeur via conséquences, pas syntaxe ; extensions DEFERRED |
| `comboThreshold = 5` | **EXPERIMENTAL** | N ∈ {3,4,5,6} à trancher par simulation+playtest ; jamais invariant |
| coefficients de score | **EXPERIMENTAL** | adossés au calibrage ; base monotone → risque de dérive |
| coefficients de récompense (étoiles) | **EXPERIMENTAL** | dérivés du score, à calibrer après lui |
| structure de progression (mondes/étoiles) | **PROPOSED** | structure data cohérente ; volumes à ajuster au contenu |
| invariants de cohérence (kernel pur, no-RNG, replay, même sémantique, Momo subordonné) | **INVARIANT** | non négociables (mandat §§2,18) |
| objectifs core (target/maxMoves/allowedOps) | **VALIDATED (design)** | cœur BRIEF ; win-on-touch résolu (S5/C-6) |

## 9. Gate B0 — Cross-Contract Coherence

**Verdict initial : BLOCKED** (K-0 critique, C-3 critique-architecture, C-1 ambiguïté, C-2 divergence).

**Corrections appliquées (annexe 1)** : K-0 (kernel `−` aligné lab), C-1 (règle monotone + `comboThreshold` config), C-2 (source unique `availableOperations`), C-3 (clé cellulaire de dédup), C-7 (Momo fail-soft).

**Après corrections : PROVEN (sous condition EXP)** — conditions du gate B0 :
- zéro contradiction critique ✅ (K-0/C-3 corrigés) ; zéro ambiguïté critique ✅ (C-1/C-2/C-7 résolus) ;
- modèle de transition cohérent ✅ (A4 ≡ solver, clé cellulaire) ;
- solver compatible ✅ · replay compatible ✅ · score cohérent ✅ (anti-double-count posé) ·
- progression cohérente ✅ · Momo compatible ✅ (fail-soft) · persistence compatible ✅.

**Réserve explicite de PROVEN** : la **cohérence documentaire est PROVEN**, pas le **gameplay**. Les hypothèses H-B1/H-3→1/H-AN et le seuil combo restent EXPÉRIMENTAUX et ne sont **PAS validés par ce gate** — ils passent au crible de **B1 (slice jouable) + test humain**, seul juge réel (§19 de la directive).

## 10. Décisions de sortie

- B0 : **PROVEN (cohérence) après corrections** — étapes documentaires closes, admissibles B1.
- B1 : construire le **plus petit slice jouable** (Board+Numbers+Operators+Formula+Transformation+Objective+Score-minimal+Replay) sur la matrice S1–S9, puis observer un humain. C'est la seule preuve des H-*.

---

### Annexe 1 — Corrections de contrat appliquées (minimales, justifiées par la revue)

| Corr. | Contrat | Avant → Après |
|---|---|---|
| K-0 | Kernel §3 `−` | `b ≠ a ? a − b : null` → `a − b ≥ 0 ? a − b : null` (sémantique lab prouvée restaurée) |
| C-1 | Combo | ajout `comboThreshold` configurable (init 5, EXP) + règle monotone explicite (reset seulement undo/fin/recommencer) |
| C-2 | Level §3.2 | `availableOperations` = **dérivé** des tuiles-opérateurs du board (source unique), revalidé au chargement |
| C-3 | Formula §6 | dédup `+`/`×` par **paire de cellules non ordonnée** (ancrage conservé), jamais par valeur seule |
| C-7 | Momo §4 | fail-soft explicite : aucun fait solver → pas d'indice |

### Annexe 2 — Éléments de preuve encore manquants (à produire en B1)

1. Frustration/perception du `blocked` et de la rareté d'opérateur (S4/S7).
2. Équivalence des 4 routes (S8) : le score de coup unique est-il perçu comme « trop pareil » ?
3. Poids réel du choix immédiat-vs-préparation (S1).
4. Données de dominance op sur dataset (S14). 5. Calibrage `comboThreshold` (S6/§6).
6. Équilibrage realtif chain/efficience (S9). Chacun devient un **point de mesure** du test humain du slice B1.