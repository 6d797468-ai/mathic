# MATHIC 1.0 — M20 : PWA (Service Worker + Manifeste)

## Contexte

M20 transforme le Grimoire en Progressive Web App installable, capable de fonctionner hors-ligne avec un cache-first strategy, manifeste standalone, et haptics via Vibration API.

## Contraintes respectées

- Aucun JavaScript du cœur (`src/b1/`, `src/v5/`) muté.
- Le Service Worker est une couche infrastricture : il ne possède aucune logique métier.
- `mathic.save.v1` et `mathic.knowledge.v1` conservent leurs écrivains uniques.
- PWA additive : aucun changement à la logique de scoring, de progression ou de règles.

## Architecture

```
src/grimoire/web/public/
├── manifest.webmanifest    → name, short_name, display=standalone, theme_color, 2 icônes
├── sw.js                    → Cache-first SW : install (cache.addAll) / activate (cleanup) / fetch (cache-first)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

### Modifications du shell web

- `vite.grimoire.config.mjs` : `publicDir: false` → `resolve(.../src/grimoire/web/public)` (publie les assets PWA).
- `index.html` : `<link rel="manifest">`, `<link rel="apple-touch-icon">`, meta apple-mobile-web-app-*.
- `grimoire.js` : enregistrement SW (`navigator.serviceWorker.register("./sw.js")`) + hook haptics (`vibrate()` via Vibration API) injecté dans `handlePlayResult`, `renderResolved`, `renderFailed`.

## Tests

```
lab/e6-pwa-proof.mjs → E6 headless Chromium CDP, 17/17 assertions pass, 0 console errors
npm test → 487 tests pass (régression)
```

### E6 PWA — Assertions (17/17)

| # | Assertion | Status |
|---|-----------|--------|
| S0 | link[rel=manifest] présent | ✅ |
| S0 | meta viewport optimisé mobile | ✅ |
| S0 | apple-touch-icon présent | ✅ |
| S0 | serviceWorker API navigable | ✅ |
| S0 | Vibration API disponible (haptics) | ✅ |
| S1 | SW enregistré (scriptURL contient sw.js) | ✅ |
| S1 | SW state = activated | ✅ |
| S2 | manifeste fetchable + lisible | ✅ |
| S2 | display = standalone | ✅ |
| S2 | ≥ 2 icônes manifeste | ✅ |
| S3 | caches Cache API présents | ✅ |
| S4 | index.html mis en cache | ✅ |
| S4 | grimoire.css mis en cache | ✅ |
| S4 | grimoire.js mis en cache | ✅ |
| S5 | navigation offline (cache-first) | ✅ |
| S6 | gameplay offline complet (save écrite) | ✅ |
| E6 | zéro erreur console/exception | ✅ |

## Invariants

- **PWA ≠ Mutation moteur** : le SW et le manifeste sont infrastricture, pas logique métier.
- **Offline = cache-first** : le navigateur sert du cache local, pas du réseau.
- **Installabilité = standalone** : aucune barre d'URL, icônes natives.

## État

**M20 PROVEN** — PWA complète, E6 headless Chromium (17/17, 0 console errors), build `dist-grimoire` contient manifest, sw.js, icons.
