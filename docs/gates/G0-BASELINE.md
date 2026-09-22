# G0-BASELINE — Gate forensic MATHIC V3

> **Équipe : Kali** · Branche : `kali/g0` · Base : `main @ 09a45a3`
> Date : 2026-09-22 · Statut final : **PASS (forensic uniquement)**
> Règle du gate : **décrire l'état, ne pas le corriger.** Aucune modification de code produit, de `package.json`, de SW ou de CI dans ce lot.

---

## Checklist officielle

| # | Item | Statut | Preuve |
|---|---|---|---|
| 1 | Commit de baseline identifié et mesuré | ✅ PROVEN | `git rev-parse HEAD` → `09a45a38f0fd963494d09ca65de5d6c161022285` ; local = `origin/main` (double fetch du jour) |
| 2 | Manifeste `MATHIC-V3-BASELINE.json` créé, **dérivé des mesures réelles** | ✅ PROVEN | JSON valide (`node -e require`), 2 artefacts hashés, 11 dettes D1–D11 à l'alignement avec V3-AUDIT.md |
| 3 | Empreintes SHA-256 des artefacts lourds | ✅ PROVEN | GGUF : `be35b981…02e5b91d` (88 201 568 o) · wllama.wasm : `6ca9fdd1…d4a689f0ad` (8 457 512 o) — `sha256sum` + `stat -c %s` |
| 4 | Audit d'architecture complet | ✅ PROVEN | `docs/architecture/V3-AUDIT.md` : 12 modules inventoriés, frontières Core/UI décrites, dettes vérifiées ligne par ligne |
| 5 | Dettes P0/P1 vérifiées à leur emplacement réel | ✅ PROVEN | D1–D11 : `grep`/`sed`/`wc` — écarts de numéros de ligne vs plan documentés dans V3-AUDIT.md §4 |
| 6 | Socle fonctionnel certifié au commit de baseline | ✅ PROVEN | `node --test` 3/3 · playtest 50/50 + 0 faux positif · build Vite OK (362,90 kB) · `npm audit` prod 0 vulnérabilité |
| 7 | Version `package.json` → `3.0.0` | ⬜ **DIFFÉRÉ** | Modification de `package.json` interdite par le périmètre G0 strict (actuel : `0.0.0`). À intégrer au lot suivant autorisé à toucher ce fichier (avec le conflit prévisible avec les scripts de tests lkaddafi) |
| 8 | Tag `v3.0-baseline` | ✅ PROVEN (local) | Tag annoté posé sur `09a45a3` — à pousser avec la branche (`git push origin v3.0-baseline`) |
| 9 | Aucune pollution du code produit | ✅ PROVEN | `git status` : seuls 3 nouveaux fichiers (JSON + 2 docs), zéro fichier `src/`, `public/`, workflow ou `package.json` touché |

## Périmètre respecté (interdictions de l'architecte)

| Interdit en G0 | Constat |
|---|---|
| Corriger `Math.random()` | Non touché — dettes documentées (D1–D4, D10) |
| Changer le service worker | Non touché — D5 documentée (`sw.js:13`) |
| Refactorer `main.js` / créer `src/core` | Non touché — D9/D11 documentées |
| Ajouter un PRNG / tests G1-G3 | Non fait |
| Modifier `package.json` | Non fait (item 7 différé explicitement) |

## Artifacts livrés par ce gate

```
MATHIC-V3-BASELINE.json          ← manifeste forensic dérivé (source chiffrée)
docs/architecture/V3-AUDIT.md    ← inventaire modules + frontières + dettes D1-D11
docs/gates/G0-BASELINE.md        ← ce document (checklist + preuves)
+ tag git : v3.0-baseline → 09a45a3
```

## Contexte inter-équipes (au moment du gate)

- **Lkaddafi** : G1/G2/G3 « PASS local annoncés », commit `c54dddd` et branche `gate/g3-levels` **NON PROVEN** sur GitHub (double vérification `git ls-remote` + API GitHub au 2026-09-22 17:05 UTC : seule `main @ 09a45a3` visible). Intégration : **BLOCKED** en attente de preuve Git.
- **Convention de branches tranchée par l'architecte** : `kali/*` et `lkaddafi/*`. Cette branche : `kali/g0`.

## Critère de clôture

G0 est clos quand : branche `kali/g0` poussée → PR ouverte → CI verte → merge → **nouvelle baseline = merge commit**. Le prochain gate (`kali/g0.5`) repartira de cette nouvelle baseline.
