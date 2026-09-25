/**
 * The bet's pachinko-style presentation plan: reach tier, near-miss tease, reel stops and the timed effect/sound cues
 * for the suspense, the win celebration and the burn. Pure and deterministic from the bet seed.
 *
 * Cosmetic only. The outcome is an INPUT here (it is fixed by the engine before the reels spin); nothing in this
 * module can draw, change or delay a result. Like a pachinko 信頼度, a hotter tier is more common before a win, but the
 * 45 % odds shown in the dialog never change.
 */
import { mix, rand } from './rng.ts';

/** Reel symbols: 0 coin, 1 gem, 2 the player's Friend. */
export const SYMBOLS = 3;
export type ReachTier = 0 | 1 | 2;
/** Win celebration tiers by streak: 0 大当たり (×2), 1 連チャン (×4), 2 確変突入 (×8), 3 FEVER (×16 and up). */
export type WinTier = 0 | 1 | 2 | 3;

export interface ReachPlan {
  readonly seed: number;
  readonly win: boolean;
  /** 0 リーチ, 1 激アツ, 2 超激アツ. */
  readonly tier: ReachTier;
  /** The last reel hangs on a near miss before it resolves. */
  readonly tease: boolean;
  /** The symbol the first two reels stop on. */
  readonly match: number;
  readonly final: readonly [number, number, number];
  /** Seconds of suspense with full motion. */
  readonly duration: number;
}

export const REACH_REDUCED = 0.3;
export const REACH_BASE = 2.6;
export const TIER_EXTRA = 0.5;
export const TEASE_HANG = 0.35;
/** Seconds when reels 1 and 2 stop, when 「リーチ！」 is called, and when the tier escalates. */
export const STOPS = [0.6, 1.05] as const;
export const REACH_AT = 1.1;
export const HOT_AT = 1.7;
export const SUPER_AT = 2.3;
/** Reel speed (symbols per second) and the slow-down windows for the first two reels and the last one. */
export const REEL_SPEED = 14;
const STOP_WINDOW = 0.28;
const LAST_WINDOW = 0.95;
const LAST_HANG = 0.12;
const TEASE_P = 0.35;
/** Tier chances [リーチ, 激アツ] (the rest is 超激アツ), given the already-fixed outcome. */
const WIN_TIERS = [0.5, 0.35] as const;
const LOSE_TIERS = [0.82, 0.15] as const;
const SALT = 0x5eac4;

/** The presentation plan for one bet. `win` must be the engine's outcome for this seed; it is only mirrored. */
export function reachPlan(seed: number, win: boolean): ReachPlan {
  const [a, s1] = rand(mix(seed >>> 0, SALT));
  const [b, s2] = rand(s1);
  const [c] = rand(s2);
  const p = win ? WIN_TIERS : LOSE_TIERS;
  const tier: ReachTier = a < p[0] ? 0 : a < p[0] + p[1] ? 1 : 2;
  const tease = b < TEASE_P;
  const match = Math.min(SYMBOLS - 1, Math.floor(c * SYMBOLS));
  const final = [match, match, win ? match : (match + 1) % SYMBOLS] as const;
  const duration = REACH_BASE + TIER_EXTRA * tier + (tease ? TEASE_HANG : 0);
  return { seed: seed >>> 0, win, tier, tease, match, final, duration: Math.round(duration * 1000) / 1000 };
}

/** Seconds to pass to the engine as the suspense; reduced motion always gets the short static reveal. */
export const suspenseFor = (plan: ReachPlan, reduced: boolean): number => reduced ? REACH_REDUCED : plan.duration;

export const winTier = (streak: number): WinTier => streak >= 4 ? 3 : streak >= 3 ? 2 : streak >= 2 ? 1 : 0;

export type ReachStage = 'spin' | 'reach' | 'hot' | 'super' | 'tease' | 'static';
export function reachStage(plan: ReachPlan, t: number, reduced: boolean): ReachStage {
  if (reduced) return 'static';
  if (plan.tease && t >= plan.duration - TEASE_HANG) return 'tease';
  if (plan.tier === 2 && t >= SUPER_AT) return 'super';
  if (plan.tier >= 1 && t >= HOT_AT) return 'hot';
  return t >= REACH_AT ? 'reach' : 'spin';
}

/** Where a reel is (in symbol units) `t` seconds into the suspense. round(position) mod SYMBOLS is the symbol shown. */
export function reelPosition(plan: ReachPlan, reel: number, t: number): number {
  const target = plan.final[reel] ?? 0;
  if (reel < 2) return approach(target, STOPS[reel] ?? 0, STOP_WINDOW, t) + settleBounce(t - (STOPS[reel] ?? 0));
  const end = plan.duration, hang = plan.tease ? TEASE_HANG : LAST_HANG;
  // Where the slow crawl ends: on the match (a lose tease), just short of it, or already home (a plain win).
  const crawl = plan.win ? (plan.tease ? target - 0.42 : target) : (plan.tease ? target - 1 : target - 1.45);
  if (t < end - hang) return approach(crawl, end - hang, LAST_WINDOW, t);
  if (t >= end) return target;
  const u = (t - (end - hang)) / hang;
  // Hold most of the hang, then bump into place (win) or slide off past the match with a clunk (lose).
  const k = u < 0.6 ? 0 : easeOut((u - 0.6) / 0.4);
  return crawl + (target - crawl) * k;
}

const easeOut = (u: number): number => 1 - (1 - u) ** 3;
/** Constant speed, then a quadratic slow-down over `window` seconds that lands exactly on `at` at time `stop`. */
function approach(at: number, stop: number, window: number, t: number): number {
  const lead = REEL_SPEED * window / 2;
  if (t >= stop) return at;
  if (t >= stop - window) { const u = (t - (stop - window)) / window; return at - lead * (1 - u) ** 2; }
  return at - lead - REEL_SPEED * (stop - window - t);
}
/** A small overshoot after a reel stops (0 at the moment of the stop, gone after ~0.3 s). */
function settleBounce(dt: number): number {
  if (dt <= 0 || dt > 0.3) return 0;
  return 0.14 * Math.sin(dt * 26) * Math.exp(-dt * 12);
}

/** Effect and sound cues on a timeline. `n` carries a reel index, a step or an intensity. */
export type FxCueKind =
  | 'spin' | 'stop' | 'reach' | 'siren' | 'beat' | 'hot' | 'tease'
  | 'lock' | 'bass' | 'zap' | 'fanfare' | 'chimes' | 'jara' | 'fever'
  | 'clunk' | 'boom' | 'whoosh' | 'wah' | 'clatter' | 'crackle';
export interface FxCue { readonly t: number; readonly k: FxCueKind; readonly n: number }
export const FX_CUE_KINDS: readonly FxCueKind[] = [
  'spin', 'stop', 'reach', 'siren', 'beat', 'hot', 'tease', 'lock', 'bass', 'zap', 'fanfare', 'chimes', 'jara', 'fever',
  'clunk', 'boom', 'whoosh', 'wah', 'clatter', 'crackle',
];

const r3 = (t: number): number => Math.round(t * 1000) / 1000;
const sorted = (cues: FxCue[]): readonly FxCue[] => cues.map(q => ({ ...q, t: r3(q.t) })).sort((a, b) => a.t - b.t);

/** The suspense: spin, two reel stops, the リーチ call, a rising siren, an accelerating heartbeat, tier-ups and the tease. */
export function reachTimeline(plan: ReachPlan, reduced: boolean): readonly FxCue[] {
  if (reduced) return [{ t: 0, k: 'reach', n: 0 }];
  const end = plan.duration, cues: FxCue[] = [{ t: 0, k: 'spin', n: 0 }, { t: STOPS[0], k: 'stop', n: 0 }, { t: STOPS[1], k: 'stop', n: 1 }, { t: REACH_AT, k: 'reach', n: plan.tier }];
  for (let t = REACH_AT, i = 0; t < end - 0.3; t += 0.55, i++) cues.push({ t, k: 'siren', n: i });
  for (let t = REACH_AT + 0.15; t < end - 0.1;) {
    const k = Math.min(1, (t - REACH_AT) / Math.max(0.1, end - REACH_AT));
    cues.push({ t, k: 'beat', n: Math.round(k * 10) });
    t += 0.42 - 0.27 * k;
  }
  if (plan.tier >= 1) cues.push({ t: HOT_AT, k: 'hot', n: 1 });
  if (plan.tier === 2) cues.push({ t: SUPER_AT, k: 'hot', n: 2 });
  if (plan.tease) cues.push({ t: end - TEASE_HANG, k: 'tease', n: plan.win ? 1 : 0 });
  return sorted(cues);
}

/** Seconds the win celebration and the burn stay on screen. */
export const WIN_TIME: readonly number[] = [3.0, 3.3, 3.9, 4.5];
export const LOSE_TIME = 2.2;
export const REDUCED_TIME = 1.8;
/** When the flash hits and the banner lands after the reels lock; when the flames start after the beat of silence. */
export const WIN_FLASH_AT = 0.12;
export const WIN_PARTY_AT = 0.3;
export const LOSE_BEAT = 0.35;

export const revealTime = (win: boolean, tier: WinTier, reduced: boolean): number =>
  reduced ? REDUCED_TIME : win ? WIN_TIME[tier] ?? WIN_TIME[0] : LOSE_TIME;

/** 大当たり: lock + bass hit, a flash zap, a three-phrase fanfare, a chime cascade, ジャラジャラ, and fever bars from 確変 up. */
export function winTimeline(tier: WinTier, reduced: boolean): readonly FxCue[] {
  const end = revealTime(true, tier, reduced), pour = reduced ? 1.0 : 2.4;
  const cues: FxCue[] = [{ t: 0, k: 'lock', n: 0 }, { t: 0, k: 'bass', n: tier }, { t: WIN_FLASH_AT, k: 'zap', n: 0 },
    { t: 0.2, k: 'fanfare', n: tier * 10 }, { t: 0.62, k: 'fanfare', n: tier * 10 + 1 }, { t: 1.04, k: 'fanfare', n: tier * 10 + 2 }, { t: WIN_PARTY_AT, k: 'chimes', n: 0 }];
  for (let t = WIN_PARTY_AT; t < WIN_PARTY_AT + pour; t += 0.09) cues.push({ t, k: 'jara', n: Math.max(1, Math.round(3 - 2 * (t - WIN_PARTY_AT) / pour)) });
  if (tier >= 1) cues.push({ t: 1.5, k: 'chimes', n: 1 });
  if (tier >= 2 && !reduced) for (let t = 1.5, i = 0; t < end - 0.3; t += 0.48, i++) cues.push({ t, k: 'fever', n: i + (tier - 2) * 2 });
  return sorted(cues.filter(q => q.t < end));
}

/** The burn: the reel clunks off, a beat of silence, then boom, whoosh, the wah-wah, coin clatter and crackling embers. */
export function loseTimeline(reduced: boolean): readonly FxCue[] {
  const end = revealTime(false, 0, reduced);
  const cues: FxCue[] = [{ t: 0, k: 'clunk', n: 0 }, { t: LOSE_BEAT, k: 'boom', n: 0 }, { t: LOSE_BEAT, k: 'whoosh', n: 0 },
    { t: LOSE_BEAT + 0.1, k: 'wah', n: 0 }, { t: LOSE_BEAT + 0.15, k: 'clatter', n: 0 }];
  for (let t = LOSE_BEAT + 0.05, i = 0; t < end - 0.3; t += 0.12, i++) cues.push({ t, k: 'crackle', n: Math.max(1, 3 - (i >> 2)) });
  return sorted(cues.filter(q => q.t < end));
}

/** Cues whose time falls in (from, to]. Start a timeline with `from` below 0 so its t = 0 cues fire. */
export function cuesBetween(timeline: readonly FxCue[], from: number, to: number): readonly FxCue[] {
  return to <= from ? [] : timeline.filter(q => q.t > from && q.t <= to);
}
