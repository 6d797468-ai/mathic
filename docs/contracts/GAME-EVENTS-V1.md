# Contrat : GAME-EVENTS-V1

> Gate : G1 — MATHIC V4

Ce contrat définit les événements (Domain Events) émis par le Game Core (moteur de jeu).
Ces événements sont de purs objets (Plain Old JavaScript Objects) qui décrivent un fait passé.

## Règle d'Or

Le `GameCore` **émet** ces événements. Il n'a aucune connaissance de qui les écoute.
L'UI, l'Audio, l'Analytics et Momo **écoutent** ces événements pour réagir (animations, sons, logs, narration).
Un événement ne contient aucune logique, fonction, ou référence DOM.

## 1. MERGE_OCCURRED
Émis lorsqu'une fusion valide a lieu entre deux tuiles.

```typescript
type MergeOccurredEvent = {
  type: 'MERGE_OCCURRED';
  timestamp: number;
  moveIndex: number;  // Le numéro du coup global dans la partie
  op: string;         // 'add', 'sub', 'mul', 'div'
  cells: Array<{      // Les cellules impliquées (coordonnées et valeur)
    row: number;
    col: number;
    value: number;
  }>;
  gained: number;     // Le score obtenu par cette fusion
}
```

## 2. TARGET_COLLAPSED
Émis lorsqu'une fusion résulte exactement en la valeur cible (ex: 24) et que la tuile est consommée (explose).

```typescript
type TargetCollapsedEvent = {
  type: 'TARGET_COLLAPSED';
  timestamp: number;
  cells: Array<{row: number, col: number}>;
  bonus: number;
  isCombo: boolean;   // Fait partie d'une réaction en chaîne
}
```

## 3. TILE_SPAWNED
Émis lorsqu'une nouvelle tuile apparaît naturellement après un coup valide.

```typescript
type TileSpawnedEvent = {
  type: 'TILE_SPAWNED';
  timestamp: number;
  cell: {
    row: number;
    col: number;
    value: number;
  }
}
```

## 4. GAME_OVER
Émis lorsque la partie se termine, soit par victoire (toutes cibles détruites), soit par défaite (plateau bloqué).

```typescript
type GameOverEvent = {
  type: 'GAME_OVER';
  timestamp: number;
  victory: boolean;
  score: number;
}
```
