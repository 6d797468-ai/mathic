# MATHIC 1.0 — Contrat : Intégration du Grimoire (MISSION 17)

**Statut** : DESIGN — contrat fondateur. Il ne sera « verrouillé » que par ses gates (§7), jamais par sa prose.
**Hérite de** : M16 LOCKED (`8fc18e8`) — baseline protégée : V5 souverain, 422/422 PASS, E5 PROVEN, E6 18/18.
**Règle héritée de M16** : un jalon UI est incomplet tant qu'il n'a pas sa preuve E6.

---

## 1. Rôle de M17

M16 a ajouté une **capacité** (composition des Gardiens au-dessus de V5).
M17 n'ajoute **aucune puissance au noyau** : il rend cohérente la boucle joueur.

```
OUVRIR LE GRIMOIRE
      ↓
choisir / charger un niveau
      ↓
jouer
      ↓
événements
      ↓
résolution
      ↓
récompenses / connaissance
      ↓
progression
      ↓
niveau suivant
```

---

## 2. Ancrage factuel (audit d'entrée M17)

Deux vérités que ce contrat assume au lieu de les masquer :

1. **Le « Grimoire » n'existe dans aucun document antérieur** (ROADMAP, BRIEF : 0 occurrence).
   C'est une couche d'habillage joueur (shell UI + navigation), pas un système de règles.
2. **La campagne actuelle (N1..N41, `mathic.save.v1`) tourne sur le moteur b1** (`src/b1/engine.mjs`),
   pas sur V5. V5 alimente aujourd'hui l'Atelier (M12..M16). Les deux moteurs purs coexistent,
   tous deux déterministes, tous deux avec `createSession/apply/getState/replay`.

**Décision M17** : le Grimoire est la façade commune des deux. Il ne porte **aucune règle**,
il **monte des sessions existantes**. Le portage b1 → V5 est explicitement **hors périmètre**
(§8) : le faire serait retoucher le noyau de campagne sans nécessité démontrée.

---

## 3. Architecture cible

```
                    ┌──────────────────────────────┐
                    │   MOTEURS PURS (b1 · V5)     │
                    │         IMMUTABLES           │
                    └──────────────┬───────────────┘
                                   │
                    Session / Events / State  (la seam — moteur-agostique)
                                   │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
      GRIMOIRE                ATELIER                 SERVICES
   (campagne, shell)       (laboratoire M12..16)   (progression, savoir)
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  ▼
                              MAGGEEK
                        observation only (M19)
```

La **seam** est déjà matérialisée : chaque moteur expose la même forme de contrat
(`createSession → apply → getState → replay`). Le Grimoire ne connaît que cette forme.
Il ne connaît ni `b1/engine.mjs` ni `v5/rules/engine.mjs` en interne — uniquement via
leurs modules publics existants (adapters / controllers déjà écrits).

---

## 4. Invariants non négociables (hérités, opposables)

| # | Invariant | Verrou de preuve |
|---|---|---|
| I-1 | Aucune modification de `src/v5/rules/*` ni de `src/b1/engine.mjs` | `git log` sur les chemins + grep CI |
| I-2 | Aucune règle narrative dans les moteurs (lore ≠ engine rule) | grep `src/v5/`, `src/b1/engine.mjs` |
| I-3 | Le Grimoire ne mute aucun état : toute transition passe par `apply()`/adapters | revue + test d'architecture |
| I-4 | Grimoire core pur : pas de `Math.random`, `Date.now`, réseau, LLM | scan de source (style SYM-12) |
| I-5 | knowledge ≠ progression : `mathic.knowledge.v1` et `mathic.save.v1` restent écrits uniquement par leurs modules dédiés (`knowledge.mjs`, `save.mjs`) | tests REPLAY-12/SEAL-10/KNOW-13 ré-exécutés |
| I-6 | Maggeek : observe, analyse, explique, suggère — jamais `apply()` | contrats Momo existants (M19) |
| I-7 | Offline-first : aucun chemin gameplay ne dépend du réseau | exécution sans réseau (E6) |

---

## 5. Cartographie de la boucle (modules existants → M17)

| Étape de la boucle | Existant réutilisé | Nouveau en M17 |
|---|---|---|
| Ouvrir le Grimoire | — | shell UI + navigation |
| Choisir/charger un niveau | `save.mjs` (`loadSave/isUnlocked`), `levels.mjs` (`LADDER/WORLDS/windowOf`) | vue Grimoire (lecture seule de ces sources) |
| Jouer | `b1` (campagne) et V5/Atelier (lab) — inchangés | pont de montage de session |
| Événements | événements des deux moteurs | projection vers la boucle (lecture) |
| Résolution | `isWon/isSolved` moteurs | détection de transition (style `wasSolved` M16) |
| Récompenses/connaissance | `markCompleted` (save), `knowledge.record` | aucun calcul nouveau — délégation pure |
| Progression | `save.mjs` (`mathic.save.v1`) | aucune écriture directe du Grimoire |
| Niveau suivant | `nextLevel` (levels.mjs) | affichage |

Le Grimoire est un **lecteur** de l'état de progression et un **monteur** de sessions.
Il ne calcule rien qui soit une règle.

---

## 6. Livrables M17

1. `src/grimoire/` — module cœur pur (montage de session, lecture progression/savoir, zéro DOM).
2. `src/grimoire/web/` — surface UI (index/css/js, style des couches existantes).
3. Tests `tests/grimoire/` — unit + intégration (style atelier : fake storage, cas limites).
4. Harnais E6 `lab/e6-grimoire-proof.mjs` — scénario complet de la boucle §1 en Chrome réel.
5. Rapport `docs/design/MATHIC-1-0-GRIMOIRE-INTEGRATION-REPORT.md` — preuves par gate.

---

## 7. Gates de sortie (toutes obligatoires)

| Gate | Contenu | Niveau exigé |
|---|---|---|
| G17-01 | Boucle §1 complète jouable de bout en bout | E2 puis E4 |
| G17-02 | Suite intégrale verte, 0 régression (≥ 422 tests) | E4 |
| G17-03 | Builds `npm run build` + `build:b1` + `build:atelier` | E4 |
| G17-04 | **Preuve E6 de la boucle** (Chrome headless, reload inclus, 0 erreur console) | **E6 — obligatoire** |
| G17-05 | Invariants I-1..I-5 vérifiés (grep + tests d'architecture) | E3 |
| G17-06 | Git : commit(s) propres, `HEAD == origin`, worktree clean, `diff --check` clean | E5 |

**Aucune fermeture M17 sans G17-04.** Le contre-exemple canonique est `updateResonance()` :
419 tests verts, régression réelle en production UI, attrapée uniquement par l'E6.

---

## 8. Non-goals explicites (M17)

- Portage b1 → V5 (aucune nécessité démontrée ; décision reportée, preuve exigée avant).
- Économie, monnaie, boutique, cloud, ranking (règle 1.0 inchangée).
- Câblage LLM Maggeek (M19) — le Grimoire réserve l'emplacement, point.
- Polissage mobile/VFX (M20), validation appareil (M21), freeze (M22).
- Toute nouvelle règle moteur, tout nouvel opérateur, tout shape > 2×2.
- Multi-tab, sync, horloge, aléa.

---

## 9. Question de fermeture M17

> Le Grimoire permet-il à un joueur de parcourir la boucle complète (ouvrir → jouer →
> résoudre → récompense → progression → niveau suivant) en conditions réelles navigateur,
> sans qu'aucune règle, aucun état, aucune écriture de sauvegarde n'échappe aux modules
> existants — et sans que V5 ni b1 aient changé d'une ligne ?

La réponse doit être démontrée par G17-01..G17-06, dont la preuve E6.
