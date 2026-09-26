# PLAN — M23 : Atelier Astral Sound Design + PWA

## Contexte

`Mathic-Univers-2.txt` décrit 6 fonctionnalités pour l'Atelier Astral. **Toutes sont déjà implémentées** dans `src/atelier/web/atelier.js` et testées (111 tests pass). Les gaps restants :

1. **Sound Design "Lo-Fi" / Brut** — `src/audio.js` est pour le B1 (V2). L'Atelier n'a aucun son : pas de plume sur papier, pas de cliquetis d'Astrolabe, pas de bourdonnement Puits de Gravité.
2. **PWA Atelier** — Pas de manifest, pas de SW, pas de cache offline. Le Grimoire a eu M20, l'Atelier est exposé mais pas installable.
3. **E6 browser proof** — Aucun test headless CDP pour l'Atelier (contrairement aux E6 saga + PWA du Grimoire).

## Phase 1 : Sound Design Atelier (M23.1)

Créer `src/atelier/web/atelier-audio.mjs` — couche audio ASMR/mécanique, inspirée de `src/audio.js` mais adaptée au thème de l'Atelier :

| Événement | Son | Caractéristique |
|-----------|-----|-----------------|
| PLACE valide | "clic métallique de plume sur parchemin" | triangle court, 880Hz → 660Hz, glide 50ms |
| PLACE refusé (obs) | "éclat de verre" | noise burst + freq drop |
| Symbiote forge | "engrenages qui s'enclenchent" | sawtooth ramp 220→880Hz, 300ms |
| Oculus ouvre | "lentille de laiton qui se focalise" | filter sweep 200→2000Hz |
| Sceau créé | "plume qui trace runes" | arpeggio 3 notes, 150ms |
| Sceau importé | "papier froissé + cache" | noise + low-pass |
| Chronos back | "sable qui coule" | granular synth, reverse |
| Victoire | "résolution harmonique" | chord majeur, fade 1s |

- 100% Web Audio API, aucun asset fichier (contrainte M20)
- `createAtelierAudio()` → `{ unlock, playPlace, playReject, playForge, playOculus, playSeal, playRewind, playVictory }`
- Injecté dans `atelier.js` via `import()` dynamic (lazy, pas de blocage charge)
- Tests unitaires : `tests/atelier/audio.test.mjs` (sinon via E6)

## Phase 2 : PWA Atelier (M23.2)

Miroir de M20 pour l'Atelier :

1. Créer `src/atelier/web/public/` :
   - `manifest.webmanifest` (name="MATHIC — Atelier Astral", display="standalone", theme_color="#0b0e1a")
   - `sw.js` (cache-first, même pattern que M20)
   - `icons/icon-192.png`, `icons/icon-512.png` (réutiliser les Grimoire icônes → `scripts/gen-icons.mjs`)
2. Mettre à jour `vite.atelier.config.mjs` : `publicDir: false` → `resolve(.../src/atelier/web/public)`
3. Mettre à jour `src/atelier/web/index.html` : manifest link + apple-touch-icon
4. Mettre à jour `src/atelier/web/atelier.js` : SW registration + vibrate hook

## Phase 3 : E6 Browser Proof (M23.3)

`lab/e6-atelier-proof.mjs` — headless Chromium CDP :

Assertions (cible 15/15) :
- A0 · board 2×2 affiché (preset SUM2X2)
- A1 · cellules cliquables + move valide → 1 coup
- A2 · Oculus ouvre + analyzeState retourne getMoves > 0
- A3 · Symbiote forge (2 Gardiens) → composition valide
- A4 · Sceau généré → decodeSeal round-trip OK
- A5 · Sceau importé dans nouvelle session → identique
- A6 · Sablier back/undo → position 0, état initial
- A7 · PWA : manifest link + SW registered + cache hit
- A8 · offline : navigation cache-first OK
- A9 · 0 console errors
- A10 · projection ≠ mutation (reload stable)
- A11 · audio unlock (Web Audio context résumé après gesture)

## Phase 4 : Commit + Rapport

1. Commit M23 (audio + PWA + E6)
2. Rapport `docs/design/MATHIC-1-0-M23-REPORT.md`
3. `git diff --check` + worktree clean

## Ordonnancement

| Phase | Effort | Dépendance |
|-------|--------|------------|
| 1.1 Sound Layer | ~25 min | — |
| 1.2 Audio Injection | ~10 min | 1.1 |
| 2. PWA Atelier | ~15 min | M20 (modèle) |
| 3. E6 Proof | ~20 min | 1, 2 |
| 4. Report + Commit | ~10 min | 3 |

**Total : ~60-80 min**

## Risque

- Pas de speakers headless → l'audio ne peut pas être vérifié par E6. Mitigation : le E6 teste l'AudioContext état (suspend/resumed) + l'existence des fonctions exportées, pas le son réel.
