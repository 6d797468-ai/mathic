# MATHIC 1.0 — B1 · Évaluation autonome (rapport)

- **Produit** : MATHIC 1.0 (économie + résolution exacte, AUCUN héritage V4/V5 gameplay).
- **Slice** : B1 « jouable 6 niveaux » — kernel exact, chaîne, objectifs, sortable/solver instrumenté.
- **Partie évaluée** : 6 niveaux (`b1-1`…`b1-6`) + 3 sondes (bad path, blockage-abandon, immédiat).
- **Commits applicatifs** : `5f5b36f` (couche web Android du slice B1) — arbre de la production de l'artefact ; `c6f8c39` (capacitor config JSON) ; ce rapport est un commit documentaire post-artefact.
- **Verrou culturel** : aucune conclusion de « jouabilité validée » n'est tirée ici ; tout verdict gameplay reste subordonné au test humain sur téléphone (protocole `MATHIC-1-0-B1-HUMAN-OBSERVATION.md`).

---

## 0. Méthode, cadre et limites

L'évaluation a été exécutée en **autonome** : les 6 niveaux ont été joués
exactement comme une session terminale guidée, par l'instrument
`src/b1/observe.mjs` (`--scripts`), qui produit un journal JSONL brut
horodaté par événement (`level` → `input` → `action` / `reject` / `blocked` /
`undo` → `end` → `summary`). Les journaux sont conservés hors dépôt
(`/tmp/opencode/b1-obs/*.jsonl` + transcripts `.out`) ; les faits de cette
section en sont la transcription directe.

**Limites — à lire avant tout jugement.**

1. **Ce n'est pas un test humain.** Les coups scriptés ont été choisis pour
   déclencher les mécanismes à observer (chaîne, préparation, rejets, undo,
   blocage). Rien ici ne renseigne sur la compréhension, le plaisir, la
   perception du score ou le « fun ».
2. **`firstMoveMs` / `waitingMs` ne sont PAS des signaux cognitifs.** Les inputs
   arrivent par pipe avec une latence mécanique (ms d'ordonnancement du shell).
   Ils ne mesurent aucune performance humaine ; toute lecture temporelle de ces
   valeurs est exclue tant qu'un humain ne joue pas en interactif.
3. **Le jugement final appartient à l'humain** (gabarit des 11 blocs du
   protocole d'observation) ; ce rapport pose des **hypothèses expérimentales**
   étiquetées comme telles, jamais des vérités.

La suite de tests est verte avant/après : **58/58** (`node --test`
+ playtest). Aucune mécanique n'a été modifiée, ajoutée ni supprimée pendant
l'évaluation.

---

## 1. Faits observés (transcription)

### b1-1 « Le Pont » (S1 — immédiat vs préparation) — VICTOIRE 17 pts
1. `9 0 1` → rejeté (opérande invalide, tuile 9 absente) — **aucune tuile consommée**.
2. `4 0 1` → `12 + 4 = 16` en cellule **0** (ancrage A), `+1` (`|16|/10 = 1`), score 1.
3. `trace` → historique `[0;4;4] 0:+ 4 = 16 +1` conforme.
4. `2 0 3` → `16 × 3 = 48`, `+6` (base 4 + **chaîne ×1 = +2**), score 7, objectif atteint.
5. **Score final : 17** (7 + objectif `+10`). Deux coups consommés, `movesLeft 0`.

Preuve du signal design : la route *préparée* (16 puis 48) rapporte `+6` au
second coup au lieu de `+4`, et le total prépa (17) bat la route *immédiate*
`12 × 4 = 48` (14, sondée en probe-c).

### b1-2 « Le 2 partagé » (S7 — ressource partagée exclusive) — VICTOIRE 14 pts
1. `5 1 0` → `96 ÷ 24 = 4` en cellule **1**, `+0` (`|4|/10 = 0`). La tuile 2 est
   conservée, score 0.
2. `undo` → retour exact à l'état initial (coups 2/2, score 0) — reconstruction
   par **replay déterministe**, cells identiques.
3. `3 0 2` → `24 × 2 = 48`, `+4`, objectif atteint.
4. **Score final : 14.**

### b1-3 « Quatre routes » (S8 — l'état d'après décide) — VICTOIRE 14 pts
1. `8 2 5` → `50 ÷ 4` **rejeté** avec raison explicite (« 50 n'est pas divisible
   par 4 »), état inchangé.
2. `4 0 1` → `24 × 2 = 48`, `+4`, objectif atteint.
3. **Score final : 14.** La preuve S8 : le coup `24×2` gagne *à cause de l'état*
   produit (48 posé en cellule 0), pas de la seule valeur.

### b1-4 « La Falaise » (S4/S9 — piège, bloqué ≠ échec) — VICTOIRE 13 pts
1. `3 0 1` → `5 + 7 = 12`, `+1`, score 1.
2. L'instrument détecte **blocked** : `12` seul ne produit aucune formule valable
   (`12 × ? = 35` impossible, opérateur `*` seul et puits en moins) → message
   « bloqué ≠ échec », l'état reste jouable.
3. `undo` → retour à l'état initial.
4. `2 1 0` → `7 × 5 = 35`, `+3`, objectif atteint.
5. **Score final : 13.**

### b1-5 « Division exacte » (K-0 + C-3 — rejets non destructifs, ancrage A) — VICTOIRE 14 pts
1. `3 0 1` → `50 ÷ 4` **rejeté** (non divisible), aucune tuile consommée.
2. `5 1 2` → `4 × 12 = 48`, `+4`, ancré en **cellule 1** (A), objectif atteint.
3. **Score final : 14.**

### b1-6 « La Chaîne » (B1-B — préparation obligatoire) — VICTOIRE 16 pts
1. `5 1 2` → `2 + 4 = 6` en cellule **1**, `+0` — **coup préparatoire à 0 point**.
2. `5 0 5` → rejeté (« il faut 3 cellules distinctes ») — self-opérande, jamais consommé.
3. `4 1 3` → `6 × 8 = 48`, `+6` (base 4 + **chaîne ×1 = +2** via le 6 recyclé),
   objectif atteint.
4. **Score final : 16** (préparation 0 + chaîne 6 + objectif 10).
5. Preuve B1-B : **aucune solution en 1 coup** sur ce plateau — le niveau impose
   la préparation.

### Sondes (hors périmètre de scoring, éclairage design)
- **probe-a** (b1-2, mauvais chemin) : `96 ÷ 24 = 4` (`+0`) puis `4 × 2 = 8`
  (`+2`, **chaîne ×1 activée sur un chemin perdant**) → ÉCHEC, score final 2.
  → la chaîne récompense *toute* réutilisation, même vers l'échec.
- **probe-b** (b1-4, blockage) : `5 + 7 = 12` → blocked → abandon (`q`). Le
  blocage a bien été signalé comme « pas un échec », mais un joueur qui
  n'imagine pas l'undo se retrouve dans une impasse avec un message.
- **probe-c** (b1-1, immédiat) : `12 × 4 = 48` direct, `+4`, score final **14**
  (vs **17** en route préparée).

---

## 2. Résultats instrumentés

Chiffres extraits des `summary` des journaux JSONL (les valeurs temporelles
étant **non-signaux**, cf. §0, elles ne sont pas interprétées).

| Run | Niveau | Coups appliqués | Rejets | Undos | Blocages détectés | Victoire | Score final |
|---|---|---|---|---|---|---|---|
| b1-1 | Pont | 2 | 1 | 0 | 0 | OK | **17** |
| b1-2 | 2 partagé | 2 | 0 | 1 | 0 | OK | **14** |
| b1-3 | 4 routes | 1 | 1 | 0 | 0 | OK | **14** |
| b1-4 | Falaise | 2 | 0 | 1 | **1** | OK | **13** |
| b1-5 | Division exacte | 1 | 1 | 0 | 0 | OK | **14** |
| b1-6 | La Chaîne | 2 | 1 | 0 | 0 | OK | **16** |
| probe-a | 2 partagé | 2 | 0 | 0 | 0 | **ÉCHEC** | 2 |
| probe-b | Falaise | 1 | 0 | 0 | **1** | abandon | — |
| probe-c | Pont (immédiat) | 1 | 0 | 0 | 0 | OK | **14** |

Constats mécaniques confirmés par les journaux :
- rejets **atomiques et non destructifs** à 100 % (b1-1, b1-3, b1-5, b1-6) ;
- `undo` = replay déterministe exact (b1-2, b1-4) ;
- détection de **bloqué ≠ échec** active (b1-4, probe-b) ;
- ancrage des résultats sur **l'opérande A** (événements `anchor=a`) ;
- chaîne `nextChain` incrémentée uniquement lors d'une **réutilisation** d'un
  résultat (b1-1, b1-6, probe-a) et remise à zéro sur coup frais ;
- déterminisme solver ≡ engine ≡ replay vérifié par les tests (58/58).

---

## 3. Anomalies techniques

**Aucune anomalie technique constatée** sur les 9 journaux. Les seuls rejets
rencontrés sont des comportements *prévus* du kernel : référence de cellule
invalide, opérateur sur lui-même, division non entière. Aucune exception, aucun
état incohérent (`state_before + action = state_after` vérifié à chaque pas),
aucune divergence replay/engine.

---

## 4. Problèmes de design potentiels (à observer chez l'humain)

Ces points sont **observables dans les données** mais leur interprétation
« problème réel » n'est possible qu'avec un humain.

1. **Coup préparatoire à 0 point (b1-6 `2+4=6` ; probe-a `96÷24=4`).** Le joueur
   paie un coup sans aucun point. Risques : (a) perception d'inutilité /
   injustice, (b) incompréhension — ou au contraire (c) compréhension du
   sacrifice comme vertu. **À observer précisément (bloc 6 du protocole).**
2. **La chaîne récompense toute réutilisation, y compris perdante (probe-a).**
   `chain:1` est appliqué sur `4×2=8` menant à l'ÉCHEC. Risque : la mécanique
   encourage le recyclage sans le rendre conditionné à l'objectif. Effet
   réel inconnu chez un joueur.
3. **Immédiat vs préparation : 14 pts < 17 pts (b1-1/probe-c).** L'écart existe
   mais est faible (3 pts sur un score final ~14-17). La préparation est-elle
   *perçue* comme avantageuse ? Sinon, le point distinguant la chaîne mourra.
4. **Win-on-touch : le jeu s'arrête dès l'objectif atteint, même s'il reste des
   coups.** Pertinent pour les scores comparatifs (14 vs 17), acceptable mais à
   confirmer comme non-frustrant.
5. **`blocked` après un premier coup (b1-4).** Mécaniquement correct, mais le
   seul message affiché dit « ce n'est pas un échec » sans guider vers l'undo ;
   en terminal c'est neutre, sur téléphone la friction devra être observée.

---

## 5. Hypothèses expérimentales (verdicts provisoires)

| Hypothèse | Statut observé | Verdict provisoire (À CONFIRMER par l'humain) |
|---|---|---|
| H-B1 opérateurs = tuiles consommées | contrat respecté partout | **cohérent** — la rareté d'opérateur structure la préparation |
| H-AN ancrage sur opérande A | vérifié (b1-1, b1-3, b1-5, b1-6, probe-a) | **robuste** |
| H-3→1 consommation 3→1 | vérifiée (2 tuiles disparaissent, 1 résultat en A) | **robuste** |
| prep obligatoire b1-6 (B1-B) | aucune solution en 1 coup, aucune en 0 | **confirmé mécaniquement** |
| score de base `|r|/10` | produit des 0-point sur petites valeurs | **risque de perception** (cf. §4.1) |
| chaîne +2/maillon | fonctionnelle | **risque sur chemin perdant** (cf. §4.2, probe-a) |
| combo N∈{3..6} | **hors périmètre B1** (non codé) | inerte |

---

## 6. Conclusions impossibles sans humain

L'évaluation autonome **ne peut pas** répondre à :
- Y a-t-il du plaisir / de l'engagement sur les 6 niveaux ?
- La préparation à 0 point est-elle comprise, acceptée, aimée ?
- L'écart immédiat/prépa (14 vs 17) est-il perçu ou invisible ?
- La chaîne récompensant un chemin perdant est-elle source de frustration
  ou de découverte ?
- Le blocage + undo est-il trouvé sans aide ?
- Les niveaux b1-1…b1-6 sont-ils ordonnés à la bonne difficulté ?

Ces questions relèvent du **test humain** sur téléphone Android, qui doit se
faire avec l'APK §7, sans explication des solutions, via le protocole
« HUMAN-OBSERVATION » (12 points, gabarit 11 blocs), et déboucher sur un des
deux verdicts : **GAMEPLAY FREEZE** ou **TARGETED RETURN**.
Jusqu'à ce verdict : aucune correction de score / balance / mécanique (STOP
CONDITION levée uniquement après retour de l'humain).

---

## 7. Git commit → build → artefact Android

**Verdict de cette phase : B1 AUTONOMOUS EVALUATION COMPLETE · ANDROID BUILD READY FOR HUMAN TEST**

### Traçabilité (double-hash, honnête)
- **Commit source de la production** : `5f5b36f` (couche web Android du slice
  B1, moteur inchangé, 58/58). Arbre d'entrée `dist-b1` généré depuis `src/`.
- **Précédent outillage** : `c6f8c39` (config Capacitor JSON — TS7/Node24
  incompatibles avec le CLI ; appId/appName/webDir strictement identiques).
- Le présent rapport est un **commit documentaire post-artefact** : il n'altère
  aucun octet d'application ; l'artefact reste reproductible à l'identique
  depuis `5f5b36f` (voir commandes).
- **Environnement de build (machine arm64, Kali des-notes)**
  - JDK 21 (`/usr/lib/jvm/java-21-openjdk-arm64`), AGP 8.13.0, Gradle 8.14.3.
  - SDK : `platforms;android-36` + `build-tools;36.0.0` (`/usr/lib/android-sdk`),
    `local.properties` → `sdk.dir=/usr/lib/android-sdk`.
  - **Note portage arm64** : Google ne publie pas de binaires `aapt2`/`zipalign`
    pour Linux arm64 ; le build passe par `qemu-user` + wrappers locaux hors
    dépôt (`-Pandroid.aapt2FromMavenOverride` + shim SDK). Aucun impact sur le
    code empreint.
- **Commandes de reproduction**
  ```
  npm run build:b1          # vite build --config vite.b1.config.mjs → dist-b1
  npx cap copy android      # dist-b1 → android/app/src/main/assets/public
  cd android && ./gradlew assembleDebug -Pandroid.aapt2FromMavenOverride=…   # AGP 8.13
  ```

### Artefact
| Champ | Valeur |
|---|---|
| Fichier sortie Gradle | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Copie de livraison | `artifacts/b1/MATHIC-B1-1.0-debug.apk` (hors dépôt, gitignoré) |
| Taille | 4 481 915 octets (~4,3 Mo — bundle B1 seul, sans assets prototype) |
| SHA-256 | `452bb99833a402f9cad7404a5c368acc20bc452d11f070c3b9a4c9912dbb735a` |
| Signature | debug Android (`CN=Android Debug`, SHA-256 `b40afee9…`) — **DIY install, non publieable Play Console telle quelle** |
| applicationId / version | `com.mathic.game` / `1.0` (versionCode 1) |
| minSdk — compileSdk — targetSdk | 24 — 36 — 36 |
| Contenu temps réel | `assets/public/` = `index.html` + `b1-web.js` + `b1-web.css` (UI B1 ; AUCUN `wllama`/`models` du prototype) |
| Intégrité zip | OK (`unzip -t`) ; APK Signing Block v2 présent |

L'APK embarque donc le **terminal "MATHIC 1.0 — slice B1"** : les 6 niveaux,
les mêmes opérateurs consommables, les rejets explicites, l'undo-replay, les
messages bloqué ≠ échec, et un journal JSONL en console WebView (préfixe
`B1|`) pour la future session instrumentée sur téléphone.

**Prochaines étapes humaines requises** : (1) `adb install` / copie manuelle
de l'APK, (2) jeu des 6 niveaux SANS explication (protocole HUMAN-OBSERVATION),
(3) verdict GAMEPLAY FREEZE ou TARGETED RETURN. Aucune modification de
score/balance/mécanique avant ce retour.