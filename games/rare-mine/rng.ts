/** Seeded randomness. `rand` is a pure mulberry32 step; `rngFrom` wraps it for one engine call. */
export function rand(seed: number): readonly [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** FNV-1a 32-bit hash for deterministic derivation from token ids. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Order-sensitive mix of two uint32 values (separate mining and bet streams from one seed). */
export function mix(a: number, b: number): number {
  let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13) ^ (b >>> 0), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Rng {
  next(): number;
  /** 0 … n-1 */
  int(n: number): number;
  readonly seed: number;
}

/** A generator local to one pure engine call: draw values, then store `seed` back into state. */
export function rngFrom(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => { const [v, s] = rand(state); state = s; return v; };
  return { next, int: (n: number) => Math.floor(next() * n), get seed() { return state; } };
}
