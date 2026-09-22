/**
 * input.js — Capture des entrées joueur
 *
 * Traduit swipe tactile et flèches clavier en une seule API :
 * onDirection(callback) où callback reçoit 'up' | 'down' | 'left' | 'right'.
 *
 * Le swipe est détecté au relâchement (touchend) : seuil minimal de
 * distance, et l'axe dominant (horizontal vs vertical) tranche la direction.
 */

const SWIPE_MIN_PX = 24; // sous ce seuil, on considère un simple tap

/**
 * Détecte la direction d'un swipe à partir des points départ → arrivée.
 * Exporté pour tests éventuels.
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} end
 * @returns {'up'|'down'|'left'|'right'|null}
 */
export function detectSwipe(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < SWIPE_MIN_PX && Math.abs(dy) < SWIPE_MIN_PX) return null;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

/**
 * Enregistre les écouteurs d'événements. Retourne une fonction de nettoyage.
 * @param {(dir: 'up'|'down'|'left'|'right') => void} onDirection
 * @returns {() => void} fonction pour détacher tous les écouteurs
 */
export function onDirection(onDirection) {
  const KEY_MAP = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };

  const onKeyDown = (e) => {
    const dir = KEY_MAP[e.key];
    if (dir) {
      e.preventDefault();
      onDirection(dir);
    }
  };

  let touchStart = null;

  const onTouchStart = (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dir = detectSwipe(touchStart, { x: t.clientX, y: t.clientY });
    touchStart = null;
    if (dir) onDirection(dir);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchend', onTouchEnd);
  };
}
