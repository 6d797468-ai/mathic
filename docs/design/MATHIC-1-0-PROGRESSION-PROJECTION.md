# MATHIC 1.0 — Contrat : Projection de progression unifiée (MISSION 18)

**Statut** : DESIGN — contrat fondateur. Verrouillé par ses gates (§7), jamais par sa prose.
**Hérite de** : M17 (Grimoire, façade commune b1+V5 — **confirmée par données**, spike `lab/SPIKE-REPORT.md`, k=6 dont 2 deltas de grammaire) et de la règle M16 : un jalon UI est incomplet sans sa preuve E6.
**Décision fondatrice** : **M18 est une PROJECTION, pas une UNIFICATION.** Aucune source de vérité n'est fusionnée, aucun format de stockage ne change, aucun moteur ne bouge.

---

## 1. Problème à résoudre

À la fermeture de M17, la progression existe mais n'est pas **vue** :

- `mathic.save.v1` porte `wins / bestScore / bestMovesLeft / unlocked` — mais **aucune étoile** ;
- le contrat de progression A13 (§2) définit ⭐1/⭐2/⭐3 — **jamais implémentés** (grep dépôt : 0 occurrence de `stars` dans les sources) ;
- le savoir (`mathic.knowledge.v1`) progresse en parallèle, sans vue commune ;
- le joueur n'a aucune lecture d'ensemble : chapitres (W1..W10), complétion, maîtrise.

Le contrat A13 a déjà tranché la nature des étoiles : *« calcul pur et dérivé »* (§3), seuils *« toujours dérivés de `scoreEnvelope` »* (D-P1), maîtrise *« pèse sur l'aide, jamais sur le verrouillage »* (D-P2). M18 applique enfin cette décision.

## 2. Source de vérité — INCHANGÉE

```text
mathic.save.v1      (écrit uniquement par src/b1/save.mjs)   → progression campagne
mathic.knowledge.v1 (écrit uniquement par knowledge.mjs)     → savoir
LADDER / WORLDS     (src/b1/levels.mjs, lecture seule)       → géographie des chapitres
solve()             (src/b1/solver.mjs, lecture seule)       → enveloppe de score (A10)
```

Aucun champ nouveau persisté. Aucune migration. Aucun backfill : la projection calcule à la volée depuis l'état existant — un ancien save v1 produit immédiatement des étoiles correctes.

## 3. Définition des étoiles (calcul pur, opposable)

Pour un niveau `L` de la campagne, avec `rec = save.completed[L.id]` et `env = solve(L)` (enveloppe solveur, memoïsée) :

| Étoile | Condition | Source de données | Justification contrat |
|---|---|---|---|
| ⭐1 | `rec.wins ≥ 1` | save (existant) | A13 §2 — « objectif atteint » |
| ⭐2 | `rec.bestMovesLeft ≥ 1` | save (existant) | A13 §2 — « contrainte remplie » par défaut : terminer avec au moins un coup d'avance |
| ⭐3 | `L.maxMoves − rec.bestMovesLeft ≤ env.minMoves` | save + solveur | A13 §2/§6 — « efficacité proche de l'optimum » : joué aussi vite que la solution minimale certifiée |

**Propriétés exigées** :
- **Pures** : `starsOf(rec, L, env) → {1,2,3}` — même entrée → mêmes étoiles, aucune horloge, aucun aléa ;
- **Monotones** : une étoile acquise ne peut pas être perdue (bestMovesLeft ne décroît pas — garantie de `markCompleted`) ;
- **Déterministes** via l'enveloppe : `env` est memoïsée par niveau, calculée par le solveur réel, jamais estimée ;
- **Limitation documentée** : l'enveloppe couvre les chemins gagnants minimaux (`samplePaths` du solveur). Le seuil ⭐3 est un *plancher d'optimalité* (atteindre `minMoves`), pas un plafond de score — choix assumé, plus robuste que la comparaison de score (le score b1 dépend du chaînage, futur M18.x).

## 4. La Saga (vue unifiée, en lecture seule)

```text
mathic.save.v1 ──┐
                 ├─→ saga.mjs (PROJECTION PURE) ─→ vue « Saga du Grimoire »
knowledge ───────┘        │
                          ├─ chapitres W1..W10 (progression par monde : worldProgress)
                          ├─ étoiles par niveau (§3) + cumul par chapitre
                          ├─ seuils de déblocage de chapitre (A13 §4, étoiles cumulées)
                          └─ fragments de savoir (lecture knowledge, jamais écrit ici)
```

- La Saga **n'écrit rien** : elle est fonction de (save, knowledge, LADDER, enveloppes) ;
- Les seuils de chapitre sont des constantes déclarées dans le module de projection (config de game design, pas de logique moteur) ;
- La maîtrise par opérateur (A13 §3 : `opUtilization`…) est **hors périmètre v1** — la donnée n'est pas persistée aujourd'hui ; ouverte en M18.x si la télémétrie A16 la persiste un jour.

## 5. Livrables M18

1. `src/grimoire/saga.mjs` — projection pure (étoiles, chapitres, cumuls, vue) + memoïsation d'enveloppes ;
2. `tests/grimoire/saga.test.mjs` — unit (propriétés §3 : pureté, monotonie, déterminisme, cas limites save vierge/corrompu) + intégration (save réelle, solveur réel) ;
3. Vue « Saga » dans `src/grimoire/web/` (chapitres, étoiles, savoir) — lecture seule ;
4. Harnais E6 `lab/e6-saga-proof.mjs` — scénario : jouer N1 → étoiles affichées → rejouer mieux → ⭐2/⭐3 montent → reload → étoiles stables ;
5. Rapport `docs/design/MATHIC-1-0-PROGRESSION-PROJECTION-REPORT.md`.

## 6. Invariants non négociables

| # | Invariant |
|---|---|
| I-1 | Zéro modification moteur (b1, V5), zéro modification `save.mjs`/`knowledge.mjs` |
| I-2 | La Saga n'écrit aucune clé de stockage — preuve par test (before/after raw storage) |
| I-3 | Étoiles = fonction pure de données existantes (§3), monotones, déterministes |
| I-4 | Module de projection pur : aléa/horloge/réseau/DOM interdits (scan de source) |
| I-5 | Un save ancien/corrompu → projection dégradée propre (étoiles manquantes ≠ crash) |
| I-6 | Aucun seuil d'étoile « inventé à la main » par niveau : tout vient de la règle §3 |

## 7. Gates de sortie

| Gate | Contenu | Niveau exigé |
|---|---|---|
| G18-01 | Projection pure + propriétés §3 testées | E3 |
| G18-02 | Intégration save réelle + solveur réel (N1..N5 au minimum) | E4 |
| G18-03 | Suite intégrale verte, 0 régression (≥ 442 tests) | E4 |
| G18-04 | Vue Saga jouable dans le build réel | E2→E4 |
| G18-05 | **Preuve E6** : boucle jouer → étoiles → rejouer mieux → étoiles → reload (0 erreur console) | **E6 — obligatoire** |
| G18-06 | Git : commits propres, `HEAD == origin`, worktree clean | E5 |

## 8. Non-goals (M18)

- Unifier `mathic.save.v1` et `mathic.knowledge.v1` (jamais — frontière I-5 de M17) ;
- Portage b1→V5 (clos par le spike, révisable par ses 4 critères uniquement) ;
- Persistance de données nouvelles (opUtilization, timestamps, profils) ;
- Maîtrise par opérateur v1 (donnée absente — M18.x si A16 la produit) ;
- Économie, boutique, cloud, multi-tab, rangs en ligne ;
- Toute modification de `markCompleted` ou de la fenêtre de déblocage M8.

## 9. Question de fermeture M18

> Le joueur peut-il voir, dans le Grimoire réel, la progression unifiée (chapitres, étoiles, savoir) dérivée **exclusivement** des sources existantes — avec des étoiles qui montent quand il joue mieux, restent stables au reload, et sans qu'aucune source de vérité ni aucun moteur n'ait changé d'une ligne ?

Réponse démontrée par G18-01..G18-06, preuve E6 incluse.
