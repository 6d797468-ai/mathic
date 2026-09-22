# V3-AUDIT — Inventaire d'architecture MATHIC V3

> Gate **G0** — Baseline forensic. Équipe : **Kali** · Branche : `kali/g0`
> Commit de référence : `09a45a3` · Mesures du 2026-09-22.
> **G0 décrit l'état, il ne le corrige pas.** Chaque affirmation ci-dessous a été vérifiée par commande directe sur la machine kali (grep / sed / wc / stat / sha256sum).

---

## 1. Vue d'ensemble

Application de puzzle mathématique (fusion de tuiles à 4 opérateurs) livrée en **PWA** (GitHub Pages) + wrapper natif **Capacitor 8** (Android). Toute la logique tourne **100 % on-device**, y compris le coach IA « Momo » (LLM GGUF via wllama). Aucun backend.

```
┌─────────────────────────────  UI LAYER  ─────────────────────────────┐
│  main.js (orchestration, 1109 lignes) · ui.js · input.js            │
│  audio.js · tutorial.js · ai.js (Momo)                              │
└──────────────┬───────────────────────────────────────┬───────────────┘
               │ appels directs                        │ lit des variables internes (D9)
┌──────────────▼─────────────  GAME CORE  ────────────▼───────────────┐
│  board.js (règles + BFS) · puzzle.js (génération)                   │
│  diff.js · history.js (Undo) · targets.js                           │
└─────────────────────────────────────────────────────────────────────┘
       ↑ Math.random() présent dans les deux couches (D1–D4, D10)
```

## 2. Inventaire des modules (mesuré)

| Module | Rôle | Couplage | Débts |
|---|---|---|---|
| `src/main.js` | Orchestration : état, événements, niveaux, profil, Momo | Importe tout ; **1109 lignes** (God Object, D11) | D3, D6, D8, D9, D11 |
| `src/board.js` | Règles de fusion, spawn, chaînes, solveur BFS (`minMovesToReach:492`) | Pure, zéro DOM (sauf `Math.random`) | D1, D7, D10 |
| `src/puzzle.js` | Rétro-génération BFS + validateur d'honnêteté | Pure | D2, D10 |
| `src/diff.js` | Différentiel de tuiles entre deux états | Pure | — |
| `src/history.js` | Pile Undo immuable « Calvados » (LIFO, 50) | Pure | — |
| `src/targets.js` | Sélection des cibles | Pure | D4 |
| `src/ai.js` | Momo : wllama (`@wllama/wllama ^3.6.1`) + fallback hors-ligne | Couplé à main.js | D4, D9 |
| `src/ui.js` | Rendu DOM, animations, confettis | Couplé DOM | D4 |
| `src/input.js` | Swipe tactile + clavier | Couplé DOM | — |
| `src/audio.js` | Synthèse Web Audio (zéro asset) | Autonome | — |
| `src/tutorial.js` | FTUE scripté | Couplé DOM/main | — |
| `src/profiler.js` | Mesures de performance | Autonome | — |

## 3. Frontières observées

- **Core pur (zéro DOM)** : `board.js`, `puzzle.js`, `diff.js`, `history.js` — testés sous Node (`node --test`). C'est le périmètre que G1 figera.
- **Couche UI/plateforme** : `main.js` concentre GameState + UI + events + persistance + IA. La migration G1 (`src/core/`) a été **annoncée par lkaddafi mais n'existe pas dans cet environnement** — le registre ci-dessous décrit l'état V3 réel.
- **Artefacts lourds suivis par git** : GGUF 88 201 568 octets + wllama.wasm 8 457 512 octets (sous la limite GitHub 100 Mo/fichier, mais l'historique grossira à chaque remplacement — Git LFS à considérer en G0.6+).
- **Service Worker** : `public/sw.js` — `mathic-v2` hardcodé ligne 13 (D5), cache-first + cache par plages (Range) pour GGUF/wasm.
- **Persistance** : `localStorage` uniquement (`mathic_record`, `mathic_tutorial_done`, migration legacy `mather-best` en `main.js:152-161`) (D6).
- **Cible de structure V4** : `src/core/`, `src/levels/`, `src/progression/`, `src/persistence/`, `src/momo/`, `src/runtime/`, `src/ui/` — voir plan V4 de l'architecte.

## 4. Registre des dettes (vérifiées ligne par ligne)

Les identifiants D1–D11 sont **synchronisés avec `MATHIC-V3-BASELINE.json`** (source chiffrée).

| ID | Sév. | Dette | Emplacement vérifié | Gate de correction |
|---|---|---|---|---|
| D1 | P0 | `Math.random()` spawn tuiles | `src/board.js:93-94` | G2 |
| D2 | P0 | `Math.random()` génération puzzles | `src/puzzle.js:34, 141` | G2 |
| D3 | P0 | `Math.random()` narration réactive | `src/main.js:357, 369, 374, 379, 385` | G2 (hors Core) |
| D4 | P1 | `Math.random()` cosmétique/non-core | `ai.js:342,345,367` · `ui.js:252-256,391-392` · `targets.js:251,260` | G2+ |
| D5 | P0 | SW `mathic-v2` en dur | `public/sw.js:13` | G0.5 |
| D6 | P1 | `localStorage` pour profil/progression | `main.js:152-161` (+ usages) | G7 |
| D7 | P1 | BFS `minMovesToReach` sur thread UI | `board.js:481-518` | G10 |
| D8 | P1 | Niveaux hardcodés `PUZZLE_LEVELS` | `main.js:550, 565` | G3 |
| D9 | P0 | Momo lit les internes de main.js | `main.js:347-388` | G8 |
| D10 | P0 | Aucun PRNG déterministe (replay impossible) | 20 occurrences `Math.random` / 6 fichiers | G2 |
| D11 | P1 | God Object `main.js` (1109 lignes) | `src/main.js` | G1→G8 progressif |

**Écarts avec le plan de l'architecte** (transparence) :
- `Math.random` dans `puzzle.js` : plan annonçait lignes 34-35, réel **34 et 141** (le `choice` de la ligne 35 n'existe pas tel quel).
- `Math.random` dans `main.js` : plan annonçait 357/369/374/379/385 — réel **conforme** (355+3=357 etc.).
- `localStorage` : plan annonçait 89/298 — réel : les usages directs sont plus diffus, migration legacy visible en 152-161.
- `BFS` : plan annonçait 492-518 — réel `minMovesToReach` exporté **:492**, doc depuis 481. Conforme.
- `PUZZLE_LEVELS` : conforme (550, 565).
- Ligne `sw.js` : conforme (13).

## 5. État de vérification (base de G0-BASELINE.md)

| Domaine | Statut |
|---|---|
| Tests unitaires logique (Node) | ✅ PROVEN 3/3 |
| Playtest joueur parfait / fautif | ✅ PROVEN 50/50 · 0 faux positif |
| Build Vite production | ✅ PROVEN (362,90 kB / gzip 159,75 kB) |
| Audit deps prod (`npm audit`) | ✅ PROVEN 0 vulnérabilité |
| CI Android (debug APK) | ⚠️ PRÉSENT (workflow), runs non re-certifiés aujourd'hui |
| CI Pages | ⚠️ PRÉSENT, provisioning non confirmé |
| PWA offline runtime (SW actif, Range, mode avion) | ⬜ NOT-TESTED (objet du gate G0.5) |
| Android WebView runtime | ⬜ NOT-TESTED (G0.5) |
| Déterminisme / replay | ❌ BROKEN par construction (D1-D3, D10) |
| Empreintes des artefacts lourds | ✅ PROVEN (SHA-256 dans le manifeste JSON) |
