/**
 * Rare Mine's state machine: automatic and tapped mining, the combo meter, and the Withdraw / Bet choice.
 * Pure and deterministic: every function returns a new state and never mutates its input.
 */
import {
  AUTO_INTERVAL, COMBO_DRAIN, COMBO_HOLD, COMBO_MAX, COMBO_SPEED, MAX_DT, MAX_STREAK, PAYOUT, ROCK_BONUS, ROCK_HP,
  ROLL_TIME, SAVE_EVERY, TAP_GAP, betOutcome, strikeRoll,
} from './economy.ts';
import { hashString, mix } from './rng.ts';

export { betOutcome };

export type Phase = 'mine' | 'confirm' | 'roll';
export type FxKind = 'strike' | 'vein' | 'gem' | 'break' | 'withdraw' | 'roll' | 'win' | 'burn';

/** Lifetime totals. mined + winnings = withdrawn + burned + pot, and staked = winnings + burned. */
export interface Stats {
  readonly mined: number;
  readonly withdrawn: number;
  readonly burned: number;
  readonly staked: number;
  readonly winnings: number;
  readonly betsWon: number;
  readonly betsLost: number;
  readonly bestStreak: number;
  readonly strikes: number;
  readonly veins: number;
  readonly gems: number;
  readonly rocks: number;
}
/** A presentation cue: the renderer and sound spawn coins, sparks and clinks for ids it has not seen. */
export interface Fx { readonly id: number; readonly kind: FxKind; readonly coins: number; readonly tap: boolean }
/** A confirmed bet whose outcome is already fixed; `left` seconds of suspense remain before the reveal. */
export interface Roll { readonly win: boolean; readonly stake: number; readonly left: number; readonly total: number }
export interface Outcome { readonly id: number; readonly win: boolean; readonly stake: number; readonly pot: number; readonly streak: number }

export interface MineState {
  readonly token: string;
  readonly mineSeed: number;
  readonly betSeed: number;
  /** Coins mined (or won) and still at risk. */
  readonly pot: number;
  /** Wins in a row on the current pot; the pot has doubled this many times. */
  readonly streak: number;
  /** Withdrawn coins: safe forever. */
  readonly safe: number;
  readonly stats: Stats;
  readonly depth: number;
  readonly rockHp: number;
  /** Combo level (fractional while draining). */
  readonly combo: number;
  /** Seconds since the last accepted tap. */
  readonly sinceTap: number;
  /** Seconds until the next automatic strike. */
  readonly strikeIn: number;
  readonly phase: Phase;
  readonly roll: Roll | null;
  readonly last: Outcome | null;
  readonly fx: readonly Fx[];
  readonly fxId: number;
  readonly sound: boolean;
  readonly saveTick: number;
  readonly sinceSave: number;
}

const TOKEN = /^(generations|genesis):([1-9][0-9]{0,77})$/;
const FX_KEEP = 24;
const EPS = 1e-6;
const IDLE = 99;

export function isToken(token: unknown): token is string { return typeof token === 'string' && TOKEN.test(token); }

export const EMPTY_STATS: Stats = Object.freeze({
  mined: 0, withdrawn: 0, burned: 0, staked: 0, winnings: 0, betsWon: 0, betsLost: 0, bestStreak: 0, strikes: 0, veins: 0, gems: 0, rocks: 0,
});

/** Mining and bet streams derived from one seed and the NFT, so two Friends never share a mine. */
export function newGame(token: string, seed: number, sound = true): MineState {
  if (!isToken(token)) throw new Error('Invalid Friend token');
  const base = mix(seed >>> 0, hashString(token));
  return rested({
    token, mineSeed: mix(base, 1), betSeed: mix(base, 2), pot: 0, streak: 0, safe: 0, stats: EMPTY_STATS,
    depth: 0, rockHp: ROCK_HP, combo: 0, sinceTap: IDLE, strikeIn: AUTO_INTERVAL, phase: 'mine', roll: null, last: null,
    fx: [], fxId: 0, sound, saveTick: 0, sinceSave: 0,
  });
}

/** Timers as after a fresh start or a reload: no combo, a full interval to the next strike, no effects queued. */
export function rested(s: MineState): MineState {
  return { ...s, combo: 0, sinceTap: IDLE, strikeIn: AUTO_INTERVAL, phase: 'mine', roll: null, fx: [], sinceSave: 0 };
}

export const comboLevel = (s: MineState): number => Math.max(0, Math.ceil(s.combo - EPS));
export const strikeInterval = (s: MineState): number => AUTO_INTERVAL / (1 + COMBO_SPEED * comboLevel(s));
export const multiplier = (streak: number): number => PAYOUT ** streak;

function pushFx(s: MineState, kind: FxKind, coins: number, tap = false): MineState {
  const id = s.fxId + 1;
  return { ...s, fxId: id, fx: [...s.fx, { id, kind, coins, tap }].slice(-FX_KEEP) };
}
const askSave = (s: MineState): MineState => ({ ...s, saveTick: s.saveTick + 1, sinceSave: 0 });

/** One pick strike: base coins, maybe a vein or a gem, and a bonus when the rock breaks. */
function strike(s: MineState, tap: boolean): MineState {
  const r = strikeRoll(s.mineSeed, s.rockHp);
  const bonus = r.broke ? ROCK_BONUS : 0, coins = r.base + r.extra + bonus;
  const t = s.stats;
  let next: MineState = {
    ...s, mineSeed: r.seed, pot: s.pot + coins, rockHp: r.broke ? ROCK_HP : s.rockHp - 1, depth: s.depth + (r.broke ? 1 : 0),
    stats: { ...t, mined: t.mined + coins, strikes: t.strikes + 1, veins: t.veins + (r.kind === 'vein' ? 1 : 0),
      gems: t.gems + (r.kind === 'gem' ? 1 : 0), rocks: t.rocks + (r.broke ? 1 : 0) },
    sinceSave: s.sinceSave + 1,
  };
  next = pushFx(next, r.kind, r.base + r.extra, tap);
  if (r.broke) next = pushFx(next, 'break', bonus, tap);
  return next.sinceSave >= SAVE_EVERY ? askSave(next) : next;
}

/** Combo holds for COMBO_HOLD seconds after a tap, then drains. */
function drainCombo(s: MineState, dt: number): MineState {
  const sinceTap = Math.min(IDLE, s.sinceTap + dt);
  const draining = Math.max(0, sinceTap - Math.max(COMBO_HOLD, s.sinceTap));
  return { ...s, sinceTap, combo: Math.max(0, s.combo - draining * COMBO_DRAIN) };
}

/** Automatic strikes due within `dt` seconds. */
function autoMine(s: MineState, dt: number): MineState {
  let next: MineState = { ...s, strikeIn: s.strikeIn - dt };
  while (next.strikeIn <= EPS) next = { ...strike(next, false), strikeIn: next.strikeIn + strikeInterval(next) };
  return next;
}

/** Advance time. Mining pauses while the odds are on screen and during a bet's suspense. */
export function tick(s: MineState, dt: number): MineState {
  const step = Number.isFinite(dt) ? Math.min(MAX_DT, Math.max(0, dt)) : 0;
  if (step === 0) return s;
  if (s.phase === 'roll' && s.roll) {
    const left = s.roll.left - step;
    return left <= EPS ? settle(s) : { ...s, roll: { ...s.roll, left } };
  }
  if (s.phase === 'confirm') return s;
  return autoMine(drainCombo(s, step), step);
}

/** Tap the rock: an extra strike and one more combo level. During the suspense a tap reveals the result. */
export function tap(s: MineState): MineState {
  if (s.phase === 'roll') return settle(s);
  if (s.phase !== 'mine' || s.sinceTap < TAP_GAP - EPS) return s;
  return strike({ ...s, sinceTap: 0, combo: Math.min(COMBO_MAX, comboLevel(s) + 1) }, true);
}

/** Move the whole pot to the safe balance. Always available except while a staked pot is rolling. */
export function withdraw(s: MineState): MineState {
  if (s.phase === 'roll' || s.pot <= 0) return s.phase === 'confirm' ? { ...s, phase: 'mine' } : s;
  const t = s.stats;
  const next: MineState = { ...s, phase: 'mine', safe: s.safe + s.pot, pot: 0, streak: 0, stats: { ...t, withdrawn: t.withdrawn + s.pot } };
  return askSave(pushFx(next, 'withdraw', s.pot));
}

export const canBet = (s: MineState): boolean => s.phase === 'mine' && s.pot > 0 && s.streak < MAX_STREAK;

/** Show the odds before anything is staked. */
export function askBet(s: MineState): MineState { return canBet(s) ? { ...s, phase: 'confirm' } : s; }
export function cancelBet(s: MineState): MineState { return s.phase === 'confirm' ? { ...s, phase: 'mine' } : s; }

/** Stake the whole pot. The outcome is drawn now (and saved settled); `suspense` seconds only delay the reveal. */
export function confirmBet(s: MineState, suspense = ROLL_TIME): MineState {
  if (s.phase !== 'confirm' || s.pot <= 0) return s;
  const [win, betSeed] = betOutcome(s.betSeed);
  const total = Math.max(0, suspense);
  const next = pushFx({ ...s, betSeed, phase: 'roll', roll: { win, stake: s.pot, left: total, total } }, 'roll', s.pot);
  return askSave(next);
}

/** Reveal a rolling bet at once. */
export function skipRoll(s: MineState): MineState { return s.phase === 'roll' ? settle(s) : s; }

/** Apply a rolling bet: a win doubles the pot and extends the streak, a loss burns the whole stake. */
export function settle(s: MineState): MineState {
  if (s.phase !== 'roll' || !s.roll) return s;
  const { win, stake } = s.roll, t = s.stats;
  const pot = win ? stake * PAYOUT : 0, streak = win ? s.streak + 1 : 0;
  const stats: Stats = {
    ...t, staked: t.staked + stake, winnings: t.winnings + (win ? stake * (PAYOUT - 1) : 0), burned: t.burned + (win ? 0 : stake),
    betsWon: t.betsWon + (win ? 1 : 0), betsLost: t.betsLost + (win ? 0 : 1), bestStreak: Math.max(t.bestStreak, streak),
  };
  const next: MineState = { ...s, phase: 'mine', roll: null, pot: s.pot - stake + pot, streak, stats };
  const done = pushFx(next, win ? 'win' : 'burn', win ? stake * (PAYOUT - 1) : stake);
  return { ...done, last: { id: done.fxId, win, stake, pot: done.pot, streak } };
}

export function setSound(s: MineState, on: boolean): MineState { return s.sound === on ? s : askSave({ ...s, sound: on }); }
