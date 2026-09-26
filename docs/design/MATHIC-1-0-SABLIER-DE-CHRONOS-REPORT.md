# MATHIC 1.0 — Rapport de mandat : Sablier de Chronos (MISSION 13)

**Référence** : MISSION 13 — `SABLIER DE CHRONOS` · Méthode : `MATHIC-1-0-SABLIER-DE-CHRONOS.md`
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ. Aucune anomalie bloquante.

---

## 1. Objet atteint

Le mandat est **machine-vérifié** de bout en bout :

```
Jouer → Trace réelle (events moteur uniquement)
  → ⌛ Sablier → Revenir/Origine → inspecter l'état historique (replay réel)
  → Reprendre (présent) → ou Jouer depuis l'histoire → Branche (futur tronqué)
  → Rejouer → déterminisme vérifiable byte-identique
```

avec, en fin de mission :

- REPLAY-01..16 PASS (**20 tests** : REPLAY-01..16 + REPLAY-C/D/E) ;
- `npm test` **PASS (347 tests)**, dont 20 Sablier ;
- `npm run build` PASS · `npm run build:atelier` PASS ;
- playtest 50/50 PASS (coups parfaits ; coups fautifs + undo restaurent la solvabilité) ;
- perf mesurée : **0.20 ms / déplacement** sur une session 4×4 de 16 coups ;
- `git diff --check` PASS · worktree propre après commit (à vérifier au verrou).

## 2. Preuve de déterminisme (la propriété fondamentale)

Sortie du banc `REPLAY-15` + vérification `verify()` :

```
seq_ui   = [ getState(c, seek(k)) for k in 0..4 ]   (replay réel au curseur)
seq_repl = [ replay(spec, E[1..k])   for k in 0..4 ] (moteur, séparément)

canonical identiques à chaque graduation →
   seq_ui ≡ seq_repl    byte-for-byte
```

Deux chemins d'accès au même instant — jouer jusqu'à k, ou jouer jusqu'à n puis
replier vers k — produisent le **même état** (REPLAY-08/10/15). `canonicalAtCursor()`
n'est jamais reconstruit par l'UI : c'est `canonical(replay(spec, E[1..k]))`.

## 3. Constats moteur vérifiés en code

| Point | Constat vérifié |
|---|---|
| `replay(spec, events)` | `createSession(spec)` + `apply` successifs ; événement impossible → `TypeError`. **Fonction pure du préfixe** : pas de mémoire du « présent ». |
| `apply(s, cmd) === null` | = **INVALID** : aucun état, aucun événement. → Aucune trace possible d'un coup invalide. |
| modèle branche (§8 décision) | retenu : trace = **liste plate unique** (pas de deuxième historique), futur tronqué. |
| `getState` (moteur) | `{grid, reserve, solved, moves}` — la source de vérité exposée au curseur. |
| `canonical` (moteur) | `JSON.stringify([state.grid])` — le hash de référence entre contrats. |
| Progression/Save/Policy | `replay-controller.mjs` n'importe que `engine.mjs` : **aucune** ref à Save/Policy/Intelligence (REPLAY-13/14). |

## 4. Résultats tests

### REPLAY-01..16 (résumé)

| Test | Résultat |
|---|---|
| REPLAY-01 trace vide → état initial (curseur 0) | PASS |
| REPLAY-02 1 événement → état exact = replay(spec,[e]) | PASS |
| REPLAY-03 N événements → état exact (4 coups, solve) | PASS |
| REPLAY-04 seek(0) → état initial exact | PASS |
| REPLAY-05 seek(total)=toPresent() → état courant exact | PASS |
| REPLAY-06 seek hors bornes → RangeError, aucun effet | PASS |
| REPLAY-06b back/toPresent conservent les bornes | PASS |
| REPLAY-07 replays identiques → canonical byte-identique | PASS |
| REPLAY-08 même spec+events → même résultat (tout chemin) | PASS |
| REPLAY-09 action invalide → aucune transition (curseur/état/trace) | PASS |
| REPLAY-10 undo + replay → branche déterministe | PASS |
| REPLAY-11 session résolue → replay en lecture sans altérer la vérité | PASS |
| REPLAY-12 le Sablier n'écrit aucune sauvegarde | PASS |
| REPLAY-13 replay-controller n'importe ni Policy ni Intelligence | PASS |
| REPLAY-14 replay-controller n'utilise aucun réseau | PASS |
| REPLAY-15 séquence UI == séquence replay du moteur | PASS |
| REPLAY-16 reload → même spec+events → même résultat | PASS |
| REPLAY-C spec invalide → fail-fast au constructeur | PASS |
| REPLAY-D déterminisme à travers plusieurs graduations | PASS |
| REPLAY-E validateSpec reste le gardien (aucun état sans spec valide) | PASS |

### Fixtures utilisées

- `SPEC_A` (2×2, correspondant au preset SUM2X2 : lignes 5/7, colonnes 4/8,
  réserve `{2:2,3:1,5:1}`) — repris des tests Sceau existants ;
- solution canonique terminale `[[[2,3],[2,5]]]` ;
- `SPEC_B` (2×2 mixte `*`/`-`/`+`).

### Performance mesurée (Rapport §13)

| Opération | Mesure |
|---|---|
| `seek` sur les 2 sens, session 16 coups | 6.762 ms au total → **0.205 ms / déplacement** |
| `toPresent()` (replay plein, n=16) | 0.235 ms |

```
trace length: 16 · canonical len: 50
timeline seek (2n+1): 6.762 ms → 0.2049 ms/déplacement
toPresent(): 0.235 ms   verify ok: true moves: 16
```

Aucune optimisation nécessaire : pas de snapshot permanent (le contrôleur ne
stocke **aucun** état intermédiaire), replay `O(k)` par déplacement suffit.

## 5. Atelier Astral (UI adaptée)

Le panneau **⌛ Sablier de Chronos** est ajouté dans l'UI Atelier (build
`dist-atelier/`) :

- **barre de progression** `position/total` (CSS `width` animée ; vite trace
  violette en mode histoire, or au présent) ;
- contrôles : **⟲ Origine** (`backToStart`) · **→ Revenir** (`back(1)`) ·
  **Annuler** (`undo`) · **Reprendre** (`toPresent`) — chacun passant par le
  ReplayController, jamais par l'adapter ni par l'Engine ;
- **filtre sépia** sur la grille en mode historique — strictement visuel, sans
  aucun effet sur les données (l'état affiché reste `getState(replay(spec,E[1..k]))`) ;
- statut : « Présent — la trace est vivante » / « Historique — état au coup X/Y
  (replay réel). Jouer ici crée une branche. » ;
- branche : jouer une valeur depuis l'histoire → `setStatus("Branche créée — la
  trace a reflué.")`, la trace reflue, le présent devient le nouveau futur.

Adaptation **minimale** et légitime : l'UI Atelier était déjà autorisée à évoluer
(§2 du mandat). Le moteur est **intact** ; seul le fichier UI (`atelier.js`,
`index.html`, `atelier.css`) est passé de `createV5GameAdapter` au
ReplayController — la grille, le HUD et le Sceau gardent exactement le même
comportement de surface.

## 6. Respect des interdits — vérifié

- `git status` : ajouts M13 = `src/atelier/replay-controller.mjs`,
  `tests/atelier/replay.test.mjs`, doc méthode + rapport ; modifs = les **3
  fichiers UI Atelier** (adaptation autorisée). `git diff` : aucun fichier hors
  `src/atelier/**`, `tests/atelier/**`, `docs/design/**` ;
- aucun import réseau dans `replay-controller.mjs` (REPLAY-14) ;
- ni Policy, ni Intelligence, ni Save, ni Progression importés (REPLAY-12/13) ;
- Engine/Solver/Policy/Orchestrator/Save/B1/main.js : **intacts** (diff vide).

## 7. Fichiers de la mission

```
src/atelier/replay-controller.mjs             NEW
tests/atelier/replay.test.mjs                 NEW
src/atelier/web/index.html                    MODIFIED (panneau Sablier + HUD)
src/atelier/web/atelier.js                    MODIFIED (UI sur ReplayController)
src/atelier/web/atelier.css                   MODIFIED (timeline, sépia histoire)
docs/design/MATHIC-1-0-SABLIER-DE-CHRONOS.md  NEW
docs/design/MATHIC-1-0-SABLIER-DE-CHRONOS-REPORT.md  NEW
```

## 8. Décisions de conception (tranchées en cours de mission)

1. **Modèle branche vs historique** : après lecture de `replay`, le **modèle
   branche** est retenu — la trace reste une liste plate unique et un coup depuis
   l'histoire tronque le futur. Le modèle historique exigeait un second
   historique, explicitement exclu au §15 du mandat.
2. **`seek(k)` strict vs clampé** : `seek` est **strict** (hors bornes → `RangeError`)
   car c'est une API de calcul ; `back` est **clampé** (navigation du joueur) et
   `backToStart` remet à 0. Deux contrats distincts, chacun testé (REPLAY-06/06b).
3. **`undo` tronque la trace** : annuler un coup n'inverse **jamais** les
   opérations réservoir/objectif (pas d'inversion mathématique interdite) — il
   retire simplement l'événement final, ce que le moteur recompute de toute façon.
4. **INVALID ne produit pas d'événement** : le contrôleur ré-utilise `apply` (le
   même gardien que la partie) au lieu de construire l'événement lui-même.

## 9. Limites et suite

- **`seek` est `O(k)`** : indexé par replay partiel, il reste sub-milliseconde
  sur les traces du prototype (0.2 ms). Si une trace de centaines de coups devenait
  un vrai scénario de jeu, un cache de *branches* (pas de snapshots permanents)
  serait la première optimisation mesurée — seulement si nécessaire.
- **Le futur tronqué est oublié** : la branche n'est pas multi-ligne de monde
  (interdit). Le joueur laisse son autre futur dans le récit, pas dans le code.
- **Suite (feuille de route)** : M14 Oculus (visualiser la déduction du moteur),
  M15 Fragments de Savoir, M16 Symbiote des Gardiens. Le Sablier est la première
  mécanique de **rejeu authentique** : M14 visualisera le *raisonnement*, pas
  seulement l'état — le ReplayController en est le socle (états purs, adressables).