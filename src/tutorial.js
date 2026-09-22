/**
 * tutorial.js — FTUE (First Time User Experience) : tutoriel in-game
 *
 * Zéro texte barbant : un calque sombre recouvre l'écran et « perce »
 * (clip-path) des trous de lumière sur le bouton + et les deux tuiles du
 * niveau scripté, pendant qu'une main fantôme 👆 anime le geste exact :
 *   1. taper le bouton + (opérateur d'addition) ;
 *   2. glisser les deux 3 l'un sur l'autre → fusion 6 = cible.
 *
 * NB : l'addition ne fusionne que des valeurs ÉGALES (règle 2048) — d'où
 * le duo 3+3. Toutes les répliques affichées pendant le tutoriel sont
 * SCRIPTées en dur (voir main.js) : le LLM reste muet durant l'initiation.
 */

/** Clé de persistance : le tutoriel est-il déjà terminé ? */
const TUTORIAL_KEY = 'mathic_tutorial_done';
const OVERLAY_ID = 'tutorial-overlay';
const HAND_CLASS = 'tut-hand';

/** Cases du niveau scripté : un 2 en (1,0), un 3 en (1,1). */
export const TUTORIAL_CELL_A = { row: 1, col: 0 };
export const TUTORIAL_CELL_B = { row: 1, col: 1 };

export function isTutorialDone() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true; // stockage indisponible : on ne bloque pas le joueur
  }
}

export function markTutorialDone() {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* stockage indisponible : on ignore */
  }
}

/** Réinitialise le drapeau (bouton de rejouer / tests). */
export function resetTutorialFlag() {
  try {
    localStorage.removeItem(TUTORIAL_KEY);
  } catch {
    /* stockage indisponible : on ignore */
  }
}

let uid = 0; // noms d'animations uniques (keyframes main glissante)

function vpRect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}

/** Transforme un rectangle en sous-chemin de polygone (clip-path). */
function rectToHole(rect) {
  return `${rect.l}px ${rect.t}px, ${rect.l}px ${rect.b}px, ${rect.r}px ${rect.b}px, ${rect.r}px ${rect.t}px`;
}

function debounceRaf(fn) {
  let t = null;
  return () => {
    if (t != null) cancelAnimationFrame(t);
    t = requestAnimationFrame(() => {
      t = null;
      fn();
    });
  };
}

/**
 * Construit l'hôte visuel du tutoriel.
 * @param {object} deps
 * @param {HTMLElement} deps.addButton bouton « + » à mettre en avant
 * @param {(row: number, col: number) => DOMRect|null} deps.cellRect   case grille
 */
export function createTutorial({ addButton, cellRect }) {
  let overlay = null;
  let hand = null;
  let styleEl = null;
  let timers = [];
  let resizeHandler = null;
  let hostActive = false;

  // --- Géométrie -----------------------------------------------------

  const holeRects = () => {
    const plus = vpRect(addButton);
    const a = vpRect(cellRect(TUTORIAL_CELL_A.row, TUTORIAL_CELL_A.col));
    const b = vpRect(cellRect(TUTORIAL_CELL_B.row, TUTORIAL_CELL_B.col));
    return [plus, a, b].filter(Boolean);
  };

  /** Découpe les « trous de lumière » sur le calque sombre. */
  function drawHoles() {
    if (!overlay) return;
    const holes = holeRects().map(rectToHole).join(', ');
    overlay.style.clipPath = holes ? `polygon(${holes})` : 'none';
  }

  // --- Main fantôme ----------------------------------------------------

  function handPos(x, y) {
    hand.style.left = `${x}px`;
    hand.style.top = `${y}px`;
  }

  /** Tap répété sur un point. */
  function handTap(cx, cy) {
    if (!hand || !hostActive) return;
    hand.style.display = '';
    handPos(cx - hand.offsetWidth / 2, cy - hand.offsetHeight / 2);
    hand.style.animation = 'none';
    void hand.offsetWidth; // force reflow
    hand.style.animation = 'tut-hand-tap 1.5s ease-in-out 2';
  }

  /** Glissé d'un point à un autre (keyframes compilées aux vraies coord.). */
  function handSwipe(x0, y0, x1, y1) {
    if (!hand || !hostActive) return;
    hand.style.display = '';
    if (!x0 || !y0) return;
    handPos(x0 - hand.offsetWidth / 2, y0 - hand.offsetHeight / 2);
    const name = `tut-hand-swipe-${uid++}`;
    const dx = Math.round(x1 - x0);
    const dy = Math.round(y1 - y0);
    const css = `@keyframes ${name} {
      0%   { transform: translate(0, 0) rotate(-10deg); opacity: 0; }
      10%  { opacity: 1; }
      42%  { transform: translate(${dx}px, ${dy}px) rotate(3deg); opacity: 1; }
      55%  { transform: translate(${dx}px, ${dy}px) rotate(3deg); opacity: 0; }
      100% { transform: translate(0, 0) rotate(-10deg); opacity: 0; }
    }`;
    styleEl.textContent += css;
    hand.style.animation = `${name} 1.9s ease-in-out 2`;
  }

  /** Boucle illustrative : taper +, puis glisser 2 → 3. */
  function guide() {
    if (!hostActive) return;
    const plus = vpRect(addButton);
    const a = vpRect(cellRect(TUTORIAL_CELL_A.row, TUTORIAL_CELL_A.col));
    const b = vpRect(cellRect(TUTORIAL_CELL_B.row, TUTORIAL_CELL_B.col));
    if (!plus || !a || !b) {
      timers.push(setTimeout(() => guide(), 300)); // layout pas prêt : retente
      return;
    }
    const center = (r) => ({ x: r.l + r.w / 2, y: r.t + r.h / 2 });
    const pb = center(plus);
    const pa = center(a);
    const pc = center(b);
    timers.push(
      setTimeout(() => {
        if (!hostActive) return;
        handTap(pb.x, pb.y);
        timers.push(
          setTimeout(() => {
            if (!hostActive) return;
            handSwipe(pa.x, pa.y, pc.x, pc.y);
            timers.push(setTimeout(() => guide(), 2000));
          }, 1650)
        );
      }, 400)
    );
  }

  // --- Cycle de vie ----------------------------------------------------

  /** Monte le calque + la main, puis positionne les trous. */
  function mount() {
    hostActive = true;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'tutorial-overlay';
    document.body.appendChild(overlay);

    styleEl = document.createElement('style');
    document.head.appendChild(styleEl);

    hand = document.createElement('div');
    hand.className = HAND_CLASS;
    hand.textContent = '👆';
    hand.style.display = 'none';
    document.body.appendChild(hand);

    // Les trous suivent les changements de géométrie (rotation, resize…).
    resizeHandler = debounceRaf(drawHoles);
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);

    drawHoles();
    // Après le premier rendu (polices/layout figés), resynchronise.
    requestAnimationFrame(() => requestAnimationFrame(drawHoles));
  }

  /** Retire tout l'habillage du tutoriel. */
  function hide() {
    hostActive = false;
    timers.forEach((t) => clearTimeout(t));
    timers = [];
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('orientationchange', resizeHandler);
      resizeHandler = null;
    }
    overlay?.remove();
    overlay = null;
    hand?.remove();
    hand = null;
    styleEl?.remove();
    styleEl = null;
  }

  return { mount, guide, hide, drawHoles };
}