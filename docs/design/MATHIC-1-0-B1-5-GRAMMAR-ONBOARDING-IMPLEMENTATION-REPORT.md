# MATHIC 1.0 — B1.5 · Grammar & Onboarding — Rapport d'implémentation

**Statut B1.5 (gate §13)** : IMPLÉMENTÉ + TESTÉ + CERTIFIÉ + BUILD OK — **TEST HUMAIN NON ENCORE FAIT** → verdict final (PROVEN / TARGETED RETURN / BLOCKED / NO-GO) **PENDING**.
**Décision source** : « DECISION : APPROUVER B1.5 · Grammar & Onboarding » (mandat architecte, revue `MATHIC-1-0-INTERACTION-ONBOARDING-REVIEW.md`).
**Règle absolue** : aucune affirmation de compréhension joueur dans ce document. Seul le test humain jugera.

---

## 1. VERDICT ARCHITECTURAL

- **Grammaire corrrigée** : `TAP nombre → TAP opérateur → TAP nombre → PREVIEW → TRANSFORMER → transformation`. Le 3ᵉ tap ne déclenche **jamais** `apply()`. `TRANSFORMER` est l'unique déclencheur.
- **Invariant INVALID → NO STATE CHANGE** : vérifié par tests (positions/valeurs/opérateurs/score/chaîne/objectif/replay/trace).
- **PREVIEW = evaluate()** : pur, non-mutant, unique. `preview.delta == apply().events[-1].delta` vérifié sur **tous** les candidats de **tous** les niveaux.
- **Kernel / Engine / Solver / Replay : INTACTS** (aucune ligne modifiée — vérifié `git diff` n'expose que `levels.mjs`, `web/*`, nouveaux tests).
- **Fonctionnalités hors périmètre non implémentées** (Momo, GGUF, drawers, swipe, drag&drop, économie, audio, branding, combo, boosters).

## 2. CHANGEMENTS RÉALISÉS

1. **`src/b1/levels.mjs`** — ajout du `LADDER` pédagogique N1–N6 (export `LADDER`, `ladderBy`). Les `b1-1…b1-6` de l'instrument sont **conservés à l'identique** (graines), rien n'est mutilé.
2. **`src/b1/web/index.html`** — barre formule en ordre **`A op B = résultat`** + bouton `[TRANSFORMER]` + `#pv-extra` ; suppression du jargon (`scenario`) ; HUD avec items adressables (`item-target/moves/score/chain`).
3. **`src/b1/web/b1-web.js`** — réécriture de la grammaire :
   - `tap()` ne fait que construire/éditer la sélection (jamais exécuter) ;
   - `refreshPreview()` = **uniquement** `evaluate(state, action)` ;
   - `commitAction()` = **unique** appel à `apply()` ;
   - sélection **éditable** : re-tap d'une tuile = retrait, tap sur slot = retrait, A retiré → B promu en A ; `effacer` = reset de sélection ;
   - plus de no-op muets : chaque tap produit un retour texte (`Opérateur choisi.` / `B retiré.` / « Deux nombres déjà choisis… ») ;
   - spring-back CSS (`.shake`) sur formulaire pour geste/refus ;
   - HUD minimal évolutif (`applyHud()` : Objectif+Coups toujours ; Score dès N2 ; Chaîne dès N5) ;
   - journal `B1|` enrichi : `preview` / `invalid` / `action` / `undo` / `switch` / `restart`.
4. **`src/b1/web/b1-web.css`** — `.eq`, `.res-slot.ok/.err/.target`, `#commit`, `#commit:disabled`, `.pv-extra`, animation `mathic-shake`.
5. **`tests/b1/b1-5-grammar.test.mjs`** — 11 nouveaux tests (détail §4).

## 3. FICHIERS TOUCHÉS

| Fichier | Modification |
|---|---|
| `src/b1/levels.mjs` | + `LADDER` N1-N6 (ajout ; `b1-*` intacts) |
| `src/b1/web/index.html` | refonte barre formule / HUD / suppression jargon |
| `src/b1/web/b1-web.js` | refonte grammaire (TAP→PREVIEW→TRANSFORMER) |
| `src/b1/web/b1-web.css` | styles B1.5 (A op B = résultat, commit, shake) |
| `tests/b1/b1-5-grammar.test.mjs` | nouveau : 11 tests |
| `docs/design/MATHIC-1-0-INTERACTION-ONBOARDING-REVIEW.md` | revue (source de la décision) |
| `docs/design/MATHIC-1-0-B1-5-GRAMMAR-ONBOARDING-IMPLEMENTATION-REPORT.md` | ce document |
| `src/b1/kernel.mjs` · `engine.mjs` · `solver.mjs` · `replay.mjs` · `observe.mjs` · `play.mjs` | **AUCUNE modification** |

## 4. INVARIANTS (vérifiés par test)

- **INVALID → STATE_BEFORE == STATE_AFTER** : `evaluate`=false / `apply`=null / état sérialisé identique (cells+score+trace+movesLeft+won+nextChain) pour tout geste invalide de chaque niveau.
- **PREVIEW ≠ STATE** : `evaluate()` est non-mutant ; après preview, `trace.length==0` et snapshot identique.
- **VALID → UN SEUL COMMIT** : un coup n'est consommé (movesLeft−1, trace, score) qu'à l'appel de `apply` (via le bouton `TRANSFORMER`).
- **Solver = Engine = Replay** : signature d'action `{a,op,b}` inchangée ; solver partage `apply()` ; replay reconstruit à l'identique (`undo` testé sur N5).

## 5. TESTS AVANT / APRÈS

| Mesure | Avant | Après |
|---|---|---|
| Suites `node --test` | 58 pass | **69 pass** (58 + 11 B1.5) |
| Playtest puzzle (npm test) | OK | OK |
| Fails | 0 | 0 |

Contributions B1.5 (11) : structure LADDER + résolvabilité · N1 victoire en 1 coup · N2 ≥2 chemins · N3 états post-coup distincts · N4 aucune victoire en 1 coup · N5 chaîne (+0 préparatoire, chaîne ×1) · N6 immédiat < préparé (14<17) · preview/purité · preview.delta==apply.delta · INVALID invariant · undo après preview.

## 6. RÉSULTATS SOLVER (certification obligatoire du ladder)

| Niveau | Solvable | minMoves | maxMoves | routes (1er coup) | postStates | victoire en 1 coup |
|---|---|---|---|---|---|---|
| N1 | true | 1 | 1 | 2 | 2 | OUI |
| N2 | true | 1 | 1 | 4 | 4 | OUI |
| N3 | true | 1 | 1 | 4 | 4 | OUI |
| N4 | true | 2 | 3 | 2 | 3 | **non** (préparation forcée) |
| N5 | true | 2 | 3 | 2 | 3 | **non** (chaîne forcée) |
| N6 | true | 1 | 2 | 2 | 5 | OUI (route rapide) et route préparée 17 > 14 |

`b1-6` (graine de N5) : intact (solvable, minMoves 2). Solver utilisé : `solve(level, {maxMoves})` + `solve(level, {maxMoves:1})` (budget 200 000 pour les sondes).

## 7. SCÉNARIOS TESTÉS

1. **N1 complet** (headless) : tap 2 → + → 3 → preview `5 ✓` → TRANSFORMER → movesLeft 1→0, victoire, overlay.
2. **3ᵉ tap seul** (N1) : après sélection complète, `moves` inchangé → **seul TRANSFORMER consomme**.
3. **Édition** : re-tap de A → A retiré (B promu si présent) ; tap slot op → op retiré ; `effacer` → reset.
4. **N5 chaîne** : `2+4=6` à **+0** puis `6×8=48`, preview montre `chaîne +2`, commit → score 6 + objectif → 16. (Mêmes trajets mathématiques que b1-6, graine intacte.)
5. **Undo** : après preview→commit, undo = replay de trace tronquée → état initial exact.
6. **Geste invalide** : combos de cellules invalides (op=opérande, a=b, hors bornes) → `evaluate`=false, `apply`=null, état identique.
7. **HUD** : N1 masque Score et Chaîne ; N5 affiche Chaîne.

## 8. COMPORTEMENT VERIFIÉ PAR ÉTAPE DE LA GRAMMAIRE

| Étape | Comportement |
|---|---|
| PREVIEW | `evaluate()` appelé à chaque sélection complète/modification ; résultat + `+delta` (+ « objectif ! ») affichés ; `TRANSFORMER` activé si valide |
| INVALID (formule rejetée) | `res` ✗ + raison (`pv-extra`), `TRANSFORMER` désactivé, **aucune** tuile consommée, sélection **conservée** (éditable) |
| CANCEL (annuler) | `effacer` ou tap slot : sélection vidée ; `state`/`trace` strictement inchangés (testé) |
| CONFIRM | `apply()` (source unique), un coup, événement journalisé, feedback texte, overlay si objectif |
| PREVIEW → CONFIRM cohérence | `preview.delta == apply().events[-1].delta` : équivalence vérifiée sur 100 % des candidats de tous les niveaux |

## 9. ÉTAT ANDROID BUILD

- Commande (reproductible, machine arm64 ; aapt2 x86-64 → wrapper `qemu-x86_64` hors dépôt) :
  ```
  npm run build:b1
  npx cap copy android
  cd android && ./gradlew assembleDebug -Pandroid.aapt2FromMavenOverride=/usr/lib/android-sdk/tools-x86/aapt2
  ```
- Résultat : **BUILD SUCCESSFUL** (2m14s, 93 tâches, assets web B1.5 embarqués).
- Assets ignorés par git (`android/.gitignore:96`) → l'APK est **reproductible depuis les sources commitées** uniquement.

## 10. COMMIT

- **Commit d'implémentation** : `abfa294`
  `b1.5: grammaire TAP->PREVIEW->TRANSFORMER + onboarding N1-N6 (decision architecte)`
- **Commit documentaire** : `566ed8d` (ce rapport + revue)  
  `docs: rapport B1.5 Grammar & Onboarding (implementation) + revue interaction/onboarding`
- Branche : `kali/v5-gameplay-lab` · origine : `git@github.com:6d797468-ai/mathic.git`.

## 11. ARTEFACT APK

| Champ | Valeur |
|---|---|
| Fichier | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Copie de livraison | `artifacts/b1/MATHIC-B1-1.0-debug.apk` |
| Taille | 4 486 812 octets |
| SHA-256 | `454e103a535eb8e7d2ef71c97c2785ed3894b32df19577fa7be6e37a4aad5ccb` |
| Intégrité zip | OK · embarqué : `index.html` (bouton `TRANSFORMER`), `b1-web.js` (marqueurs B1.5) |
| applicationId / version | `com.mathic.game` / 1.0 |

Correspondance **APK ↔ commit** : l'APK a été buildé depuis l'arbre de travail **identique** à celui figé dans `abfa294` (aucune modification applicative après le build ; seuls les documents `.md` ont suivi, sans effet sur le web).

## 12. LIMITES RESTANTES (assumées, hors périmètre B1.5)

- **Aucune validation humaine** : la compréhension, la fluence de la grammaire et l'onboarding ne peuvent pas être déduits des tests (§13 du mandat).
- Pas de sélection visuelle de rôle A/B par drag — desinvolture assumée pour ≤ 2 nombres en `+ ×` ; l'ancrage A reste EXPLÉRIMENTAL (H-AN, à juger humain).
- `+0` préparatoire en N5 (score `|6|/10 = 0`) : conservé, NON corrigé (observation humaine obligatoire).
- Pas de swipe, pas de mouse drag, pas de support clavier web (le terminal `play.mjs` reste un harnais).
- UI volontairement épurée : pas de drawers, pas de Momo, pas d'audio.

## 13. PROTOCOLE DU PROCHAIN TEST HUMAIN (adjoint — à exécuter)

**Objectif** : vérifier la grammaire TAP→PREVIEW→TRANSFORMER et l'onboarding N1→N6 sur le téléphone, **sans explication préalable**.

1. **Install** : `adb install artifacts/b1/MATHIC-B1-1.0-debug.apk` (ou copie manuelle).
2. **Session** : un joueur n'ayant jamais vu MATHIC ; observateur **silencieux** ; l'interface doit se comprendre seule.
3. **Séquences N1→N6à l'écran** de l'instrument (webview) : N1 → N2 → … → N6, reprise possible ; pas de passage forcé.
4. **Observeurs (journal `B1|`)** : previews, rejets (`invalid`), actions, undo, score, temps avant premier `action`.
5. **Checklist d'observation** (par niveau) :
   - (a) nombre de taps avant un premier TRANSFORMER réussi ;
   - (b) une formule rejetée ne modifie-t-elle **rien** d'autre qu'un message ? (sélection conservée ?)
   - (c) le 3ᵉ tap a-t-il été pris pour une exécution (attente d'un effet) ou lu comme preview ?
   - (d) dans N5 : le `+0` est-il relu comme un sacrifice ou comme une punition ? hésitation ?
   - (e) N6 : le joueur choisit-il la route `12×4` (rapide) et/ou explore-t-il `12+4` ?
   - (f) HUD : quelque chose a-t-il manqué / dérangé ?
   - (g) envie de rejouer un niveau (phrase n°5 du BRIEF §19) ?
6. **Verdict** : un des 4 statuts du gate B1.5 — **PROVEN** | **TARGETED RETURN** | **BLOCKED** | **NO-GO**.
7. **Contraintes** : aucun correctif de score/balance/grammaire pendant la session ; le retour ciblé est décrit, puis exécuté en slice séparé.

## 14. CULTURE MATHIC — AUTO-VÉRIFICATION CODESPACE (12 questions)

| # | Question | Réponse |
|---|---|---|
| 1 | Mathématiques exactes ? | OUI (kernel intact, tests 69) |
| 2 | Une action = une intention ? | OUI (sélection ≠ preview ≠ apply) |
| 3 | INVALID → state intact ? | OUI (testé) |
| 4 | Preview utilise evaluate() ? | OUI (source unique) |
| 5 | apply() seul commit ? | OUI (TRANSFORMER) |
| 6 | Solver = Engine = Replay ? | OUI (intacts, conformance conservée) |
| 7 | Board central ? | OUI (HUD minimalisé, jargon supprimé) |
| 8 | Une idée nouvelle par niveau ? | OUI (ladder certifié) |
| 9 | Conséquences réellement différentes ? | OUI (N3/N4/N5/N6, postStates ≥ 2) |
| 10 | Preuve automatisée ? | OUI (11 nouveaux tests + 58 existants) |
| 11 | Validation humaine ? | **PENDING — protocole §13 à exécuter** |
| 12 | Périmètre courant respecté ? | OUI (rien d'hors-B1.5 ajouté) |

---

*Fin du rapport. Aucun développement supplémentaire ne doit être engagé avant le verdict du test humain (§13).*