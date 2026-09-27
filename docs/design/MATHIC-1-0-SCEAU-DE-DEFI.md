# MATHIC 1.0 — MISSION 12 : SCEAU DE DÉFI (Univers Mathic — première fonctionnalité produit)

**Référence** : MISSION 12 — `SCEAU DE DÉFI` · Atelier Astral
**Statut** : IMPLÉMENTÉ, TESTÉ, PROUVÉ (voir `MATHIC-1-0-SCEAU-DE-DEFI-REPORT.md`).

---

## 1. Objet

Transformer une session/spec V5 reproductible en un **Sceau** : un code court,
versionné, vérifiable et partageable, qui permet de recréer **exactement** le
même défi Mathic **hors ligne**, sur n'importe quel appareil, sans serveur, sans
compte, sans réseau, sans signature cryptographique, sans aucun hasard.

Le critère de mission : `decode(encode(spec)) = spec`, puis
`createSession(spec_A) ≡ createSession(spec_B)`, puis
`canonical(state_A°)=canonical(state_B°)` pour une même suite de commandes —
autrement dit **deux appareils produisent exactement le même défi à partir du
même Sceau**.

Ce qui n'existait pas avant, et que cette mission matérialise :

- un module pur `src/atelier/seal.mjs` (encode/decode/verify + CRC32 pure +
  base64url pur + JSON canonique), zéro dépendance, zéro réseau, zéro horloge ;
- une enveloppe partageable `MATHIC-CHAL-1:<payload>:<checksum>` ASCII-safe ;
- 16 tests `SEAL-01..14 + SEAL-C` prouvant déterminisme, rejet propre des
  Sceaux altérés, et non-régression ;
- une preuve « deux appareils » en deux processus séparés
  (`scripts/seal-reproducibility.mjs`) ;
- une page Atelier Astral minimale **hors ligne**
  (`src/atelier/web/`, build `dist-atelier/`) : créer une anomalie → jouer →
  frapper le Sceau → copier → importer → vérifier → initier le défi.

## 2. Périmètre (autorisé / interdit)

**AUTORISÉ** : `src/atelier/**` · `tests/atelier/**` ·
`scripts/seal-reproducibility.mjs` · `vite.atelier.config.mjs` · `docs/design/**`.

**INTERDIT (respecté)** : Engine · Solver · Policy · Orchestrator · Save · B1 ·
main.js · Progression · Runtime Intelligence · M9 catalogue.
Aucun déplacement de fichier existant. Aucun refactor opportuniste. Aucune
dépendance réseau. Aucun serveur. Aucun compte. Aucune signature
cryptographique. Aucun hasard (`Math.random`/`Date.now` bannis du chemin de
décision).

## 3. Architecture (3 strates, moteur souverain)

```
Atelier UI (src/atelier/web)                     ← couche produit (hors ligne)
        │  encodeSeal / decodeSeal / verifySeal
        ▼
Challenge Seal (src/atelier/seal.mjs)            ← NEW · pur, déterministe
        │  validateSpec → createSession(spec)    ← uniquement des reads Engine
        ▼
V5 Adapter (src/runtime/game-adapter-v5.js)       ← EXISTANT, non modifié
        │
        ▼
Game Engine (src/v5/rules/engine.mjs)             ← INTACT, autorité unique
```

L'UI ne touche le moteur que via `createV5GameAdapter`. Le Sceau ne touche le
moteur que par `validateSpec` (read) avant de rendre le spec. La session n'est
créée qu'après validation complète — jamais l'inverse.

### Invariant de sécurité (chaîne imposée, implémentée telle quelle)

```
raw seal → parse → format validation → version validation → checksum
validation → spec validation → createSession(spec)
```

Une donnée externe n'atteint **jamais** le moteur avant validation complète.
`decodeSeal` ne crée pas de session : il valide et retourne un spec ; la session
est créée par l'adapter après `ok:true`.

### Invariant produit

Le Sceau **crée un défi**, jamais : débloquer un niveau, modifier une
progression, modifier une sauvegarde, modifier le profil, appeler la Policy.
`src/atelier/**` ne référence ni `save.mjs`, ni `getProgress`, ni la Policy.

## 4. Format du Sceau

```
MATHIC-CHAL-1:<payload-base64url>:<crc32-hex>
```

- **version d'enveloppe** `1` (constante `SEAL_PREFIX_VERSION`).
- **payload** : `canonicalJson({ schemaVersion:1, gameVersion:"v5",
  ruleVersion:"v5-engine", spec, origin:"atelier",
  metadata:{createdFrom:"spec"} })` encodé en **base64url** (implémentation
  pure, navigateur + Node).
- **checksum** : CRC32 (table, implémenté pur) sur le payload encodé, en hex 8.

### Pourquoi le payload = spec complet (pas `canonical(s)`)

Le moteur expose `canonical(s) = JSON.stringify([s.grid])` : il ne couvre **que
la grille** — ni `reserve`, ni `rows`, ni `cols`. Deux specs à grilles
identiques mais réserves différentes produisent le même `canonical`. Le Sceau
doit donc porter le **spec entier** (`grid` + `rows` + `cols` + `reserve`),
sinon deux défis différents deviendraient indistinguables. `canonical` reste un
helper d'identité d'état au runtime (preuve 2-appareils), pas une identité de
défi.

### Pourquoi base64url

ASCII-safe (copier-coller parfait : WhatsApp, SMS, navigateur, store,
terminal), URL-safe (`-`/`_`, pas de `+`/`/`/`=`), ~25 % plus court que
base32 — retenu d'après décision de conception.

### Pourquoi CRC32

CHECKSUM = **intégrité** (détection de toute altération), pas authentification
ni confidentialité. CRC32 (32 bits, implémentation pure déterministe) suffit à
rejeter toute corruption d'un caractère (SEAL-06). La **signature asymétrique
reste hors périmètre** — le Sceau est un artefact de partage d'un défi, pas un
certificat d'autorité.

### Pourquoi des constantes (pas package.json)

`gameVersion`/`ruleVersion` sont des constantes de module lues à l'encode et au
décode. Aucune lecture de `package.json` à chaud (navigateur), aucune
modification d'Engine. Une future règle produirait une nouvelle
`schemaVersion`/`ruleVersion` → rejet propre côté ancien client (SEAL-07/14).

## 5. Déterminisme

- **JSON canonique** : `sortKeys` trie les clés (numériques d'abord, puis
  lexicales) récursivement — `{2:.., 3:.., 5:..}` reste `2,3,5` quel que soit
  l'ordre d'insertion de la réserve.
- **base64url pur** : aucune dépendance à `Buffer`/`btoa`, déterministe.
- **CRC32 pur** : table construite statiquement.
- **Aucun hasard, aucune horloge** dans encode/decode/verify : deux exécutions
  séparées du même spec produisent le **même** Sceau byte-identique
  (SEAL-01/02/12).

## 6. Modules livrés

| Fichier | Rôle |
|---|---|
| `src/atelier/seal.mjs` | encode/decode/verify + sortKeys/canonicalJson + crc32 + base64url pur + constantes versions |
| `tests/atelier/seal.test.mjs` | SEAL-01..14 + SEAL-C (16 tests) |
| `scripts/seal-reproducibility.mjs` | preuve 2-processus (device A → Sceau → device B) |
| `src/atelier/web/index.html` | page Atelier Astral (Créer → Jouer → Sceau → Copier → Importer → Vérifier → Initier) |
| `src/atelier/web/atelier.css` | thème Dark Academia / Cosmic Fantasy (re-branding) |
| `src/atelier/web/atelier.js` | logique UI via `createV5GameAdapter` + seal |
| `vite.atelier.config.mjs` | build standalone `dist-atelier/` |

## 7. Tests et preuves

- **SEAL-01..14 + SEAL-C** (16 tests, `node --test tests/atelier/seal.test.mjs`) :
  identité byte-identique · multi-exécutions · reconstruction
  `createSession` · `getState(init)` identique · même suite de `apply` → mêmes
  états + `canonical` final identique · 1 caractère muté → checksum rejeté ·
  version inconnue → rejet propre · spec invalide → rejet avant `createSession`
  · malformé → aucune mutation · progression intacte · accès Engine via adapter
  uniquement · hors-ligne pur · non-régression v1 · contrat d'enveloppe ·
  vecteur CRC32 standard `0xcbf43926`.
- **Reproductibilité** (`npm run seal:reproducibility`) : deux processus
  séparés, seul médiaux = la chaîne Sceau → `spec_A == spec_B`, 5 états
  identiques, `canonical(final)==[[[2,3],[2,5]]]`, `moves=4 solved=true`.

## 8. Vérification finale attendue

`SEAL-01..14 PASS` · `seal-reproducibility PASS` · `npm test PASS` (327, dont 16
SCEAU) · `npm run build PASS` · `npm run build:atelier PASS` · playtest 50/50
PASS · `git diff --check` PASS · worktree propre · `HEAD == origin` après push.