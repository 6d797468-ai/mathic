# MATHIC 1.0 — Rapport de mandat : Sceau de Défi (MISSION 12)

**Référence** : MISSION 12 — `SCEAU DE DÉFI` · Méthode : `MATHIC-1-0-SCEAU-DE-DEFI.md`
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ. Aucune anomalie bloquante rencontrée ;
une anomalie de décodage (accumulateur base64url non masqué) a été trouvée puis
corrigée localement pendant la mission — voir §8.

---

## 1. Objet atteint

La chaîne complète du mandat est **machine-vérifiée** :

```
Créer anomalie → Jouer → Créer Sceau → Copier → Importer → Vérifier →
Reconstruire → Rejouer → Même défi → Même résultat déterministe ✅
```

avec, en fin de mission :

- SEAL-01..14 PASS (16 tests : SEAL-01..14 + 2 SEAL-C) ;
- reproductibilité **2 processus séparés** PASS ;
- `npm test` PASS (327 tests, dont 16 Sceau) ;
- `npm run build` PASS · `npm run build:atelier` PASS ;
- playtest 50/50 PASS (coups parfaits, coups fautifs + undo) ;
- `git diff --check` PASS · worktree propre après commit.

## 2. Preuve de reproductibilité (device A ↔ device B)

Sortie `node scripts/seal-reproducibility.mjs` :

```
PREUVE M12 — REPRODUCTIBILITÉ DEUX APPAREILS : PASS
  spec canonique     : {"cols":[…],"grid":[[-1,-1],[-1,-1]],"reserve":{"2":2,"3":1,"5":1},"rows":[…],…}
  états (5) identiques entre appareils
  canonical final    : [[[2,3],[2,5]]]
  moves / solved     : 4 / true

  decode(encode(spec)) = spec                     → OK
  createSession(specA) ≡ createSession(specB)     → OK
  canonical(stateA°) = canonical(stateB°)         → OK
```

Le **seul** média entre les deux processus est la chaîne Sceau (fichier
transitoire dans `/tmp`), ce qui reproduit le geste copier-coller. Deux
exécutions séparées du même spec produisent un Sceau **byte-identique** (SEAL-01/02).

## 3. Constats moteur vérifiés en code

| Point | Constat |
|---|---|
| `canonical(s)` | = `JSON.stringify([s.grid])` : **grille seule**, réserve/rows/cols incluses dans le spec. Le Sceau porte donc `spec` complet, pas `canonical`. |
| `validateSpec` | rejet `TypeError` détaillé sur spec corrompue : réutilisé comme porte d'entrée `decodeSeal` (SEAL-08) — arrête la chaîne avant `createSession`. |
| `createSession(spec)` | copie grille+réserve, enregistre `moves/events` : base des états identiques entre appareils. |
| `createV5GameAdapter` | fournit `start/move/undo/getState/getCommands/canonical` : l'UI Atelier s'appuie dessus sans toucher l'Engine. |
| Progression | aucune référence à `save.mjs`/Policy/Progression dans `src/atelier/**` (SEAL-10/11). |

## 4. Résultats tests

### SEAL-01..14 (résumé)

| Test | Résultat |
|---|---|
| SEAL-01 même spec → même Sceau byte-identique | PASS |
| SEAL-02 exécutions séparées → byte-identiques | PASS |
| SEAL-03 décode → createSession valide (3 specs) | PASS |
| SEAL-04 getState(init) identique | PASS |
| SEAL-05 même suite de apply → mêmes états + canonical final identique | PASS |
| SEAL-06 1 caractère muté → checksum rejeté | PASS |
| SEAL-07 version d'enveloppe inconnue → rejet propre | PASS |
| SEAL-08 spec invalide embarquée → rejet avant createSession | PASS |
| SEAL-09 malformé → aucune mutation | PASS |
| SEAL-10 import → aucune modification de progression | PASS |
| SEAL-11 accès Engine via adapter uniquement | PASS |
| SEAL-12 création hors ligne (sans horodatage) | PASS |
| SEAL-13 import/verify locaux sans effet de bord | PASS |
| SEAL-14 nouveau schéma → rejet version, v1 intact | PASS |

### Fixtures utilisées

- `SUM2X2` (sommes, réserve `{2:2,3:1,5:1}`) — repris de `tests/v5/rules.test.mjs` ;
- `MIXED2X2` (mixte `*`/`-`/`+`, réserve `{2:1,3:1,5:1,7:1}`) ;
- `SPEC_1X3` (monoligne, cibles simples par colonne) ;
- vecteur CRC32 standard `"123456789" → 0xcbf43926` (interopérabilité).

### Taille caractéristique du Sceau

Spec `SUM2X2` → Sceau **422 caractères** (mesuré). L'enveloppe reste du
copier-coller ASCII-safe (base64url), conforme à l'objectif code court & partageable.

## 5. Atelier Astral (UI hors ligne)

Page standalone buildée (`dist-atelier/`) : presets (Anomalie du jour), grille
V5 cliquable via `createV5GameAdapter`, HUD coups/résolu/réserve, frappe du
Sceau + copie (`navigator.clipboard`, rechute sélection manuelle), import
(vérification stricte → aperçu `rows×cols` → « Initier le défi »). Style Dark
Academia / Cosmic Fantasy conforme au re-branding (fonds abyssaux, or/violet,
monospace terminal pour Sceau). Aucune I/O réseau : tout se déroule in-memory.

## 6. Respect des interdits — vérifié

- `git status` : seuls les fichiers M12 sont nouveaux/ajoutés (voir §7) ; aucun
  fichier existant modifié hors `package.json` (2 scripts npm ajoutés) et
  `docs/design/**` ;
- aucun import réseau ni serveur dans `src/atelier/**` ;
- aucun `Math.random`/`Date.now` dans `seal.mjs` (SEAL-12 le prouve :
  aucun motif d'horodatage dans le Sceau) ;
- Engine/Solver/Policy/Orchestrator/Save/B1/main.js : **intacts** (diff vide).

## 7. Fichiers de la mission

```
src/atelier/seal.mjs                        NEW
src/atelier/web/index.html                  NEW
src/atelier/web/atelier.css                 NEW
src/atelier/web/atelier.js                  NEW
tests/atelier/seal.test.mjs                 NEW
scripts/seal-reproducibility.mjs            NEW
vite.atelier.config.mjs                     NEW
package.json                                2 scripts ajoutés (build:atelier, seal:reproducibility)
docs/design/MATHIC-1-0-SCEAU-DE-DEFI.md     NEW
docs/design/MATHIC-1-0-SCEAU-DE-DEFI-REPORT.md  NEW
```

## 8. Anomalie rencontrée et corrigée (règle « une anomalie ≠ funérailles »)

**Symptôme** : `decode(encode(spec))` retournait `PAYLOAD` illisible alors que
l'encodage était byte-identique.

**Cause** : l'accumulateur de `base64urlToBytes` ne masquait pas les bits
résiduels après l'extraction d'un octet (`acc &= (1 << bits) - 1` manquant), et
`TextDecoder.decode` exigeait une vue typée (`Uint8Array`).

**Correction** : masquage ajouté + enveloppe `Uint8Array` dans `decodeUtf8`.
**Re-test** : suite Sceau complète PASS + round-trip multi-specs PASS avant
continuer. La mission a repris immédiatement — pas de cérémonie, pas de
régression engendrée.

## 9. Limites et suite

- **Sceau = défi, pas autorité** : aucune signature asymétrique (M12 exclut).
  Un Sceau forgeable — c'est un partage de défi, pas un certificat ; l'intégrité
  de *transport* (corruption) est couverte par le CRC32, pas l'authenticité.
- **422 caractères** : compact pour copier-coller ; un encodage surplus (base36/
  abréviations spec) est possible plus tard si le partage à la voix devient un besoin.
- **Suite (feuille de route)** : M13 Replay/Sablier (rejouer une incantation),
  M14 Oculus, M15 Fragments de Savoir, M16 Symbiote des Gardiens → Atelier Astral complet.
  Le Sceau en est la fondation : chaque futur artefact devra conserver la même
  invariabilité `decode(encode(x)) = x` et le même rejet fail-fast.