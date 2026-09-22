# ROADMAP — MATHIC 4.0

> Développement en **sens inverse** : on commence par la phase la plus profonde et on remonte.
> Chaque phase est **verrouillée** (tests certifiés + build OK) avant de passer à la suivante.
> Le code et les messages sont en **français** (apostrophes typographiques, zéro apostrophe droite dans les chaînes JS).

---

## Phase 5 — ⬜ NON COMMENCÉE (à définir)
**Objectif** : pas encore spécifié dans les tickets.
État : aucune édition — lancera suite à la Phase 4.

---

## Phase 4 — « Mathic 4.0 » 🔄 EN COURS
Édition plein-écran + différentiel de tuiles (historique « Calvados », v2.0 d’Archived Mind Archive).
L’objectif : ne jamais perdre une ligne d’historique en descendant dans le terrier.

### À faire
- [ ] Différentiel de tuiles entre deux états (avant/après) — `diffBoards` (tuiles glissées, fusionnées, créées).
- [ ] Édition plein-écran (grille agrandie, navigation fluide).
- [ ] Historique « Calvados » complet + restauration.
- [ ] Tests unitaires dédiés + playtest.
- [ ] Build Vite régénéré.

---

## Phase 3 — « Coup Parfait » ✅ LIVRÉE
Rétro-générateur de grilles **honnêtes** avec cible explicite + validation BFS.

### Livré
- `generatePuzzle({target, moves})` avec pool de cibles explicites (42, 48).
- Garantie d’honnêteté : jamais de grille qui ment sur la profondeur (fallback en profondeur réelle, certificat BFS toujours `=== moves`).
- Niveaux cycliques : Découverte (3 coups), 42 en 4, 48 en 5.
- Jauge « Coups restants » + **Undo** (bouton + touche U, bug clavier corrigé).
- Coach IA certifiant (intro, indice, insonvable → propose Undo, victoire).
- Tests : **54/54** · Playtest : **50/50** · Build ✓ · `dist/` régénéré.

---

## Phase 2 — « Coach Momo » ✅ LIVRÉE
IA locale on-device (wllama + GGUF) qui aide le joueur.

### Livré
- Coach IA « Momo » (Hype-Man) : intro, indice, félicitations, réactions.
- Fallback hors-ligne complet quand le modèle n’est pas chargé.
- Chargement du GGUF depuis `public/models/`.

---

## Phase 1 — « Mathic » ✅ LIVRÉE
Le socle : jeu de fusion 2048 étendu avec 4 opérateurs.

### Livré
- Logique de fusion `+ − × ÷` (sub/div orientées, spawn 1..5 séparé, chaînes, cibles).
- Barre d’opérateurs (mobile) + sélection clavier 1-4.
- Raccourcis clavier, profil local (`localStorage`), PWA (icônes, manifest, service worker).
- Serveur HTTPS local (certificats auto-signés, jamais commités).
- Build Vite → `dist/`.

---

## Consigne d’archivage
- `node_modules`, `dist`, `certs/` ne sont **jamais** commités.
- Le GGUF (88 Mo) et wllama.wasm sont dans `public/` — attention à la limite GitHub de 100 Mo/fichier.
- Chaque phase se termine par : tests + playtest + build + un commit dédié.
