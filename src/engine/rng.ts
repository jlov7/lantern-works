// Keyed, order-independent randomness. A draw depends only on its key, never on
// how many other draws happened before it, so opening a panel or adding a job
// cannot shift an unrelated outcome.

/** cyrb53: fast 53-bit string hash. Public domain (bryc). */
export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Uniform integer in [0, n) for an explicit key. */
export function drawInt(n: number, ...key: (string | number)[]): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`drawInt range must be a positive integer, got ${n}`);
  return hash53(key.join('|')) % n;
}

/** True with probability bp / 10000. */
export function drawBp(bp: number, ...key: (string | number)[]): boolean {
  return drawInt(10000, ...key) < bp;
}
