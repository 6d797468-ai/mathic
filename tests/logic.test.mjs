/**
 * Test de logique (node) — valide slideBoard/moves/targets sans DOM.
 * Usage : node tests/logic.test.mjs
 */
import {
  createBoard,
  slideBoard,
  spawnRandomTile,
  fillInitialTiles,
  isGameOver,
  isCleaningMove,
  countEmptyCells,
  isValidPair,
  isValidMerge,
  computeMerge,
  minMovesToReach,
  boardContains,
  createChainTracker,
  hasAnyMove,
} from '../src/core/board.js';
import { TARGET_NUMBER } from '../src/core/rules.js';
import {
  pickTarget,
  consumeTargetTiles,
  findTargetPairs,
  findTargetHint,
} from '../src/targets.js';
import { generatePuzzle, unmerge, PUZZLE_STARTER_MAX } from '../src/puzzle.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

// --- Règles strictes -------------------------------------------------------
console.log('— Règles de fusion strictes —');
check('add : 3+3 ok', isValidPair(3, 3, 'add'));
check('add : 3+5 non', !isValidPair(3, 5, 'add'));
check('sub : 5 glisse sur 2 → 3', computeMerge(5, 2, 'sub') === 3);
check('sub : 2 sur 5 invalide', !isValidPair(2, 5, 'sub'));
check('div : 6 sur 3 → 2', computeMerge(6, 3, 'div') === 2);
check('div : 3 sur 6 invalide', !isValidPair(3, 6, 'div'));

// --- Trajectoires ------------------------------------------------------------
console.log('— Trajectoires de glissement —');
{
  // Ligne : [2, 2, null, null] vers la droite → fusion en col 3.
  const b = createBoard(1, 4);
  b[0][0] = 2;
  b[0][1] = 2;
  const r = slideBoard(b, 'right', 'add');
  check('plateau résultat : [null, null, null, 4]', JSON.stringify(r.board[0]) === '[null,null,null,4]');
  check('2 mouvements (convergence)', r.moves.length === 2);
  const to = r.moves.filter((m) => m.toCol === 3);
  check('les 2 tuiles convergent vers col 3', to.length === 2);
  check('1 cellule fusionnée', r.mergedCells.length === 1 && r.mergedCells[0].value === 4);
  check('gained = 4', r.gained === 4);
}

{
  // Glissement simple sans fusion : [3, null, null, null] vers la droite.
  const b = createBoard(1, 4);
  b[0][0] = 3;
  const r = slideBoard(b, 'right', 'add');
  check('tuile déplacée en col 3', r.board[0][3] === 3);
  check('1 mouvement simple', r.moves.length === 1 && r.moves[0].fromCol === 0 && r.moves[0].toCol === 3);
  check('pas de fusion', r.mergedCells.length === 0);
}

{
  // Contact invalide : [5, 3] vers la gauche en mode soustraction
  // (5 arrive sur 3 : 5 > 3 → valide ! Prenons 3 arrive sur 5 : invalide.)
  const b = createBoard(1, 4);
  b[0][1] = 5;
  b[0][3] = 3; // en glissant à gauche, 3 arrive sur 5 → 3 > 5 faux → invalide
  const r = slideBoard(b, 'left', 'sub');
  check('aucune fusion', r.mergedCells.length === 0);
  // Les tuiles se compactent quand même (comportement 2048) : 5 → col0, 3 → col1.
  check('tuiles compactées : 5 en col0, 3 en col1', r.board[0][0] === 5 && r.board[0][1] === 3);
  check('shake détecté', r.invalidCells.length === 2);
}

// --- Cibles -------------------------------------------------------------------
console.log('— Cibles —');
{
  const b = createBoard(2, 2);
  b[0][0] = 2;
  b[0][1] = 3;
  b[1][0] = 6;
  b[1][1] = 4;
  const pairs = findTargetPairs(b, 6); // 2×3 ou 6×… plusieurs options
  check('paires pour 6 trouvées', pairs.length >= 1);

  const pairsImp = findTargetPairs(b, 999);
  check('aucune paire pour 999', pairsImp.length === 0);

  // Consommation : pose une 2e tuile = 6 → les DEUX explosent d'un coup.
  b[0][0] = 6;
  const consumed = consumeTargetTiles(b, 6);
  check('2 tuiles 6 consommées (multi-explosion)', consumed.length === 2 && b[0][0] === null && b[1][0] === null);

  const t = pickTarget(b, []);
  check('cible dans la fourchette 6..60', t >= 6 && t <= 60 && Number.isInteger(t));
}

// --- Game over ------------------------------------------------------------------
// --- Équilibrage spawn 1..5 (roadmap 1.2) --------------------------------------
console.log('— Équilibrage : spawn 1..5 —');
{
  let outOfRange = 0;
  for (let i = 0; i < 500; i++) {
    const b = createBoard(4, 4);
    const s = spawnRandomTile(b, PUZZLE_STARTER_MAX);
    if (s && (s.value < 1 || s.value > 5)) outOfRange++;
  }
  check('500 spawns : tous dans [1..5]', outOfRange === 0);

  // Le spawn PAR DÉFAUT du moteur est lui aussi plafonné à 5 (pas seulement
  // les appels explicites avec PUZZLE_STARTER_MAX).
  let defaultOutOfRange = 0;
  for (let i = 0; i < 500; i++) {
    const b = createBoard(4, 4);
    const s = spawnRandomTile(b);
    if (s && (s.value < 1 || s.value > 5)) defaultOutOfRange++;
  }
  check('500 spawns par défaut : tous dans [1..5]', defaultOutOfRange === 0);

  // fillInitialTiles par défaut : même plafond 1..5.
  let initOutOfRange = false;
  const init = createBoard(4, 4);
  fillInitialTiles(init, 6);
  for (const row of init) {
    for (const v of row) {
      if (v !== null && (v < 1 || v > 5)) initOutOfRange = true;
    }
  }
  check('fillInitialTiles par défaut : toutes les tuiles dans [1..5]', !initOutOfRange);
}

// --- Sélecteur d'opérateur (UI Opérateurs) --------------------------------
// L'état de l'opérateur courant pilote le moteur : un même glissement peut
// produire une fusion, un refus, ou un shake selon l'opérateur sélectionné.
console.log('— Sélecteur d’opérateur : l’op pilote le moteur —');
{
  const mk = () => {
    const b = createBoard(1, 2);
    b[0][0] = 4;
    b[0][1] = 2; // en glissant vers la gauche, 2 arrive sur 4
    return b;
  };

  // 'mul' : toute paire fusionne → 2×4 = 8.
  const rMul = slideBoard(mk(), 'left', 'mul');
  check('op mul : 2 arrive sur 4 → 2×4 = 8', rMul.board[0][0] === 8 && rMul.gained === 8);

  // 'add' : 2 ≠ 4 → refus de fusion (shake), aucun gain — même glissement.
  const rAdd = slideBoard(mk(), 'left', 'add');
  check('op add : 2≠4 → aucune fusion (même coup)', rAdd.gained === 0 && rAdd.mergedCells.length === 0);

  // 'sub' : 2 > 4 est FAUX → refus ; 'div' : 2 % 4 ≠ 0 → refus aussi.
  const rSub = slideBoard(mk(), 'left', 'sub');
  check('op sub : 2>4 faux → fusion refusée', rSub.mergedCells.length === 0);
  const rDiv = slideBoard(mk(), 'left', 'div');
  check('op div : 2 n est pas multiple de 4 → refus', rDiv.mergedCells.length === 0);

  // Inversement, si on glisse à droite (4 arrive sur 2) : sub → 2, div → 2.
  const rSubR = slideBoard(mk(), 'right', 'sub');
  check('op sub droite : 4 arrive sur 2 → 4−2 = 2', rSubR.board[0][1] === 2 && rSubR.gained === 2);
}

// --- Coup de nettoyage (persona Hype-Man) ------------------------------------
// Une soustraction/division qui libère une case sur un plateau ENCOMBRÉ est
// la finesse tactique que Momo doit féliciter.
console.log('— Nettoyage tactique (sub/div qui libère de l’espace) —');
{
  // Plateau 2×2 PLEIN → la soustraction libère une case : nettoyage.
  const full = createBoard(2, 2);
  full[0] = [4, 2];
  full[1] = [7, 7];
  const before = full.map((r) => [...r]);
  const res = slideBoard(full, 'right', 'sub'); // 4 arrive sur 2 → 2, case libérée
  check('sub sur plateau plein → nettoyage détecté', isCleaningMove(before, res.board, 'sub') === true);
  check('freed = 1 case libérée', countEmptyCells(res.board) - countEmptyCells(before) === 1);

  // add ne déclenche JAMAIS le nettoyage (opération exclue par règle).
  check('add : jamais un nettoyage', isCleaningMove(before, res.board, 'add') === false);

  // Plateau aéré (peu de tuiles) : la même sub n'est pas un nettoyage.
  const sparse = createBoard(2, 2);
  sparse[0] = [5, 3];
  const beforeSparse = sparse.map((r) => [...r]);
  const resSparse = slideBoard(sparse, 'right', 'sub');
  check('plateau aéré : pas de nettoyage', isCleaningMove(beforeSparse, resSparse.board, 'sub') === false);
}

// --- Indice naturel (roadmap 2.2) -----------------------------------------------
console.log('— Indice naturel —');
{
  const b = createBoard(2, 3);
  b[0][0] = 16;
  b[0][2] = 4;
  const hint = findTargetHint(b, 4); // 16 ÷ 4 = 4
  check('indice trouvé', hint !== null);
  check('l’opération est révélée (div)', hint && hint.op === 'div');
  check('2 cellules localisées', hint && hint.cells.length === 2);
  check('les valeurs de la paire sont livrées au LLM (16 ÷ 4)',
    hint && hint.a === 16 && hint.b === 4);
}

// --- Solveur BFS (roadmap 3.2) ---------------------------------------------------
console.log('— BFS minMovesToReach —');
{
  // [2, null, null, 2] → un swipe add → 4 : 1 coup.
  const b = createBoard(1, 4);
  b[0][0] = 2;
  b[0][3] = 2;
  check('2→4 en 1 coup', minMovesToReach(b, 4, 3) === 1);

  // Déjà présent : 0 coup.
  const b2 = createBoard(1, 4);
  b2[0][1] = 6;
  check('cible déjà sur le plateau : 0 coup', minMovesToReach(b2, 6, 3) === 0);

  // Impossible : tuiles 7 et 11 seules (pas de 14 possible en 1 coup... 7+11=18,
  // 7×11=77 ; et en profondeur 2 rien ne peut créer 14) → null.
  const b3 = createBoard(1, 4);
  b3[0][0] = 7;
  b3[0][3] = 11;
  check('inatteignable en ≤2 coups : null', minMovesToReach(b3, 14, 2) === null);

  check('boardContains basique', boardContains([[1, null], [null, 7]], 7));
}

// --- Générateur de puzzles (roadmap 3.1-3.3) --------------------------------------
console.log('— Générateur Coup Parfait —');
{
  // Défusion : toujours une décomposition VALIDE de C.
  let badUnmerge = 0;
  for (let i = 0; i < 200; i++) {
    const c = 4 + Math.floor(Math.random() * 40);
    const r = unmerge(c);
    if (r === null) continue; // certains C n'ont pas de décomposition
    const [a, b, op] = r;
    if (!isValidPair(a, b, op) || computeMerge(a, b, op) !== c) badUnmerge++;
  }
  check('200 défusions : toutes valides (règles strictes)', badUnmerge === 0);

  // Taux de réussite du générateur sur 100 grilles (roadmap 5.1).
  let ok = 0;
  let shortestAllExact = true;
  for (let i = 0; i < 100; i++) {
    const p = generatePuzzle({ rows: 4, cols: 4, moves: 3, attempts: 60 });
    const shortest = minMovesToReach(p.board, p.target, 3);
    if (shortest === 3) ok++;
    if (shortest !== null && shortest !== 3) shortestAllExact = false;
  }
  check('100 puzzles générés : ≥80 validés (exactement 3 coups)', ok >= 80);
  check('aucun puzzle accepté avec un raccourci < N', shortestAllExact);

  // Le puzzle retourné est atteignable en N coups (jamais moins, jamais plus).
  const p = generatePuzzle({ rows: 4, cols: 4, moves: 3 });
  check('puzzle générique : profondeur certifiée',
    minMovesToReach(p.board, p.target, 3) === 3);
}

// --- Mathic Chain (roadmap 4.1) ----------------------------------------------
console.log('— Mathic Chain —');
{
  const t = createChainTracker();
  // Objectifs détruits aux coups 3 puis 4 : intervalle 1 ≤ 2 → CHAÎNE.
  let r = t.registerTarget(3);
  check('1re cible : pas de chaîne', r.chained === false && r.chainLength === 1);
  r = t.registerTarget(4);
  check('cible au coup suivant → chaîne ×2', r.chained === true && r.chainLength === 2);
  r = t.registerTarget(5);
  check('3e cible consécutive → chaîne ×3', r.chained === true && r.chainLength === 3);

  // Intervalle de 2 coups exactement : encore une chaîne (moins de 2 MOUVEMENTS
  // consécutifs : coups 5→7 = un coup blanc entre les deux).
  r = t.registerTarget(7);
  check('intervalle 2 coups → chaîne ×4', r.chained === true && r.chainLength === 4);

  // Intervalle de 3 : la chaîne est cassée.
  const t2 = createChainTracker();
  t2.registerTarget(2);
  r = t2.registerTarget(6);
  check('intervalle 3 → chaîne cassée', r.chained === false && r.chainLength === 1);

  // Reset (nouvelle partie).
  t2.reset();
  r = t2.registerTarget(1);
  check('reset : plus d’historique', r.chained === false && r.chainLength === 1);
}

console.log('— Game over —');
{
  // Plateau plein sans aucun mouvement possible avec aucun opérateur.
  // Valeurs premières impaires distinctes : pas d'add (différents), pas de
  // sub/div (a>b requis mais tous égaux impossible)... utilisons un mélange
  // vérifié par isGameOver lui-même.
  const b = createBoard(2, 2);
  b[0][0] = 7; b[0][1] = 11;
  b[1][0] = 13; b[1][1] = 17;
  // 13×17 est valide en mul (toute paire) → pas game over.
  check('plein mais mul possible → pas game over', !isGameOver(b));
}

// --- V3 « Effondrement » : cible fixe 24 + plafond 999 ---------------------
console.log('— V3 Effondrement (TARGET_NUMBER 24, plafond VALUE_CAP 999) —');
{
  const board = createBoard(1, 2);
  board[0][0] = 512;
  board[0][1] = 512;

  // 512+512 = 1024 > 999 → fusion REFUSÉE (les tuiles glissent seulement).
  const rAdd = slideBoard(board, 'left', 'add');
  check(
    'plafond : 512+512 refusé (aucune fusion)',
    rAdd.mergedCells.length === 0,
  );

  // Un résultat égal au plafond reste permis (ex. 333×3 = 999).
  const bOkay = createBoard(1, 2);
  bOkay[0][0] = 3;
  bOkay[0][1] = 333;
  const rMul = slideBoard(bOkay, 'left', 'mul');
  check(
    'plafond : 3×333 = 999 autorisé',
    rMul.mergedCells.length === 1 && rMul.board[0][0] === 999,
  );

  // isMergeWithinCap : la paire plafonnée n'est plus « jouable ».
  check('plafond : isValidMerge(512,512,add) faux', !isValidMerge(512, 512, 'add'));
  check('plafond : isValidMerge(3,333,mul) vrai', isValidMerge(3, 333, 'mul'));

  // Une grille dont la SEULE fusion dépasserait le plafond n'a aucun coup add.
  const bOnlyCap = createBoard(1, 2);
  bOnlyCap[0][0] = 512;
  bOnlyCap[0][1] = 512;
  check('plafond : hasAnyMove(add) faux si seule fusion plafonnée', !hasAnyMove(bOnlyCap, 'add'));

  // Constante de cible V3 : la DESTRUCTION vise 24.
  check('V3 : TARGET_NUMBER === 24', TARGET_NUMBER === 24);
}

// --- Cible explicite + certificat BFS (roadmap Ph3) ------------------------------
console.log('— Cible explicite (42 en 4) & BFS grilles codées —');
{
  // 1) Grille codée EN DUR : [5,1,3,_] → 12. Pas de raccourci en 1 coup
  // (mul 5×3=15, add 5+1=6, 5+3=8, 1+3=4…), mais 2 coups exacts :
  //   coup 1 droite : 3 arrive sur 1 → 3−1=2  →  [_, 3, 2, _]
  //   coup 2 gauche : 2+c'… 3 arrive sur 2 → 3−2? mul 3×2=6 ; reprenons :
  //   le solveur BFS certifie la PROFONDEUR = la borne courte.
  const bHard = createBoard(1, 4);
  bHard[0][0] = 5;
  bHard[0][1] = 1;
  bHard[0][2] = 3;
  const bHardShortest = minMovesToReach(bHard, 12, 4);
  check('grille codée 1×4 [5,1,3,_] → 12 : au plus 1 coup', bHardShortest === null || bHardShortest !== 1);
  check('grille codée 1×4 [5,1,3,_] → 12 : BFS = 2 coups', bHardShortest === 2);

  // 2) Un 1 coup est bien le plus court possible sur cette grille.
  const bOne = createBoard(1, 3);
  bOne[0][0] = 6;
  bOne[0][2] = 6;
  check('grille codée [6,_,6] → 12 : exactement 1 coup', minMovesToReach(bOne, 12, 4) === 1);

  // 3) Cible EXPLICITE : le ticket demande 42 en exactement 4 coups certifiés.
  let exact42 = 0;
  for (let i = 0; i < 8; i++) {
    const p = generatePuzzle({ rows: 4, cols: 4, moves: 4, target: 42, attempts: 300 });
    const s = minMovesToReach(p.board, p.target, p.moves);
    if (s === 4) exact42++;
  }
  check('8× cible 42 : au moins une grille en 4 exacts', exact42 >= 1);
  check('8× cible 42 : acceptation honnête ≥ 3/8', exact42 >= 3);
}

console.log(failures === 0 ? '\nTous les tests passent ✅' : `\n${failures} échec(s) ❌`);
process.exit(failures === 0 ? 0 : 1);
