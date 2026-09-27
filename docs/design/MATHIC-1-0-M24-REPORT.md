# MATHIC 1.0 — M24 : Release Build & Installable Delivery

## Contexte

M24 produit le build de release final, vérifiable sur téléphone (PWA + APK), avec tous les artefacts de distribution.

## Builds produits

### PWA (Grimoire + Atelier)

| Bundle | Dir | Hashes (SHA-256) |
|--------|-----|------------------|
| Grimoire | `dist-grimoire/` | `grimoire.js`: d11ab440…, `grimoire.css`: de8b3360…, `sw.js`: 4783560a… |
| Atelier | `dist-atelier/` | `atelier.js`: e1583985…, `atelier.css`: 3a3a84ec…, `sw.js`: a207e424… |

Tous deux sont PWA complètes :
- Manifest standalone (display=standalone, 2 icônes)
- Service Worker cache-first (install/activate/fetch)
- Offline jouable A→Z
- Haptics via Vibration API
- Audio Atelier (ASMR/mécanique — M23)

### Android APK

| Variant | SHA-256 | Size | Status |
|---------|---------|------|--------|
| debug | a87b9e65… | 4.5 MB | ✅ Signé (v2 scheme) |
| release | 431f62ee… | 3.4 MB | ✅ Signé (v2 scheme) |

- `package: com.mathic.game`
- `versionCode: 1`, `versionName: 1.0`
- `minSdk: 24`, `targetSdk: 36`
- PWA assets dans `assets/public/` (index.html, grimoire.js, sw.js, manifest, icons)

## Production

```sh
# PWA
npm run build:grimoire && npm run build:atelier

# APK (environnement provisionné : JDK 21 + Android SDK build-tools 34 + platform 34)
cd android && ./gradlew assembleRelease  # → app-release-unsigned.apk
zipalign -f -p 4 app-release-unsigned.apk app-release.apk
apksigner sign --ks mathic-release.jks app-release.apk

# Debug (auto-signé)
./gradlew assembleDebug  # → app-debug.apk
```

## E6 Preuves

| Suite | Assertions | Console Errors |
|-------|-----------|-----------------|
| E6 PWA (Grimoire) | 17/17 pass | 0 |
| E6 Atelier Astral | 24/24 pass | 0 |
| npm test (unit + playtest) | 487/487 pass | — |
| Playtest (Perfect Move) | 50/50 puzzles | — |

## Artefacts de release

```
release/
├── MATHIC-1-0-release.json     → manifeste complet (hashes, APK, PWA, E6)
└── (APK + PWA bundles dans leurs dists respectifs)

docs/design/
├── MATHIC-1-0-M19-REPORT.md    → Couche intel Maggeek/Momo
├── MATHIC-1-0-M20-REPORT.md    → PWA Grimoire installable + E6 17/17
├── MATHIC-1-0-M21-REPORT.md    → Capacitor integration + APK env-blocked → resolved
├── MATHIC-1-0-M22-REPORT.md    → Release reproducibility manifest
├── MATHIC-1-0-M23-REPORT.md    → Atelier Astral sound + PWA + E6 24/24
└── MATHIC-1-0-M24-REPORT.md    → Release build & installable delivery (ce document)
```

## Vérification installation

```
APK : apksigner verify → "Verification succesful" (v2 scheme: true)
PWA : 0 console errors, 0 exceptions, offline gameplay confirmed
```

## Statut

**M24 PROVEN** — Build de release produit et signé, PWA installable (manifest + SW), APK vérifiable (apksigner), 487 tests pass + 2 E6 proofs (17/17 + 24/24) + playtest 50/50.

**Sortie finale du chantier :** build installable sur téléphone, gameplay A→Z, persistence, offline, Momo/fallback, écran tactile.
