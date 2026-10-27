// Seeded pseudo-random numbers for gameplay decisions.
//
// Gameplay code must draw randomness from a generator created here so that a
// seed reproduces an identical sequence. Cosmetic effects use their own
// source and never touch the gameplay generator.

/** Normalize any number to an unsigned 32-bit seed. */
export function toSeed(value) {
  return Number(value) >>> 0;
}

/** An unpredictable seed for normal play. */
export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

/**
 * Create a mulberry32 generator.
 * @returns {{ seed: number, next(): number, range(min: number, max: number): number, int(n: number): number }}
 */
export function createRandom(seed = randomSeed()) {
  let s = toSeed(seed);
  const initial = s;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: initial,
    next,
    /** Uniform float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Uniform integer in [0, n). */
    int: (n) => Math.floor(next() * n),
  };
}
