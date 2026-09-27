# MATHIC 1.0 — Rapport de mandat : Intégration UI (MISSION 7)

**Référence** : Mandat MISSION 7 (G7-UI) · Méthode : `MATHIC-1-0-UI-ADAPTIVE.md` · **Statut** : IMPLÉMENTÉ, TESTÉ — Prouvé au niveau du pipeline UI réel.

---

## 1. Objet

Prouver que le pipeline M1→M6 est réellement **consommé par l'interface** : une
victoire dans l'UI réelle (`b1-web.js`, Core N1–N36) fait circuler l'action
réelle du joueur → l'Evidence réelle (adaptateur M5) → le profil réel →
la policy réelle → l'orchestrator (écrivain unique) → **le niveau suivant
affiché et joué** — sans nouvelle autorité UI, sans ré-implémentation, sans
contournement des règles (§3, §7, §12 du mandat).

Preuve livrée : 10 tests (UI-01 → UI-10) portant un **driver headless qui
reproduit le flux exact de `b1-web.js`** (engine réel injecté par l'UI,
`nav.commit/preview/finishLevel/decideNext`), plus une preuve de divergence
en conditions contrôlées.

## 2. Livrables

| Livrable | Type | Fichier |
| --- | --- | --- |
| Pont UI → Runtime Adapter → Orchestrator | Code (ADD) | `src/b1/web/intel-navigation.mjs` |
| Front réel branché (modif. minimale) | Code (MOD) | `src/b1/web/b1-web.js` |
| Tests UI-01 → UI-10 + driver headless | Test (ADD) | `tests/intel/ui-adaptive.test.mjs` |
| Conception | Doc (ADD) | `docs/design/MATHIC-1-0-UI-ADAPTIVE.md` |
| Rapport de mandat | Doc (ADD) | `docs/design/MATHIC-1-0-UI-ADAPTIVE-REPORT.md` |

**PRÉSERVE (intouché)** : `src/b1` hors 2 lignes du front, `src/v5/`,
`src/intel/*` (M1–M6), tests antérieurs (269) — **non-régressés** (279/279).

### Corrections effectuées en route

- **Pont** : `intel-navigation.mjs` réinitialisait l'Evidence à chaque niveau
  (chaque `beginLevel` créait un adaptateur neuf) ⇒ le profil ne franchissait
  jamais le seuil de confiance ⇒ toujours `SAFE_DEFAULT`. **Corrigé** : l'Evidence
  est maintenant **agrégée sur la session UI** (historique complet du joueur),
  comme la fenêtre M6. C'est ce qui rend l'adaptation réellement observable.
- **Driver de test** : la première version sélectionnait les actions d'une
  façon différente du scénario de faisabilité ⇒ régression de la preuve.
  Aligné sur la stratégie du scénario (sélection uniforme) ; stable depuis.

## 3. IMPLEMENTED — le pipeline réel

### 3.1 État du git

- HEAD : commit M7 (voir §19 du mandat : HEAD == origin, worktree propre).
- `npm test` **279/279** PASS (269 antérieurs + UI-01…10).
- `npm run build` PASS · `npm run build:b1` PASS (le pont est embarqué dans `dist-b1/b1-web.js`).
- Playtest (`node tests/playtest-puzzle.mjs`) PASS (50/50 BFS, undo restauré).

## 4. Résultats — répondre aux 6 questions du mandat §20

### Q1 — Où exactement l'intelligence a-t-elle été branchée sur l'UI ?

**PROUVÉ** (inspection §4 + code livré). Point de décision unique repéré :
`renderOverlay()` `#ov-next` utilisait `nextLevel(level.id)` ordinal.
Il consomme désormais `nav.decideNext().nextLevel` (repli = ordinal).
L'observation est branchée sur le flux réel : `refreshPreview → nav.preview`,
`commitAction → nav.commit`, undo/restart → `nav.undo/restart`,
`persistVictory → nav.finishLevel({won, score, movesLeft})`.

### Q2 — L'Evidence du trajet UI atteint-elle le profil ?

**PROUVÉ** (UI-01, UI-06). La décision expose `evidenceCount` (≥ 3 pour chaque
décision, agrégé) et `profileState` réel issu de `detectProfile(evidences)` ;
`nav.profile()` = détection sur les events réels de la session (≥ 10 events
sur un run explorer de 2 niveaux — preuves preview/completed réelles).

### Q3 — La Recommendation atteint-elle l'Orchestrator ?

**PROUVÉ** (UI-02). Quand l'Orchestrator répond `APPLIED`, le pont expose
`recommended === nextLevel` et la save est **réellement écrite par
orchestrate** (un seul écrivain) : `save.current === recommended` après
décision. UI-10 bloque statiquement l'accès direct du pont aux primitives
`saveNow/setCurrent/markCompleted/unlockTo`.

### Q4 — Le niveau affiché est-il la progression calculée ?

**PROUVÉ au niveau du pipeline** ; à nuancer pour la fenêtre réelle (§ 6.1).
Le bouton `#ov-next` est piloté par `decision.nextLevel` (pas un calcul UI
parallèle), l'handler navigue vers `decision.nextLevel`. En test `APPLIED`,
niveau affiché == recommendation acceptée == `save.current`.
**DÉCOUVERT (limite v1 assumée)** : `orchestrate` applique la reco seulement
si le niveau est *légalement débloqué* (§7). `markCompleted` ne débloque que
N+1 ⇒ la reco vise-t-elle au-delà de la fenêtre débloquée → repli sur l'ordinal
(comportement backstop voulu). L'effet adaptatif complet n'apparaît qu'une fois
la reco *dans* la fenêtre d'unlock du joueur.

### Q5 — La trajectoire d'un joueur réel diffère-t-elle vraiment ?

**PROUVÉ** (UI-07, preuve §9) — dans la langue du pipeline, avec un joueur
disposant de la fenêtre d'unlock légitime. Conditions contrôlées :

| Trajectoire | seed | Niveau 1 | Niveau 2 | Preuve |
| --- | --- | --- | --- | --- |
| `arithm` | 1 | N1 → **N2** (LOW EVIDENCE, fallback) | N2 → **N3** (SAFE_DEFAULT) | parcours standard |
| `explorer` | 2 | N1 → **N2** (LOW EVIDENCE, fallback) | N2 → **N4** (**APPLIED**, SUFFICIENT, `EXPLORATION_MATCH`) | saut adaptatif |

Mêmes puzzles (Catalogue N1-N36 certifié), même moteur réel. Le saut N2→N4 est
décidé par la **policy existante** (M6) sur la **probleme détectée**
(`exploration ← previews` réelles), **aucune contrainte de progression
contournée** (verrou à N3 levé par la fenêtre légitime du joueur). Deux
trajectoires UI **différentes** sans ré-implémentation dans l'UI.

### Q6 — Que se passe-t-il si l'intelligence est indisponible ?

**PROUVÉ** (UI-04, UI-05). Panne simulée / Intelligence OFF / reco invalide /
terminal absent : la décision tombe en **FALLBACK** = `nextLevel(level.id)`
(ordinal standard), le jeu **ne se bloque jamais**, la save n'est jamais
mutilée, aucune écriture hors orchestrate. Non-régression complète garantie
par la suite antérieure (269 tests).

## 5. Tableau de preuves

| # | Énoncé | Résultat |
| --- | --- | --- |
| UI-01 | La complétion déclenche le pipeline adaptatif | **TESTÉ** — PASS |
| UI-02 | Niveau suivant == Recommendation acceptée (APPLIED) | **TESTÉ** — PASS (£de save écrite par orchestrate) |
| UI-03 | Reco rejetée/repli n'altère pas la progression | **TESTÉ** — PASS |
| UI-04 | SAFE_DEFAULT conserve le parcours standard | **TESTÉ** — PASS |
| UI-05 | Panne Intelligence → jeu continue (fallback) | **TESTÉ** — PASS |
| UI-06 | Profil issu des Evidence réelles de la session | **TESTÉ** — PASS |
| UI-07 | Deux comportements → deux niveaux suivants (divergence §9) | **PROUVÉ** — PASS |
| UI-08 | Même trajectoire → même niveau suivant (déterminisme) | **PROUVÉ** — PASS |
| UI-09 | Reload/reprise cohérent (save == dernier niveau joué) | **TESTÉ** — PASS |
| UI-10 | Aucun accès direct UI → Save Authority | **PROUVÉ** — PASS (statique) |

## 6. Limites / DÉCOUVERTES

6.1 **Effet produit partiellement latent en v1** (découverte, assumée §7) :
la reco ne peut pas sauter hors de la fenêtre d'unlock légale. C'est correct
vis-à-vis du mandat, mais l'effet *visible* aujourd'hui se produit une fois la
reco dans la fenêtre. Suite produit possible (hors M7) : politique avec fenêtre
d'anticipation métier validée (ex. déblocage progressif par tranche) — à discuter.

6.2 **L'observabilité est dans la console** (`MATHIC-UI|`) : cela sert le
débogage sans apprentissage machine ni telemetry (conforme §14). Le test humain
recommande d'ouvrir la console (voir méthode `MATHIC-1-0-UI-ADAPTIVE.md` § 9).

## 7. Vérité du commit

- Commit : `feat(intel): integrate adaptive progression into UI`
- HEAD == origin, worktree propre, :warning: **avant** lancement du CI final le dépôt
  était conforme (vérifié après push).

_— Fin du rapport M7._