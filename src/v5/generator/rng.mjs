/**
 * MATHIC V5 — DETERMINISTIC RNG
 * ============================================================================
 * Générateur de nombres aléatoires déterministe pour la génération de niveaux.
 * Utilise un LCG 64-bit avec BigInt pour éviter les problèmes de précision JS.
 */

export function createRng(seed) {
  // État interne 64-bit (BigInt)
  let state = BigInt(seed >= 0 ? seed : (seed % 2n**64n + 2n**64n) % 2n**64n);

  // Constantes LCG 64-bit (valeurs de Numerical Recipes)
  const MULTIPLIER = 6364136223846793005n;  // 0x5DEECE66D * 2^32 + ...
  const INCREMENT = 1442695040888963407n;   // 0xB504F333 * 2^32 + ...
  const MODULUS = 2n ** 64n;

  return {
    next() {
      state = (state * MULTIPLIER + INCREMENT) % (2n ** 64n);
      return Number(state & 0xFFFFFFFFn); // Retourne 32 bits bas
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
    getState() {
      return state.toString();
    },
    setState(newState) {
      state = BigInt(newState);
    }
  };
}

/**
 * Crée un RNG à partir d'une seed string/number (déterministe).
 * @param {string|number} seed
 * @returns {object} RNG instance
 */
export function rngFromSeed(seed) {
  let seedNum;
  if (typeof seed === "string") {
    // Hash simple de la string
    let hash = 0n;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31n + BigInt(seed.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
    }
    seed = Number(hash);
  }
  seed = Number(seed);
  if (!Number.isInteger(seed) || seed < 0) {
    seed = Math.abs(Math.floor(seed)) || 1;
  }
  return createRng(BigInt(seed >>> 0));
}