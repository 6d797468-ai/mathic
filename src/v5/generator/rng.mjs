/**
 * MATHIC V5 — DETERMINISTIC RNG
 * ============================================================================
 * Générateur de nombres aléatoires déterministe pour la génération de niveaux.
 * Basé sur xoshiro256** (période 2^256 - 1, pas de dépendances).
 * 
 * Propriétés :
 * - Même seed → même séquence
 * - Pas de Math.random()
 * - Pas d'état global
 * - Rapide et de bonne qualité statistique
 */

export function createRng(seed) {
  // Convert seed to 4x64-bit state using splitmix64
  let state = splitmix64State(seed);
  
  return {
    next() {
      const result = xoshiro256starstar(state);
      return result;
    },
    nextInt(max) {
      if (max <= 0) return 0;
      // Rejection sampling pour éviter le biais modulo
      const maxU32 = 0x100000000;
      const threshold = maxU32 - (maxU32 % max);
      let x;
      do {
        x = this.next();
      } while (x >= threshold);
      return x % max;
    },
    nextFloat() {
      return this.next() / 0x100000000;
    },
    shuffle(array) {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.nextInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    // Pour reproduction exacte : retourne l'état interne
    getState() {
      return [...state];
    },
    setState(newState) {
      state = [...newState];
    }
  };
}

function splitmix64State(seed) {
  let z = (seed + 0x9e3779b97f4a7c15) >>> 0;
  const state = new Array(4);
  for (let i = 0; i < 4; i++) {
    z = (z + 0x9e3779b97f4a7c15) >>> 0;
    let t = (z ^ (z >>> 30)) * 0xbf58476d1ce4e5b9;
    t = (t ^ (t >>> 27)) * 0x94d049bb133111eb;
    t = t ^ (t >>> 31);
    state[i] = t >>> 0;
  }
  return state;
}

function xoshiro256starstar(state) {
  const [s0, s1, s2, s3] = state;
  const result = (s0 * 5) >>> 0;
  const t = (s1 << 17) >>> 0;
  state[2] ^= s0;
  state[3] ^= s1;
  state[1] ^= s2;
  state[0] ^= s3;
  state[2] = (state[2] ^ t) >>> 0;
  state[3] = (state[3] >>> 45) | (state[3] << 19);
  return result;
}

/**
 * Crée un RNG à partir d'une seed string/number (déterministe).
 * @param {string|number} seed
 * @returns {object} RNG instance
 */
export function rngFromSeed(seed) {
  let seedNum = typeof seed === "string" ? hashString(seed) : Number(seed);
  if (!Number.isInteger(seedNum) || seedNum < 0) {
    seedNum = Math.abs(Math.floor(seedNum)) || 1;
  }
  return createRng(seedNum);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash) >>> 0;
}