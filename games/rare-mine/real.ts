/**
 * The pot ledger over real reward accrual. The RF amounts are real (read from the chain); Withdraw only records them
 * and the bet is SIMULATED: nothing here moves, claims or burns any token. Pure: every function returns a new ledger.
 *
 *   pot = max(0, earned − baseline) + bonus
 *   realized + winnings = withdrawn + burned + bonus       (checked on every save load)
 *   staked = winnings + burned
 * so at any real earned value: realized + accrued(earned) + winnings = withdrawn + burned + pot.
 */
import { MAX_STREAK, betOutcome } from './economy.ts';
import { hashString, mix } from './rng.ts';

export interface RealLedger {
  /** Earned RF already accounted for; the pot's real part is what accrued above it. First-ever baseline: 0. */
  readonly baseline: bigint;
  /** Simulated winnings still at risk in the pot (the stakes of the current streak's wins). */
  readonly bonus: bigint;
  readonly streak: number;
  /** Real accrual moved out of the pot (by a withdraw, a loss or a claim on the official site). */
  readonly realized: bigint;
  readonly withdrawn: bigint;
  readonly burned: bigint;
  readonly staked: bigint;
  readonly winnings: bigint;
  readonly betsWon: number;
  readonly betsLost: number;
  readonly bestStreak: number;
  /** Times the real value dropped because the holder claimed on the official site. */
  readonly claims: number;
  readonly betSeed: number;
}
export interface RealBet { readonly ledger: RealLedger; readonly win: boolean; readonly stake: bigint; readonly pot: bigint }

const max = (a: bigint, b: bigint): bigint => a > b ? a : b;

/** A fresh ledger for one NFT; its bet stream is derived from the seed and the NFT, separate from practice mode's. */
export function newLedger(token: string, seed: number): RealLedger {
  return {
    baseline: 0n, bonus: 0n, streak: 0, realized: 0n, withdrawn: 0n, burned: 0n, staked: 0n, winnings: 0n,
    betsWon: 0, betsLost: 0, bestStreak: 0, claims: 0, betSeed: mix(mix(seed >>> 0, hashString(token)), 3),
  };
}

export const accrued = (l: RealLedger, earned: bigint): bigint => max(0n, earned - l.baseline);
export const realPot = (l: RealLedger, earned: bigint): bigint => accrued(l, earned) + l.bonus;
export const canRealBet = (l: RealLedger, earned: bigint): boolean => realPot(l, earned) > 0n && l.streak < MAX_STREAK;

/** Record the pot as withdrawn: the baseline moves up to the current real value (never down) and the streak ends. */
export function realWithdraw(l: RealLedger, earned: bigint): RealLedger {
  const pot = realPot(l, earned);
  if (pot <= 0n) return l;
  return { ...l, realized: l.realized + accrued(l, earned), withdrawn: l.withdrawn + pot, baseline: max(l.baseline, earned), bonus: 0n, streak: 0 };
}

/** Stake the whole pot on the seeded bet stream. A win adds the stake to the bonus (the pot doubles); a loss burns it. */
export function realBet(l: RealLedger, earned: bigint): RealBet | null {
  if (!canRealBet(l, earned)) return null;
  const stake = realPot(l, earned);
  const [win, betSeed] = betOutcome(l.betSeed);
  const staked = l.staked + stake;
  if (win) {
    const streak = l.streak + 1;
    const ledger = { ...l, betSeed, staked, bonus: l.bonus + stake, winnings: l.winnings + stake, streak, betsWon: l.betsWon + 1, bestStreak: Math.max(l.bestStreak, streak) };
    return { ledger, win, stake, pot: stake * 2n };
  }
  const ledger = {
    ...l, betSeed, staked, realized: l.realized + accrued(l, earned), burned: l.burned + stake, baseline: max(l.baseline, earned),
    bonus: 0n, streak: 0, betsLost: l.betsLost + 1,
  };
  return { ledger, win, stake, pot: 0n };
}

/**
 * The real value fell from `last` to `next`: the holder claimed on the official site. The pot as last seen is recorded
 * as withdrawn and the mine restarts from the new value, so the pot is never negative and no stale bonus remains.
 */
export function realClaimed(l: RealLedger, last: bigint, next: bigint): RealLedger {
  if (next >= last) return l;
  return { ...realWithdraw(l, last), bonus: 0n, streak: 0, baseline: next, claims: l.claims + 1 };
}

/** The saved identities (independent of the current real value). */
export function balancedReal(l: RealLedger): boolean {
  return l.realized + l.winnings === l.withdrawn + l.burned + l.bonus && l.staked === l.winnings + l.burned;
}
