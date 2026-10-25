/**
 * A tiny seeded PRNG. Equity is shown on a dashboard; if the same spot gave a
 * different number on every refresh nobody would trust it, so `Math.random()`
 * is off the table and the default seed is a fixed constant.
 */

export const DEFAULT_SEED = 0xc0ffee

/** mulberry32: small, fast, and good enough for sampling — not for security. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A uniform integer in [0, n). */
export function randomInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n)
}
