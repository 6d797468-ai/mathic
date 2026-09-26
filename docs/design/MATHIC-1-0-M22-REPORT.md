# MATHIC 1.0 — M22 : Manifeste de Reproductibilité de Release

## Contexte

M22 formalise la reproductibilité des builds de release pour le Grimoire PWA (`dist-grimoire`), en s'appuyant sur le modèle déjà éprouvé par M12 (sceau de reproductibilité à deux appareils).

## Garanties de reproductibilité

### 1. Build Vite déterministe

- `npm ci` installe les dépendances verrouillées via `package-lock.json` (commit-pinned).
- `npm run build:grimoire` (`vite build --config vite.grimoire.config.mjs`) produit `dist-grimoire/` de manière déterministe :
  - `outDir: resolve(..., "dist-grimoire")`
  - `emptyOutDir: true` (pas d'artefacts résiduels)
  - `rollupOptions.output` fixe les noms : `grimoire.js` (entry), `grimoire.[ext]` (assets)
  - `base: "./"` (chemins relatifs, indépendants de l'hôte)

### 2. Assets statiques versionnés

- `public/` copié tel quel via `publicDir` (manifest.webmanifest, sw.js, icons/).
- Aucun hash de build injecté → les assets sont byte-identiques entre runs.

### 3. Sceau de reproductibilité (hérite de M12)

- `scripts/seal-reproducibility.mjs` démontre `decode(encode(spec)) = spec` et identité de `canonical(final)` entre deux processus isolés.
- M22 étend: le même `build:grimoire` exécuté sur deux runners CI (ubuntu-latest) produit des `dist-grimoire/grimoire.js` + `dist-grimoire/grimoire.css` byte-identiques (deterministic build).

### 4. CI/CD

- `.github/workflows/test.yml` : tests + build sur toute PR / branche `kali/*`.
- `.github/workflows/pages.yml` : déploiement GitHub Pages sur `main`.
- `.github/workflows/android-build.yml` : production d'APK (déclenché manuellement).

## Vérification reproductibilité

```sh
# Deux builds isolés → checksums identiques
npm run build:grimoire
sha256sum dist-grimoire/grimoire.js    # A
rm -rf dist-grimoire
npm run build:grimoire
sha256sum dist-grimoire/grimoire.js    # B → A == B ✓
```

## Release manifest

```
dist-grimoire/
├── index.html              # 100% statique, PWA shell
├── grimoire.css            # feuille de style (sha256 pinnée)
├── grimoire.js             # bundle Vite (sha256 pinnée)
├── manifest.webmanifest    # PWA installability
├── sw.js                   # Service Worker (cache-first)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Pin cédéché (M11 EXP-05)

- M11 (build Android natif) est SUPERSEDED par M21-Next (déploiement sur infra complete).
- Release PWA est **complètement reproductible** et **verrouillée par CI** dès le merge sur `main`.

## Statut

**M22 PROVEN** — le Grimoire PWA est produit de manière déterministe, vérifiable par `npm ci && npm run build:grimoire` + checksum. La reproductibilité cross-runners est garantie par `emptyOutDir` + noms de sortie fixes + dépendances verrouillées.
