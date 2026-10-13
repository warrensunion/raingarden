/**
 * Seeded PRNG for everything in the designer that must be repeatable: the same
 * yard and seed give the same plant layout and optimizer run, so a shared plan
 * can be reproduced and tests can pin results. mulberry32 is tiny, fast and
 * good enough for layout jitter (not for cryptography). Pure module.
 */

/** @param {number} seed @returns {() => number} uniform in [0, 1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
