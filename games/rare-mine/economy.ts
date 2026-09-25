/**
 * Rare Mine's numbers: mining pace, strike yields, events and the double-or-burn bet. Pure.
 * All coins are a simulated preview currency, never real RF.
 */
import { rand, rngFrom } from './rng.ts';

/** Seconds between automatic strikes with no combo. */
export const AUTO_INTERVAL = 1.0;
/** Each combo level shortens the auto interval: interval = AUTO_INTERVAL / (1 + COMBO_SPEED × combo). */
export const COMBO_SPEED = 0.125;
export const COMBO_MAX = 12;
/** Seconds without a tap before the combo starts to drain, and the drain rate in levels per second. */
export const COMBO_HOLD = 1.0;
export const COMBO_DRAIN = 6;
/** Taps closer together than this are ignored (keeps auto-clickers from breaking the pace). */
export const TAP_GAP = 0.08;
/** The largest time step one tick may simulate; a background tab cannot mine for hours at once. */
export const MAX_DT = 1.0;

/** Base coins per strike: 1–3. */
export const BASE_MIN = 1;
export const BASE_SPAN = 3;
/** Gold vein: extra 12–30 coins. Gem: extra 60–120 coins. At most one event per strike. */
export const VEIN_P = 0.03;
export const VEIN_MIN = 12;
export const VEIN_SPAN = 19;
export const GEM_P = 0.008;
export const GEM_MIN = 60;
export const GEM_SPAN = 61;
/** Strikes to break one rock face, and the bonus coins it drops. */
export const ROCK_HP = 8;
export const ROCK_BONUS = 5;

/** The bet: 45 % to double, otherwise the whole stake burns. EV = 0.9 × stake. */
export const WIN_CHANCE = 0.45;
export const PAYOUT = 2;
/** After this many wins in a row only Withdraw is offered (keeps numbers far inside safe integers). */
export const MAX_STREAK = 20;
/** Suspense before the result is revealed (seconds); reduced motion uses the short one. */
export const ROLL_TIME = 1.6;
export const ROLL_TIME_REDUCED = 0.3;
/** Pot size at which the Withdraw / Bet choice is highlighted for the first time. */
export const CHOICE_HINT = 150;
/** Ask for a save after this many strikes. */
export const SAVE_EVERY = 20;
/** Upper bound for any stored amount (well inside Number.MAX_SAFE_INTEGER). */
export const COIN_CAP = 1e15;

export type StrikeKind = 'strike' | 'vein' | 'gem';
export interface StrikeRoll {
  readonly base: number;
  readonly kind: StrikeKind;
  readonly extra: number;
  readonly broke: boolean;
  readonly seed: number;
}

/** One pick strike against a rock with `rockHp` left, drawn from the mining stream. */
export function strikeRoll(seed: number, rockHp: number): StrikeRoll {
  const rng = rngFrom(seed);
  const base = BASE_MIN + rng.int(BASE_SPAN);
  const r = rng.next();
  const kind: StrikeKind = r < GEM_P ? 'gem' : r < GEM_P + VEIN_P ? 'vein' : 'strike';
  const extra = kind === 'gem' ? GEM_MIN + rng.int(GEM_SPAN) : kind === 'vein' ? VEIN_MIN + rng.int(VEIN_SPAN) : 0;
  return { base, kind, extra, broke: rockHp <= 1, seed: rng.seed };
}

/** Expected coins per strike, including the rock-break bonus. */
export const EXPECTED_STRIKE = BASE_MIN + (BASE_SPAN - 1) / 2 + VEIN_P * (VEIN_MIN + (VEIN_SPAN - 1) / 2)
  + GEM_P * (GEM_MIN + (GEM_SPAN - 1) / 2) + ROCK_BONUS / ROCK_HP;

/** The bet stream: [win, next seed]. Independent of mining so a bet's odds never depend on how you mined. */
export function betOutcome(seed: number): readonly [boolean, number] {
  const [v, next] = rand(seed);
  return [v < WIN_CHANCE, next];
}
