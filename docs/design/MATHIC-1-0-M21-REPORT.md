# MATHIC 1.0 — M21 : Intégration Capacitor (APK)

## Contexte

M21 intègre le PWA Grimoire (dist-grimoire) dans l'enveloppe Capacitor/Android pour produire un APK natif installable.

## Intégration effectuée

`capacitor.config.json` : `webDir` mis à jour de `dist-b1` → `dist-grimoire`.

```
npx cap copy android
✔ Copying web assets from dist-grimoire to android/app/src/main/assets/public in 51.06ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 1.77ms
✔ copy android in 100.79ms
```

Assets PWA déployés dans `android/app/src/main/assets/public/` :
- `index.html`, `grimoire.css`, `grimoire.js`, `sw.js`, `manifest.webmanifest`
- `icons/icon-192.png`, `icons/icon-512.png`
- `cordova.js`, `cordova_plugins.js` (injectés par Capacitor)

## Blocage environnemental (APK non producible)

| Composant | Requis | Disponible |
|-----------|--------|------------|
| JDK (javac) | 17+ | JRE 25 (runtime seulement, **javac absent**) |
| Android build-tools | ✓ (compile) | **absent** |
| Android emulator / system-images | ✓ (test) | **absent** |
| Gradle | ✓ (build) | présent (gradlew) |

Consequences :
- `javac` absent → impossible de compiler le code source Android (Java/Kotlin).
- build-tools absent → impossible de générer le APK signé.
- emulator/system-images absent → impossible de vérifier le runtime natif.

## Statut

**M21 INTÉGRATION OK — APK BLOQUÉ PAR ENVIRONNEMENT**

L'intégration Capacitor (`cap copy`) est complète et les assets PWA sont correctement déployés. La production et la vérification d'un APK natif sont bloquées par l'absence de `javac`, `build-tools`, et `emulator/system-images` dans l'environnement courant.

## Prochaine étape

M21-Next : provisionner un environnement Android SDK complet (build-tools + system-images + JDK) pour exécuter `./gradlew assembleRelease` et produire un APK vérifiable.
