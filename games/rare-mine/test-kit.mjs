/** Shared fixtures for Rare Mine engine tests (not shipped: index.tsx never imports it). */
import { newGame, tick, tap } from './game.ts';

export const TOKEN = 'generations:7730';
export const GENESIS = 'genesis:597';

/** Advance the engine in fixed 50 ms frames, as the renderer would. */
export function run(s, seconds, frame = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += frame) s = tick(s, frame);
  return s;
}

/** A player tapping `rate` times per second for `seconds` while the mine keeps running. */
export function tapFor(s, seconds, rate, frame = 0.05) {
  const every = 1 / rate;
  let clock = 0, next = 0;
  while (clock < seconds - 1e-9) {
    if (clock >= next - 1e-9) { s = tap(s); next += every; }
    s = tick(s, frame); clock += frame;
  }
  return s;
}

/** A fresh mine with some coins already in the pot. */
export function withPot(seed, pot = 100) {
  const s = newGame(TOKEN, seed);
  return { ...s, pot, stats: { ...s.stats, mined: pot } };
}

/** mined + winnings = withdrawn + burned + pot, the safe equals withdrawals, and every stake either won or burned. */
export function balanced(s) {
  const t = s.stats;
  return t.mined + t.winnings === t.withdrawn + t.burned + s.pot && s.safe === t.withdrawn && t.staked === t.winnings + t.burned;
}
