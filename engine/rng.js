// Seeded pseudo-random number generator (mulberry32).
//
// Every practice set and every Friday Check is generated from a seed, so the
// same profile + week + day always produces the same problems. That matters for
// two reasons: a family that reloads mid-set does not get a different set, and
// the tests can verify a generator against 1,000 reproducible samples.

/**
 * @param {number} seed 32-bit unsigned integer
 * @returns {() => number} a function returning a float in [0, 1)
 */
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

/** Hash an arbitrary string to a 32-bit seed (FNV-1a). */
export function seedFrom(...parts) {
  const str = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A small helper object so generators read like prose instead of arithmetic on
 * a raw float. All generators take one of these, never Math.random.
 */
export function createRng(seed) {
  const next = mulberry32(typeof seed === 'string' ? seedFrom(seed) : seed);
  return {
    next,
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** A random element of arr. */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** Fisher-Yates, returns a new array. */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /**
     * Pick from `arr` where `weightOf(item)` gives the relative weight.
     * Used by the spiral mixer to over-sample facts a child has missed.
     */
    weightedPick(arr, weightOf) {
      let total = 0;
      for (const item of arr) total += Math.max(0, weightOf(item));
      if (total <= 0) return this.pick(arr);
      let r = next() * total;
      for (const item of arr) {
        r -= Math.max(0, weightOf(item));
        if (r < 0) return item;
      }
      return arr[arr.length - 1];
    },
  };
}
