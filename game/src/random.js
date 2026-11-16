// A small seeded generator (mulberry32): the same seed replays the same game,
// which is what makes the screenshot scenes deterministic and the world testable
// in plain Node with no browser at all.

export function createRandom(seed) {
  let state = seed >>> 0;
  return {
    /** A float in [0, 1). */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** A float in [min, max). */
    range(min, max) {
      return min + this.next() * (max - min);
    },
    /** An integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    /** One element of a non-empty array, uniformly. */
    pick(array) {
      return array[Math.floor(this.next() * array.length)];
    },
  };
}
