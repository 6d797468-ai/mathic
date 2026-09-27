# MATHIC 1.0 — M23 : Atelier Astral — Sound Design + PWA

## Contexte

`Mathic-Univers-2.txt` décrit l'Atelier Astral — un laboratoire expérimental V5 avec 6 fonctionnalités narrative. Cinq d'entre elles étaient **déjà implémentées** (Sceau, Sablier, Oculus, Symbiote, Fragments de Savoir) mais l'Atelier manquait de :

1. **Sound Design** (Le Paysage Sonore) — sons ASMR/mécaniques, absence totale
2. **PWA** — aucun manifest, SW, ou cache offline
3. **Preuve E6** — aucun test headless browser

## 1. Sound Design "Lo-Fi" / Brut (M23.1)

`src/atelier/web/atelier-audio.mjs` — couche audio 100% Web Audio API, inspirée du thème narratif :

| Événement | Son | Technèque |
|-----------|-----|-----------|
| PLACE valide | "plume sur parchemin" | triangle 880→660Hz, glide 60ms |
| PLACE refusé | "éclat de verre" | noise burst + square freq drop |
| Symbiote forge | "engrenages qui s'enclenchent" | sawtooth ramp 110→880Hz + arpège |
| Oculus ouvre | "lentille qui se focalise" | filter sweep lowpass 200→2000Hz |
| Sceau créé | "runes qui s'incarnent" | arpeggio Do5/Mi5/Sol5 |
| Rewind | "sable qui coule" | granular noise reverse, playbackRate 0.5 |
| Victoire | "harmonie stable" | chord majeur Do5/Mi5/Sol5/Do6, fade 1s |

Injection dans `atelier.js` — hooks sur `place`, `placeReject`, `playForge`, `playOculus`, `playVictory`, `playRewind`, `playSeal`.
- `pointerdown` → `audio.unlock()` (déblocage autoplay).
- Aucun asset fichier (contrainte M20).
- Web Audio API uniquement.

## 2. PWA Atelier (M23.2)

Miroir de M20 pour l'Atelier :

- `src/atelier/web/public/manifest.webmanifest` — display=standalone, 2 icônes.
- `src/atelier/web/public/sw.js` — cache-first install/activate/fetch.
- `vite.atelier.config.mjs` — `publicDir` → real public dir.
- `index.html` — manifest link + apple-touch-icon meta.
- `atelier.js` — SW registration + vibrate hooks.

## 3. E6 Browser Proof (M23.3)

`lab/e6-atelier-proof.mjs` — headless Chromium CDP :

**24/24 assertions pass** (0 console errors) :

| # | Assertion | Status |
|---|-----------|--------|
| S0 | manifest link + apple-touch-icon + viewport + SW + vibrate + Web Audio | ✅ |
| S0 | board + presets affichés | ✅ |
| S1 | SW registered + activated | ✅ |
| S2 | plateau 2×2 chargé (SUM2X2) | ✅ |
| S3 | coup valide appliqué | ✅ |
| S4 | Oculus d'Analyse ouvre | ✅ |
| S5 | Sablier remonte au curseur 0 | ✅ |
| S6 | Symbiote forge défi hybride | ✅ |
| S7 | Sceau de Défi généré | ✅ |
| S8 | Sceau importé (round-trip) | ✅ |
| S9 | caches Cache API (offline) | ✅ |
| S10 | navigation offline cache-first | ✅ |
| S11 | Audio context accessible | ✅ |
| S12 | reload stable (plateau rechargé) | ✅ |
| E6 | 0 erreur console/exception | ✅ |

## Invariants

- **Audio ≠ Moteur** : la couche audio est pure synthèse, aucune logique métier.
- **PWA ≠ Mutation moteur** : manifest/SW sont infrastructure.
- **Projection ≠ Mutation** : le reload stable prouve que la vue ne modifie pas l'état.

## Test régression

```
npm test → 487 tests pass (aucune régression)
npm run build:atelier → dist-atelier complet (12 modules, 42.43kB js)
```

## Statut

**M23 PROVEN** — Atelier Astral complet : les 6 dimensions de `Mathic-Univers-2.txt` sont implémentées, audiovisuelles, PWA-installable, et prouvées par E6 browser (24/24).
