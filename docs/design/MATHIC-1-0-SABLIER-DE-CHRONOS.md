# MATHIC 1.0 — MISSION 13 : SABLIER DE CHRONOS (Replay Controller)

**Référence** : MISSION 13 — `SABLIER DE CHRONOS` · Atelier Astral
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ (voir `MATHIC-1-0-SABLIER-DE-CHRONOS-REPORT.md`).

---

## 1. Objet

Transformer `replay(spec, events)` — primitive technique existante du moteur V5 —
en une mécanique utilisable par le joueur : **le Sablier de Chronos**. Le joueur
joue, accumule une **trace réelle**, ouvre le Sablier, revient à un état
antérieur, inspecte la bifurcation, puis reprend la session… sans jamais quitter
la déterminisme du moteur.

> « Remonte le temps. Observe ton erreur. Trouve l'instant où ton raisonnement a bifurqué. »

Le Sablier **ne remonte pas réellement le temps** : il **reconstruit exactement
un état historique** à partir de la trace déterministe, via `replay(spec, events)`.

Ce qui n'existait pas avant, et que cette mission matérialise :

- `src/atelier/replay-controller.mjs` : contrôleur de replay pur, adossé au
  moteur V5 (aucun état artisanal, aucune inversion mathématique) ;
- 20 tests `REPLAY-01..16 + REPLAY-C/D/E` ;
- un panneau **⌛ Sablier de Chronos** dans l'Atelier (diégétique, données du
  replay réel) : Origine · Revenir · Annuler · Reprendre · barre de progression ;
- le contrat **`INVALID → NO STATE CHANGE → NO TRANSITION`** vérifié en test.

## 2. Sémantique inspectée (décision de conception §8 du mandat)

Avant d'écrire quoi que ce soit, l'implémentation réelle de `replay` a été lue :

- `replay(spec, events)` : `createSession(spec)` puis, pour chaque événement,
  `apply(s, {id:"PLACE",...})` ; un événement impossible **throw** un
  `TypeError`. Le replay est une **fonction pure du préfixe** : sa sortie ne
  dépend que de `(spec, E[1..k])`, rien d'autre. Il n'y a **pas de notion de
  « présent »** dans le moteur : chaque état est redérivable de zéro.

**Conséquence** — le modèle §8 retenu est le **modèle branche** :

```
A B C
  ↓ retour B
A B D
```

La trace reste une **liste plate unique** ; la position du curseur définit le
présent ; un coup valide joué depuis une position temporelle tronque le futur et
crée une branche. Le second modèle (§8 « historique ») est **écarté** : il
exigerait un deuxième historique, explicitement interdit au §15 (« créer un
deuxième historique ») et il n'y a pas de support moteur pour deux lignes
temporelles — l'état historique est redérivé, pas conservé.

## 3. Architecture (aucun nouveau moteur)

```
PLAYER
  ↓
UI Atelier (src/atelier/web/atelier.js)
  ↓
Replay Controller (src/atelier/replay-controller.mjs)   ← NEW
  ↓
replay(spec, events) → Game State (src/v5/rules/engine.mjs — INTACT)
```

Interdits respectés : pas de mutation directe d'état par l'UI ; pas de
reconstruction approximative ; pas de deuxième historique ; pas d'annulation
manuelle d'opérations ; pas d'inversion mathématique pour fabriquer un undo.

## 4. Modèle temporel & curseur

Soit `E = [e_1, ..., e_n]` la trace **réelle des événements commis** (uniquement
les `PLACE` validés par le moteur). Soit `S_0 = createSession(spec)`. Alors :

```
S_k = getState(replay(spec, E[1..k]))    pour tout k ∈ [0, n]
S_0 = getState(createSession(spec))      (replay d'une trace vide)
```

**ReplayCursor** : `{ position, total }` avec `position = 0` = état initial et
`position = total = n` = état courant. `assertCursor` rejette toute valeur hors
bornes (`RangeError`), jamais d'état incohérent — **jamais** de clamp silencieux
dans `seek` (REPLAY-06) ; `back` est une navigation sûre clampée à 0 (REPLAY-06b).

### Comportements (REPLAY-04/05/06)

| Déplacement | API | Effet |
|---|---|---|
| Retour d'un cran | `back(1)` | `position → max(0, position-1)` |
| Retour de k crans | `back(k)` | `position → max(0, position-k)` |
| Retour à l'origine | `backToStart()` | `position → 0` |
| Retour au présent | `toPresent()` | `position → total` |
| Position explicite | `seek(k)` | rejet hors bornes (RangeError) |
| Rejeter le dernier coup | `undo()` | tronque la trace + `position-1` |

Chaque déplacement retourne `getState(replay(spec, E[1..k]))` — **l'état du
moteur**, jamais un état construit par l'UI.

## 5. Actions & INVALID (contrat IND-solution)

```
APPLY(s, cmd) === null  →  INVALID
```

Une action invalide ne doit **ni avancer le curseur, ni créer de transition, ni
produire d'état intermédiaire, ni être comptée comme `PLACE`** :

```
INVALID
  ↓
cursor unchanged · state unchanged · trace unchanged
```

Le contrôleur appelle `apply(current, cmd)` et, sur `null`, retourne
`{ ok:false, reason:"ILLIGAL_PLACE" }` sans modifier `position` ni `trace`
(REPLAY-09). Aucun événement invalide n'entre dans la trace.

Action **valide** : `apply` retourne un nouvel état → l'événement créé (`next.events.at(-1)`)
est **le seul** à entrer dans la trace, via `trace = [...trace.slice(0, position), event]`
(branche), puis `position = trace.length`.

## 6. Déterminisme & propriété fondamentale

Pour tout `0 ≤ k ≤ n` :

```
Replay(spec, E, k) = replay(spec, E[1..k])
```

Deux chemins d'accès au même instant donnent le même état (REPLAY-15) :
- jouer directement jusqu'à k, et
- jouer jusqu'à n puis replier vers k.

« Deux replays identiques → états byte-identiques » (REPLAY-07/08) ; « même spec
+ mêmes events → même résultat » quel que soit le chemin (REPLAY-10, branche).

## 7. Performance (mesurée, pas devinée)

`replay` est en `O(k)` par déplacement. Prototype conservé en `O(n)` par
déplacement — mesures réelles sur une session 4×4 résolue en 16 coups :

| Opération | Mesure |
|---|---|
| `seek` aller-retour complet (2n+1 déplacements, n=16) | 6.762 ms → **0.20 ms / déplacement** |
| `toPresent()` (replay plein, n=16) | 0.235 ms |

Aucune optimisation (snapshots `O(log n)`, replay partiel) n'est justifiée :
le coût par déplacement est sub-milliseconde. Les snapshots permanents sont
évités — le contrôleur ne stocke **aucun** SessionState intermédiaire.

## 8. UI — Sablier de Chronos (diégétique)

Panneau `⌛ Sablier de Chronos` dans l'Atelier (build `dist-atelier`) :

```
⟲ Origine   ← Revenir   Annuler   Reprendre
───────●───────────         4 / 9
```

- **barre de progression** : curseur `position` sur `total`, aspect devenant
  violet en mode historique ; filtre **sépia** sur la grille en mode historique
  (UI ONLY, aucun effet moteur) ;
- **lecture** : « Coup X / total Y » + statut « Présent — la trace est vivante »
  ou « Historique — état au coup X/Y (replay réel). Jouer ici crée une branche. » ;
- **plaçage** : en mode historique, jouer une valeur = branche (trace refluée,
  `setStatus("Branche créée — la trace a reflué.")`).

La donnée affichée vient **toujours** de `getState(replay(spec, E[1..k]))`.

## 9. PRESERVE (respecté)

Engine · Math Kernel · Solver · Evidence · Profile · Policy · Orchestrator ·
Save · Progression · Sceau · contrat de déterminisme · contrat
`INVALID → NO STATE CHANGE`. Nouveau code seulement dans
`src/atelier/**`, `tests/atelier/**`, `docs/design/**` (+ UI Atelier).

## 10. Verrou final attendu

`REPLAY-01..16 PASS` (20 tests) · `npm test` PASS (347) · playtest 50/50 PASS ·
`npm run build` PASS · `npm run build:atelier` PASS · `git diff --check` PASS ·
worktree propre · `HEAD == origin` après push.