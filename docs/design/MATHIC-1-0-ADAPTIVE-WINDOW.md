# MATHIC 1.0 — FENÊTRE D'ANTICIPATION DE PROGRESSION (MISSION 8)

**Statut : TERMINÉE** — Mission : `M8 ADAPTIVE PROGRESSION WINDOW` (branche `kali/v5-gameplay-lab`).
**Décisions produit** : k = 3 · fenêtre **débloquée et jouable** (autorité 100 % progression pure).

---

## 1. Problème (contexte M7)

La chaîne M1→M7 est prouvée, mais l'espace de décision réel de la Policy était
~1 candidat à de nombreux moments :

```
W(p,t) = { l | l débloqué ∧ certifié }        (défini par la save)
l*     = argmax_{l∈W} Score(profile, l)        (déjà implémenté, M3)
|W(p,t)| ≈ 1   après chaque victoire (markCompleted débloquait N uniquement, puis N+1)
```

Conséquence : même une Policy excellente avait peu de liberté — **l'adaptation
était correcte mais quasi invisible** (Risque 1 du diagnostic).

## 2. Objectif

Augmenter intelligemment |W(p,t)| — et rien d'autre. C'est une question
**d'espace de décision**, pas de puissance de modèle. La Policy/Orchestrator
n'ont nécessité **aucune modification** : ils maximisent déjà dans W (M3/M4).

## 3. Architecture — gouvernance de la fenêtre

```
Victoire UI (level N complété)
   ↓  markCompleted({ horizon: PROGRESSION_WINDOW })     ← règle de progression PURE
   ↓  déblocage déterministe de { N+1 … N+k }             ← indépendant du profil
W = fenêtre légale (débloquée ∧ certifiée)
   ↓  Policy (M3) :  l* = argmax_{l∈W} Score(profile, l)  ← déjà en place
   ↓  Orchestrator (M4) : reco ∈ W && isUnlocked → setCurrent + saveNow
   ↓
Progression affichée, autour de la fenêtre
```

**Le profil n'a AUCUN pouvoir sur la taille ni la composition de W** — il ne
fait que *choisir dans* W. Le déverrouillage reste à 100 % une fonction
déterministe du niveau complété et de la constante de conception `PROGRESSION_WINDOW`.

## 4. Livrables

| Fichier | Rôle |
| --- | --- |
| `src/b1/levels.mjs` | `PROGRESSION_WINDOW = 3` · `windowOf(id, k)` → {N+1…N+k} (recadrage fin de ladder) |
| `src/b1/save.mjs` | `markCompleted(…, { horizon = 1 })` — **défaut 1 = comportement historique, NON-RÉGRESSIF** |
| `src/b1/web/b1-web.js` | `persistVictory` passe `horizon = PROGRESSION_WINDOW` (la fenêtre est la progression du jeu) |
| `tests/intel/window-progression.test.mjs` | W-01 → W-09 (fenêtre, invariants, divergence réelle, non-régression) |
| `docs/design/MATHIC-1-0-ADAPTIVE-WINDOW-REPORT.md` | Rapport §20 |

**Intouchés** : policy (M3), orchestrator (M4), runtime (M5), pont UI (M7) —
la fenêtre élargit leur *entrée*, pas leur logique.

## 5. Effet produit (preuve §9 — flux save réel, aucun hack)

| Comportement | Trajectoire (si renvoi de la fenêtre 3) | Preuve |
| --- | --- | --- |
| `arithm` (confiance insuffisante → repli) | N1→N2, N2→**N3**, N3→N4 | parcours **ordinal** conservé |
| `explorer` (SUFFICIENT EVIDENCE, EXPLORATION_MATCH) | N1→N2, N2→**N5** (APPLIED) | saut adaptatif **dans** la fenêtre |

`windowOf("N2", 3) = {N3, N4, N5}` → les deux choix restent dans la fenêtre :
l'espace est gouverné par la progression, le *choix* par profil+metadata+policy.

## 6. Propriétés vérifiées

- **Déterministe** : windowOf/markCompleted sont des fonctions pures de la progression (W-01/W-05).
- **Non-régression** : horizon=1 ≡ ancien comportement (W-02) — suite complète 289/289.
- **Invariant reco ∈ W** : toute recommendation (repli compris) reste dans la fenêtre (W-04/W-06bis).
- **Sans pouvoir de curseur** : deux profils distincts voient le MÊME espace éligible (W-07).
- **Recadrage** : fin du catalogue → fenêtre limitée aux niveaux restants (W-09).
- **SAFE_DEFAULT** : reste le parcours ordinal classique (W-08).

## 7. Limite connue / suite

- La reco tend vers le **front** de la fenêtre (proximité + règles) : la divergence
  arithm/explorer est surtout pilotée par le **seuil de confiance** (repli LOW →
  ordinal ; SUFFICIENT+ → front). C'est conforme et lisible ; une hiérarchisation
  de grammaire plus fine (Niveau C) est hors périmètre M8.
- L'utilisateur peut librement choisir n'importe quel niveau de la fenêtre dans la
  carte (fenêtre jouable) — cohérent avec la décision « débloquée et jouable ».

## 8. Test humain

`npx vite --config vite.b1.config.mjs` — ouvrir la console (`MATHIC-UI|`).
Après quelques victoires, la carte montre jusqu'à 3 niveaux d'avance ; le bouton
« Niveau suivant » reflète la décision (saut possible au front de la fenêtre pour
les profils à confiance suffisante).