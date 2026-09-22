# G0 — Forensic Baseline

> Commit : `09a45a3` — Date : 2026-09-22

## Checklist

### G0.1 — Repository Provenance

- [x] Clone local aligné sur `origin/main` (`09a45a3`)
- [ ] Tag `v3.0-baseline` créé sur `09a45a3` ← **à pousser sur origin**
- [x] `MATHIC-V3-BASELINE.json` créé

### G0.2 — Artifact Manifest

- [x] `scripts/generate-model-manifest.mjs` créé
- [ ] `public/models/manifest.json` généré ← **nécessite GGUF local ou CI**
- [x] Script `npm run gen:model-manifest` ajouté à `package.json`
- [x] Taille GGUF confirmée : **88 201 568 bytes** (origin/main, GitHub)

### G0.3 — V3 Freeze

- [x] `docs/architecture/V3-AUDIT.md` — inventaire complet
- [x] `docs/contracts/` — répertoire créé (vide, réservé G1)
- [x] `docs/evidence/` — répertoire créé (vide, réservé G0.5)
- [x] `tests/runtime/` — répertoire créé (vide, réservé G0.5)
- [ ] `docs/gates/G0-BASELINE.md` marqué PASS ← **après tag + manifest**

## Facts Établis

```
Tests V3              PROVEN — 3 suites, 0 fail, playtest 50/50
Build Vite            PROVEN — dist/ généré
Android CI            PROVEN — APK artifact
Git local = origin    PROVEN — 09a45a3, HEAD propre
GGUF in repo          PROVEN — 88 201 568 bytes (origin/main)
node                  PROVEN — v24.19.0
npm                   PROVEN — 12.0.2
vite                  PROVEN — 8.3.0
capacitor             PROVEN — 8.5.2
wllama                PROVEN — 3.6.1
```

## Gate G0 PASS =

```
[x] baseline documentée
[x] commit distant identifié (09a45a3)
[x] tests reproductibles
[ ] tag v3.0-baseline créé
[ ] manifest.json généré avec SHA-256 réel
```

## Prochain Gate

→ **G0.5 Runtime Feasibility** sur branche `gate/g05-runtime`
