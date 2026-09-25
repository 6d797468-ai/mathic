# MATHIC 1.0 — Rapport de mandat : Fragments de Savoir (MISSION 15)

**Référence** : MISSION 15 — `FRAGMENTS DE SAVOIR` · Méthode : `MATHIC-1-0-KNOWLEDGE-FRAGMENTS.md`
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ. Aucune anomalie bloquante.
**Baseline** : M14 = `71df85b` · **Livrable** : voir §14 (commit) — HEAD == origin, worktree clean.

Résumé des preuves, classées selon la nomenclature en vigueur :

- **PROUVÉ** (vérifié machine/source) : déterminisme de `F(E)=F(E)` (KNOW-06,
  KNOW-16, KNOW-ENC), monotonie (KNOW-M1), idempotence (KNOW-03, KNOW-M2),
  compatibilité d'union (KNOW-M3), non-mutation GameState (KNOW-13), séparation
  progression/knowledge (KNOW-14, module sans aucun import), zéro réseau (KNOW-15),
  zéro hasard/horloge (KNOW-M6), corruption → fallback (KNOW-07/08/09), stockage
  indisponible → Atelier continue (KNOW-18), toutes les builds + playtest + git.
- **OBSERVÉ** : sorties réelles de `analyzeAction`/`encodeSeal`/`replay` branchées
  sur les triggers (KNOW-10/11/12), comportement UI au build atelier.
- **EXPÉRIMENTAL** : les triggers séquencés (MAGEEK, ALJABR) exigent un ordre
  témoigné par la séquence — oui, la chronologie est une partie de l'évidence.
- **NON PROUVÉ** : aucune mesure de difficulté linguistique de Maggeek, aucun
  LLM, aucune économie, aucune monnaie — hors champ, non introduits.

---

## 1. Modèle de persistance (§4 mandate)

- `KnowledgeState { schemaVersion: 1, unlockedFragments: [] }` — trié par ordre
  du catalogue, dédupliqué. Clé dédiée `mathic.knowledge.v1` dans Web Storage.
- `KnowledgeFragment { id, title, body, fact, category, version }` — contenu
  **statique** versionné ; `fact` (technique) et `body` (lore) séparés (§2 de la
  méthode, exigence §23 : jamais de lore qui crée un faux fait technique).
- Le module `src/atelier/knowledge.mjs` est **100% autonome** (aucun import) :
  le backend `{get,set}` est injecté (Web Storage en UI, mémoire en test).

## 2. Liste des Fragments

| id | catégorie | titre |
|---|---|---|
| `LORE_ATELIER_001` | ATELIER | L'Atelier Astral |
| `LORE_CHRONOS_001` | ENGINE | Marges de Chronos |
| `LORE_ENGINE_FAILFAST_001` | ENGINE | Marges du Validateur |
| `LORE_MAGEEK_001` | MAGEEK | L'apprentissage par la trace |
| `LORE_ALJABR_001` | WORLD | Sceau & transmission |

## 3. Triggers (fondés sur des comportements réels, jamais des boutons « ouverts »)

| trigger | évidence | source réelle checkée |
|---|---|---|
| LORE_ATELIER_001 | `CHALLENGE_COMPLETED` | transition réelle de `getState().solved` au curseur (rendu board) |
| LORE_CHRONOS_001 | `REWIND_USED` | `ctrl.back(1)` / `ctrl.backToStart()` exécutés (curseur déplacé) |
| LORE_ENGINE_FAILFAST_001 | `OCULUS_ACTION_ANALYZED` | `analyzeAction` réel de l'Oculus |
| LORE_MAGEEK_001 | `OCULUS_REJECTION_OBSERVED` puis `CHALLENGE_COMPLETED` | `!valid` ou `!offered` réel, SUIVI d'une résolution |
| LORE_ALJABR_001 | `SEAL_CREATED` puis `CHALLENGE_COMPLETED` | `encodeSeal(spec)` réel réussi, SUIVI d'une résolution |

`OCULUS_REJECTION_OBSERVED` = l'Oculus a conclu un rejet réel (`reasonCode`) OU
une incantation acceptée par `apply` mais écartée par `getMoves` — les deux faits
sont des sorties réelles, aucun coupable inventé. Le corps du fragment cite
exactement le fait (§16—18 mandate respectés).

## 4. Faits sources

- Engine : `getState` (`solved`, `moves`), `apply`, `getMoves` — via ReplayController
  (M13) et Oculus (M14) ; **aucun module moteur modifié**.
- Sceau (M12) : `encodeSeal(spec)` → événement `SEAL_CREATED`.
- Sablier (M13) : `back`/`backToStart`/`undo` → `REWIND_USED`/`UNDO_USED`.
- Oculus (M14) : `analyzeAction`/`analyzeState` → `OCULUS_ACTION_ANALYZED`,
  `OCULUS_STATE_ANALYZED`, `OCULUS_REJECTION_OBSERVED`.
- Aucun de ces modules (M12/M13/M14) n'a été modifié pour « fabriquer » un trigger :
  ils sont **observés**, pas instrumentés.

## 5. Tests

`npm test` global : **402 PASS** (376 existants + 26 nouveaux).
Nouveaux tests `tests/atelier/knowledge.test.mjs` — **26 PASS** :

| id | contrat |
|---|---|
| KNOW-01 | état initial sans Fragment |
| KNOW-02 | premier trigger → Fragment débloqué |
| KNOW-03 | appel identique → NO_OP, aucun doublon |
| KNOW-04 | persist → reload → Fragment présent |
| KNOW-05 | deux triggers → deux Fragments distincts |
| KNOW-06 | ordre d'évaluation différent → même ensemble (pureté) |
| KNOW-07 | JSON invalide → fallback sûr |
| KNOW-08 | version inconnue → fallback sûr |
| KNOW-09 | fragment inconnu / doublon → ignoré/dédupliqué |
| KNOW-10 | analyse réelle Oculus → LORE_ENGINE_FAILFAST_001 |
| KNOW-11 | rewind réel (curseur déplacé) → LORE_CHRONOS_001 |
| KNOW-12 | Sceau réel + résolution → LORE_ALJABR_001 |
| KNOW-13 | aucune mutation GameState |
| KNOW-14 | module sans aucun import : connaissance ≠ progression |
| KNOW-15 | aucune dépendance réseau |
| KNOW-16 | F(E)=F(E) — pureté, reload inclus |
| KNOW-17 | reload UI → bibliothèque intacte |
| KNOW-18 | storage indisponible → fallback mémoire, Atelier continue |
| KNOW-M1 | monotonie K_{t+1} ⊇ K_t |
| KNOW-M2 | unlock répété → jamais plus d'une entrée |
| KNOW-M3 | F(E1∪E2) = F(E1)∪F(E2) (monotones indépendants) |
| KNOW-M4 | MAGEEK exige rejet PUIS réussite (ordre réel) |
| KNOW-M5 | getFragment/listFragments — lookup direct (perf triviale) |
| KNOW-M6 | aucun `Math.random` / `Date.now` |
| KNOW-M7 | triggers disjoints → fragments disjoints |
| KNOW-ENC | encode déterministe (byte-stable, ids triés) |

## 6. Comportement corruption

| cas | résultat `decodeKnowledgeState` |
|---|---|
| JSON invalide | état vide + `reason: corrupted-json` |
| `schemaVersion` inconnue | état vide + `reason: unknown-schema-version` |
| fragment inconnu | rejeté (id absent du catalogue → ignoré) |
| ID dupliqué | dédupliqué (1 occurrence) |
| champ manquant | état vide + `reason: missing-field` |

Jamais de throw, jamais de blocage de session (§13 mandate).

## 7. Intégration Oculus

`oculusAttempt` observe `OCULUS_ACTION_ANALYZED` (avec `valid`, `offered`,
`reasonCode` réels) et, si l'action est rejetée (`!valid`) ou écartée par la loi
(`valid && !offered`), observe `OCULUS_REJECTION_OBSERVED`. `renderOculusState`
observe `OCULUS_STATE_ANALYZED`. Le fragment MAGEEK ne peut se déverrouiller que
si une telle inspection a réellement précédé une résolution.

## 8. Intégration Sablier

`btn-back`/`btn-start` observent `REWIND_USED` **après** que le ReplayController a
réellement déplacé le curseur (les boutons sont désactivés à la position 0 : un
clic observé est toujours une navigation effective). `btn-undo` observe `UNDO_USED`
(la branche est réellement tronquée). Aucun déclenchement au simple survol.

## 9. Intégration Sceau

`btn-seal` observe `SEAL_CREATED` **seulement** si `encodeSeal(spec)` a réussi (try
autour de l'appel : un Sceau invalide n'est jamais un événement). `LORE_ALJABR_001`
exige ensuite la résolution réelle du défi.

## 10. UI

Panneau 📜 MARGES DE MAGGEEK (section 4 de `index.html`) : liste ✦/○ par ordre du
catalogue, `details/summary` pour les fragments déverrouillés (FAIT technique en
mono pâle, corps narratif en italique doré), note en pied indiquant le mode de
mémoire (`persistent` / `memory`). Aucun inventaire géant, aucune grille de
collection, aucune image.

## 11. Performance

- Évaluation : parcours direct d'une séquence de session (petite) ; union sur un
  tableau trié ; lookup `fragmentId → fragment` via `Map` (§21 mandate : recherche
  directe, pas de base de données, pas de worker, pas de cache).
- Coût mesuré au module : évaluation + union + (éventuelle) sérialisation d'un
  KnowledgeState à ≤ 5 ids — travail sub-milliseconde, aucun snapshot.

## 12. Build

- `npm test` → **402 PASS** (playtest 50/50 + undo 50/50 inclus dans le suite).
- `npm run build` → pass (moteur V5 + orchestration intact).
- `npm run build:atelier` → pass (10 modules transformés, dist-atelier émis).

## 13. Playtest & intégrité

- Playtest inclus dans `npm test` : 50/50 parfait · 50/50 fautif (blocage
  détecté 0 faux positif, undo restaure la solvabilité 50/50).
- `npm run build` / `build:atelier` : PASS.
- `git diff --check` : CLEAN.
- Engine / Solver / Kernel / Evidence / Profile / Policy / Orchestrator / Save /
  Progression (M1–M9) / Sceau (M12) / Sablier (M13) / Oculus (M14) : **intacts**.

## 14. Commitment & distance

| item | valeur |
|---|---|
| baseline | `71df85b` (M14) |
| commit | cf. HEAD (messages : `m15(memory): Fragments de Savoir — Marges de Maggeek (…pour la suite)` 1 seul commit) |
| push | `git push origin kali/v5-gameplay-lab` ✓ |
| HEAD == origin | ✓ |
| worktree | clean |

## 15. Conformité aux exigences textuelles

- `progression ≠ connaissance` : clé séparée, module sans import, aucun couplage
  avec les modules de sauvegarde (KNOW-14).
- `récompense = fait, jamais monnaie` : aucun score, aucune monnaie, aucune
  économie introduite.
- `idempotence` / `monotonie` / `déterminisme` : tests KNOW-03, KNOW-06, KNOW-16,
  KNOW-M1..M3.
- `pas de bouton « ouvert »` : triggers sur comportements exécutés (
  §7/8/9).
- `Lore OFF / storage unavailable` : KNOW-18 + fallback mémoire du store, l'Atelier
  ne dépend jamais du lore.