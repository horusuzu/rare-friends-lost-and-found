/**
 * The real-reward feed: validates reward snapshots from the trusted host, estimates the accrual rate from successive
 * snapshots, interpolates between them, and decides between real and practice mode. Pure: every function returns new
 * values and never mutates its input. Amounts are bigint base units (18 decimals); nothing here moves any token.
 */

export const RF = 10n ** 18n;
/** A read every 20 s; the second read comes after 5 s so the rate is known quickly. */
export const POLL_MS = 20_000;
export const FIRST_RATE_MS = 5_000;
/** Before any read has succeeded: quick retries, then the usual backoff. */
export const RETRY_MS: readonly number[] = [2_000, 5_000];
export const MAX_BACKOFF_MS = 160_000;
/** Consecutive failures with no value yet before practice mode is offered. */
export const FALLBACK_FAILURES = 3;
/** Interpolation never runs further than 1.5 poll intervals past the last snapshot. */
export const AHEAD_MS = POLL_MS * 1.5;
/** Rate window: snapshots within the last 3 minutes, at most 12. A span under 2 s is too noisy to use. */
export const RATE_WINDOW_MS = 180_000;
export const MAX_SAMPLES = 12;
export const MIN_SPAN_MS = 2_000;
/** The display closes this fraction of its gap to the target per second. */
export const EASE_PER_S = 6;
/** Aim for at most this many popping coins a second. */
export const MAX_COINS_PER_S = 6n;

export interface Sample {
  /** Claimable RF (earned, not yet claimed) in base units. */
  readonly rf: bigint;
  readonly weth: bigint;
  /** checkedAt from the host, in ms. */
  readonly at: number;
  readonly block: bigint;
  readonly active: boolean;
}
export interface Feed {
  readonly samples: readonly Sample[];
  /** Estimated accrual in base units per second; null until two snapshots are far enough apart. */
  readonly rate: bigint | null;
}
export type FeedEvent = 'first' | 'grow' | 'drop' | 'stale';
export const EMPTY_FEED: Feed = Object.freeze({ samples: [], rate: null });

const isAmount = (v: unknown): v is bigint => typeof v === 'bigint' && v >= 0n && v < 1n << 256n;

/** Validate a FriendRewardsSnapshot for the selected NFT and keep only what the mine needs. Throws on anything else. */
export function readSample(value: unknown, friendId: bigint, collection: 'genesis' | 'generations'): Sample {
  if (!value || typeof value !== 'object') throw new Error('Invalid reward snapshot');
  const v = value as Record<string, unknown>;
  if (v.friendId !== friendId) throw new Error('Reward snapshot for another NFT');
  if ((v.collection ?? 'generations') !== collection) throw new Error('Reward snapshot for another collection');
  if (!isAmount(v.claimableRF) || !isAmount(v.claimableWETH) || !isAmount(v.blockNumber)) throw new Error('Invalid reward amounts');
  if (typeof v.checkedAt !== 'number' || !Number.isFinite(v.checkedAt) || v.checkedAt < 0) throw new Error('Invalid reward time');
  if (typeof v.active !== 'boolean') throw new Error('Invalid reward state');
  return { rf: v.claimableRF, weth: v.claimableWETH, at: v.checkedAt, block: v.blockNumber, active: v.active };
}

/** Accrual per second from the oldest to the newest snapshot in the window (no drops inside it). */
export function estimateRate(samples: readonly Sample[]): bigint | null {
  if (samples.length < 2) return null;
  const first = samples[0], last = samples[samples.length - 1];
  const span = Math.round(last.at - first.at);
  if (span < MIN_SPAN_MS) return null;
  const gain = last.rf - first.rf;
  return gain <= 0n ? 0n : gain * 1000n / BigInt(span);
}

/**
 * Add a snapshot. An older block or time is ignored ('stale'). A lower value than the last snapshot means the holder
 * claimed on the official site ('drop'): the window restarts from the new value, and the rate is kept.
 */
export function addSample(feed: Feed, sample: Sample): { readonly feed: Feed; readonly event: FeedEvent } {
  const last = feed.samples[feed.samples.length - 1];
  if (!last) return { feed: { samples: [sample], rate: null }, event: 'first' };
  if (sample.block < last.block || sample.at <= last.at) return { feed, event: 'stale' };
  if (sample.rf < last.rf) return { feed: { samples: [sample], rate: feed.rate }, event: 'drop' };
  const samples = [...feed.samples.filter(s => s.at >= sample.at - RATE_WINDOW_MS), sample].slice(-MAX_SAMPLES);
  return { feed: { samples, rate: estimateRate(samples) ?? feed.rate }, event: 'grow' };
}

/** The value now: the last snapshot plus rate × elapsed, clamped to AHEAD_MS past the snapshot. */
export function project(feed: Feed, now: number): bigint | null {
  const last = feed.samples[feed.samples.length - 1];
  if (!last) return null;
  if (feed.rate === null) return last.rf;
  const elapsed = Math.round(Math.min(AHEAD_MS, Math.max(0, now - last.at)));
  return last.rf + feed.rate * BigInt(elapsed) / 1000n;
}

/** Ease the shown value toward the target. It holds rather than run backwards, unless `reset` (after a claim). */
export function ease(shown: bigint | null, target: bigint, dt: number, reset = false): bigint {
  if (shown === null || reset) return target;
  if (target <= shown) return shown;
  const gap = target - shown;
  const k = BigInt(Math.round(Math.min(1, Math.max(0, dt) * EASE_PER_S) * 1000));
  const step = gap * k / 1000n;
  return shown + (step > 0n ? step : 1n);
}

/** Base units per popping coin: the smallest 1-2-5 step that keeps coins at or under 6 a second (so 2.4-6 a second). */
export function coinUnit(rate: bigint | null): bigint | null {
  if (rate === null || rate <= 0n) return null;
  const need = (rate + MAX_COINS_PER_S - 1n) / MAX_COINS_PER_S;
  for (let decade = 1n; ; decade *= 10n) for (const m of [1n, 2n, 5n]) if (m * decade >= need) return m * decade;
}

/** Whole coins between two shown values. */
export function coinsCrossed(from: bigint, to: bigint, unit: bigint | null): number {
  if (unit === null || to <= from) return 0;
  return Number(to / unit - from / unit);
}

export interface DelayInput { readonly ok: boolean; readonly reads: number; readonly failures: number; readonly everOk: boolean }
/** Milliseconds until the next read. */
export function nextDelay({ ok, reads, failures, everOk }: DelayInput): number {
  if (ok) return reads <= 1 ? FIRST_RATE_MS : POLL_MS;
  if (!everOk && failures <= RETRY_MS.length) return RETRY_MS[Math.max(0, failures - 1)];
  const steps = everOk ? failures : failures - RETRY_MS.length - 1;
  return Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.max(0, steps));
}

export interface ReadEvent { readonly kind: FeedEvent; readonly prev: bigint | null; readonly next: bigint; readonly id: number }
export interface Reader {
  readonly feed: Feed;
  readonly last: Sample | null;
  readonly reads: number;
  readonly failures: number;
  readonly everOk: boolean;
  readonly event: ReadEvent | null;
}
export const EMPTY_READER: Reader = Object.freeze({ feed: EMPTY_FEED, last: null, reads: 0, failures: 0, everOk: false, event: null });

export function onRead(r: Reader, sample: Sample): Reader {
  const { feed, event } = addSample(r.feed, sample);
  const reads = r.reads + 1;
  const last = event === 'stale' ? r.last : sample;
  return { feed, last, reads, failures: 0, everOk: true, event: { kind: event, prev: r.last?.rf ?? null, next: sample.rf, id: reads } };
}
export function onFail(r: Reader): Reader { return { ...r, failures: r.failures + 1 }; }

export type ModeReason = 'unavailable' | 'failed' | 'inactive';
export type ModeDecision = { readonly mode: 'reading' | 'real' } | { readonly mode: 'practice'; readonly reason: ModeReason };
/** Real mode when the NFT accrues; practice when rewards are unavailable, keep failing, or the NFT does not accrue. */
export function decideMode({ available, failures, last, rate }: { available: boolean; failures: number; last: Sample | null; rate: bigint | null }): ModeDecision {
  if (!available) return { mode: 'practice', reason: 'unavailable' };
  if (!last) return failures >= FALLBACK_FAILURES ? { mode: 'practice', reason: 'failed' } : { mode: 'reading' };
  if (!last.active || rate === 0n) return { mode: 'practice', reason: 'inactive' };
  return { mode: 'real' };
}

const group = (whole: bigint): string => whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** RF with 4 decimals under 1,000 and 2 above, thousands separators, truncated. */
export function fmtRF(wei: bigint): string {
  const v = wei > 0n ? wei : 0n, whole = v / RF, places = whole < 1000n ? 4 : 2;
  return `${group(whole)}.${(v % RF).toString().padStart(18, '0').slice(0, places)}`;
}
/** WETH with 4 decimals; tiny non-zero amounts read "<0.0001". */
export function fmtWETH(wei: bigint): string {
  if (wei <= 0n) return '0';
  const whole = wei / RF, frac = (wei % RF).toString().padStart(18, '0').slice(0, 4);
  return whole === 0n && /^0+$/.test(frac) ? '<0.0001' : `${group(whole)}.${frac}`;
}
/** A per-second rate shown per minute with three significant digits (a label, not money math). */
export function fmtRate(perSecond: bigint): string {
  const perMinute = Number(perSecond * 60n) / 1e18;
  return perMinute >= 1000 ? Math.round(perMinute).toLocaleString('en-US') : perMinute.toPrecision(3);
}
