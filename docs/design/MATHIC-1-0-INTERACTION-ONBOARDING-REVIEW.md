# MATHIC 1.0 — Revue Interaction · Onboarding · Simplification (TARGETED RETURN B1)

**Statut** : REVUE LIVRÉE — PAS D'IMPLÉMENTATION
**Source du verdict** : test humain B1 (slice `189f377`, commit applicatif `5f5b36f`, APK `artifacts/b1/MATHIC-B1-1.0-debug.apk`).
**Verdict** : **TARGETED RETURN** — le problème principal n'est plus l'architecture mathématique (PROVEN), c'est la **grammaire d'interaction** : comment le joueur agit, ce que le geste signifie, comment le jeu répond.
**Étendue de cette revue** : inventaire → ambiguïtés → invariant → simplifications → alternatives → pédagogie N1–N6 → évaluation temps réel → Solver/Replay → UI → comparatif → décisions → slice suivant.
**Ordre de travail** : `REVIEW → DECISION → MINIMAL IMPLEMENTATION → HUMAN TEST`. Rien n'est codé ici.

---

## 0. Résumé exécutif

- Le test humain confirme **un réel progrès gameplay** : la base devient MATHIC, mais le joueur ne comprend pas ce que ses gestes signifient et le jeu répond d'une façon qu'il n'avait pas demandée.
- Le constat humain : *« Je fais un geste mathématique, mais le geste provoque également une mécanique de déplacement du board. »*
- Cause racine identifiée dans le code : **la composition de formule et son exécution sont fusionnées** (auto-apply dès le 3ᵉ tap, `src/b1/web/b1-web.js:107`), **sans étape de prévisualisation**, et l'ordre d'affichage de la formule est **OP-A-B** (`index.html:31`, `b1-web.js:56`) — incompatible avec la lecture mathématique naturelle **A op B**.
- Aucun swipe n'existe dans B1 (APK = TAP pur) ; la « double grammaire » perçue est en réalité **sélection vs exécution+consommation fusionnées**. Le swipe (deux significations concurrentes) ne vit que dans l'héritage V4/V5 (`src/input.js`, `src/board.js`) et **ne doit pas revenir dans le cœur du tutoriel**.
- L'invariant « ACTION INVALIDE → AUCUN CHANGEMENT D'ÉTAT » est **déjà garanti au niveau moteur** (`engine.mjs`, test N0). Il est à **renforcer** au niveau UI (sélection, feedback, preview non-committante).
- Recommandation centrale : **TAP opérande → TAP opérateur → TAP opérande → PRÉVISUALISATION formule → VALIDATION → transformation**, formule affichée `12 + 4 = 16`, board **strictement invariant** avant validation.
- La refonte touche **la couche geste uniquement** : l'action `{a, op, b}` (signature de `apply`) ne change pas → **Solver, Replay, trace, kernels, tests restent valides sans modification**. Risque maîtrisé.

---

## 1. Inventaire des interactions actuelles

Deux grammaires distinctes coexistent dans le dépôt. La **seule exposée au joueur humain** est la grammaire web (APK). La grammaire terminal est un instrument de mesure.

### 1.1 Interaction web / APK (le joueur) — `src/b1/web/b1-web.js` + `index.html`

| # | Interaction | Action | Intention | Précondition | Effet si valide | Effet si invalide |
|---|---|---|---|---|---|---|
| W1 | TAP tuile nombre (1er) | `sel.a = id` | « je choisis le 1ᵉʳ opérande A » | A vide, tuile ≠ op sélectionnée | A est remplie (slot affiché en valeur seulement, pas en position) | tap sur tuile déjà A ou sur l'op → **no-op muet** (`b1-web.js:99-100`) |
| W2 | TAP tuile nombre (2ᵉ) | `sel.b = id` | « je choisis le 2ᵉ opérande B » | A pleine, tuile ≠ A, ≠ op | B est remplie | tuile déjà A / déjà op / 3ᵉ nombre → **no-op muet** |
| W3 | TAP tuile opérateur | `sel.op = id` | « je choisis l'opération » | op vide | slot op rempli, tuile surlignée | op déjà choisi → no-op muet |
| W4 | W1+W2+W3 complets | `maybeApply()` | « construire la formule » **MAIS le jeu l'interprète « exécuter »** | les 3 slots remplis | **exécution immédiate sans preview ni validation** : `apply` (3→1, ancrage A + `engine.mjs:51-53`), score, trace, event, render | formule invalide → **reset complet de la sélection** + message « Rejeté — aucune tuile consommée… » (`b1-web.js:117-120`) |
| W5 | TAP `effacer` | reset de `sel` | « annuler ma sélection » | sélection partielle | slots vides | — |
| W6 | TAP `Annuler le coup` | `undo` via replay (`b1-web.js:206-214`) | « revenir en arrière » | `trace.length > 0` | état & score reconstruits déterministes | bouton désactivé si trace vide |
| W7 | TAP `Recommencer` | reset du niveau | « rejouer » | — | état initial, score 0 | — |
| W8 | TAP sélecteur de niveau (1→6) | `switchLevel` | « changer de niveau » | — | reset niveau cible | — |
| W9 | Overlay victoire/échec/bloqué | boutons Rejouer / Niveau suivant | « continuer » | condition atteinte | reset / passage au niveau suivant | — |

**Fait structurant** : il n'existe **aucune étape de prévisualisation ni de confirmation**. Le 3ᵉ tap est simultanément « je termine ma formule » et « exécute la transformation ». C'est la fusion décrite par le joueur.

### 1.2 Interaction terminal (instrument) — `src/b1/play.mjs`, `src/b1/observe.mjs`

| # | Interaction | Effet |
|---|---|---|
| T1 | saisie `<opId> <cellIdA> <cellIdB>` | formule sur **ids de cellules** (exp: `3 0 2` = la tuile op en 3 appliquée à A=0, B=2). Syntaxe opaque, réservée à l'instrument. |
| T2 | `undo` / `re` / `q` / `trace` | méta-commandes préservées pour la session mesurée (`observe.mjs` journalise `action/reject/undo/restart/blocked/end/summary`). |

Le terminal n'est pas une grammaire produit ; il est l'**harnais de mesure**. Il reste en l'état.

### 1.3 Grammaire swipe (héritage V4/V5, HORS B1, présent dans le dépôt)

`src/input.js:25` (détection direction) + `src/board.js` (« le sens du swipe compte ») + `src/runtime/game-adapter.js:136` (« positions recalculées dans le sens du swipe »). Un swipe y porte **simultanément** : (a) déplacement de toute la grille, (b) désignation de la tuile qui « percute », (c) sémantique directionnelle pour `−` et `÷`, (d) détermination de la cellule d'ancrage. C'est **exactement** la double grammaire que le retour humain interdit. Verdict : candidat **rejeté** pour le cœur du tutoriel (§5, §11).

---

## 2. Ambiguïtés identifiées

### A1 — Composition et exécution fusionnées (cause racine du « déplacement »)
`b1-web.js:107` : `maybeApply()` est appelé après **chaque** tap ; dès que `op/a/b` sont remplis, la transformation s'exécute. Le joueur n'a jamais l'occasion de **relire** sa formule avant qu'elle ne modifie le board. La « mécanique de déplacement » qu'il décrit = la consommation 3→1 re-rendue (`apply`, `engine.mjs:51-53`) déclenchée **sans qu'il ait validé**. Pour lui, le board « a bougé tout seul ».

### A2 — Ordre d'affichage `OP-A-B` vs lecture naturelle `A op B`
Les slots sont `[?] [A] [B]` (`index.html:31-33`), remplis en op-a-b (`b1-web.js:56-58`). Un joueur qui tape `12`, `+`, `4` voit `[+][12][4]` alors qu'il « écrit » `12 + 4`. L'inversion est acceptable pour `+` et `×`, **pernicieuse pour `−` et `÷`** : le joueur ne peut pas distinguer « 12 − 4 » de « 4 − 12 » — la seule information visible est une valeur, **jamais la position de l'ancrage** (le résultat apparaît en A, `engine.mjs:53`). D'où des rejets surprise (« résultat négatif interdit », `kernel.mjs:37`) impossibles à anticiper.

### A3 — A/B assignés par ordre de tap, pas par intention
Rien ne permet de désigner délibérément l'opérande qui recevra le résultat (ancrage A, H-AN). Pour `×` et `+` c'est transparent ; pour `−` et `÷` c'est invisible avant l'exécution, donc **non prévisible** — violation du principe « mathématiquement et visuellement prévisible ».

### A4 — Rejets silencieux / no-op muets (W1-W3)
Plusieurs tap ne produisent **aucun retour** (retour anticipé, `b1-web.js:95-100`). Le joueur ne sait pas si sa tap a été entendue, ignorée, ou refusée. Une grammaire doit répondre à **chaque** geste, même implicite.

### A5 — Rejet par « reset complet » (W4 invalide)
Une formule invalide au 3ᵉ tap vide **toute la sélection** (`b1-web.js:117`). Board intact ✓, mais le joueur perd sa construction partielle et doit tout refaire. Aucun spring-back, aucune indication « recommencez en touchant tel nombre ».

### A6 — Division / soustraction : zéro anticipation du rejet
Les deux seules causes de rejet au niveau kernel sont exactement les cas où l'**ordre** compte. Sur une grammaire sans preview, le joueur apprend par « punition » muette puis reset — le pire scénario pédagogique possible pour `÷` (le plus discriminant, vide de l'objectif `Operator Usage ÷` du BRIEF §17).

### A7 — HUD et jargon dès le niveau 1
Le niveau 1 affiche simultanément : id/name/scenario (légende « S1 — immédiat vs préparation », jargon **équipe**, pas joueur), Objectif, Coups, Score, Chaîne, formule, undo/restart, 6 niveaux (`index.html:14-45`). « Chaîne » n'a aucun sens pour un joueur qui n'a jamais enchaîné deux opérations. **Toutes les règles sont déposées d'un coup** — exactement le « manuel universitaire » que le retour dénonce.

### A8 — Le score `0 point` au niveau 6 est affiché comme une récompense vide
`+0` (`b1-web.js:130`) après `2+4=6` en b1-6. Le joueur n'a aucun signal que ce coup est volontairement préparatoire. (Rappel §5 du brief : le scoring reste EXPÉRIMENTAL — à NE PAS corriger maintenant, à observer.)

---

## 3. Invariant d'action invalide — état actuel et durcissement

> **RÈGLE (invariant MATHIC, non négociable)** : chaque geste du joueur est vérifié avant tout effet d'état. Geste invalide → `STATE_BEFORE == STATE_AFTER` pour **positions, valeurs, opérateurs, score, chaîne, combo, objectif, replay, progression, trace**. Seul un feedback visuel/sonore **non persistant** est autorisé en réponse.

### 3.1 État actuel (vérifié dans le code)

| Couche | Garantie | Preuve |
|---|---|---|
| Kernel | `apply2` rejette (null) sans effet de bord ; `reason` explicite | `src/b1/kernel.mjs:3-38` |
| Formule | `evalFormula` valide avant tout calcul ; triple `null` en sortie sur rejet | `src/b1/formula.mjs:8-27` |
| Moteur | `apply` appelle `evaluate` en 1ᵉʳ gate ; si `!ok` → `return null`, aucune écriture | `engine.mjs:47-49` |
| Éval. temps réel | `evaluate(state, action)` pure (aucune mutation) | `engine.mjs:21-46` |
| Test | N0 : état sérialisé **strictement identique** après rejet | `tests/b1/b1.test.mjs:36-44` |
| Web (invalide) | `maybeApply` : `evaluate` échoue → reset `sel` + message ; `state` intact | `b1-web.js:115-120` |

**Constat** : l'invariant tient au niveau moteur à 100 %, y compris dans le web. Le verrou `[]` de la directive §1 est **déjà mécaniquement présent** pour les actions invalides.

### 3.2 Faiblesses à durcir (non-persistantes vs non-persistantes)

1. **W4 valide = exécution.** Une formule *bien formée mais non voulue* (3ᵉ tap par erreur) transforme le board. Ce n'est pas une action « invalide » — c'est **l'absence d'étape de confirmation** qui le rend dangereux. Durcissement : la **validation explicite** devient le seul déclencheur de `apply` (voir §4).
2. **Preview non-committante à créer** : toute prévisualisation affichée avant confirmation doit être **calculée par `evaluate` (pur)** et **jamais** matérialisée dans `state`/`trace`. Ajouter un test : après *preview puis cancel* et *preview puis rejet*, `cellsSnapshot` == état initial.
3. **Feedback unique requis** : chaque tap reçoit soit une sélection/une désélection visible, soit un refus visuel explicite (spring-back léger). Supprimer les no-op muets (A4).
4. **Différence « geste invalide » vs « formule invalide »** : un geste *invalide* (tap sur tuile vide, tap hors formula bar) doit être distingué d'une *formule invalide* (celle-ci est une composition complète rejetée par le kernel) — messages, couleurs et délais peuvent différer, mais **ni l'un ni l'autre ne touche le board**.

---

## 4. Propositions de simplification

### 4.1 Grammaire cible (recommandée) — « TAP → PREVIEW → VALIDATE »

```
TAP nombre     → premier opérande A (surbrillance + slot "12")
TAP opérateur  → opérateur op (slot "+", tuile surlignée)
TAP nombre     → second opérande B (slot "4")
PREVIEW        → formule affichée en ordre naturel :  "12 + 4 = 16"
                 (+ signaux : +delta, chaîne, "atteint l'objectif")
VALIDATION     → bouton [TRANSFORMER] (uniquement actif si preview valide)
                 ou [toucher la même formule une 2ᵉ fois] comme confirmation
TRANSFORMATION → apply (3→1, ancrage A), animation explicative
```

- **L'ordre naturel des slots devient `A op B`** (corrige A2, A3) — la formule s'affiche exactement comme le joueur la pense.
- **Le 3ᵉ tap ne déclenche plus rien d'autre qu'une preview** (corrige A1). L'exécution exige un geste de **confirmation délibéré**.
- **Confirmation = le coup n'est jamais « survendu »** : avant validation, un *invalide* (non divisible, négatif) affiche la preview en rouge + la raison, board intact, ET laisse la sélection **éditable** (pas de reset brutal, corrige A5).
- Édition : toucher un slot permet de le **re-sélectionner** (remplacement) sans repartir de zéro ; `effacer` reste disponible.

### 4.2 Principe : le geste ≠ la décision
Le retour humain pose la règle décisive : bon exemple (2048, Candy Crush) → l'apprentissage **dévient trivial**. MATHIC applique : le geste (tap taper) ne doit jamais être plus complexe que la décision qu'il représente (choisir une transformation). Le geste reste **un moyen, universel** ; la décision mathématique est **le produit**. Le tuple d'action `{a, op, b}` est inchangé (voir §7-8).

### 4.3 Le swipe : statut décidé
- **Exclu du tutoriel et du cœur du gameplay.** Tant qu'on ne peut pas répondre en une phrase à « que signifie ce swipe ? », il n'a rien à faire ici.
- **Non détruit** : il reste dans l'héritage V4/V5 (`src/`) comme acquis de laboratoire. S'il revient un jour, ce sera **une interaction avancée optionnelle** avec une signification **unique** (ex : glisser un opérande sur un autre pour composer), validée humainement, jamais par défaut.
- Une swipe en cours pendant le tutoriel (geste parasite du joueur) ne modifie **rien**.

### 4.4 Board inchangé avant validation (invariant visuel)
Avant la confirmation, aucun « déplacement secondaire » : pas de réorganisation, pas de consommation, pas de modification silencieuse. La **seule** réponse à un geste tant que la formule n'est pas validée = surbrillances/slots/preview.

---

## 5. Comparaison des alternatives d'interaction

| Alternative | Geste | Preview | Confirmation | Risque principal | Verdict |
|---|---|---|---|---|---|
| **A1 · TAP→PREVIEW→VALIDATE** (recommandée) | tap opérande, op, opérande | oui (éval. temps réelle) | bouton dédié | 1 geste de plus par coup | **RETENIR** |
| A2 · TAP auto-apply actuel (B1) | 3 tap | non | non (3ᵉ tap exécute) | fusion sélection/exécution (A1) — refusé par le retour humain | **REJETER** |
| A3 · SWIPE enchaîné (hors B1) | glisser A sur op puis résultat sur B… | non | implicite | 2 significations concurrentes ; casse la décision | **REJETER** (tutoriel) |
| A4 · Swipe directionnel type 2048 | swipe | non | geste = action | la grille « se déplace » ; MATHIC n'est pas une physique de tuiles | **REJETER** |
| A5 · Drag&Drop du nombre sur un opérateur | glisser-déposer | partielle | lâcher = exécuter | précision mobile ; geste plus lourd que la décision | REJETER (à ne pas mélanger à la phase d'apprentissage) |
| A6 · Drag&Drop + validation barre formule | glisser A+op+B puis valider | oui | bouton | combler les deux gestes (drag pour sélectionner, tap pour valider) | **GARDE** (évolution après validation A1) |
| A7 · Clavier numérique RPN | tokens `op A B` | non | entrée | syntaxe opaque (terminal) — instrument uniquement | **REJETER** (joueur) |

Critères retenus (pondération équilibrée) : compréhension spontanée · non-ambiguïté (`ce geste = X`) · fidélité à la décision mathématique · prévisibilité visuelle · échec doux · coût moteur (états purs) · robustesse tactile mobile.

**A1 gagne sur tous les critères décisifs**, et son coût est dérisoire grâce à `evaluate` déjà pure (§7).

---

## 6. Progression pédagogique N1–N6 (l'école MATHIC)

### 6.1 Principes
1. **Une seule idée cognitive par niveau** (exigence BRIEF §5 / W1-W10 : ne jamais tout déposer en même temps).
2. La première interaction du niveau N1 **invente la règle** : TAP → la formule apparaît → TRANSFORMER → le résultat remplace. Sans aide externe.
3. Chaque niveau **réutilise** ce que le précédent a appris (spirale), n'ajoute qu'**un** paramètre visible, et cache ce qui n'existe pas encore (HUD minimal évolutif, §9).
4. Les boards candidats sont **certifiés par le solver** (résolvables, `minMoves`, ≥2 routes dès N2 quand l'idée est « plusieurs chemins », jamais de cul-de-sac avant N4). La certification est le filtre unique (A11).

### 6.2 Ladder proposé (candidats à certifier — instances finales en IMPLEMENTATION)

| Niv | Nom | Idée introduite (une seule) | Ébauche board (à certifier) | Ce qui reste caché à ce stade |
|---|---|---|---|---|
| **N1** | La Première Formule | sélectionner → prévisualiser → transformer | `[2] [+] [3]` → 5 · 1 coup · 1 seule formule valable | score, chaîne, ancre (aucun choix) |
| **N2** | Deux Chemins | plusieurs formules → même objectif (choix = valeur) | `{1,2,3,4,+}` → 5 (`4+1`, `3+2`) | ancrage, score |
| **N3** | L'État Après | même objectif, états post-coup différents | `{6,4,8,3,×,+}` → 24 (`6×4` vs `8×3`) | score |
| **N4** | Le Sacrifice | premier coup peu rentable, utile ensuite | ébauche fils de b1-6 (formule → ressource) | chaîne visible |
| **N5** | La Chaîne | résultat réutilisé → chaîne | reprise b1-6 `{3,2,4,8,×,+}` → 48 (aucune solution en 1 coup, certifié par `solve(maxMoves:1)`) | optimisation |
| **N6** | L'Optimisation | solution rapide vs solution préparée | reprise b1-1 (immédiat 14 pts vs prépa 17 pts) | — (score devient décision) |

- Les boards **b1-1…b1-6 existants ne sont pas jetés** : ils sont les **graines** familiales des N1-N6 (valeur de l'instrument B1 PROVEN préservée). Renommage/exigences re-certifiées, kernel/engine intacts.
- Verrou pédagogique : **chaque board, une seule idée**. Un paramètre introduit = un seul bord visible changé. Si un test solveur révèle qu'un board permet « de s'en sortir sans utiliser l'idée » sur une route dominante, le board est re-designé (jamais le score « pour que ça passe »).

---

## 7. Implications du système d'évaluation temps réel

La refonte **ne duplique et ne remplace rien** :

1. `evaluate(state, action)` (`engine.mjs:21-46`) est **pure, déterministe, sans mutation**. C'est *exactement* le moteur de la preview : résultat, `base`, `delta`, `chainRun`, `chainBonus` calculés avant tout engagement.
2. **Preview = appel de `evaluate` + affichage** ; **confirmation = appel de `apply`**. Les deux sont les **seules** portes (A3/B0 : source unique, jamais deux évaluateurs).
3. Garantie dure à tester : pour tout candidat d'un état donné, `evaluate(...).delta` doit être **identique** au `events[-1].delta` produit par `apply(...)` sur le même couple. C'est l'équivalent §1 « évaluation temps réel réutilisée, jamais dupliquée ».
4. La preview doit afficher **honnêtement** : `result`, `+delta`, l'indicateur de chaîne (`chainRun`), et la médaille « objectif ! » si `result === target` — **sans jamais** mettre `won`, ni consommer, ni écrire dans `trace`. *Preview ≠ transition d'état.*
5. L'éligibilité du bouton `[TRANSFORMER]` = `evaluate(...).ok` sur la composition courante (réapprovisionnant la sélection en direct). Défaut du bouton `divisible/négatif` → cause affichée.
6. Conséquence télémetrie : le journal (`B1|` dans la webview) doit distinguer `preview` (format, delta, rejet) de `action` (engagé). L'instrument `observe.mjs` reste celui du slicing terminal.

---

## 8. Implications Solver / Replay

1. **Signature d'action inchangée** : `{a, op, b}` reste le tuple des **positions de cellules** (`engine.mjs:72`). La grammaire gestuelle n'affecte pas la sémantique → **solver, replay, conformance solver≡engine≡replay, tests 58/58 restent valides**. C'est le point qui rend la refonte « bas risque ».
2. **Solver = instrument, jamais exposé** : `solve()` (`solver.mjs`) reste un outil de certification (résolvabilité, `minMoves`, nombres de routes, `postStates`, difficulté). N1-N6 à certifier par `solve(level)` + sondes `maxMoves:1` (N5) exactement comme b1-6.
3. **Replay / undo inchangé** : `undo` = `replay(level, trace.slice(0,-1))` (`b1-web.js:210`). La preview ne doit **jamais** écrire dans `trace` ; une formule confirmée puis annulée est rejouée à l'identique. Nouveau test : preview → cancel → `cellsSnapshot(state)` identique ; preview → confirm → replay de la trace = état.
4. **Déterminisme mono-session** (pas de RNG) : aucune conséquence. La disponibilité des opérateurs (ressources) reste certifiée, pas régénérée (`design` D-B2).
5. **Aucune recomputation cachée** : si Momo (hors périmètre) devait suggérer, il réutiliserait `enumerateActions`/`evaluate` ; rien de nouveau ici.

---

## 9. Recommandations UI

### 9.1 Hiérarchie (le board est le héros)
```
┌──────────────────────────────┐
│ OBJECTIF 48        SCORE 14  │   ← social, priorisé
├──────────────────────────────┤
│                              │
│          BOARD               │   ← central, dominant, lisible
│                              │
│    [12] [+] [4] = [16]       │   ← barre formule en ordre naturel A op B
│             [TRANSFORMER]    │   ← validation (actif seulement si valide)
├──────────────────────────────┤
│   ↩ annuler       aide  ⚙   │
└──────────────────────────────┘
```

- **HUD évolutif par niveau** : N1 = Objectif + Coups seulement ; le Score apparaît avec le premier choix à conséquence (≈N3) ; « Chaîne » n'apparaît qu'à N5. Afficher une métrique qui n'existe pas encore = bruit (A7).
- Supprimer le label de scénario (« S1 — immédiat… ») : jargon équipe.
- Overlay bloqué → **bandeau** avec actions `↩ Annuler` / `Recommencer`, pas un modal bloquant.

### 9.2 Formula bar (la grammaire A1)
- Slots affichés dans l'ordre **A op B**, value + (option) numéro de position si non-commutatif (`12 − 4` vs `4 − 12` clairement distinguables).
- `=` suivi de la **preview du résultat** (calculée par `evaluate`) ; rouge + raison si invalide ; `✓` + « objectif ! » si cible atteinte.
- Bouton `[TRANSFORMER]` : seul déclencheur de `apply`.
- Re-toucher un slot = le remplacer ; `effacer` = reset de sélection (jamais de reset à la validation).

### 9.3 Feedback (la culture « l'animation explique la math », PAS des confettis)
- **VALID** → sélection (surbrillance) → preview stable → à la validation : opérateur et B glissent vers A, résultat émerge (déjà accentué `.res`, `b1-web.css:109`), son court, score incrémenté.
- **INVALID** → aucun mouvement de tuiles ; spring-back léger de la composition, raison affichée, son discret.
- **CHAIN** (N5+) → l'animation du résultat réutilisé se distingue (pulsation du compteur chaîne), sans surcharge ; **COMBO** reste hors périmètre B1.

### 9.4 Drawer System (différé, documenté, PAS implémenté maintenant)
- `‹` à gauche → aide / comment jouer / objectifs / progression.
- `⚙` à droite → son / musique / animations / difficulté / accessibilité.
- `✦ Momo` → panneau coach : Indice / Explication / Modèle IA / Paramètres.
- **Règle** : le drawer est une conséquence de l'architecture UI, pas une feature qui retarde la validation gameplay. En N1, seuls `aide` et `⚙` existent comme boutons minimaux ; le reste arrive après le GAMEPLAY FREEZE (§12).

---

## 10. Revue comparative ciblée (9 références)

Analyse des grammaires de jeux à forte rétention — le but : extraire **les principes de simplicité et de lisibilité**, pas copier les mécaniques.

| Jeu | 1ʳᵉ interaction | Geste invalide | Onboarding | 1ᵉʳe conséquence visible |
|---|---|---|---|---|
| Candy Crush | échanger 2 bonbons adjacents (tap L→R, tap R) | **spring-back** (retour visuel, état intact) | niveaux 1-2-3 guidés, **une règle à la fois** | match → pop → cascade → score |
| Bubble Witch | viser (glisser) + relâcher | bulle revient, rien ne change | popup « tape puis vise » | 3+ bulles → pop ; **visée prévisualisée (ligne pointillée)** |
| Merge 2048 | déplacer une tuile (drag/swipe), cases limitrophes | tuile ne bouge pas | rien (physique auto-évidente) | fusion deux égaux → nombre double |
| 2048 | swipe pousse toute la grille | **rien** ne bouge, aucune punition | règle auto-évidente par le geste | fusion déterministe, score des fusions |
| Two Dots | touch point + ligne à travers ≥2 dots mg | ligne seule / arrêt → rien | guidage progressif, séquence de points | dots effacés + gravité |
| Royal Match | échanger 2 pièces voisines | spring-back | tuto 1-2 niveaux, objectif HUD permanent | match → clear → falls+cascade |
| Toon Blast | tap un **groupe** ≥2 blocs de même couleur | tap solitaire → rien / rappel « besoin de 2+ » | très léger | blocs disparaissent, colonnes retombent |
| Blockudoku | taper une pièce puis **la poser** (ghost de placement) | placement impossible → **rejet + secousse**, pièce non consommée | guide 1 niveau | ligne/colonne/carré complet → clear |
| Number Match | taper 2 nombres (même valeur / somme cible) | tap simple → rien | minimal | paire retirée |

### Principes convergents → application MATHIC

| # | Principe extrait | Application MATHIC |
|---|---|---|
| P1 | **Une seule grammaire principale par jeu** | TAP→PREVIEW→VALIDATE comme seul verbe ; swipe exclu du tutoriel (§4.3) |
| P2 | **Le geste invalide ne change jamais l'état** ; il est rendu lisible (rien, ou spring-back **réversible**) | Invariant §3 ; feedback spring-back léger (§9.3), jamais de mouvement de board |
| P3 | **La règle s'invente par le geste + conséquence immédiate**, pas par texte | N1 : 2+3 → preview → TRANSFORMER, découverte sans lecture |
| P4 | **Les premiers niveaux = école**, une idée par niveau, succès garanti | Ladder N1-N6 (§6), HUD minimal évolutif (§9.1) |
| P5 | **Pré-visualiser quand la décision coûte** (visée Bubble Witch, ghost Blockudoku) | Preview de la formule avant validation (§4.1) — le « spring-back préventif » |
| P6 | **Échec doux** (replay immédiat, vie sous tension faible) | `undo`/`Recommencer` déjà déterministes ; overlay bloqué → bandeau (§9.1) |
| P7 | **Interface secondaire en retrait pendant l'apprentissage** | Drawers différés (§9.4) ; 2 boutons disponibles en N1 |
| P8 | **HUD sémantique : l'objectif et la progression, pas le jargon** | Objectif/Score piliers ; « Chaîne » n'apparaît qu'à N5 (une idée = un champ) |

Verdict comparatif : MATHIC combine la **preview fiable** (Bubble Witch/Blockudoku), le **geste invalide lisible** (match-3), et **l'école N1–N6** (Candy Crush). Rien d'un swipe-2048 ni d'un drag-puzzle (la décision mathématique n'est pas une physique).

---

## 11. Classification des décisions (avant toute implémentation)

| Proposition | Décision | Justification |
|---|---|---|
| TAP→PREVIEW→VALIDATE (A1) + formule `A op B` | **REQUIRED** | corrige la cause racine (A1/A2/A3) ; coût moteur nul (§7) |
| Invariant « INVALID → NO STATE CHANGE » + tests (state_before==state_after preview/cancel/reject) | **REQUIRED** | invariant culturel ; durcir le UI, le moteur est déjà conforme |
| Suppression des no-op muets (Refus/feedback visible partout) | **REQUIRED** | A4 ; condition de « confiance au jeu » |
| HUD minimal évolutif (Objectif/Coups → +Score → +Chaîne) | **REQUIRED (onboarding)** | emporte « une idée par niveau » |
| Ladder N1-N6 avec boards **certifiés** par le solver (graines = b1-1…b1-6) | **REQUIRED (contenu)** | l'école MATHIC, gate humain n°2 |
| Score `+0` prép / chaîne / coefficients | **EXPÉRIMENTAL — NE PAS TOUCHER** | directive §5 ; observer, jamais « ajuster pour passer » |
| Swipe dans le tutoriel / double-grammaire | **REJETÉ** | A8/§4.3 ; swipe gardé hors-code-slice comme acquis lab |
| Système de tiroirs (Drawer System) | **DIFFÉRÉ** | §9.4 ; après gameplay freeze |
| Momo / panneau IA / modèle GGUF | **DIFFÉRÉ** | Momo = couche auxiliaire ; modèle conservé à `public/models/` (intact) |
| Score, difficulté, économie, combos N∈{3..6}, spécials | **HORS PÉRIMÈTRE** | STOP CONDITIONS de la directive §11 |
| Terminal / `observe.mjs` (harnais instrument) | **CONSERVÉ TEL QUEL** | mesure humaine ; inchangé |
| Kernel / Engine / Solver / Replay / contracts | **INTACTS** | aucun octet de mathématiques modifié |
| V6/V7 / nouvelle mécanique | **INTERDIT** | trajectoire unique MATHIC 1.0 |

---

## 12. Proposition du slice suivant — « B1.5 · Grammar & Onboarding »

### 12.1 Objectif
Faire **reconnaître à un joueur humain** la grammaire : « je compose une formule, je lis la preview, je décide, je TRANSFERME — et si je me trompe, rien ne bouge ». Deuxième test humain ciblé sur N1–N6.

### 12.2 Périmètre ENTRANT (minimum démontrant l'invariant)
- Web UI : ordre de slots `A op B`, preview par `evaluate`, bouton `[TRANSFORMER]` seul déclencheur de `apply`, édition par re-touch, spring-back invalide, HUD minimal évolutif.
- Niveaux N1–N6 (graines b1-1…b1-6) certifiés : `solve` → résolvable, `minMoves`, ≥2 routes (N2/N3/N6), 0 solution en 1 coup pour N5 (`solve(maxMoves:1)`), `blocked` désactivé avant N4.
- Tests ajoutés : preview/cancel → état identique ; `evaluate.delta == apply.events[-1].delta` pour tout candidat ; rejet → `cellsSnapshot` inchangé ; refonte N1 ne casse pas le lecture.
- Journal `B1|` : événements `preview`/`action`/`invalid` distincts (télémétrie LOCAL, pas d'envoi).

### 12.3 Périmètre SORTANT (verrouillé)
Swipes, drag&drop, Momo, drawers, son/musique/animations avancées, score (aucune ligne), combo, progression, home/branding, UI polish. **Aucune modification** de `kernel.mjs`/`engine.mjs`/`solver.mjs`/`replay.mjs`/`levels.mjs` (les graines sont adaptées via une **nouvelle liste de niveaux** N1-N6, pas en mutilant b1-*).

### 12.4 Phase d'implémentation (après DECISION du gate)
```
REVIEW (ce document) → DECISION (arbitrage §11 par l'équipe)
→ MINIMAL IMPL (B1.5, périmètre §12.2, tests 58/58 + nouveaux verts)
→ HUMAN TEST n°2 (protocole B1-HUMAN-OBSERVATION, instrument épaissi : preview/reject)
→ GAMEPLAY FREEZE ou retour ciblé n°2
```
Critères de succès du test n°2 : le joueur (a) reconstitue seul N1 (1ᵉʳ coup < ~20 s), (b) ne dit plus « le board a bougé », (c) corrige une formule sans reset, (d) décrit la preview (« 12+4=16 »), (e) sent que « préparer rapporte » (N5/N6), (f) a envie de rejouer un niveau (phrase n°5 du BRIEF §19).

### 12.5 Traçabilité
- Commit du doc : un seul ajout `docs/design/MATHIC-1-0-INTERACTION-ONBOARDING-REVIEW.md` sur `kali/v5-gameplay-lab` (HEAD `18af8a2`). Aucune modification de code/artefact.
- Slice source verrouillé pour le test n°1 : `189f377`.

---

## Annexe A — Environnement vérifié (aucun changement)
- Workspace unique : `/home/kali/Documents/mathic` (pas `/sdcard/…`).
- `.git` propre (`git status` clean), `node_modules/` présent, `android/` + `android/gradlew` présents.
- Modèle IA conservé à `public/models/smollm-135m-math-v7-q2_k.gguf` (intact).
- `dist-b1/` = build web B1 de référence (source inchangée).
- Ce document est **le seul** fichier créé par cette revue.

## Annexe B — Rappel culturel (invariants MATHIC)
Geste invalide → AUCUN changement d'état · mathématiques exactes et **prévisibles** · plusieurs solutions, conséquences distinctes · l'état d'après compte · Solver = Engine = Replay · évaluation temps réelle unique, jamais dupliquée · Momo coach, pas moteur · séparation Mathematics / Gameplay / UI / AI / Persistence / Telemetry · aucune conclusion gameplay sans joueur humain · une seule décision par geste · le board reste central, lisible, dominant.