/**
 * main.js — Boucle de jeu, chorégraphie et orchestration du coach IA
 *
 * K5 : la MÉCANIQUE appartient à l'adapter (src/game.js → GameSession →
 * Core → GameEvents) ; ce module orchestre UNIQUEMENT la présentation.
 * Chorégraphie d'un coup :
 *  1. game.move(dir, op) → moteur (court) + outcome (trajectoires, faits)
 *  2. tiles.slide         → les tuiles glissent, les fusions convergent
 *  3. tiles.shake         → feedback des contacts invalides
 *  4. tiles.explode       → effondrement des tuiles-objectif (bonus classic
 *                           lu sur clone : 500 + 100/tuile), ou le moteur
 *                           pour le puzzle
 *  5. tiles.sync          → le spawn vient du moteur, surbrillance, HUD
 *  6. afterPuzzleMove / gameOver → fin de partie
 *
 * Momo (coach IA local) commente CHAQUE coup : fusions, coups faibles,
 * coups sans effet, contacts invalides, explosions, et annonce chaque
 * nouvel objectif avec son atteignabilité réelle (faits calculés par le code).
 * Le TUTORIEL (séquence scriptée FTUE) est le seul bloc qui écrit ses
 * miroirs d'affichage en direct (chorégraphie isolée, pas la boucle de jeu).
 */

import './style.css';
import {
  createBoard,
  slideBoard,
} from './core/board.js';
import { createRng } from './random.js';
import {
  buildGrid,
  createTileManager,
  renderOperatorSelection,
  MOVE_DURATION,
  SPAWN_DURATION,
} from './ui.js';
import { onDirection } from './input.js';
import {
  consumeTargetTiles,
  findTargetPairs,
  findTargetHint,
  describeTarget,
} from './targets.js';
import { createGame, CLASSIC_BONUS, CLASSIC_HIT_BONUS } from './game.js';
import { createPersistence } from './persistence.js';
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
import { createAudioManager } from './audio.js';
import {
  createTutorial,
  isTutorialDone,
  markTutorialDone,
  resetTutorialFlag,
  TUTORIAL_CELL_A,
  TUTORIAL_CELL_B,
} from './tutorial.js';

// Couleurs d'opérateur (miroir des règles .op-btn[data-op]) : récompenses
// visuelles V2 (confettis, textes flottants) teintées par l'op choisi.
const OP_COLORS = { add: '#4fd1c5', sub: '#e8704b', mul: '#e8b04b', div: '#4a90d9' };
const OP_SYMBOLS = { add: '+', sub: '−', mul: '×', div: '÷' };

// --- État -------------------------------------------------------------------

let rows = 4;
let cols = 4;
let currentOp = 'add';
let busy = false;
let best = Number(migrateOldKeys() || 0);
let idleTimer = null;
let hintLock = false;
/** @type {ReturnType<typeof createTileManager>|null} */
let tiles = null;

// K5 : l'ADAPTER est l'autorité unique (moteur audité). Les variables
// d'état ci-dessous ne sont que des MIROIRS D'AFFICHAGE : lues par l'UI
// (HUD, tuiles, coach), réécrites par l'adapter à chaque coup/undo/nouvelle
// partie. Seul le tutoriel (séquence scriptée isolée) les écrit en direct.
const game = createGame();
// K8 : persistance de session (jouer → fermer → rouvrir → continuer).
const persistence = createPersistence();
let board = [];
let score = 0;
let target = 0;
let targetCount = 0;
let movesLeft = 0;
let puzzleMoves = 0;

// Seed de session (miroir, pour le debug / replay).
let sessionSeed = String(Date.now());
// Flux cosmetic (coach) : seul consommateur RESTANT du RNG côté runtime ;
// le flux game (spawn/coups) appartient désormais au moteur (game stream).
let cosmeticRng = createRng(sessionSeed ^ 0xDEADBEEF);

// Mode courant : 'tutorial' ou 'classic'/'puzzle' (géré par l'adapter).
let mode = 'classic';
/** Hôte visuel du tutoriel FTUE (null hors tutoriel). */
let tutorialHost = null;

// Résonance V2 : nombre de coups RÉUSSIS (avec fusion) d'affilée — le pitch
// des fusions monte d'un demi-ton à chaque pas (ascension harmonique).
let mergeStreak = 0;

/** Met à jour les miroirs d'affichage depuis l'adapter. */
function syncMirror() {
  board = game.board;
  score = game.score;
  target = game.target;
  targetCount = game.targetCount;
  movesLeft = game.movesLeft;
  puzzleMoves = game.puzzleMoves;
  sessionSeed = game.seed;
}

/** Rafraîchit le badge CHAIN depuis l'adapter (fenêtre 2 coups). */
function refreshChainBadge() {
  if (game.chainWindowLeft > 0) showChain(game.chainCount, game.chainWindowLeft);
  else hideChain();
}

/** K8 : fige la partie courante (adapter → storage). */
function saveSession() {
  persistence.save(game);
}

// --- Moteur audio + éléments DOM -------------------------------------------

const audio = createAudioManager();

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
const audioButton = document.querySelector('#btn-audio');
const installButton = document.querySelector('#btn-install');
const tutorialResetButton = document.querySelector('#btn-tut-reset');
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

// Bonus d'effondrement classic (V3, cible 24) : propriété de l'adapter
// (testable), ré-exportés ici pour le tutoriel scripté.
const TARGET_BONUS = CLASSIC_BONUS;
const HIT_BONUS = CLASSIC_HIT_BONUS;

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
    // Pendant la découverte, pas de réplique LLM spontanée (répliques scriptées).
    if (!busy && mode !== 'tutorial' && aiIsReady() && !aiIsBusy()) {
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
  // G2 : nouvelle seed par session pour la déterminabilité.
  sessionSeed = `classic-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  cosmeticRng = createRng(sessionSeed ^ 0xDEADBEEF);

  mode = 'classic';
  document.body.dataset.mode = 'classic';
  busy = false;
  mergeStreak = 0;

  // K5 : la mécanique (plateau initial, spawn [1..5], compteur, game over)
  // appartient au moteur via l'adapter — 6 tuiles initiales (default moteur).
  game.newClassic({ rows, cols, seed: sessionSeed });
  syncMirror();

  buildGrid(gridElement, rows, cols);
  const tileLayer = gridElement.querySelector('.tile-layer');
  tiles = createTileManager(tileLayer, rows, cols);

  hideChain();
  updateHud();
  tiles.sync(board, targetValueCells());
  hideGameOver();
  resetIdleTimer();

  saveSession();
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
  if (cleaning && cosmeticRng.next() < 0.85) {
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
    if (cosmeticRng.next() < 0.75) {
      coachReact({ type: 'goodMove', score, target, gained: result.gained }).then(coachSay);
    }
    return;
  }
  if (result.invalidCells.length > 0 && cosmeticRng.next() < 0.5) {
    coachReact({ type: 'invalidContact', score, target }).then(coachSay);
    return;
  }
  if (result.gained > 0) {
    if (cosmeticRng.next() < 0.35) {
      coachReact({ type: 'weakMove', score, target, gained: result.gained }).then(coachSay);
    }
    return;
  }
  // Rien n'a bougé : réplique occasionnelle (le joueur teste des directions).
  if (cosmeticRng.next() < 0.4) {
    coachReact({ type: 'noMove', score, target }).then(coachSay);
  }
}

function handleDirection(dir) {
  if (busy) return;
  audio.unlock(); // K6 : le geste de glissement est aussi un déblocage autoplay

  // Pendant la découverte, seul le geste qui fusionne 2+3 est accepté.
  if (mode === 'tutorial') {
    handleTutorialDirection(dir);
    return;
  }

  // K5 : un seul point d'entrée — l'ADAPTER (mécanique moteur + spins).
  const r = game.move(dir, currentOp);
  if (!r.moved) {
    audio.playError(); // glissement sans effet → son « bloqué »
    reactToMove({ gained: 0, invalidCells: r.invalidCells || [] }, []);
    return;
  }

  busy = true;
  audio.playMove(); // « pop » tactile au départ du glissement

  // Miroirs d'affichage (le vrai état est côté moteur / adapter).
  board = game.board;
  score = r.score;
  movesLeft = r.movesLeft;
  targetCount = game.targetCount;

  // 1) Les tuiles glissent (et les fusions convergent) — la fusion éclate
  // en confettis teintés de l'opérateur (V2).
  const mergeCount = r.mergedCells.length;
  if (mergeCount > 0) {
    // Résonance harmonique : +1 pas par coup réussi d'affilée (et +1 par
    // fusion supplémentaire dans le même coup).
    mergeStreak += 1;
    audio.playMerge(mergeStreak + mergeCount - 1);
  } else {
    mergeStreak = 0; // coup sans fusion → la série retombe
  }
  tiles.slide(r.moves, r.mergedCells, {
    confettiColor: OP_COLORS[currentOp],
  });

  // Texte flottant de l'opération réalisée au-dessus de chaque fusion
  // (ex. « +14 », « ×24 »), synchronisé sur le rebond de la tuile résultat.
  if (mergeCount > 0) {
    setTimeout(() => {
      for (const mc of r.mergedCells) {
        tiles.spawnFloatingText(
          mc.row,
          mc.col,
          `${OP_SYMBOLS[currentOp]}${mc.value}`,
          OP_COLORS[currentOp]
        );
      }
    }, MOVE_DURATION + 50);
  }

  // 2) Feedback des contacts invalides : shake des tuiles + SCREEN SHAKE
  // + son d'erreur sourd.
  if (r.invalidCells.length > 0) {
    tiles.shake(r.invalidCells);
    tiles.screenShake({ strong: r.invalidCells.length > 2 });
    audio.playError();
  }

  // 3) Explosion des tuiles-objectif : portée et bonus fournis par l'adapter
  // (classic = lecture clone sur le plateau moteur ; puzzle = engine).
  const exploded = r.exploded;
  const isCombo = r.isCombo;
  const preExplosionDelay = exploded.length > 0 ? MOVE_DURATION + 60 : 0;

  setTimeout(() => {
    if (exploded.length > 0) {
      // Le combo amplifie visuellement (particules ×, halo doré).
      tiles.explode(exploded, r.bonus, { combo: isCombo });
      tiles.bumpScore(scoreElement);
      audio.playExplode(isCombo ? game.chainCount : 1); // arpège si combo
      if (isCombo) tiles.screenShake({ strong: true }); // euphorie
    }

    // Badge CHAIN : la fenêtre de 2 coups est calculée par l'adapter.
    refreshChainBadge();

    // 4) Rafraîchissement visuel (la tuile spawnée vient du moteur ;
    // l'affichage classic effondre les tuiles 24).
    tiles.sync(board, targetValueCells());
    updateHud();

    // 5) Réaction du coach : le COMBO passe AVANT tout le reste.
    if (isCombo && exploded.length > 0) {
      coachReact({
        type: 'combo',
        score,
        target: exploded[0].value,
        chain: r.chain.chainLength,
      }).then(coachSay);
    } else {
      reactToMove(r, exploded, r.cleaning);
    }
    if (exploded.length > 0 && mode === 'classic') announceTarget();
    saveSession();

    setTimeout(() => {
      busy = false;
      resetIdleTimer();
      if (mode === 'puzzle') {
        afterPuzzleMove(exploded);
      } else if (r.gameOver) {
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

  // G2 : seed déterministe pour la session puzzle.
  sessionSeed = `puzzle-${level.target ?? 'rand'}-${level.moves}-${Date.now()}`;
  cosmeticRng = createRng(sessionSeed ^ 0xDEADBEEF);

  mode = 'puzzle';
  document.body.dataset.mode = 'puzzle';
  mergeStreak = 0;
  hideChain();

  // K5 : la génération rétro-ingénierie + validation BFS + la jauge
  // appartiennent au moteur (via l'adapter) ; seed déterministe.
  game.newPuzzle({ rows, cols, target: level.target, moves: level.moves, seed: sessionSeed });
  syncMirror();

  busy = true; // génération BFS en cours
  buildGrid(gridElement, rows, cols);
  const tileLayer = gridElement.querySelector('.tile-layer');
  tiles = createTileManager(tileLayer, rows, cols);

  updateHud();
  tiles.sync(board, targetValueCells());
  hideGameOver();

  saveSession();

  // Annonce certifiée par le solveur : "Cible X. Le chemin parfait se
  // fait en N coups exacts. Pas de droit à l'erreur !"
  coachPuzzleIntro({ target, moves: puzzleMoves }).then(coachSay);
  setTimeout(() => {
    busy = false;
  }, 60);
}

/**
 * Annule le dernier coup (Undo) — proposé par Momo quand le puzzle devient
 * insolvable, disponible en continu dans ce mode.
 *  - Le MOTEUR restaure l'état (pile d'états, stream game re-positionné) ;
 *  - l'adapter fournit le plan graphique exact (`reversePlan`) pour animer
 *    le retour avec les MÊMES éléments DOM (transitions CSS inverses) ;
 *  - les miroirs d'affichage (score, jauge, cible, chaîne, compteur de
 *    coups) sont restaurés depuis l'adapter.
 */
function undoMove() {
  if (mode !== 'puzzle' || busy) return;
  const u = game.undo();
  if (!u.ok) return;

  // Miroirs : l'état est déjà restauré côté moteur.
  board = game.board;
  score = game.score;
  target = game.target;
  targetCount = game.targetCount;
  movesLeft = game.movesLeft;
  puzzleMoves = game.puzzleMoves;

  busy = true;

  if (u.plan) tiles.rewind(u.plan);
  tiles.sync(board, targetValueCells());
  updateHud();
  refreshChainBadge();
  saveSession();

  // L'Undo dégrise aussi l'écran de fin : on annule un dernier coup depuis
  // un game over comme depuis une victoire, et on reprend la main.
  hideGameOver();

  coachReact({ type: 'undo', score, target, ...(u.context || {}) }).then(coachSay);
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

  // Solvabilité temps réel : le coup a-t-il tué le puzzle ? (adapter =
  // board moteur, target, coups restants — même primitive que l'ancien code).
  const remaining = game.solvabilityRemainder();
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

// --- Tutoriel FTUE (Phase 3) ----------------------------------------------

/**
 * Rectangle viewport de la case (row, col) de la grille — pour les trous
 * de lumière et le placement de la main fantôme.
 * @param {number} row
 * @param {number} col
 * @returns {DOMRect|null}
 */
function cellRectFor(row, col) {
  const idx = row * cols + col;
  const cell = gridElement.querySelectorAll('.cell')[idx];
  return cell ? cell.getBoundingClientRect() : null;
}

/**
 * Lance le niveau scripté de découverte : deux 3 adjacents (addition =
 * fusion 3+3 → 6, cible). L'overlay perce le bouton + et les deux tuiles,
 * la main fantôme anime le geste, et Momo parle EN SCRIPT (aucun appel LLM).
 * NB : sous l'opérateur +, deux tuiles ne fusionnent que si elles sont
 * ÉGALES (règle 2048) — le duo 3+3→6 est le plus court chemin vrai vers
 * une cible atteignable.
 */
function startTutorial() {
  mode = 'tutorial';
  document.body.dataset.mode = 'classic'; // undo/jauge gérés par classic
  hideGameOver();

  // Séquence scriptée ISOLÉE : le tutoriel écrit directement ses miroirs
  // (il ne passe pas par l'adapter — c'est une chorégraphie FTUE, pas la
  // boucle de jeu). La première vraie partie pose le state moteur via
  // newGame() au moment du finish.
  board = createBoard(rows, cols);
  score = 0;
  targetCount = 0;
  busy = false;
  mergeStreak = 0;
  hideChain();

  currentOp = 'add';
  board[TUTORIAL_CELL_A.row][TUTORIAL_CELL_A.col] = 3;
  board[TUTORIAL_CELL_B.row][TUTORIAL_CELL_B.col] = 3;
  target = 6;

  buildGrid(gridElement, rows, cols);
  const tileLayer = gridElement.querySelector('.tile-layer');
  tiles = createTileManager(tileLayer, rows, cols);

  updateHud();
  tiles.sync(board, targetValueCells());
  resetIdleTimer();

  tutorialHost = createTutorial({
    addButton: document.querySelector('#operator-bar .op-btn[data-op="add"]'),
    cellRect: cellRectFor,
  });
  tutorialHost.mount();
  tutorialHost.guide();

  // Répliques SCRIPTées : pas de LLM pendant les 2 premières minutes.
  coachSay('Bienvenue dans MATHIC ! Montre-moi ce que tu sais faire. Fusionne ces deux 3 !');
}

/**
 * Gère un glissement pendant le tutoriel : rejette tout coup qui ne produit
 * pas la fusion 3+3 (feedback « bloqué »), sinon applique la chorégraphie
 * réduite (pas de spawn) jusqu'à l'explosion de la cible 6.
 * @param {'up'|'down'|'left'|'right'} dir
 */
function handleTutorialDirection(dir) {
  if (busy) return;

  const result = slideBoard(board, dir, 'add');
  if (result.mergedCells.length === 0) {
    // Toute autre direction ne déclenche aucune fusion : on la rejette.
    audio.playError();
    if (result.invalidCells.length > 0) tiles.shake(result.invalidCells);
    coachSay('Glisse une tuile 3 sur l’autre pour faire 6 !');
    return;
  }

  busy = true;
  mergeStreak = 1;
  audio.playMove();
  audio.playMerge(1);

  board = result.board;
  score += result.gained;

  tiles.slide(result.moves, result.mergedCells, {
    confettiColor: OP_COLORS.add,
  });
  setTimeout(() => {
    for (const mc of result.mergedCells) {
      tiles.spawnFloatingText(mc.row, mc.col, `+${mc.value}`, OP_COLORS.add);
    }
    const consumed = consumeTargetTiles(board, target);
    if (consumed.length > 0) {
      score += TARGET_BONUS + (consumed.length - 1) * HIT_BONUS;
      targetCount += consumed.length;
      updateHud();
      tiles.bumpScore(scoreElement);
      tiles.explode(consumed, score, { combo: false });
      audio.playExplode(1);
      finishTutorial();
    } else {
      busy = false;
    }
  }, MOVE_DURATION + 60);
}

/**
 * Termine la découverte : persiste le drapeau, enlève l'overlay et bascule
 * sur la vraie partie (Momo reprend la main, LLM déjà préchauffé en fond).
 */
function finishTutorial() {
  markTutorialDone();
  tutorialHost?.hide();
  tutorialHost = null;
  mode = 'classic';

  coachSay('Magnifique ! Tu as compris le principe. À toi de jouer en mode libre !');
  // Laisse le compliment respirer, puis lance la vraie partie.
  setTimeout(() => {
    busy = false;
    if (mode === 'tutorial') return; // le joueur a relancé la découverte
    newGame();
  }, 1600);
}

/**
 * Bouton de développement : relance le tutoriel depuis zéro.
 */
function replayTutorial() {
  resetTutorialFlag();
  tutorialHost?.hide();
  tutorialHost = null;
  startTutorial();
}

// --- Indice ---------------------------------------------------------------------

/**
 * Demande un indice : le code trouve les paires exactes (jamais faux),
 * le flash les montre, et Momo phrase l'indice sans donner la réponse.
 */
function requestHint() {
  if (busy || hintLock || mode === 'tutorial') return;
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

newGameButton.addEventListener('click', () => {
  // Un nouveau joueur ne peut pas quitter la découverte : on la relance.
  if (!isTutorialDone()) {
    replayTutorial();
    return;
  }
  newGame();
});
restartButton.addEventListener('click', () => {
  if (!isTutorialDone()) {
    replayTutorial();
    return;
  }
  newGame();
});
hintButton.addEventListener('click', requestHint);
undoButton.addEventListener('click', undoMove);
puzzleButton.addEventListener('click', () => {
  if (busy || mode === 'tutorial') return;
  startPuzzle();
});

sizeSelect.addEventListener('change', () => {
  const [r, c] = sizeSelect.value.split('x').map(Number);
  rows = r;
  cols = c;
  if (mode === 'tutorial') replayTutorial();
  else newGame();
});

operatorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    // Tutoriel : seul « + » est utilisable (et il est déjà présélectionné) ;
    // tout autre opérateur est bloqué avec une réplique scriptée.
    if (mode === 'tutorial') {
      if (btn.dataset.op !== 'add') {
        audio.playError();
        coachSay('Essaie plutôt le bouton + (addition) !');
      } else {
        coachSay('Bien ! Le + est prêt. Maintenant glisse un 3 sur l’autre.');
      }
      return;
    }
    audio.unlock(); // K6 : le clic d'opérateur est aussi un geste de déblocage
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
  } else if (e.key === 'm' || e.key === 'M') {
    if (audioButton) audioButton.click();
  }
});

// Profillage mobile (roadmap 5.2) : HUD FPS/mémoire via bouton ou touche P.
const profiler = createProfiler();
if (profileButton) {
  profileButton.addEventListener('click', () => profiler.toggle());
}

// Bouton de développement : rejouer la découverte (tests / navigation privée).
if (tutorialResetButton) {
  tutorialResetButton.addEventListener('click', replayTutorial);
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

// --- Moteur audio (V2) — coupure/activation persitante --------------------

/**
 * Mirotre l'état de muet sur le bouton 🔊/🔇 (et aria-pressed).
 */
function syncAudioUI() {
  if (!audioButton) return;
  const muted = audio.isMuted();
  audioButton.textContent = muted ? '🔇' : '🔊';
  audioButton.setAttribute('aria-pressed', String(muted));
}

if (audioButton) {
  audioButton.addEventListener('click', () => {
    audio.toggleMute();
    syncAudioUI();
  });
}

// Politique d'autoplay : le contexte audio est débloqué au PREMIER geste de
// l'utilisateur (clic/touche/glissement), puis jamais bloqué de la session.
const unlockAudio = () => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('touchend', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('touchend', unlockAudio);
window.addEventListener('keydown', unlockAudio);

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

/**
 * K8 : reprend la partie sauvegardée (jouer → fermer → rouvrir → continuer).
 * Réhydrate l'adapter, rebranche les miroirs et reconstruit la grille.
 * @returns {boolean} true si la reprise a réussi
 */
function resumeFromSave() {
  let payload = null;
  try {
    payload = persistence.load();
  } catch {
    payload = null;
  }
  if (!payload) return false;

  try {
    game.restoreSnapshot(payload);
  } catch {
    persistence.clear();
    return false;
  }

  mode = game.mode;
  document.body.dataset.mode = mode;
  rows = payload.state.rows;
  cols = payload.state.cols;
  syncMirror();

  busy = false;
  mergeStreak = 0;

  buildGrid(gridElement, rows, cols);
  const tileLayer = gridElement.querySelector('.tile-layer');
  tiles = createTileManager(tileLayer, rows, cols);

  hideChain();
  hideGameOver();
  updateHud();
  tiles.sync(board, targetValueCells());
  resetIdleTimer();

  if (mode === 'puzzle') {
    coachPuzzleIntro({ target, moves: puzzleMoves }).then(coachSay);
  } else {
    coachWelcome({ target }).then(coachSay);
  }
  return true;
}

syncAudioUI();
// Un tout nouveau joueur entre par le tutoriel FTUE, pas par une grille au hasard.
if (!isTutorialDone()) {
  startTutorial();
} else if (!resumeFromSave()) {
  newGame();
}
startAI();
