# MATHIC 1.0 — MISSION 15 : FRAGMENTS DE SAVOIR

**Référence** : MISSION 15 — `FRAGMENTS DE SAVOIR` · Marges de Maggeek
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ (voir `MATHIC-1-0-KNOWLEDGE-FRAGMENTS-REPORT.md`).

---

## 1. Objet

Construire la première couche de **mémoire pédagogique persistante** de l'Atelier
Astral : les Fragments de Savoir. Un Fragment est débloqué **uniquement** à partir
d'un **fait de jeu réellement observé** (Verified Event), puis persiste
localement, séparé de la progression. Il est consultable après rechargement
sans avoir à rejouer la session.

> Un Fragment n'est pas un texte que l'on reçoit. C'est une **conséquence
> déterministe d'une expérience vérifiée**.

Ce qui n'existait pas avant :

- `src/atelier/knowledge.mjs` : la couche de connaissance (catalogue + triggers +
  évaluation pure + persistance fail-safe, **module 100% autonome**) ;
- 26 tests `KNOW-01..18` + `KNOW-M1..7` + `KNOW-ENC` ;
- panneau **📜 MARGES DE MAGGEEK** dans l'Atelier : liste ✦ débloqué / ○ inconnu,
  « encre dorée » (le lore est versionné, jamais généré).

## 2. Principe fondamental

```
Engine / Replay / Oculus   (INVARIABLES — source de vérité)
        ↓  les faits sont observés, jamais fabriqués
Verified Event / Lesson Fact
        ↓  evaluateFragmentUnlocks(evidence)  [pure]
Fragment Unlock Rule
        ↓  ids stables, ordre du catalogue
Fragment ID
        ↓  local persistence (offline-first, versionnée, fail-safe)
KnowledgeState { schemaVersion: 1, unlockedFragments: [] }
        ↓  présentation diégétique statique (no LLM)
Lore Presentation
```

Interdit et maintenu interdit :

```
Lore → inventer → règle mathématique
```

Le lore **met en scène** le fait technique (`fact` et `body` sont deux champs
distincts d'un Fragment : FAIT TECHNIQUE / INTERPRÉTATION NARRATIVE).

## 3. Identité des Fragments

Identifiant **stable**, indépendant de toute position LADDER, numéro de niveau,
score ou index de tableau :

```
LORE_ATELIER_001          L'Atelier Astral          (première résolution)
LORE_CHRONOS_001          Marges de Chronos         (rewind réel exécuté)
LORE_ENGINE_FAILFAST_001  Marges du Validateur      (analyse Oculus réelle)
LORE_MAGEEK_001           L'apprentissage par trace (erreur inspectée, PUIS réussite)
LORE_ALJABR_001           Sceau & transmission      (Sceau forgé, PUIS défi résolu)
```

Catégories utilisées (du jeu fixé : `WORLD MATH ENGINE MAGEEK ATELIER` — ici
ATELIER, ENGINE ×2, MAGEEK, WORLD ; MATH volontairement **non** peuplée tant
qu'aucun fait mathématique n'est exigé).

## 4. Modèle

```
KnowledgeFragment {
  id        (stable, page 3)
  title     (court, affiché dans la liste)
  body      (lore narratif — contenu statique versionné)
  fact      (le fait technique réel qui justifie le fragment — artefact de la séparation)
  category  (WORLD | MATH | ENGINE | MAGEEK | ATELIER)
  version   (entier, version du CONTENU — pas la progression)
}
```

`KnowledgeState` (persistance) :

```
KnowledgeState {
  schemaVersion: 1,
  unlockedFragments: [fragmentId, ...],   // union monotone, dédupliquée, triée
}
```

## 5. Déverrouillage — évaluation pure

```
evaluateFragmentUnlocks(evidence) → [nouveaux ids candidats]
```

- **Purement fonctionnelle** : aucune mutation implicite.
- Entrées : une **séquence d'observations réelles** prise en chronologie
  (la séquence fait PARTIE de l'évidence ; évaluer ne réordonne jamais rien) :
  `CHALLENGE_COMPLETED` (transition réelle `getState().solved`), `REWIND_USED`
  (curseur réellement déplacé par back/backToStart), `UNDO_USED`, `OCULUS_STATE_ANALYZED`,
  `OCULUS_ACTION_ANALYZED` (`valid`/`offered`/`reasonCode` réels de l'Oculus),
  `OCULUS_REJECTION_OBSERVED` (`!valid` ou `!offered` — erreur inspectée),
  `SEAL_CREATED` (encodeSeal réel réussi).
- Sortie : ids candidats dans l'ordre du catalogue. L'union avec l'état courant
  est ensuite faite par `applyUnlocks` (monotone + idempotente).

## 6. Triggers (petit corpus démonstratif)

| Fragment | Condition (évidence) | Fait source réel |
|---|---|---|
| LORE_ATELIER_001 | `CHALLENGE_COMPLETED` vu dans la séquence | transition solved du moteur |
| LORE_CHRONOS_001 | `REWIND_USED` vu dans la séquence | seek/back/backToStart a déplacé le curseur replay |
| LORE_ENGINE_FAILFAST_001 | `OCULUS_ACTION_ANALYZED` vu dans la séquence | analyzeAction réel de l'Oculus |
| LORE_MAGEEK_001 | un `OCULUS_REJECTION_OBSERVED` **précède** un `CHALLENGE_COMPLETED` | erreur inspectée PUIS nouvelle réussite (ordre vérifié) |
| LORE_ALJABR_001 | un `SEAL_CREATED` **précède** un `CHALLENGE_COMPLETED` | Sceau forgé PUIS défi résolu |

Aucun trigger n'est relié à un bouton « ouvert » : uniquement à des
**comportements réellement exécutés** (rewind effectué, analyse effectuée,
Sceau forgé, état résolu au curseur).

## 7. Monotonie & idempotence

- **Monotonie** : `K_{t+1} ⊇ K_t`. Les nouvelles expériences n'ajoutent que des
  ids ; un Fragment débloqué n'est **jamais** retiré (§10).
- **Idempotence** : `unlock(F) + unlock(F) = unlock(F)` — second appel → `NO_OP`,
  aucun doublon, aucune réécriture inutile du stockage (§11).
- **Déterminisme** : `F(E) = F(E)` quel que soit l'ordre d'évaluation, le reload,
  l'ordre des appels UI, l'état du stockage préexistant.

## 8. Persistance & fail-safe

- Clé dédiée : `mathic.knowledge.v1` — **jamais** mélangée à la sauvegarde de
  progression (progression ≠ connaissance).
- Le module n'importe **rien** : le backend (`get/set`) est injecté par l'UI.
  En test : backend mémoire ; en UI : Web Storage local.
- `decodeKnowledgeState` ne **throw** jamais :
  - JSON invalide → état vide + raison `corrupted-json` ;
  - `schemaVersion` inconnue → état vide + raison `unknown-schema-version` ;
  - fragment inconnu / doublon → **ignoré** (dédupliqué, jamais inventé) ;
  - champ manquant → état vide + raison `missing-field`.
- Si le backend échoue (stockage indisponible) → bascule **mémoire**,
  l'Atelier continue, `KNOW-18` le vérifie.

## 9. UI

Panneau 📜 **MARGES DE MAGGEEK**, léger (pas d'inventaire gigantesque) :

```
✦ L'Atelier Astral · ATELIER        (déverrouillé → <details> fact + body)
○ Marges de Chronos · ENGINE
○ Marges du Validateur · ENGINE
○ L'apprentissage par la trace · MAGEEK
○ Sceau & transmission · WORLD
```

- `✦` = débloqué (le contenu se déplie) ; `○` = inconnu (titre seul, encre pâle).
- Les observations sont branchées sur les **vrais handlers** : `place`/`renderBoard`
  (transition solved), `btn-back`, `btn-start`, `btn-undo`, `renderOculusState`,
  `oculusAttempt`, `btn-seal`. Aucun événement fantôme.
- `observe()` n'écrit jamais de Fragment orphelin : la séquence de session et
  l'état de connaissance vivent dans `knowledge.mjs` ; l'UI affiche seulement.

## 10. Do Not Do (réaffirmé)

Pas de monnaie, pas d'économie, pas de réseau, pas de compte, pas de LLM, pas de
lore à la volée, pas de `Math.random`, pas de `Date.now`, pas de suppression de
Fragments acquis, pas de modification d'Engine/Solver/Oculus/Sablier pour
« fabriquer » des triggers, pas de mélange Fragments/progression.

## 11. Critère de réussite

```
EXPÉRIENCE RÉELLE → FAIT OBSERVÉ → TRIGGER → FRAGMENT → PERSISTANCE → RELOAD → FRAGMENT TOUJOURS PRÉSENT
```

et « Lore/stockage indisponible ne casse jamais l'Atelier » — c'est la chaîne
démontrée par M15 (tests KNOW-04, KNOW-16, KNOW-17, KNOW-18 + §9/§10 du rapport).