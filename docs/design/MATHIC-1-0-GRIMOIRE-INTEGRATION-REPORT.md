# MATHIC 1.0 — Rapport de clôture : Intégration du Grimoire (MISSION 17)

**Référence** : MISSION 17 — `INTÉGRATION DU GRIMOIRE` · Contrat : `MATHIC-1-0-GRIMOIRE-INTEGRATION.md`  
**Statut** : IMPLÉMENTÉ, TESTÉ, VÉRIFIÉ, PROUVÉ (E2/E3/E4 logique + **E6 navigateur — G17-04 fermé**). **Publié** : commits `be36300` → `09f4454` poussés sur `origin/kali/v5-gameplay-lab` (push `2f842f7..09f4454` du 2026-09-25) — G17-06 **clos** (§2).  
**Baseline** : M16 LOCKED = `8fc18e8` · **Suite de tests** : 442 PASS (0 FAIL, 0 SKIPPED) + playtest 50/50 — soit +20 tests Grimoire sur la base 422 de M16.  
**Exécution de contrôle (2026-09-25)** : `npm test` 442/442 PASS, `npm run build` / `build:b1` / `build:atelier` / `build:grimoire` tous OK, `git diff --check` CLEAN, worktree clean.  
**Preuve E6 (2026-09-25, Chrome 153 headless, vrai DOM + vrai localStorage)** : boucle §1 du contrat exécutée de bout en bout sur `dist-grimoire` — **27/27 assertions PASS, 0 erreur console**. Harnais versionné : `lab/e6-grimoire-proof.mjs` (CDP brut, zéro dépendance, modèle `lab/e6-browser-proof.mjs`) ; artefacts : `lab/e6-grimoire-evidence/` (8 captures + `e6-grimoire-result.json`, verdict `E6 PROVEN`).

**Commits M17** : `be36300` (contrat fondateur) · `2f842f7` (cœur pur + seams b1/V5, G17-01) · `352187e` (surface UI — shell + navigation de la boucle) · `5584c92` (preuve E6, G17-04). Postérieurs au périmètre M17, même branche : `01f0d50` + `09f4454` (contrat M18 v1.1).

---

## 1. Synthèse des Preuves par Nomenclature Officielle

- **PROUVÉ** (assertions machine + analyse source + greps formels) :
  - **M17-01** (Machine d'écrans) : CLOSED → INDEX → PLAYING → RESOLVED/FAILED, transitions et rejets par contrat, events consommables une seule fois (GR-01, GR-02, GR-04).
  - **M17-02** (Façade moteur-agnostique) : les deux moteurs purs montés via la même seam (`mount/apply/legal/isTerminal/outcome/expose`) ; aucun rejet ne mute l'état (GR-06, GR-R2, GR-R3).
  - **M17-03** (Lecture pure de la progression) : `listLevels`/`canPlay` dérivent OPEN/LOCKED/MASTERED de `mathic.save.v1` sans jamais écrire (GR-03, GR-05, GR-R1, GR-R4).
  - **M17-04** (Délégation de récompense) : b1 → `markCompleted` (délégation pure, diff de déblocage calculé côté seam, idempotence `ALREADY_REWARDED`) (GR-09, GR-R2) ; v5 → savoir uniquement, `mathic.save.v1` jamais écrit par le chemin lab (GR-10, GR-R3).
  - **M17-05** (Séparation knowledge ≠ progression — I-5) : en conditions réelles navigateur, le chemin lab n'écrit que `mathic.knowledge.v1` et le chemin campagne n'écrit que `mathic.save.v1` (S7/S8 de la preuve E6 + greps §3).
  - **M17-06** (Persistance et restauration) : snapshot/restore round-trip byte-identique sur seams fakes ET moteur réel ; reload navigateur → progression et savoir restaurés sans doublon (GR-12, GR-R5, S9).
  - **M17-07** (Déterminisme) : F(G,I) = F(G,I) — même scénario → même trace d'événements, même état (GR-13).
  - **M17-08** (Pureté du cœur — I-4) : zéro DOM, zéro hasard, zéro horloge, zéro réseau, zéro storage direct, zéro import (GR-14 + grep indépendant §3).
  - **M17-09** (Non-régression) : 442 PASS, moteurs intacts (I-1), builds 4/4.
- **OBSERVÉ** (preuve E6 in-browser) :
  - Navigation réelle au clic : index à deux familles (Campagne verrouillée + Laboratoire ouvert), N2 hachurée tant que non débloquée, N1 dorée (MASTERED) après victoire.
  - Saisie formule b1 en 3 clics (rappel de sélection « Formule : 2 + »), soumission → vue Résolution → sceau → récompense → « Tourner la page » vers N2 montée via `next()`.
  - Lab joué uniquement par les coups OFFERTS par le moteur V5 (`getMoves`), sans jamais exposer la solution.
- **EXPÉRIMENTAL** :
  - Aucun — M17 n'ajoute aucune puissance au noyau (contrat §1) ; le spike de portage b1→V5 vit sur sa branche dédiée `lab/v5-portage-spike` (`2609aec`), hors branche principale.
- **NON PROUVÉ** :
  - Aucune monétisation, aucun réseau, aucune synchronisation multi-tab — le Grimoire est 100% hors-ligne (I-7 : la preuve E6 tourne sur serveur de fichiers statiques local, aucune ressource distante).

---

## 2. Validation des Gates de Sortie (G17-01 à G17-06)

| Gate | Contenu (contrat §7) | Niveau exigé | Résultat | Justification |
|---|---|---|---|---|
| **G17-01** | Boucle §1 jouable de bout en bout | E2 puis E4 | **CONFORME (dépassé : E6)** | 20 tests Grimoire verts (E2/E4, commit `2f842f7`) puis boucle complète rejouée in-browser (E6, `5584c92`). |
| **G17-02** | Suite intégrale verte, 0 régression (≥ 422) | E4 | **CONFORME** | 442/442 PASS (0 FAIL, 0 SKIPPED) + playtest 50/50, 0 faux positif. |
| **G17-03** | Builds `build` + `build:b1` + `build:atelier` | E4 | **CONFORME** | 4/4 OK — dist 363,25 kB · dist-b1 60,46 kB · dist-atelier 38,45 kB · **dist-grimoire 44,40 kB** (gzip 14,07 kB). |
| **G17-04** | **Preuve E6 de la boucle** (Chrome headless, reload inclus, 0 erreur console) | **E6 — obligatoire** | **CONFORME — FERMÉE** | 27/27 assertions, 0 erreur console, reload inclus (S9). Aucune régression de type `updateResonance()` détectée. |
| **G17-05** | Invariants I-1..I-5 (grep + tests d'architecture) | E3 | **CONFORME** | Greps formels exécutés et figés §3 ci-dessous. |
| **G17-06** | Commits propres, `HEAD == origin`, worktree clean, `diff --check` clean | E5 | **CONFORME — PUBLIÉ** | Push effectué le 2026-09-25 : `2f842f7..09f4454` sur `origin/kali/v5-gameplay-lab`, `HEAD == origin`. Worktree clean, `diff --check` CLEAN, commits conformes aux conventions. |

**Aucune fermeture M17 sans G17-04** : G17-04 est fermée par preuve machine, artefacts versionnés.

---

## 3. Invariants I-1..I-5 — Verrous formels (G17-05, niveau E3)

Commandes exécutées le 2026-09-25 sur `kali/v5-gameplay-lab` à `5584c92`. Sorties brutes conservées ci-dessous — ce sont les verrous opposables.

### I-1 — Aucune modification des moteurs purs

```
$ git log --oneline be36300..HEAD -- src/v5/rules src/b1/engine.mjs
(VIDE — aucun commit M17 ne touche les chemins sacrés)

$ git log -1 --format="%h %ad %s" --date=short -- src/b1/engine.mjs
189f377 2026-09-23  (B1 — slice minimal jouable, antérieur au contrat M17)

$ git log -1 --format="%h %ad %s" --date=short -- src/v5/rules/
fa0f2f4 2026-09-23  (GATE 2 — antérieur au contrat M17)
```

**Verdict : TENU.** Les moteurs n'ont pas changé d'une ligne depuis avant le contrat M17.

### I-2 — Aucune règle narrative dans les moteurs

```
$ grep -rinE "gardien|symbiote|grimoire|maggeek|\blore\b|fragment" src/v5/rules/ src/b1/engine.mjs
(aucune occurrence)
```

**Verdict : TENU.** Le lore vit dans `src/atelier/*` et `src/grimoire/*` ; les moteurs restent muets.

### I-3 — Le Grimoire ne mute aucun état hors `apply()`

Preuve architecturale (revue + tests) :
- le cœur `grimoire.mjs` ne connaît ni `b1/engine.mjs` ni `v5/rules/engine.mjs` — uniquement les seams injectées ; toute transition de session passe par `apply()` de la seam (GR-06) ;
- les coups joués par les tests d'intégration sont pris dans `enumerateActions` (b1) / `getMoves` (v5) — jamais fabriqués (GR-R2, GR-R3) ;
- `listLevels`/`canPlay` sont des lectures pures : 0 écriture de progression (GR-05) ;
- tout rejet (`LEVEL_LOCKED`, `MOVE_ILLEGAL`, `CLOSED_OR_BUSY`…) laisse l'état inchangé (GR-04, GR-06).

**Verdict : TENU.**

### I-4 — Cœur pur : pas de `Math.random`, `Date.now`, DOM, réseau, storage

```
$ grep -nE "Math\.random|Date\.now|document|window\.|localStorage|navigator|fetch\(|XMLHttpRequest|WebSocket" src/grimoire/grimoire.mjs
(aucune occurrence)

$ grep -c "^import" src/grimoire/grimoire.mjs
0        (zéro dépendance — cœur 100% pur, seams injectées)
```

Verrou permanent en CI : test **GR-14** (scan de source, style SYM-12) — vert dans la suite 442.

**Verdict : TENU.**

### I-5 — knowledge ≠ progression : clés écrites uniquement par leurs modules dédiés

```
$ grep -c "set(" src/b1/save.mjs src/atelier/knowledge.mjs src/grimoire/engines.mjs
src/b1/save.mjs:2            (SEUL écrivain de mathic.save.v1)
src/atelier/knowledge.mjs:2  (SEUL écrivain de mathic.knowledge.v1)
src/grimoire/engines.mjs:0   (délègue — n'écrit rien lui-même)
```

Qualification exhaustive des références aux clés :
- `src/grimoire/engines.mjs` : importe explicitement `../b1/save.mjs` et exige `createKnowledgeStore` de `src/atelier/knowledge.mjs` (TypeError fail-fast sinon, GR-R5) — **délégation pure, 0 écriture directe** ;
- `src/grimoire/grimoire.mjs` (cœur) : mentions en commentaires et via les seams injectées uniquement — 0 I/O ;
- `src/grimoire/web/grimoire.js` : **aucune clé littérale** ; l'unique occurrence est un libellé de pied de page (`foot-save`) ; les backends sont injectés par `createGrimoireAssembly` ;
- `src/intel/adaptive-experiment.mjs` : exporte la constante `SIM_SAVE_KEY = "mathic.save.v1"` — **non consommée** (aucun importateur dans `src/`, `tests/`, `lab/`, `scripts/`) ; remarque P3 d'hygiène, aucune écriture constatée ;
- `src/intel/progression-orchestrator.mjs` : clé dédiée distincte `mathic.intel.progression.v1` — séparation respectée.

Verrous de bordure ré-exécutés verts dans la suite 442 : **REPLAY-12** (le Sablier n'écrit aucune sauvegarde), **SEAL-10** (l'import d'un Sceau ne modifie aucune progression), **KNOW-13** (`applyUnlocks` ne mute aucun GameState), plus GR-09/GR-10/GR-R2/GR-R3, plus l'assertion **S8** de la preuve E6 (`mathic.save.v1` inchangé après un chemin lab complet, in-browser, vrai localStorage).

**Verdict : TENU.**

---

## 4. Détail des Tests M17 (`tests/grimoire/`)

### Unitaires — `grimoire.test.mjs` (15, seams fakes)

| Identifiant | Assertion vérifiée | Statut |
|---|---|---|
| **GR-01** | Construction : contrat des dépendances fail-fast (TypeError sans seams complètes) | PASS |
| **GR-02** | open/close : machine d'écrans, idempotence, events consommables une seule fois | PASS |
| **GR-03** | `listLevels` : états OPEN/LOCKED/MASTERED dérivés de la progression ; `canPlay` (moteur inconnu, non jouable) | PASS |
| **GR-04** | `start` : rejets par contrat (écran, moteur, niveau, verrou, non-jouable) — aucun montage sur rejet | PASS |
| **GR-05b** | `toIndex` : abandon propre, session non adressable ensuite, no-op depuis INDEX | PASS |
| **GR-05** | `listLevels` ne mute jamais la progression (lecture pure) | PASS |
| **GR-06** | `play` : transition réelle via la seam, rejet sans mutation, events MOVE_REJECTED/MOVE_APPLIED | PASS |
| **GR-07** | `play` hors session → NOT_PLAYING | PASS |
| **GR-08** | Terminalité : WON → RESOLVED (+CHALLENGE_COMPLETED), LOST → FAILED (+LEVEL_FAILED) | PASS |
| **GR-09** | `reward` b1 : délégation, diff de déblocage, **idempotence** (second appel → ALREADY_REWARDED, 0 réécriture) | PASS |
| **GR-10** | `reward` lab : knowledge nourri, progression INTACTE (0 écriture), flush NO_OP sur file vide | PASS |
| **GR-11** | `next` : avance au niveau suivant, NOT_RESOLVED / END_OF_LADDER propres | PASS |
| **GR-12** | snapshot/restore : round-trip byte-identique, rejets propres (v, écran, moteur inconnus) | PASS |
| **GR-13** | Déterminisme F(G,I)=F(G,I) : même trace d'événements, même état | PASS |
| **GR-14** | Pureté du cœur (I-4) : aucun Math.random/Date.now/DOM/réseau/localStorage direct | PASS |

### Intégration — `grimoire-integration.test.mjs` (5, moteurs réels b1 + V5 + save.mjs + knowledge.mjs)

| Identifiant | Assertion vérifiée | Statut |
|---|---|---|
| **GR-R1** | Façade progression réelle : N1 ouvert, N2 verrouillé, `markCompleted` débloque la fenêtre, l'index reflète | PASS |
| **GR-R2** | Boucle b1 réelle : N1 joué via `enumerateActions[0]` → WON → `mathic.save.v1` écrit (N2 débloqué, wins=1) → N2 montée | PASS |
| **GR-R3** | Boucle v5 réelle : lab résolu par coups offerts → `LORE_ATELIER_001` → **`mathic.save.v1` jamais écrit** (clé absente du storage) | PASS |
| **GR-R4** | Catalogue double famille : campagne verrouillée, lab toujours ouvert | PASS |
| **GR-R5** | Assemblage officiel fail-fast sans knowledgeStore ; round-trip session réelle ; même coup suivant après restore | PASS |

---

## 5. Preuve E6 — La boucle complète en Chrome réel (G17-04)

Harnais : `lab/e6-grimoire-proof.mjs` — serveur `node:http` sur `dist-grimoire`, Chrome headless (`--remote-debugging-port=0`, profil temporaire), pilotage CDP brut par WebSocket natif, collecte non destructive des erreurs console. Scénario en 9 étapes, **27/27 assertions PASS, 0 erreur console** :

| Étape | Preuve in-browser |
|---|---|
| **S1** Index | Vue visible au démarrage ; 2 familles (Campagne + Laboratoire) ; N1 ouverte ; **N2 hachurée et désactivée** (état dérivé de `mathic.save.v1`) |
| **S2** Montage | Session montée sur clic réel ; page N1 ; moteur « formules » (b1 via seam) ; plateau = 3 tuiles réelles du niveau |
| **S3** Jouer | Rappel de sélection (« Formule : 2 + ») ; le 3e clic soumet la formule → vue Résolution |
| **S4** Résoudre | Vue scellée affichée ; **N2 débloquée par la récompense** (markCompleted délégué) ; victoire enregistrée (wins=1) ; bouton « Tourner la page » actif |
| **S5** Suivant | N2 montée via `next()` (b1 réel, échelle LADDER) |
| **S6** Progression | Index : **N1 dorée (MASTERED)** après victoire réelle ; N2 désormais ouverte |
| **S7** Lab | Page lab ouverte (moteur « grilles », jamais verrouillée) ; résolue par clics sur les coups OFFERTS uniquement ; savoir écrit dans `mathic.knowledge.v1` (LORE_ATELIER_001) |
| **S8** Frontière I-5 | **`mathic.save.v1` inchangé par le chemin lab** — invariant prouvé en conditions réelles |
| **S9** Reload | Index restauré ; N1 toujours MASTERED ; N2 toujours ouverte ; savoir restauré **sans doublon** ; persistance visible (mode persistent) |

Artefacts versionnés : `lab/e6-grimoire-evidence/` — captures `00-chargement.png` → `08-reload.png` + `e6-grimoire-result.json` (verdict : `"status": "E6 PROVEN"`).

---

## 6. Audit de Non-Régression et Intégrité

- **Moteur b1** (`src/b1/engine.mjs`, `levels.mjs`, `save.mjs`, `solver.mjs`) : non modifiés (I-1, verrou §3).
- **Moteur V5** (`src/v5/rules/*`) : non modifié (I-1, verrou §3) — lore absent (I-2).
- **Atelier M12..M16** (`seal.mjs`, `replay-controller.mjs`, `oculus-controller.mjs`, `knowledge.mjs`, `symbiote.mjs`) : non modifiés ; `knowledge.mjs` **réutilisé** par l'UI Grimoire via injection (aucune duplication d'écriture).
- **Compilation** : `npm run build` (363,25 kB), `build:b1` (60,46 kB), `build:atelier` (38,45 kB), `build:grimoire` (44,40 kB) — 4/4 succès.
- **Playtest** : 50/50 puzzles, joueur fautif 49/50 détections, 0 faux positif, undo restaure 50/50.
- **Total global des tests** : **442 PASS**, 0 échec, 0 skip.
- **Git** : worktree clean, `git diff --check` CLEAN, commits conformes aux conventions (messages détaillés, trailer Codebuff).

## 7. Question de fermeture M17 (contrat §9)

> *Le Grimoire permet-il à un joueur de parcourir la boucle complète (ouvrir → jouer → résoudre → récompense → progression → niveau suivant) en conditions réelles navigateur, sans qu'aucune règle, aucun état, aucune écriture de sauvegarde n'échappe aux modules existants — et sans que V5 ni b1 aient changé d'une ligne ?*

**OUI — prouvé.** Boucle complète exécutée in-browser (§5, 27/27, 0 erreur console) ; toute écriture passe par `save.mjs`/`knowledge.mjs` (I-5, §3) ; toute transition passe par les seams des moteurs intacts (I-1/I-3). M17 n'a ajouté **aucune règle** : le Grimoire est un lecteur de progression et un monteur de sessions, conformément au contrat §5.

## 8. Restant hors périmètre (volontaire)

- **P3 de l'audit M16** : marqueur LAB au Sceau, note multi-tab — non traités, sans impact sur M17.
- **APK Android (E6 APK)** : reporté à M21 (validation appareil).
- **Câblage LLM Maggeek (M19)** : emplacement réservé dans la boucle, aucune logique.
- **Portage b1 → V5** : non-goals confirmé par le spike (`lab/v5-portage-spike`, branche dédiée).
- **Étapes suivantes** : M18 — vue Saga UI (G18-04), preuve E6 (G18-05), puis fermeture (G18-06).
