# MATHIC 1.0 — INTÉGRATION UI DE L'ADAPTIVE PROGRESSION (MISSION 7)

**Statut : TERMINÉE** — Mission : `M7 INTÉGRATION UI DE L'ADAPTIVE PROGRESSION` (branche `kali/v5-gameplay-lab`).
**Prérequis :** M1 → M2 → M3 → M4 → M5 → M6 (runtime, profils, policy, orchestrator, expérience M6).

---

## 1. But

Brancher la chaîne M1→M6 sur l'interface *réelle* du produit (Core N1–N36, `src/b1/web/b1-web.js`)
afin qu'un joueur réel produise une progression calculée par l'intelligence — **sans** qu'on ré-implémente
aucune intelligence dans l'UI, et **sans** qu'une nouvelle grammaire de niveau (COMBINATION/MASTERY) soit
introduite (hors périmètre M7, documenté comme information de couverture).

Définition de fini (§18 mandat) : UI → Engine réel → Evidence réelle → profil réel → policy réelle →
orchestrate (écrivain unique) → save → **niveau suivant affiché**, où deux comportements différents
peuvent produire des progressions différentes **sans contourner les règles du jeu**.

## 2. Surface livrée

| Fichier | Rôle |
| --- | --- |
| `src/b1/web/intel-navigation.mjs` | **Pont UI** → Runtime Adapter (injecté par l'UI) → Orchestrator. Seul intermédiaire entre l'UI et l'intelligence. |
| `src/b1/web/b1-web.js` (modif. minimale) | Front réel : appelle le pont pour *observer* (preview/commit/undo/restart) et *affiche* la décision (`#ov-next`). **Ne décide rien.** |
| `tests/intel/ui-adaptive.test.mjs` | Suite UI-01…UI-10 + driver UI headless fidèle au flux réel (déterministe). |
| `docs/design/MATHIC-1-0-UI-ADAPTIVE-REPORT.md` | Rapport §20 (preuves, catégories, 6 questions). |

## 3. Architecture imposée (rappel §3)

```
UI (b1-web.js)
   │  contra
   ▼
PONT intel-navigation.mjs           ← SEUL accès de l'UI à l'intelligence
   │  (engine injecté par l'UI — jamais importé par src/intel)
   ▼
RUN TIME ADAPTER (runtime.mjs)      ← observe (events) + pointeur de partie
   │
   ├─ Evidence réelle (evidence.mjs)
   ├─ Profil (profile.mjs : detectProfile)
   ├─ Policy (progression-policy.mjs : recommend)
   └─ ORCHESTRATOR (progression-orchestrator.mjs : orchestrate) ← SEUL écrivain de la save
```

**L'UI n'est pas une autorité de progression.** Elle ne calcule pas de profil, ne choisit pas de niveau,
ne débloque pas, ne mute pas la save, ne duplique pas les règles de progression. Elle *observe* et *affiche*.

## 4. Point d'ancrage (inspection §4)

- Contrôleur de session : `state = createSession(level)` module-level, `save = loadSave()`.
- Fin de niveau : `commitAction()` → `n.won` → `persistVictory()` (`markCompleted`).
- **Décision du niveau suivant : `renderOverlay()` (`#ov-next`)** — avant M7, `nextLevel(level.id)` ordinal déterministe.
- Reprise : `switchLevel(id)` → `reset(id)`.

Le pont remplace cette décision ordinale par la décision calculée `nav.decideNext().nextLevel`, tout en
**conservant l'ordinal comme repli** (§7 Intelligence OFF / panne / reco invalide).

## 5. Contrat du pont `createIntelNavigation({ engine, storage, config?, metadata?, clock? })`

Retourne : `version`, `method`, `isEnabled()`, `setEnabled(v)`, `beginLevel(level)`, `preview(action)`,
`commit(action)`, `undo()`, `restart()`, `finishLevel({ won, score, movesLeft })`, `decideNext()`,
`decision()`, `events()`, `profile()`.

- `decideNext()` :
  1. Si Intelligence OFF **ou** partie non terminée → **FALLBACK** : `nextLevel(level.id)`, aucun repli de save.
  2. Sinon `detectProfile(evidences)` → `orchestrate({ storage, metadata, difficulty, profile, config })`.
  3. Si `APPLIED` et niveau **déjà légal** (débloqué ou gagné) → `nextLevel = reco` ; sinon **FALLBACK**.
  4. Log `console.info("MATHIC-UI|", …)` (observabilité §14).
- **`evidences` agrégées sur la session UI** (jamais réinitialisées entre niveaux) : le profil reflète le
  parcours complet du joueur — c'est ce qui permet à la policy de franchir le seuil de confiance (§ M6).
- Le pont **n'importe et n'appelle jamais** `saveNow/setCurrent/markCompleted/unlockTo` (vérifié UI-10) ;
  la seule écriture passe par `orchestrate` (qui, lui, fait `setCurrent + saveNow`, sans jamais unlock).

## 6. Fait observable (preuve §9, extraite de la suite VS5)

```
arithm  (seed 1) : N1 → N2 (LOW EVIDENCE) · N2 → N3 (SAFE_DEFAULT)      → parcours standard
explorer(seed 2) : N1 → N2 (LOW EVIDENCE) · N2 → N4 (APPLIED)           → saut adaptatif
  reasonCodes explorer : DIFFICULTY_MATCH · EXPLORATION_MATCH · DIFFICULTY_IN_BAND (SUFFICIENT EVIDENCE)
```

Deux comportements d'un joueur face aux *mêmes* puzzles produisent deux trajectoires différentes **avec
les seules règles existantes** (policy + profils M6). Voir rapport §20 Q4.

## 7. Limite volontaire (à connaître avant la suite produit)

En v1, `orchestrate` applique la reco seulement si le niveau est **légalement débloqué** dans la save
(§7 : jamais contourner les règles, jamais `unlockTo` parallèle). Or `markCompleted` ne débloque que N+1.
**Conséquence UX** : le saut adaptatif est visible dès que la reco tombe *dans* la fenêtre d'unlock du
joueur (parcours réellement joué), et il est *retardé* d'un cran tant que la reco vise un niveau en dehors
de cette fenêtre. C'est le compromis SAFE_DEFAULT assumé par le mandat. La suite produit la lèvera si
souhaitée (policy avec fenêtre d'anticipation métier validée) — hors M7.

## 8. Intelligence OFF / panne / non-régression

- Intelligence désactivée → monkey-patch/setEnabled(false) → **parcours standard déterministe intact** (UI-04, UI-05).
- `npm test` : 279/279 PASS (269 antérieurs non-régressés + 10 UI).
- `npm run build` PASS (vite), `npm run build:b1` PASS (`dist-b1/b1-web.js` embarque le pont).
- Playtest (`node tests/playtest-puzzle.mjs`) PASS.

## 9. Test humain (procédure §13)

Lancer le front réel localement : `npx vite --config vite.b1.config.mjs`.
Ouvrir la console : chaque décision logge `MATHIC-UI|`. Jouer N1 (objectif → “Niveau suivant”) :
le log doit montre le FALLBACK/APPLIED et le bouton doit refléter `decision.nextLevel`.
Sur des parties longues, explorer vs arithm → logs de divergence (reasonCodes EXPLORATION_MATCH).

## 10. Production / déploiement

Le pont est embarqué dans le bundle b1 (`dist-b1`). Le déploiement Netlify actuel publie `dist` (ancien
front V3, `src/main.js`) — sans intelligence. Le front produit Core N1–N36 (`b1-web`) est servi par
`dist-b1/index.html` ; à basculer par la config de déploiement lorsque la cible produit est le front b1.