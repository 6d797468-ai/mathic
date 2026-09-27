# MATHIC 1.0 — Rapport de mandat : Fenêtre de Progression Adaptative (MISSION 8)

**Référence** : MISSION 8 — `ADAPTIVE PROGRESSION WINDOW` · Méthode : `MATHIC-1-0-ADAPTIVE-WINDOW.md`
**Décisions produit** : k = 3 · fenêtre **débloquée et jouable**.
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVE.

---

## 1. Objet

Amplifier, de façon **déterministe et gouvernée par la progression réelle**,
l'espace de décision |W(p,t)| de la Policy (Niveau B : fenêtre d'anticipation
N → {N+1 … N+k}). L'IA n'acquiert **aucun** pouvoir de déverrouillage arbitraire,
et aucune logique de Policy/Orchestrator n'est modifiée : seule la *progression*
(primitives de la save) est paramétrée.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Fenêtre de progression (k=3) + itérateur | Code (ADD) | `src/b1/levels.mjs` — `PROGRESSION_WINDOW`, `windowOf` |
| markCompleted paramétré (horizon, défaut 1) | Code (MOD) | `src/b1/save.mjs` |
| persistVictory → fenêtre réelle | Code (MOD) | `src/b1/web/b1-web.js` |
| Tests W-01 → W-09 | Test (ADD) | `tests/intel/window-progression.test.mjs` |
| Tests UI adaptés (flux save réel) | Test (MOD) | `tests/intel/ui-adaptive.test.mjs` |
| Conception + rapport | Docs (ADD) | `docs/design/MATHIC-1-0-ADAPTIVE-WINDOW.md` + `-REPORT.md` |

**PRESERVE (intouché)** : M3 policy, M4 orchestrator, M5 runtime, M7 pont — la
fenêtre élargit leur entrée, pas leur logique. `markCompleted` reste
**rétro-compatible exacte** (horizon=1 ≡ ancien comportement).

### Corrections effectuées en route

1. **MarkCompleted** : intégration d'un horizon à la primitive de progression —
   non-régressive (horizon par défaut = 1), déterministe (dépend du niveau, pas
   du profil).
2. **Driver de test M7** : le `unlockAhead(…, +3)` simulé a été **supprimé** et
   remplacé par le vrai flux produit (`markCompleted` fenêtré) — le driver devient
   un miroir exact de `b1-web.js` (UI-01..UI-10 toujours verts).
3. **Bugs de test corrigés** : profil évolutif UI-06 (comparer au dernier état),
   metadata incomplet W-07 (NOT_CERTIFIED).

## 3. Résultats — répondre aux 6 questions (style §20)

### Q1 — Où la fenêtre est-elle définie et qui l'augmente ?

**PROUVÉ** (W-01/W-03, code livré). `PROGRESSION_WINDOW = 3` et `windowOf(id, k)`
vivent dans `src/b1/levels.mjs` (la progression du jeu). La seule source
d'augmentation de |W| est `markCompleted(…, { horizon })`, appelé par `persistVictory`
sur **victoire réelle** — une fonction pure du niveau complété.

### Q2 — La Policy maximise-t-elle réellement dans W ?

**PROUVÉ** (W-04/W-05, code M3 inchangé). `recommend` reçoit `candidates` + `progression` ;
`eligibility` filtre sur `unlocked` ; le classement est `l* = argmax Score(profile,l)`.
Espace identique pour deux profils (W-07), choix déterministe (W-05).

### Q3 — La divergence est-elle visible dans le flux réel sans hack ?

**PROUVÉ** (W-06/W-06bis, UI-07). Flux save réel (markCompleted fenêtré), aucun
`unlockAhead` :

| Comportement | N1 | N2 | N3 |
| --- | --- | --- | --- |
| arithm (seed 1) | → N2 (LOW, repli) | → **N3** (LOW, repli) | → N4 (repli) |
| explorer (seed 2) | → N2 (LOW, repli) | → **N5** (APPLIED, SUFFICIENT EVIDENCE) | — |

`windowOf("N2",3)={N3,N4,N5}` → les deux chemins restent dans la fenêtre.
**DÉCOUVERT** : la reco tend vers le **front** de la fenêtre ; la divergence
visible vient surtout du seuil de confiance (LOW→repli ordinal, SUFFICIENT→front).
C'est conforme et lisible.

### Q4 — La fenêtre reste-t-elle déterministe et gouvernée par la progression réelle ?

**PROUVÉ** (W-01/W-03/W-09). Déterministe (fonctions pures), gouvernée par la
progression réelle (uniquement fonction du niveau complété + k), recadrée en fin
de catalogue. Aucun chemin ne dépend du profil pour *construire* W.

### Q5 — Le profil peut-il élargir W ?

**PROUVÉ NON** (W-07). Deux profils opposés (arithm vs explorer, confiance 0.9)
reçoivent exactement le même ensemble `eligibleLevels`. Le pouvoir du profil se
limite au choix *dans* W.

### Q6 — Non-régression / sauvegarde ?

**PROUVÉ** (W-02, suite complète). `horizon=1` ≡ comportement historique ;
suite **289/289** PASS (279 antérieurs non-régressés + W-01..09), playtest PASS,
`npm run build` PASS, `npm run build:b1` PASS (le fenêtrage est embarqué dans
`dist-b1/b1-web.js`). Les écritures restent exclusivement `markCompleted` (progression)
et `orchestrate` (setCurrent+saveNow) — invariant UI-10 inchangé.

## 4. Tableau de preuves

| # | Énoncé | Résultat |
| --- | --- | --- |
| W-01 | windowOf = {N+1..N+k}, recadrage fin | **TESTÉ** — PASS |
| W-02 | horizon=1 ≡ ancien comportement | **PROUVÉ** — PASS |
| W-03 | horizon=3 débloque exactement N+1..N+k | **TESTÉ** — PASS |
| W-04 | toute reco (repli inclus) ∈ W | **PROUVÉ** — PASS |
| W-05 | déterminisme profil+progression | **PROUVÉ** — PASS |
| W-06 | divergence réelle arithm vs explorer | **PROUVÉ** — PASS |
| W-06bis | trajectoires complètes restent dans W | **PROUVÉ** — PASS |
| W-07 | le profil n'élargit pas W | **PROUVÉ** — PASS |
| W-08 | SAFE_DEFAULT = parcours ordinal | **TESTÉ** — PASS |
| W-09 | |W| ≥ min(k, restant), recadrage | **TESTÉ** — PASS |
| UI-01..10 | non-régression intégration UI (flux réel) | **TESTÉ** — 10/10 PASS |

## 5. Limites / suite produit (hors M8)

- **Front-pinning** : la reco favorise le front de la fenêtre. Si l'on veut des
  choix de *grammaire* plus discriminants au sein de W (p.ex. explorer vs chaîneur
  à même front), ce sera l'objet du Niveau C (progression structurée par
  profil→world→classe→bande de difficulté) — pas une couche IA.
- **Fenêtre jouable** : la carte affiche jusqu'à k niveaux d'avance (décision
  produit « débloquée et jouable ») — c'est un choix d'expérience assumé.

## 6. Vérité du commit

- Commit : `feat(intel): implement adaptive progression window (M8)`
- HEAD == origin, worktree propre, tests 289/289 PASS, builds PASS.

_— Fin du rapport M8._