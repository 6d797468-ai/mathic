# Contrat : GAME-STATE-V1

> Gate : G1 — MATHIC V4

Ce contrat définit l'état minimal, complet et sérialisable d'une partie (GameState).
Toute UI ou Agent AI ne peut lire l'état qu'à travers cette interface. L'état ne doit **jamais** contenir d'objets DOM, de fonctions ou de références circulaires.

## Structure de l'État (TypeScript Schema)

```typescript
type GameState = {
  // L'identifiant unique de la partie en cours
  sessionId: string;

  // Configuration du niveau
  rows: number;
  cols: number;
  target: number;
  
  // Plateau (2D array, null pour vide, entier > 0 pour tuile)
  board: Array<Array<number | null>>;

  // Métriques de progression
  score: number;
  moves: number;

  // Statut
  isGameOver: boolean;
  victory: boolean;

  // Options du RNG pour le replay (G2)
  seed: string;
}
```

## Règles d'Isolation

1. **Pure Data :** L'objet GameState doit pouvoir passer intact par `JSON.stringify` / `JSON.parse` ou traverser un Web Worker (structured clone).
2. **Read-Only :** Aucun composant extérieur (UI, Momo) ne doit muter l'état. L'état n'évolue qu'en réponse à des Commandes (Swipe) via un reducer pur.
3. **Séparation d'Intérêt :** Le GameState ne stocke PAS la progression du joueur (étoiles, niveaux débloqués), qui appartient au `PlayerProfile` (G7).
