# Contrat : GAME-EVENTS-V1

> Gate : G1 — MATHIC V4

Ce contrat définit les événements (Domain Events) émis par le Game Core (moteur de jeu).
Ces événements sont de purs objets (Plain Old JavaScript Objects) qui décrivent un fait passé.

## Règle d'Or

Le `GameCore` **émet** ces événements. Il n'a aucune connaissance de qui les écoute.
L'UI, l'Audio, l'Analytics et Momo **écoutent** ces événements pour réagir (animations, sons, logs, narration).
Un événement ne contient aucune logique, fonction, ou référence DOM.

## Contrainte de Pureté (G2)

Chaque événement doit :
- Être sérialisable par `JSON.stringify` / `JSON.parse`
- Être clonable par `structuredClone`
- Ne contenir **aucune fonction**
- Ne contenir **aucune référence DOM** (`document`, `window`, etc.)
- Ne contenir **aucune référence circulaire**

---

## 1. GAME_STARTED

Émis lors du lancement d'une partie (mode libre ou puzzle).

```typescript
type GameStartedEvent = {
  type: 'GAME_STARTED';
  timestamp: number;
  mode: 'free' | 'puzzle';
  sessionId: string;
  rows: number;
  cols: number;
  target: number | null;
  moves: number | null;
}
```

## 2. MOVE_APPLIED

Émis lorsqu'un swipe a été appliqué avec succès (au moins un glissement ou fusion).

```typescript
type MoveAppliedEvent = {
  type: 'MOVE_APPLIED';
  timestamp: number;
  moveIndex: number;
  dir: string;
  op: string;
  moved: boolean;
  gained: number;
  mergedCells: Array<{ row: number, col: number, value: number }>;
  invalidCells: Array<{ row: number, col: number }>;
}
```

## 3. MOVE_REJECTED

Émis lorsqu'un swipe est rejeté (aucun mouvement possible, ou partie terminée).

```typescript
type MoveRejectedEvent = {
  type: 'MOVE_REJECTED';
  timestamp: number;
  moveIndex: number;
  dir: string;
  op: string;
  reason: 'no-move' | 'game-over' | 'busy';
}
```

## 4. MERGE_OCCURRED

Émis lorsqu'une fusion valide a lieu entre deux tuiles.

```typescript
type MergeOccurredEvent = {
  type: 'MERGE_OCCURRED';
  timestamp: number;
  moveIndex: number;
  op: string;
  cells: Array<{ row: number, col: number, value: number }>;
  gained: number;
}
```

## 5. TARGET_COLLAPSED

Émis lorsqu'une fusion résulte exactement en la valeur cible (ex: 24) et que la tuile est consommée (explose).

```typescript
type TargetCollapsedEvent = {
  type: 'TARGET_COLLAPSED';
  timestamp: number;
  cells: Array<{row: number, col: number}>;
  bonus: number;
  isCombo: boolean;
}
```

## 6. TILE_SPAWNED

Émis lorsqu'une nouvelle tuile apparaît naturellement après un coup valide.

```typescript
type TileSpawnedEvent = {
  type: 'TILE_SPAWNED';
  timestamp: number;
  cell: { row: number, col: number, value: number }
}
```

## 7. UNDO_APPLIED

Émis lorsqu'un undo a été appliqué avec succès.

```typescript
type UndoAppliedEvent = {
  type: 'UNDO_APPLIED';
  timestamp: number;
  moveIndex: number;
}
```

## 8. LEVEL_COMPLETED

Émis lorsqu'un niveau puzzle est complété (cible atteinte au coup exact).

```typescript
type LevelCompletedEvent = {
  type: 'LEVEL_COMPLETED';
  timestamp: number;
  moves: number;
  optimalMoves: number;
  score: number;
}
```

## 9. GAME_OVER

Émis lorsque la partie se termine, soit par victoire (toutes cibles détruites), soit par défaite (plateau bloqué).

```typescript
type GameOverEvent = {
  type: 'GAME_OVER';
  timestamp: number;
  victory: boolean;
  score: number;
}
```