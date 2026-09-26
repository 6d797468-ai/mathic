// Concept B — « Grille croisée » : lignes ET colonnes doivent valoir leur équation.
// reserve = multisets {valeur: nombreDisponible}. grid = -1 pour case vide.

export const levelsB = [
  {
    id: "b-01",
    title: "Symétrique somme",
    note: "2 solutions (permutations croisées)",
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [
      { ops: ["+"], target: 9 },
      { ops: ["+"], target: 9 },
    ],
    cols: [
      { ops: ["+"], target: 9 },
      { ops: ["+"], target: 9 },
    ],
    reserve: { 4: 2, 5: 2 },
    seed: "lab-b-01",
  },
  {
    id: "b-02",
    title: "Croisée mixte (2×2)",
    note: "équations +, ×, − ; solution unique",
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [
      { ops: ["+"], target: 10 },
      { ops: ["*"], target: 12 },
    ],
    cols: [
      { ops: ["+"], target: 7 },
      { ops: ["-"], target: 2 },
    ],
    reserve: { 3: 1, 4: 2, 6: 1 },
    seed: "lab-b-02",
  },
  {
    id: "b-03",
    title: "3×3 Lo Shu",
    note: "lignes et colonnes = 15 avec 1..9 : 8 variantes (rotations/réflexions)",
    grid: [
      [-1, -1, -1],
      [-1, -1, -1],
      [-1, -1, -1],
    ],
    rows: [
      { ops: ["+", "+"], target: 15 },
      { ops: ["+", "+"], target: 15 },
      { ops: ["+", "+"], target: 15 },
    ],
    cols: [
      { ops: ["+", "+"], target: 15 },
      { ops: ["+", "+"], target: 15 },
      { ops: ["+", "+"], target: 15 },
    ],
    reserve: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 },
    seed: "lab-b-03",
  },
  {
    id: "b-04",
    title: "Unique par réserve (2×2)",
    note: "seul c=2 est possible avec la réserve donnée",
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [
      { ops: ["+"], target: 7 },
      { ops: ["+"], target: 6 },
    ],
    cols: [
      { ops: ["+"], target: 5 },
      { ops: ["+"], target: 8 },
    ],
    reserve: { 2: 1, 3: 1, 4: 2 },
    seed: "lab-b-04",
  },
  {
    id: "b-05",
    title: "Produit + croisées (2×2)",
    note: "deux affectations atteignent 8 par produit",
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [
      { ops: ["+"], target: 9 },
      { ops: ["*"], target: 8 },
    ],
    cols: [
      { ops: ["+"], target: 9 },
      { ops: ["+"], target: 9 },
    ],
    reserve: { 8: 2, 1: 2 },
    seed: "lab-b-05",
  },
  {
    id: "b-06",
    title: "3×3 sommes variées",
    note: "lignes 9/12/15, colonnes 10/13/13 ; réserve dédiée",
    grid: [
      [-1, -1, -1],
      [-1, -1, -1],
      [-1, -1, -1],
    ],
    rows: [
      { ops: ["+", "+"], target: 9 },
      { ops: ["+", "+"], target: 12 },
      { ops: ["+", "+"], target: 15 },
    ],
    cols: [
      { ops: ["+", "+"], target: 10 },
      { ops: ["+", "+"], target: 13 },
      { ops: ["+", "+"], target: 13 },
    ],
    reserve: { 1: 1, 2: 2, 3: 1, 4: 1, 5: 1, 6: 2, 7: 1 },
    seed: "lab-b-06",
  },
  {
    id: "b-07",
    title: "IMPOSSIBLE — réserve incompatible",
    note: "uniquement des 1 : aucune ligne ne peut faire 11 — le solver doit rejeter",
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [
      { ops: ["+"], target: 11 },
      { ops: ["+"], target: 9 },
    ],
    cols: [
      { ops: ["+"], target: 12 },
      { ops: ["+"], target: 8 },
    ],
    reserve: { 1: 4 },
    seed: "lab-b-07",
  },
  {
    id: "b-08",
    title: "3×3 lignes paires, colonnes fortes",
    note: "lignes 9/12/10, colonnes 13/18 — remplissage souple",
    grid: [
      [-1, -1],
      [-1, -1],
      [-1, -1],
    ],
    rows: [
      { ops: ["+"], target: 9 },
      { ops: ["+"], target: 12 },
      { ops: ["+"], target: 10 },
    ],
    cols: [
      { ops: ["+", "+"], target: 13 },
      { ops: ["+", "+"], target: 18 },
    ],
    reserve: { 2: 1, 7: 2, 5: 1, 6: 1, 4: 1 },
    seed: "lab-b-08",
  },
  {
    id: "b-09",
    title: "3×3 faible contrainte",
    note: "total 24, beaucoup d'affectations possibles (diversité élevée)",
    grid: [
      [-1, -1, -1],
      [-1, -1, -1],
      [-1, -1, -1],
    ],
    rows: [
      { ops: ["+", "+"], target: 7 },
      { ops: ["+", "+"], target: 8 },
      { ops: ["+", "+"], target: 9 },
    ],
    cols: [
      { ops: ["+", "+"], target: 8 },
      { ops: ["+", "+"], target: 8 },
      { ops: ["+", "+"], target: 8 },
    ],
    reserve: { 1: 2, 2: 2, 3: 2, 4: 3 },
    seed: "lab-b-09",
  },
  {
    id: "b-10",
    title: "3×3 lignes/colonnes déséquilibrées",
    note: "réserve dédiée 30 ; rejouable (permutations)",
    grid: [
      [-1, -1, -1],
      [-1, -1, -1],
      [-1, -1, -1],
    ],
    rows: [
      { ops: ["+", "+"], target: 8 },
      { ops: ["+", "+"], target: 10 },
      { ops: ["+", "+"], target: 12 },
    ],
    cols: [
      { ops: ["+", "+"], target: 7 },
      { ops: ["+", "+"], target: 10 },
      { ops: ["+", "+"], target: 13 },
    ],
    reserve: { 1: 1, 2: 1, 3: 2, 4: 4, 5: 1 },
    seed: "lab-b-10",
  },
];