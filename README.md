# 🧩 MATHIC — Puzzle mathématique offline, mobile-first

[![Deploy Pages](https://github.com/6d797468-ai/mathic/actions/workflows/pages.yml/badge.svg)](https://6d797468-ai.github.io/mathic/)
[![PWA Offline-First](https://img.shields.io/badge/PWA-Offline--First-brightgreen.svg)](#)
[![Tests](https://img.shields.io/badge/tests-105%20assertions-brightgreen.svg)](#)

**MATHIC** est un jeu de fusion mathématique (2048 étendu, opérateurs + − × ÷)
pensé mobile-first, avec un moteur strictement déterministe, un mode
« Coup Parfait » certifié par solveur, et un coach IA **local** — « Momo » —
qui tourne intégralement hors-ligne dans le navigateur.

🎮 **Démo jouable (PWA installable) : https://6d797468-ai.github.io/mathic/**

---

## ✨ Points forts

- **Moteur déterministe & validation stricte** : logique de jeu en modules JS
  purs (`src/board.js`). Chaque « Coup Parfait » est généré par
  rétro-ingénierie puis validé par un solveur BFS exact : il existe
  mathématiquement une solution en N coups.
- **IA locale sans serveur** : « Momo » (SmolLM‑135M-Instruct, GGUF Q2_K)
  exécuté via `wllama` en WebAssembly. Répliques, indices et encouragements en
  français, le tout hors-ligne et sans envoi de données.
- **100 % hors-ligne** : app shell mise en cache (cache-first) ; les gros
  binaires (modèle GGUF ~88 Mo, moteur WASM) sont téléchargés
  **progressivement par plages** (requêtes Range/206) par le service worker.
- **Historique « Calvados »** : suivi des états diff (`diffBoards`) —
  glissements, fusions, créations, explosions — pour un undo exact et des
  animations CSS synchronisées.
- **Retours sensoriels (V2)** : moteur audio **100 % synthétisé** (Web Audio,
  aucun asset externe), résonance harmonique des combos (le pitch monte d'un
  demi-ton à chaque fusion réussie d'affilée), squash & stretch des tuiles,
  confettis aux couleurs de l'opérateur, textes flottants, particules et
  screen-shake.
- **Mobile-first** : barre d'opérateurs tactile, édition plein-écran (touche
  F), disposition fluide (`--board-max`), installation PWA native iOS/Android.

## 🛠️ Stack

| Domaine | Choix |
| --- | --- |
| Frontend | JavaScript vanilla (ES Modules), Vite 8, CSS3 moderne (Grid/Flexbox/animations) |
| IA locale | `wllama` (WASM) + SmolLM‑135M-Instruct (GGUF Q2_K) |
| Audio | Web Audio API — synthèse par oscillateurs, aucun fichier audio |
| Tests | Runner natif `node --test` (moteur, diff, historique, combos) + playtest du mode puzzle |
| CI/CD | GitHub Actions → GitHub Pages |

## 🚀 Développement local

Prérequis : Node ≥ 20.19 (ou ≥ 22.12, requis par Vite 8).

```bash
git clone https://github.com/6d797468-ai/mathic.git
cd mathic
npm install
npm run dev      # serveur de développement
```

Tests et build :

```bash
npm test         # suite unitaire + playtest Coup Parfait
npm run build    # production → dist/
npm run preview  # prévisualise le build
```

Pour tester les requêtes Range / le service worker en conditions réelles
(localhost est autorisé) :

```bash
npm run gen:icons   # régénère les icônes PWA si besoin
npm run serve:https # serveur HTTPS local (certificats auto-signés, jamais commités)
```

## 📁 Structure

```
src/board.js     moteur (glissements, fusions, spawns, solveur BFS)
src/targets.js   gestion des objectifs, paires, indices exacts
src/puzzle.js    génération des « Coups Parfaits » (rétro-ingénierie)
src/history.js   état diff « Calvados » + plan de dé-fusion (undo)
src/ai.js        orchestration de Momo (répliques, délais LLM)
src/audio.js     Moteur audio V2 : synthèse Web Audio + résonance des combos
src/ui.js        couche de rendu animée (DOM, particules, confettis, floats)
src/main.js      boucle de jeu, chorégraphie, PWA, plein-écran
public/sw.js     service worker offline-first + cache par plages (Range)
public/models/   le GGUF SmolLM-135M (~88 Mo)
tests/           suites `node --test` + `playtest-puzzle.mjs`
```

> ⚠️ Le modèle (~88 Mo) vit dans `public/models/`. Il n'est pas redistribué par
> la CI sur Pages : il faut qu'il soit présent localement pour le build complet.

## 📄 Licence

Non publiée à ce stade — décision de publication en cours. Tous droits
réservés tant que la licence officielle n'est pas choisie.