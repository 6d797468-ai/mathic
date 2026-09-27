# MATHIC 1.0 — Rapport de mandat : Oculus d'Analyse (MISSION 14)

**Référence** : MISSION 14 — `OCULUS D'ANALYSE` · Méthode : `MATHIC-1-0-OCULUS-D-ANALYSE.md`
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ. Aucune anomalie bloquante.

Résumé des preuves, classées selon la nomenclature demandée :

- **PROUVÉ** (vérifié machine / source) : immutabilité de l'analyse,
  déterminisme byte-à-byte, causes de rejet biunivoques avec `apply === null`,
  absence de réseau/LLM/Policy/Intelligence, performance mesurée, builds,
  playtest, §19 sur l'UI réelle, bonnes pratiques git.
- **OBSERVÉ** : sorties de l'analyse sur SPEC_A / SPEC_B / SPEC 4×4 (fixtures
  et script en annexe), comportement UI capturé au headless.
- **EXPÉRIMENTAL** : borne du portail « loi de ligne/colonne » — elle est
  atteinte via `getMoves` (réelle) et la ligne incriminée n'est PAS désignée
  (non exportée) : choix documenté comme limite de vérité.
- **NON PROUVÉ** : aucune requête LLM (interdit), aucune analyse multi-agent,
  aucune signature (hors champ). Rien d'autre n'est réclamé.

---

## 1. Objet atteint (critère §16 / §19)

La chaîne complète est démontrée sur l'UI réelle (`dist-atelier` servie puis
pilotée par chromium headless) :

```
jouer 4 coups (offerts 10→5→2→1→0) → "OUI ✦"
  ↓ btn ◉ OCULUS (présent)
analyse état → "CRÉATION STABILISÉE ✦" + lignes brutes L1..C2
  ↓ Sablier ← Revenir ×2 → mode "history" · coup 2/4
analyse état historique → lignes montrent S_2 réelle (2 3 / · · )
       lo Oculus suit le curseur, jamais « le présent »
  ↓ clique la valeur écartée 5 @ (1,0)
"ACCEPTÉE PAR LE MOTEUR — ÉCARTÉE PAR LA LOI"
  cause : « … aucun de ses coups légaux (getMoves) ne l'offre … »
  ↓ après analyse
curseur intact (2/4) · coups intacts (2)   ← aucune mutation (§19)
```

## 2. Primitives moteur utilisées (et où)

| Primitive | Usage dans l'Oculus |
|---|---|
| `replay`, `createSession` | dériver S_k (adressable M13) — analyser EXACTEMENT l'état affiché |
| `getState`, `isSolved` | faits `grid/reserve/solved/moves`, `reasonCode` SOLVED/ONGOING |
| `apply` | oracle d'action : `valid` (« prévisualisation » déterministe) |
| `getMoves` | portail « loi de ligne/colonne » : `offered` — jamais recalculé |
| `validateSpec` | mode SPEC : message réel en cas de rejet, fail-fast à la création |
| `quickReject` | annotation additive SAT/UNSAT/NON-ADDITIF (spec entière) |

## 3. Modèle AnalysisResult

Défini §4 de la méthode ; **aucun champ n'est dérivé d'une source non
déterministe**. Deux modes + un mode spec :
`state` (analyse S_k), `action` (analyse cmd sur S_k), `spec`. Chaques sortie
porte `cursor`, `total`, `atPresent`, `reasonCode`, `valid`/`offered`, `source`.

Structure des rejets (procédure testée) :

```
REJECTED_COMMAND_UNKNOWN   ← cmd.id ≠ PLACE               (fait observable)
REJECTED_OUT_OF_BOUNDS     ← r/c non-entières ou hors grille (adresse)
REJECTED_CELL_OCCUPIED     ← grid[r][c] ≠ -1              (fait observable)
REJECTED_RESERVE_EMPTY     ← reserve[v] ≤ 0 (via apply→null) (oracle)
REJECTED_VALUE_INVALID     ← cmd.value non numérique        (fait observable)
ENGINE_ACCEPTS_NOT_OFFERED ← apply ≠ null  ∧  cmd ∉ getMoves (deux faits)
```

La bijection est garantie par l'ordre des gardes de `apply` (lu en §3 méthode) +
la garde d'adresse propre à l'Oculus (l'Engine planterait sur r hors bornes).

## 4. Mapping reasonCode → présentation

Largé au §5 de la méthode. Découplage réel : `AnalysisResult` ne contient aucun
texte, `present(result)` construit le texte à partir de faits (ex :
`Case (0,1) : déjà scellée par 3`). Aucune justification lore n'entre dans les
champs machine.

## 5. Intégration M13 — vérifiée

- `OC-04` : deux chemins (jouer puis analyser vs jouer→rewind→analyser) →
  byte-identique.
- `OC-02` : analyse de k reflète le grid affiché par le Sablier au même k.
- `OC-14` / `OC-15` : l'analyse porte le curseur explicite ; k ≠ k' ⇒ états et
  offres différentes.
- Live (UI headless) : rewind à 2/4 → l'Oculus affiche S_2, pas le présent.

## 6. Exemples d'états (fixtures SPEC_A — OBSERVÉ)

| État | reasonCode | offered (ex.) |
|---|---|---|
| k=0 (grille vide) | ONGOING | 10 coups offerts ; `5@(0,0)` NON offert (colonne 0 cible 4) |
| k=2 (`[[2,3],[-1,-1]]`) | ONGOING | `2@(1,0)` offert ; `3@(0,0)` → REJECTED_CELL_OCCUPIED ; `3@(1,1)` → REJECTED_RESERVE_EMPTY (réserve 3 épuisée) |
| k=4 (`[[2,3],[2,5]]`) | SOLVED | 0 coup restant |
| SPEC tordu (`grid[[2,5],[2]]`) | SPEC_INVALID | message réel `grid[1] : 1 cases ≠ 2` |

## 7. Tests

`tests/atelier/oculus.test.mjs` — 29 tests : `OC-01..16` (mandat), OC-05b/c/d,
OC-06b, OC-M13/a/b/c (couple Sablier/Oculus), OC-SPEC/a/b, OC-PURE, OC-API.

```
ℹ tests 29 · pass 29 · fail 0      (node --test tests/atelier/oculus.test.mjs)
ℹ npm test        → 376 tests · 376 pass · fail 0
```

## 8. Performance (mesurée, pas devinée)

```
state simple S0 (2x2)           0.107 ms   state final (2x2)  0.066 ms
action rejetée (2x2)            0.020 ms   action offerte     0.053 ms
state MID 4×4 (k=8)             0.269 ms   state final 4×4    0.016 ms
spec analyse                    0.016 ms   (chaque ligne : 2000–4000 répétitions)
```

Tout est **sub-milliseconde** (§14 : bien sous le seuil « quelques centaines de
µs à quelques ms »), donc : **aucune** architecture worker / snapshot / cache.

## 9. Non-régression

347 tests M12/M13 + playtest : voir npm test. Engine/Solver/Policy/Save/Sceau/
Replay Controller : intacts (git diff vide hors atelier/tests/docs).

## 10. Build & UI

```
npm run build         ✓ (dist/assets …)
npm run build:atelier ✓ (dist-atelier/index.html · atelier.css · atelier.js)
git diff --check      ✓
```

Modal `#oculus` (stylée Dark Academia : violet, monospace), bouton
`◉ OCULUS — Analyser l'état` dans le panneau Sablier, valeurs « écartées » en
puces `5✕` dans chaque case (clic = analyse, **jamais** un coup : aucun PLACE ne
part d'un obstacle).

## 11–14. Git — Commit · Push · HEAD == origin · Worktree clean

Vérifié au verrou (voir zone suivante) : une fois la chaîne `npm test` +
builds + playtest verte et `git diff --check` propre, commit et push sont faits ;
`HEAD == origin` et `git status` vide seront confirmés ci-dessous par exécution.

## 15. Limites explicites

- **Portail loi de ligne/colonne sans coupable** : `lineOk` n'est pas exporté.
  L'Oculus dit « le moteur n'offre pas ce coup » (`getMoves`), jamais « la ligne 2
  est fautive » — ce serait de l'invention. C'est un choix de vérité, pas un manque.
- **Prévisualisation ≠ saisie** : l'Oculus montre l'état `After` d'une action
  acceptée, mais la commettre reste l'acte du joueur (cliquer un coup `ok`).
- **ValidateSpec = structure, pas solvabilité** : le mode SPEC ne juge que la
  forme (et l'additivité `quickReject` séparément), conformément au moteur.

## 16. Trajectoire

```
M12 Sceau de Défi    ✅   M13 Sablier de Chronos  ✅
M14 Oculus d'Analyse ✅   → M15 Fragments de Savoir
M16 Symbiote des Gardiens
```