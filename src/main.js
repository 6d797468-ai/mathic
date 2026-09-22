/**
 * main.js — Boucle de jeu, chorégraphie et orchestration du coach IA
 *
 * Chorégraphie d'un coup :
 *  1. slideBoard        → modèle mis à jour + trajectoires (moves)
 *  2. tiles.slide       → les tuiles glissent, les fusions convergent
 *  3. tiles.shake       → feedback des contacts invalides
 *  4. processTargets    → explosion des tuiles-objectif, bonus, nouvelle cible
 *  5. spawn + tiles.sync → nouvelle tuile (pop), surbrillance, HUD
 *  6. game over check
 *
 * Momo (coach IA local) commente CHAQUE coup : fusions, coups faibles,
 * coups sans effet, contacts invalides, explosions, et annonce chaque
 * nouvel objectif avec son atteignabilité réelle (faits calculés par le code).
 */

import './style.css';
import {
  createBoard,
  slideBoard,
  spawnRandomTile,
  fillInitialTiles,
  isGameOver,
  isCleaningMove,
  countEmptyCells,
  minMovesToReach,
  createChainTracker,
  OPERATORS,
} from './board.js';
import {
  buildGrid,
  createTileManager,
  renderOperatorSelection,
  MOVE_DURATION,
  SPAWN_DURATION,
} from './ui.js';
import { onDirection } from './input.js';
import {
  pickTarget,
  consumeTargetTiles,
  findTargetPairs,
  findTargetHint,
  describeTarget,
} from './targets.js';
import { generatePuzzle, PUZZLE_STARTER_MAX } from './puzzle.js';
import {
  initAI,
  aiIsReady,
  aiIsBusy,
  coachWelcome,
  coachReact,
  coachNewTarget,
  coachHint,
  coachGameOver,
  coachPuzzleIntro,
  coachPuzzleWin,
} from './ai.js';
import { createProfiler } from './profiler.js';
import {
  createCalvados,
  makeEntry,
  reversePlan,
  calvadosContext,
} from './history.js';

// --- État -------------------------------------------------------------------

let rows = 4;
let cols = 4;
let board = createBoard(rows, cols);
let currentOp = 'add';
let busy = false;
let score = 0;
let best = Number(migrateOldKeys() || 0);
let target = 0;
let targetCount = 0;
let recentTargets = [];
let idleTimer = null;
let hintLock = false;
/** @type {ReturnType<typeof createTileManager>|null} */
let tiles = null;

// Mode courant : 'classic' (score libre) ou 'puzzle' (Coup Parfait).
let mode = 'classic';
let movesLeft = 0; // jauge de coups restants (mode puzzle)
let puzzleMoves = 0; // profondeur N certifiée du puzzle courant
/** Pile Calvados : historique COMPLET des coups (états ± faits exacts). */
const calvados = createCalvados();

// Mathic Chain (Phase 4) : chaîne d'objectifs en < 2 coups.
const chainTracker = createChainTracker();
let moveIndex = 0; // compteur de coups joués (pour la chaîne)
/** Fenêtre de chaîne ACTIVE : coups restants avant extinction (0 = off). */
let chainWindowLeft = 0;
let chainCount = 0;

// --- Éléments DOM -----------------------------------------------------------

const gridElement = document.querySelector('#grid');
const chainBadge = document.querySelector('#chain-badge');
const chainValue = document.querySelector('#chain-value');
const chainWindow = document.querySelector('#chain-window');
const profileButton = document.querySelector('#btn-profile');
const scoreElement = document.querySelector('#score');
const bestElement = document.querySelector('#best');
const targetElement = document.querySelector('#target');
const newGameButton = document.querySelector('#new-game');
const puzzleButton = document.querySelector('#btn-puzzle');
const undoButton = document.querySelector('#btn-undo');
const fullscreenButton = document.querySelector('#btn-fs');
const installButton = document.querySelector('#btn-install');
const movesLeftElement = document.querySelector('#moves-left');
const sizeSelect = document.querySelector('#board-size-select');
const hintButton = document.querySelector('#btn-hint');
const coachTextElement = document.querySelector('#coach-text');
const coachStatusElement = document.querySelector('#coach-status');
const operatorButtons = document.querySelectorAll('#operator-bar .op-btn');
const overlay = document.querySelector('#game-over-overlay');
const finalScoreElement = document.querySelector('#final-score');
const finalTargetsElement = document.querySelector('#final-targets');
const restartButton = document.querySelector('#restart');

// --- Constantes de score ------------------------------------------------------

/**
 * Migration silencieuse des clés localStorage de l'ancienne version
 * ("Mather") vers les nouvelles ("mathic_*") — conserve le record.
 * @returns {string} le record historique ("0" si absent)
 */
function migrateOldKeys() {
  try {
    const legacy = localStorage.getItem('mather-best');
    if (legacy !== null) {
      if (localStorage.getItem('mathic_record') === null) {
        localStorage.setItem('mathic_record', legacy);
      }
      localStorage.removeItem('mather-best');
    }
  } catch {
    /* stockage indisponible : on ignore */
  }
  return localStorage.getItem('mathic_record') || 0;
}

const TARGET_BONUS = 50; // points par cible atteinte
const HIT_BONUS = 10; // points par tuile-cible supplémentaire (multi-explosion)

// --- Coach : affichage --------------------------------------------------------

/**
 * Affiche une réplique du coach avec une petite animation d'apparition.
 * @param {string} text
 */
function coachSay(text) {
  if (!text) return;
  coachTextElement.textContent = text;
  coachTextElement.classList.remove('coach-say');
  void coachTextElement.offsetWidth;
  coachTextElement.classList.add('coach-say');
}

/**
 * Met à jour le statut de connexion du modèle.
 * @param {string} text
 */
function coachStatus(text) {
  coachStatusElement.textContent = text;
}

/**
 * Initialise le modèle IA en arrière-plan (85 Mo, une seule fois).
 */
function startAI() {
  coachStatus('○ Momo se réveille…');
  initAI(({ phase, progress, text }) => {
    if (phase === 'loading') {
      coachStatus(progress != null ? `⏳ ${text}` : `⏳ ${text || 'Chargement…'}`);
    } else if (phase === 'ready') {
      coachStatus('● Momo est connecté');
    } else if (phase === 'error') {
      coachStatus('○ Momo hors ligne (le jeu reste jouable)');
    }
  });
}

/**
 * Minutateur d'inactivité : si le joueur réfléchit longtemps, Momo
 * propose un mot de soutien (seulement si le modèle est prêt).
 */
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!busy && aiIsReady() && !aiIsBusy()) {
      coachReact({ type: 'idle', score, target }).then(coachSay);
    }
  }, 22000);
}

// --- Badge Mathic Chain (compteur visible) ----------------------------------

/**
 * Affiche le badge CHAIN ×N avec ses points de fenêtre.
 * @param {number} count longueur de la chaîne (≥ 2)
 * @param {number} windowLeft coups restants pour prolonger (0..2)
 */
function showChain(count, windowLeft) {
  chainValue.textContent = `CHAIN ×${count}`;
  const dots = chainWindow.querySelectorAll('i');
  dots.forEach((d, i) => d.classList.toggle('spent', i >= windowLeft));
  chainBadge.classList.add('visible');
  chainBadge.classList.remove('pop', 'combo');
  void chainBadge.offsetWidth;
  chainBadge.classList.add(windowLeft === 2 ? 'combo' : 'pop');
}

/** Masque le badge (chaîne cassée ou nouvelle partie). */
function hideChain() {
  chainBadge.classList.remove('visible', 'pop', 'combo');
}

/**
 * Annonce commentée d'un objectif : le code calcule les faits
 * (paires directes, tuiles existantes), Momo les transforme en annonce.
 * Appelée au démarrage et après chaque explosion.
 */
function announceTarget() {
  const facts = describeTarget(board, target);
  coachNewTarget({ board, target, directPairs: facts.directPairs })
    .then((r) => coachSay(r.text));
}

// --- Boucle de jeu --------------------------------------------------------------

function newGame() {
  mode = 'classic';
  document.body.dataset.mode = 'classic';
  board = createBoard(rows, cols);
  score = 0;
  busy = false;
  targetCount = 0;
  recentTargets = [];
  calvados.clear();
  chainTracker.reset();
  moveIndex = 0;
  chainWindowLeft = 0;
  chainCount = 0;
  hideChain();

  buildGrid(gridElement, rows, cols);
  const tileLayer = gridElement.querySelector('.tile-layer');
  tiles = createTileManager(tileLayer, rows, cols);

  // Équilibrage (roadmap 1.2) : tuiles initiales ET spawn dans [1..5].
  fillInitialTiles(board, Math.max(4, cols), PUZZLE_STARTER_MAX);
  target = pickTarget(board, recentTargets);
  recentTargets.push(target);

  updateHud();
  tiles.sync(board, targetValueCells());
  hideGameOver();
  resetIdleTimer();

  coachWelcome({ target }).then(coachSay);
  announceTarget();
}

function updateHud() {
  scoreElement.textContent = score;
  best = Math.max(best, score);
  localStorage.setItem('mathic_record', String(best));
  bestElement.textContent = best;
  targetElement.textContent = target;
  document.body.dataset.op = currentOp;
  renderOperatorSelection(operatorButtons, currentOp);
  updateGauge();
}

/**
 * Index (row*cols+col) des cases dont la valeur égale l'objectif courant.
 * @returns {number[]}
 */
function targetValueCells() {
  const indexes = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === target) indexes.push(r * cols + c);
    }
  }
  return indexes;
}

/**
 * Traite les explosions : consomme les tuiles égales à la cible, attribue
 * les bonus, puis enchaîne sur une nouvelle cible.
 */
function processTargets() {
  const consumed = consumeTargetTiles(board, target);
  if (consumed.length === 0) return { exploded: [], bonus: 0 };

  const bonus = TARGET_BONUS + (consumed.length - 1) * HIT_BONUS;
  score += bonus;
  targetCount += consumed.length;

  // En mode puzzle, la cible est unique : pas de re-tirage.
  if (mode === 'puzzle') return { exploded: consumed, bonus };

  // Nouvelle cible : évite de reprendre la même immédiatement.
  const next = pickTarget(board, recentTargets);
  recentTargets.push(next);
  if (recentTargets.length > 5) recentTargets.shift();
  target = next;

  return { exploded: consumed, bonus };
}

/**
 * Réagit au coup joué : UNE réplique max par coup, priorisée
 * (explosion > nettoyage tactique > grosse fusion > contact invalide >
 * petit gain > rien). Le tirage au sort évite le bavardage constant ;
 * la cadence LLM (1.6 s) évite le spam.
 * @param {object} result résultat de slideBoard
 * @param {{row: number, col: number, value: number}[]} exploded
 * @param {{op: 'sub'|'div', freed: number}|null} cleaning infos si nettoyage
 */
function reactToMove(result, exploded, cleaning = null) {
  if (exploded.length > 0) {
    coachReact({
      type: 'targetReached',
      score,
      target: exploded[0].value,
      consumed: exploded.length,
      multi: exploded.length > 1,
    }).then(coachSay);
    return;
  }
  // Hype-Man : féliciter la finesse tactique des coups de nettoyage.
  if (cleaning && Math.random() < 0.85) {
    coachReact({
      type: 'cleaningMove',
      score,
      target,
      gained: result.gained,
      op: cleaning.op,
      freed: cleaning.freed,
    }).then(coachSay);
    return;
  }
  if (result.gained >= 12) {
    if (Math.random() < 0.75) {
      coachReact({ type: 'goodMove', score, target, gained: result.gained }).then(coachSay);
    }
    return;
  }
  if (result.invalidCells.length > 0 && Math.random() < 0.5) {
    coachReact({ type: 'invalidContact', score, target }).then(coachSay);
    return;
  }
  if (result.gained > 0) {
    if (Math.random() < 0.35) {
      coachReact({ type: 'weakMove', score, target, gained: result.gained }).then(coachSay);
    }
    return;
  }
  // Rien n'a bougé : réplique occasionnelle (le joueur teste des directions).
  if (Math.random() < 0.4) {
    coachReact({ type: 'noMove', score, target }).then(coachSay);
  }
}

function handleDirection(dir) {
  if (busy) return;

  const result = slideBoard(board, dir, currentOp);
  if (!result.moved) {
    reactToMove(result, []);
    return;
  }

  busy = true;
  // Snapshot COMPLET avant le coup : l'Undo restaure exactement cet état
  // (score, jauge, cible, chaîne, compteur de coups).
  const snapBefore = { score, movesLeft, target, targetCount, moveIndex, chainWindowLeft, chainCount };
  const beforeBoard = board; // avant le coup (mesure de l'espace libéré)
  board = result.board;
  score += result.gained;
  if (mode === 'puzzle') movesLeft -= 1;
  moveIndex += 1;

  // Coup de nettoyage (Hype-Man) : sub/div qui libère une case sur un
  // plateau encombré → Momo valorise la finesse tactique du joueur.
  const cleaning = isCleaningMove(beforeBoard, result.board, currentOp)
    ? {
        op: currentOp,
        freed: countEmptyCells(result.board) - countEmptyCells(beforeBoard),
      }
    : null;

  // 1) Les tuiles glissent (et les fusions convergent).
  tiles.slide(result.moves, result.mergedCells);

  // 2) Feedback des contacts invalides : shake des tuiles + SCREEN SHAKE.
  if (result.invalidCells.length > 0) {
    tiles.shake(result.invalidCells);
    tiles.screenShake({ strong: result.invalidCells.length > 2 });
  }

  // 3) Explosion éventuelle des tuiles-objectif (après le glissement).
  const { exploded, bonus } = processTargets();

  // Mathic Chain : cette destruction s'enchaine-t-elle à la précédente ?
  // La fenêtre VISIBLE décrémente à chaque coup sans explosion.
  let chainInfo = { chained: false, chainLength: 1 };
  if (exploded.length > 0) {
    chainInfo = chainTracker.registerTarget(moveIndex);
  } else if (chainWindowLeft > 0) {
    chainWindowLeft -= 1;
    if (chainWindowLeft === 0) hideChain();
    else showChain(chainCount, chainWindowLeft);
  }
  const isCombo = chainInfo.chained;
  const preExplosionDelay = exploded.length > 0 ? MOVE_DURATION + 60 : 0;

  setTimeout(() => {
    if (exploded.length > 0) {
      // Le combo amplifie visuellement (particules ×, halo doré).
      tiles.explode(exploded, bonus, { combo: isCombo });
      tiles.bumpScore(scoreElement);
      if (isCombo) tiles.screenShake({ strong: true }); // euphorie

      // Badge : ×N visible tant que la fenêtre de 2 coups est ouverte.
      chainCount = chainInfo.chained ? chainInfo.chainLength : 1;
      chainWindowLeft = 2;
      showChain(chainCount, chainWindowLeft);
    }

    // 4) Nouvelle tuile + rafraîchissement visuel.
    // Équilibrage (roadmap 1.2) : spawn STRICTEMENT dans [1..5].
    let spawnInfo = null;
    if (mode !== 'puzzle') spawnInfo = spawnRandomTile(board, PUZZLE_STARTER_MAX);
    tiles.sync(board, targetValueCells());
    updateHud();

    // 5) Réaction du coach : le COMBO passe AVANT tout le reste.
    if (isCombo && exploded.length > 0) {
      coachReact({
        type: 'combo',
        score,
        target: exploded[0].value,
        chain: chainInfo.chainLength,
      }).then(coachSay);
    } else {
      reactToMove(result, exploded, cleaning);
    }
    if (exploded.length > 0 && mode === 'classic') announceTarget();

    // 6) Fin du coup : on FINALISE l'entrée Calvados (faits exacts + états
    // immuables + diff vectoriel) — la pile ne perd jamais une ligne.
    calvados.push(
      makeEntry({
        before: beforeBoard,
        after: board,
        moves: result.moves,
        mergedCells: result.mergedCells,
        spawned: spawnInfo ? [spawnInfo] : [],
        exploded,
        gained: result.gained,
        dir,
        op: currentOp,
        snap: snapBefore,
      })
    );

    setTimeout(() => {
      busy = false;
      resetIdleTimer();
      if (mode === 'puzzle') {
        afterPuzzleMove(exploded);
      } else if (isGameOver(board)) {
        showGameOver();
      }
    }, SPAWN_DURATION);
  }, preExplosionDelay);
}

// --- Mode « Coup Parfait » (Phase 3) --------------------------------------------

/**
 * Palette de niveaux (portée croissante). target=null → cible tirée au hasard
 * dans le pool du générateur. Le bouton 🧩 cycle ces niveaux à chaque lancement.
 * Niveau 2 = l'exemple du ticket : cible 42 en EXACTEMENT 4 coups.
 */
const PUZZLE_LEVELS = [
  { target: null, moves: 3, label: 'Découverte · 3 coups' },
  { target: 42, moves: 4, label: 'Défi · 42 en 4 coups' },
  { target: 48, moves: 5, label: 'Maître · 48 en 5 coups' },
];

/** Index du prochain niveau (cycle 0 → N → 0). */
let puzzleLevelIndex = 0;

/**
 * Lance un puzzle généré par rétro-ingénierie + validation BFS :
 * la solution existe en EXACTEMENT N coups, certifié mathématiquement.
 */
function startPuzzle() {
  if (busy) return;
  const level = PUZZLE_LEVELS[puzzleLevelIndex % PUZZLE_LEVELS.length];
  puzzleLevelIndex = (puzzleLevelIndex + 1) % PUZZLE_LEVELS.length;

  mode = 'puzzle';
  document.body.dataset.mode = 'puzzle';
  calvados.clear();
  chainTracker.reset();
  moveIndex = 0;
  chainWindowLeft = 0;
  chainCount = 0;
  hideChain();

  board = createBoard(rows, cols);
  score = 0;
  targetCount = 0;
  recentTargets = [];
  busy = true; // génération BFS en cours

  buildGrid(gridElement, rows, cols);
  const tileLayer = gridElement.querySelector('.tile-layer');
  tiles = createTileManager(tileLayer, rows, cols);

  const generated = generatePuzzle({
    rows,
    cols,
    moves: level.moves,
    target: level.target,
  });
  board = generated.board;
  target = generated.target;
  puzzleMoves = generated.moves; // profondeur RÉELLE (certifiée BFS)
  movesLeft = generated.moves;

  updateHud();
  tiles.sync(board, targetValueCells());
  hideGameOver();

  // Annonce certifiée par le solveur : "Cible X. Le chemin parfait se
  // fait en N coups exacts. Pas de droit à l'erreur !"
  coachPuzzleIntro({ target, moves: puzzleMoves }).then(coachSay);
  setTimeout(() => {
    busy = false;
  }, 60);
}

/**
 * Annule le dernier coup (Undo) — proposé par Momo quand le puzzle devient
 * insolvable, disponible en continu dans ce mode. Dépile l'entrée Calvados
 * et la joue EN MIROIR :
 *  - `reversePlan` fige le plan exact (dé-fusions, glissements inversés,
 *    spawn retirés) ; `tiles.rewind` anime ce retour avec les MÊMES
 *    éléments DOM (mêmes ids → transitions CSS en sens inverse) ;
 *  - le snapshot complet (`snap`) restaure le score, la jauge de coups,
 *    la cible, la chaîne et le compteur de coups ;
 *  - `sync` fait foi : il recrée les tuiles explosées et retire les résidus.
 */
function undoMove() {
  if (mode !== 'puzzle' || busy) return;
  const entry = calvados.pop();
  if (!entry) return;

  board = entry.before;
  score = entry.snap.score;
  movesLeft = entry.snap.movesLeft;
  target = entry.snap.target;
  targetCount = entry.snap.targetCount;
  moveIndex = entry.snap.moveIndex;
  chainWindowLeft = entry.snap.chainWindowLeft;
  chainCount = entry.snap.chainCount;
  if (chainWindowLeft === 0) hideChain();
  else showChain(chainCount, chainWindowLeft);
  busy = true;

  const plan = reversePlan(entry);
  tiles.rewind(plan);
  tiles.sync(board, targetValueCells());
  updateHud();

  // L'Undo dégrise aussi l'écran de fin : on annule un dernier coup depuis
  // un game over comme depuis une victoire, et on reprend la main.
  hideGameOver();

  coachReact({ type: 'undo', score, target, ...calvadosContext(entry) }).then(coachSay);
  setTimeout(() => {
    busy = false;
    resetIdleTimer();
  }, 60);
}

/**
 * Jauge de pression : compteur de coups restants (mode puzzle).
 */
function updateGauge() {
  if (!movesLeftElement) return;
  if (mode !== 'puzzle') {
    movesLeftElement.parentElement.style.display = 'none';
    return;
  }
  movesLeftElement.parentElement.style.display = '';
  movesLeftElement.textContent = movesLeft;
  movesLeftElement.parentElement.classList.toggle('urgent', movesLeft <= 1);
}

/**
 * Après chaque coup de puzzle : victoire (cible produite et consommée),
 * insolvabilité détectée en temps réel (Undo proposé), ou épuisement.
 * @param {{row: number, col: number, value: number}[]} exploded
 */
function afterPuzzleMove(exploded) {
  updateGauge();

  if (exploded.length > 0) {
    finalScoreElement.textContent = score;
    finalTargetsElement.textContent = targetCount;
    overlay.classList.add('visible');
    coachPuzzleWin({ score, movesLeft }).then(coachSay);
    return;
  }

  // Solvabilité temps réel : le coup a-t-il tué le puzzle ?
  const remaining = minMovesToReach(board, target, movesLeft);
  if (remaining === null || remaining > movesLeft) {
    if (movesLeft <= 0) {
      showGameOver();
      coachGameOver({ score, targetCount }).then(coachSay);
    } else {
      // Momo réagit IMMÉDIATEMENT et propose l'Undo (pas de punition).
      coachReact({ type: 'blockingMove', score, target, movesLeft }).then(coachSay);
    }
    return;
  }
  if (movesLeft <= 0) {
    showGameOver();
    coachGameOver({ score, targetCount }).then(coachSay);
  }
}

// --- Indice ---------------------------------------------------------------------

/**
 * Demande un indice : le code trouve les paires exactes (jamais faux),
 * le flash les montre, et Momo phrase l'indice sans donner la réponse.
 */
function requestHint() {
  if (busy || hintLock) return;
  hintLock = true;
  setTimeout(() => (hintLock = false), 1500);

  const pairs = findTargetPairs(board, target);
  const cells = pairs.flat();

  if (cells.length > 0) tiles.flash(cells);

  // Indice naturel : le code fournit l'OP exact (fait garanti),
  // Momo le phrase sans révéler les valeurs.
  const hint = findTargetHint(board, target);

  coachHint({
    board,
    target,
    hasPair: cells.length > 0,
    pairCount: pairs.length,
    hintOp: hint ? hint.op : null,
    hintA: hint ? hint.a : undefined,
    hintB: hint ? hint.b : undefined,
  }).then((r) => coachSay(r.text));
}

// --- Game over -------------------------------------------------------------------

function showGameOver() {
  finalScoreElement.textContent = score;
  finalTargetsElement.textContent = targetCount;
  overlay.classList.add('visible');
  coachGameOver({ score, targetCount }).then(coachSay);
}

function hideGameOver() {
  overlay.classList.remove('visible');
}

// --- Événements --------------------------------------------------------------------

newGameButton.addEventListener('click', newGame);
restartButton.addEventListener('click', newGame);
hintButton.addEventListener('click', requestHint);
undoButton.addEventListener('click', undoMove);
puzzleButton.addEventListener('click', startPuzzle);

sizeSelect.addEventListener('change', () => {
  const [r, c] = sizeSelect.value.split('x').map(Number);
  rows = r;
  cols = c;
  newGame();
});

operatorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentOp = btn.dataset.op;
    updateHud();
  });
});

onDirection(handleDirection);

// Raccourcis clavier : 1-4 = opérateurs, H = indice, U = undo, P = profiler.
// Les touches 1-4 SIMULENT un clic sur le bouton HTML correspondant : la
// barre tactile reste parfaitement synchronisée (état .active + currentOp).
window.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= 4 && operatorButtons[n - 1]) {
    operatorButtons[n - 1].click();
  } else if (e.key === 'h' || e.key === 'H') {
    requestHint();
  } else if (e.key === 'u' || e.key === 'U') {
    undoMove();
  } else if (e.key === 'p' || e.key === 'P') {
    profiler.toggle();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  }
});

// Profillage mobile (roadmap 5.2) : HUD FPS/mémoire via bouton ou touche P.
const profiler = createProfiler();
if (profileButton) {
  profileButton.addEventListener('click', () => profiler.toggle());
}

// --- Édition plein-écran (Phase 4) ---------------------------------------------
// Mode immersif : la grille remplît le viewport (CSS `body.fullscreen`).
// L'API native Fullscreen (sur le document) est tentée quand elle existe ;
// sinon le mode CSS pur s'applique (fallback iOS par exemple).
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return;
  }
  const canNative = typeof document.documentElement.requestFullscreen === 'function';
  if (canNative) {
    // Classe posée pour l'immersion pendant la transition native ; elle
    // sera retirée à la sortie (ESC → fullscreenchange).
    document.body.classList.add('fullscreen');
    document.documentElement.requestFullscreen().catch(() => {
      // API refusée (permissions) : on rend la main au mode normal.
      document.body.classList.remove('fullscreen');
      syncFullscreenUI();
    });
  } else {
    // Fallback : mode immersif purement CSS, annulé par un nouveau clic.
    document.body.classList.toggle('fullscreen');
    syncFullscreenUI();
  }
}

function syncFullscreenUI() {
  if (!fullscreenButton) return;
  const active =
    document.body.classList.contains('fullscreen') || !!document.fullscreenElement;
  fullscreenButton.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function onFullscreenChange() {
  if (!document.fullscreenElement) document.body.classList.remove('fullscreen');
  syncFullscreenUI();
}

document.addEventListener('fullscreenchange', onFullscreenChange);
// Variante préfixée (anciens WebKit).
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

if (fullscreenButton) {
  fullscreenButton.addEventListener('click', toggleFullscreen);
}

// --- PWA — installation native + hors-ligne total (Phase 5) --------------------

// L'événement `beforeinstallprompt` (Chrome/Android, Edge) est intercepté et
// conservé : l'invite native ne peut être déclenchée QUE via .prompt() sur
// demande explicite de l'utilisateur (bonnes pratiques d'installation).
let deferredInstallPrompt = null;

function showInstallButton() {
  if (installButton) installButton.hidden = false;
}

function hideInstallButton() {
  if (installButton) installButton.hidden = true;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e; // stocké → .prompt() au clic
  showInstallButton();
});

if (installButton) {
  installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt(); // invite d'installation native de la plateforme
    try {
      await deferredInstallPrompt.userChoice; // résultat (accepted / dismissed)
    } catch {
      /* choix annulé : non bloquant */
    }
    deferredInstallPrompt = null;
    hideInstallButton();
  });
}

// App déjà installée : le bouton ne doit plus jamais apparaître.
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallButton();
});

// Enregistrement du service worker (cache hors-ligne). Production seulement —
// en dev, Vite ne sert pas sw.js à la racine de manière fiable. Le chemin est
// relatif : l'app fonctionne sous GitHub Pages (/mathic/) comme à la racine.
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* hors-ligne optionnel : échec non bloquant */
    });
  });
}

// --- Démarrage -----------------------------------------------------------------------

newGame();
startAI();
