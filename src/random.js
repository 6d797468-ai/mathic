/**
 * src/random.js — PRNG déterministe (G2)
 *
 * Basé sur le algorithme mulberry32 (seed 32-bit, très compact,
 * bonne qualité statistique pour du gameplay). Permet le replay
 * exact et le cross-platform determinism.
 *
 * API :
 *   createRng(seed) → {
 *     next(),           // float [0, 1)
 *     int(min, max),    // entier [min, max] inclus
 *     pick(arr),
 *     getState(),      // { seed, state }
 *     setState(state),
 *     clone(),
 *   }
 *
 * Trois flux séparés (héritent du même seed de base mais indépendants) :
 *   gameRng     = createRng(seed)           // spawn, coups
 *   cosmeticRng = createRng(seed ^ 0xDEADBEEF)  // animations, Momo fallback
 *   puzzleRng   = createRng(seed ^ 0xCAFEBABE)  // génération puzzle
 *
 * Gate : G2
 */

/**
 * Crée un générateur aléatoire déterministe à partir d'une seed.
 * @param {number|string} seed — nombre entier ou chaîne (hashée en uint32).
 * @returns {Object} Instance PRNG avec next/int/pick/getState/setState/clone.
 */
export function createRng(seed) {
  // Normalise la seed en uint32 (évite les seeds négatives ou > 2^32).
  const initialSeed = toUint32(seed);
  let state = initialSeed;

  const rng = {
    /**
     * Retourne un nombre flottant dans [0, 1[.
     * @returns {number}
     */
    next() {
      // mulberry32
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    /**
     * Entier dans [min, max] inclus.
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },

    /**
     * Élément aléatoire d'un tableau.
     * @param {Array} arr
     * @returns {*}
     */
    pick(arr) {
      if (arr.length === 0) return undefined;
      return arr[Math.floor(this.next() * arr.length)];
    },

    /**
     * Sauvegarde l'état interne (pour replay / persistence).
     * @returns {{ seed: number, state: number }}
     */
    getState() {
      return { seed: initialSeed, state };
    },

    /**
     * Restaure l'état interne (reprise d'un replay).
     * @param {{ seed: number, state: number }} newState
     */
    setState(newState) {
      state = newState.state;
    },

    /**
     * Clone le générateur (indépendant mais même état).
     * @returns {Object}
     */
    clone() {
      const copy = createRng(initialSeed);
      copy.state = state;
      return copy;
    },
  };

  return rng;
}

/**
 * Convertit une seed quelconque en uint32 (stable, hash simple).
 * @param {number|string} seed
 * @returns {number}
 */
export function toUint32(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.abs(Math.floor(seed)) >>> 0;
  }
  // Hash FNV-1a 32-bit sur la chaîne.
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Trois flux PRNG séparés, dérivés d'une seed de base.
 * Chaque flux est indépendant : avancer l'un n'affecte pas les autres.
 * @param {number|string} seed
 * @returns {{ game: Object, cosmetic: Object, puzzle: Object }}
 */
export function createRngStreams(seed) {
  const base = toUint32(seed);
  return {
    game: createRng(base),
    cosmetic: createRng(base ^ 0xDEADBEEF),
    puzzle: createRng(base ^ 0xCAFEBABE),
  };
}