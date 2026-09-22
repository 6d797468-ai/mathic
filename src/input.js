/**
 * input.js — Capture des entrées joueur (K3 — Équipe Kali)
 *
 * Traduit swipe tactile et flèches clavier en **GameCommand purs** (POJO).
 * Règle de la brique : AUCUN calcul mathématique ici — input ne fait que
 * nommer l'intention du joueur ; la session/adapter décide de la validité.
 *
 * API :
 *   onCommand(handler)  → handler reçoit { type:'MOVE', dir }
 *   onDirection(cb)     → compat V3, équivalent à onCommand(c => cb(c.dir))
 *
 * La fenêtre est injectable (createInputSource(target)) pour tester sous Node
 * sans DOM réel — même modèle que la sonde G0.5 et les tests K1.
 */

const SWIPE_MIN_PX = 24; // sous ce seuil, on considère un simple tap

/**
 * Détecte la direction d'un swipe à partir des points départ → arrivée.
 * Exporté pour tests.
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

/**
 * Crée la source d'entrée sur une cible DOM injectable (window par défaut).
 * @param {{addEventListener: Function, removeEventListener: Function}} [target]
 */
export function createInputSource(target = typeof window !== 'undefined' ? window : undefined) {
  if (!target) {
    // Environnement sans DOM (tests Node) : source factice pilotable.
    return {
      onCommand(handler) {
        const fire = (dir) => handler({ type: 'MOVE', dir, op: null });
        return { fire, detach() {} };
      },
      onDirection(cb) {
        const fire = (dir) => cb(dir);
        return { fire, detach() {} };
      },
    };
  }

  return {
    /**
     * @param {(cmd: {type:'MOVE', dir:'up'|'down'|'left'|'right', op:string|null}) => void} handler
     * @returns {{fire: Function, detach: () => void}}
     */
    onCommand(handler) {
      const onKeyDown = (e) => {
        const dir = KEY_MAP[e.key];
        if (dir) {
          e.preventDefault();
          handler({ type: 'MOVE', dir, op: null });
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
        if (dir) handler({ type: 'MOVE', dir, op: null });
      };

      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('touchstart', onTouchStart, { passive: true });
      target.addEventListener('touchend', onTouchEnd, { passive: true });

      return {
        fire: (dir) => handler({ type: 'MOVE', dir, op: null }),
        detach() {
          target.removeEventListener('keydown', onKeyDown);
          target.removeEventListener('touchstart', onTouchStart);
          target.removeEventListener('touchend', onTouchEnd);
        },
      };
    },

    /** Compat V3 — ancien onDirection(cb). */
    onDirection(cb) {
      return this.onCommand((cmd) => cb(cmd.dir));
    },
  };
}

/** API par défaut (window réel). Retourne le handle de la source. */
export function onCommand(handler) {
  return createInputSource().onCommand(handler);
}

/** API historique conservée : onDirection(cb). */
export function onDirection(cb) {
  return createInputSource().onCommand((cmd) => cb(cmd.dir));
}
