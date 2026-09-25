/**
 * Real mode glue: keeps the pot ledger, the shown (interpolated) earned value and the coins due, and turns them into
 * shell strikes and a mirrored pot every frame. The ledger math is pure (real.ts, feed.ts); this hook only holds refs.
 */
import { useEffect, useRef } from 'react';
import { cancelBet, realBank, realRoll, realStrike, syncReal, type MineState } from './game.ts';
import { coinUnit, coinsCrossed, ease, project, type Reader } from './feed.ts';
import { realBet, realClaimed, realPot, realWithdraw, type RealBet, type RealLedger } from './real.ts';

/** Coin unit used for the pile before the rate is known (0.01 RF). */
const FALLBACK_UNIT = 10n ** 16n;
/** Coins waiting to pop are capped so a catch-up after a pause does not flood the mine. */
const MAX_DUE = 12;
/** The Friend strikes at most this often for real coins, carrying up to 3 coins a strike. */
const STRIKE_GAP = 0.3;
const COINS_PER_STRIKE = 3;

export interface RollingBet extends RealBet { readonly before: RealLedger }
export interface RealMine {
  readonly ledger: { current: RealLedger | null };
  readonly shown: { current: bigint | null };
  readonly rolling: { current: RollingBet | null };
  begin(ledger: RealLedger): void;
  /** One frame: interpolate, pop due coins as strikes and mirror the pot in coin units. */
  step(s: MineState, now: number, dt: number): MineState;
  withdraw(s: MineState): { readonly state: MineState; readonly pot: bigint } | null;
  confirm(s: MineState, suspense: number): MineState;
  unit(): bigint | null;
  toCoins(wei: bigint): number;
}

export function useRealMine(reader: Reader, onClaim: () => void): RealMine {
  const ledger = useRef<RealLedger | null>(null), shown = useRef<bigint | null>(null), rolling = useRef<RollingBet | null>(null);
  const due = useRef(0), lastStrike = useRef(-1), reset = useRef(false), checkLoad = useRef(false);
  const readerRef = useRef(reader); readerRef.current = reader;
  const claimRef = useRef(onClaim); claimRef.current = onClaim;

  // A snapshot lower than the one before: the holder claimed on the official site.
  useEffect(() => {
    const e = reader.event;
    if (!e || e.kind !== 'drop') return;
    reset.current = true;
    const l = ledger.current;
    if (!l) return;
    ledger.current = realClaimed(l, shown.current ?? e.prev ?? e.next, e.next);
    claimRef.current();
  }, [reader.event?.id]);

  const unit = () => coinUnit(readerRef.current.feed.rate);
  const toCoins = (wei: bigint): number => Number(wei * 1000n / (unit() ?? FALLBACK_UNIT)) / 1000;

  /** A saved baseline far above the current value means a claim happened while away (1 % margin for interpolation). */
  function checkSaved(l: RealLedger, value: bigint): boolean {
    if (value * 100n >= l.baseline * 99n) return false;
    reset.current = true; ledger.current = realClaimed(l, l.baseline, value);
    return true;
  }

  return {
    ledger, shown, rolling, unit, toCoins,
    begin(l) { ledger.current = l; shown.current = null; rolling.current = null; due.current = 0; checkLoad.current = true; },
    step(s, now, dt) {
      const l0 = ledger.current, r = readerRef.current;
      const target = project(r.feed, Date.now());
      if (!l0 || target === null || !r.last) return s;
      const claimed = checkLoad.current && checkSaved(l0, r.last.rf);
      checkLoad.current = false;
      if (claimed) claimRef.current();
      const l = ledger.current ?? l0;
      const prev = shown.current, next = ease(prev, target, dt, reset.current);
      reset.current = false; shown.current = next;
      if (prev !== null) due.current = Math.min(MAX_DUE, due.current + coinsCrossed(prev, next, unit()));
      let out = s;
      if (out.phase === 'mine' && due.current >= 1 && now - lastStrike.current >= STRIKE_GAP) {
        const n = Math.min(COINS_PER_STRIKE, Math.floor(due.current));
        out = realStrike(out, n); due.current -= n; lastStrike.current = now;
      }
      return out.phase === 'roll' ? out : syncReal(out, toCoins(realPot(l, next)), toCoins(l.withdrawn), l.streak);
    },
    withdraw(s) {
      const l = ledger.current, e = shown.current;
      if (!l || e === null || s.phase === 'roll') return null;
      const next = realWithdraw(l, e);
      if (next === l) return null;
      const pot = realPot(l, e);
      ledger.current = next;
      return { state: realBank(s, toCoins(pot)), pot };
    },
    confirm(s, suspense) {
      const l = ledger.current, e = shown.current;
      const bet = l && e !== null && s.phase === 'confirm' ? realBet(l, e) : null;
      if (!l || !bet) return cancelBet(s);
      rolling.current = { ...bet, before: l };
      ledger.current = bet.ledger;
      return realRoll(s, bet.win, toCoins(bet.stake), suspense);
    },
  };
}
