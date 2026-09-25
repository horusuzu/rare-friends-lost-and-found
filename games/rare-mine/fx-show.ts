/**
 * The bet show: follows the engine's roll and result and turns them into effect frames and timed sound cues.
 * Presentation only. The reach runs on the engine's own suspense clock (it freezes with the game on pause); the win
 * and burn celebrations run on a clock the caller advances only while the game is active.
 */
import type { MineState } from './game.ts';
import {
  LOSE_BEAT, REACH_REDUCED, WIN_PARTY_AT, cuesBetween, loseTimeline, reachPlan, reachStage, reachTimeline, revealTime, winTier, winTimeline,
  type FxCue, type ReachPlan, type WinTier,
} from './reach.ts';

export type FxKind = 'reach' | 'win' | 'fever' | 'lose';
export type RevealStage = 'lock' | 'party' | 'clunk' | 'burn';
export interface FxFrame {
  /** One id per bet (keys the overlays). */
  readonly id: number;
  readonly kind: FxKind;
  readonly t: number;
  readonly duration: number;
  readonly plan: ReachPlan;
  readonly stage: string;
  readonly winTier: WinTier;
  readonly streak: number;
  readonly reduced: boolean;
}
export interface ShowStep { readonly frame: FxFrame | null; readonly cues: readonly FxCue[] }
export interface Show {
  /** Forget any show and remember the current result, so a loaded save never replays a reveal. */
  reset(s: MineState | null): void;
  /** A bet was confirmed: start the reach with this plan. */
  begin(plan: ReachPlan, reduced: boolean): void;
  /** Advance by `dt` active seconds; reveals start by themselves when the engine publishes a new result. */
  step(s: MineState | null, dt: number, reduced: boolean): ShowStep;
  /** Seconds into the current reach or celebration. */
  clock(): number;
}

interface Reach { readonly plan: ReachPlan; readonly reduced: boolean; readonly timeline: readonly FxCue[]; t: number; readonly id: number }
interface Reveal { readonly plan: ReachPlan; readonly win: boolean; readonly tier: WinTier; readonly streak: number; readonly reduced: boolean;
  readonly timeline: readonly FxCue[]; readonly duration: number; t: number; readonly id: number }
const NONE: ShowStep = { frame: null, cues: [] };

export function createShow(): Show {
  let reach: Reach | null = null, reveal: Reveal | null = null, seenLast = 0, ids = 0, t = 0;

  function startReach(plan: ReachPlan, reduced: boolean): Reach {
    return { plan, reduced, timeline: reachTimeline(plan, reduced), t: -1, id: ++ids };
  }
  function startReveal(s: MineState, reduced: boolean): Reveal {
    const win = s.last?.win ?? false, tier = winTier(s.streak);
    const plan = reach?.plan && reach.plan.win === win ? reach.plan : reachPlan(s.betSeed, win);
    const id = reach?.id ?? ++ids;
    return { plan, win, tier, streak: s.streak, reduced, timeline: win ? winTimeline(tier, reduced) : loseTimeline(reduced),
      duration: revealTime(win, tier, reduced), t: -1, id };
  }

  return {
    reset(s) { reach = null; reveal = null; seenLast = s?.last?.id ?? 0; t = 0; },
    begin(plan, reduced) { reveal = null; reach = startReach(plan, reduced); t = 0; },
    clock: () => t,
    step(s, dt, reduced) {
      if (!s) return NONE;
      if (s.last && s.last.id !== seenLast) {
        seenLast = s.last.id;
        reveal = startReveal(s, reach?.reduced ?? reduced);
        reach = null;
      }
      if (s.phase === 'roll' && s.roll) {
        // A roll with no plan (should not happen) still gets a show, planned from the engine's own outcome.
        if (!reach) reach = startReach(reachPlan(s.betSeed, s.roll.win), s.roll.total <= REACH_REDUCED + 1e-6);
        const now = Math.max(0, s.roll.total - s.roll.left), cues = cuesBetween(reach.timeline, reach.t, now);
        reach.t = now; t = now;
        return { cues, frame: { id: reach.id, kind: 'reach', t: now, duration: reach.reduced ? REACH_REDUCED : reach.plan.duration, plan: reach.plan,
          stage: reachStage(reach.plan, now, reach.reduced), winTier: 0, streak: s.streak, reduced: reach.reduced } };
      }
      if (!reveal) return NONE;
      const r = reveal, now = Math.max(0, r.t) + Math.max(0, dt), cues = cuesBetween(r.timeline, r.t, now);
      r.t = now; t = now;
      if (now > r.duration) { reveal = null; return { cues, frame: null }; }
      const stage: RevealStage = r.win ? (now < WIN_PARTY_AT ? 'lock' : 'party') : (now < LOSE_BEAT ? 'clunk' : 'burn');
      return { cues, frame: { id: r.id, kind: r.win ? (r.tier >= 2 ? 'fever' : 'win') : 'lose', t: now, duration: r.duration, plan: r.plan,
        stage, winTier: r.tier, streak: r.streak, reduced: r.reduced } };
    },
  };
}
