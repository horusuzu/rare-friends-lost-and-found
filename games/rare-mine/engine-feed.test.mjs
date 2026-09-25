import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AHEAD_MS, EMPTY_FEED, EMPTY_READER, FALLBACK_FAILURES, FIRST_RATE_MS, MAX_BACKOFF_MS, POLL_MS, RF,
  addSample, coinUnit, coinsCrossed, decideMode, ease, estimateRate, fmtRF, fmtRate, fmtWETH, nextDelay, onFail, onRead, project, readSample,
} from './feed.ts';

/** Genesis #597 measured on mainnet: about 16.4 RF a minute. Friend #7730: about 0.2 RF a minute. */
const GENESIS_RATE = 164n * RF / 600n;
const FRIEND_RATE = 2n * RF / 600n;
const sample = (rf, at, extra = {}) => ({ rf, weth: 0n, at, block: BigInt(at), active: true, ...extra });
const snapshot = (over = {}) => ({
  friendId: 7730n, blockNumber: 1000n, checkedAt: 1_000_000, walletAddress: '0x3333333333333333333333333333333333333333', active: true,
  claimableRF: 38_529n * RF, claimableWETH: 187n * 10n ** 14n, walletRF: 0n, walletWETH: 0n, ...over,
});

test('a reward snapshot is validated before use: amounts, the NFT and the collection must match', () => {
  const s = readSample(snapshot(), 7730n, 'generations');
  assert.deepEqual(s, { rf: 38_529n * RF, weth: 187n * 10n ** 14n, at: 1_000_000, block: 1000n, active: true });
  assert.equal(readSample(snapshot({ friendId: 597n, collection: 'genesis' }), 597n, 'genesis').rf, 38_529n * RF);
  for (const bad of [null, 'x', snapshot({ friendId: 1n }), snapshot({ claimableRF: 5 }), snapshot({ claimableRF: -1n }), snapshot({ claimableWETH: '1' }),
    snapshot({ checkedAt: Number.NaN }), snapshot({ checkedAt: -5 }), snapshot({ blockNumber: 3 }), snapshot({ active: 'yes' }), snapshot({ collection: 'genesis' })]) {
    assert.throws(() => readSample(bad, 7730n, 'generations'), undefined, String(bad && bad.friendId));
  }
  assert.throws(() => readSample(snapshot(), 597n, 'genesis'), 'a Generations read is not a Genesis read');
});

test('the accrual rate comes from successive snapshots (checkedAt deltas), not history', () => {
  assert.equal(estimateRate([]), null);
  assert.equal(estimateRate([sample(10n * RF, 0)]), null, 'one snapshot cannot give a rate');
  assert.equal(estimateRate([sample(10n * RF, 0), sample(10n * RF + RF, 1_000)]), null, 'spans under 2 s are too noisy');
  const a = sample(38_529n * RF, 0), b = sample(38_529n * RF + GENESIS_RATE * 20n, 20_000);
  assert.equal(estimateRate([a, b]), GENESIS_RATE);
  const c = sample(b.rf + GENESIS_RATE * 20n, 40_000);
  assert.equal(estimateRate([a, b, c]), GENESIS_RATE, 'uses the whole window (oldest to newest)');
  assert.equal(estimateRate([sample(5n, 0), sample(5n, 20_000)]), 0n, 'no accrual is a rate of zero');
});

test('adding snapshots: first, growth, stale reads ignored, and a drop (a claim) restarts the window but keeps the rate', () => {
  let r = addSample(EMPTY_FEED, sample(100n * RF, 0));
  assert.equal(r.event, 'first'); assert.equal(r.feed.rate, null); assert.equal(r.feed.samples.length, 1);
  r = addSample(r.feed, sample(100n * RF + GENESIS_RATE * 5n, 5_000));
  assert.equal(r.event, 'grow'); assert.equal(r.feed.rate, GENESIS_RATE);
  const before = r.feed;
  const older = addSample(before, sample(1n, 4_000, { block: 1n }));
  assert.equal(older.event, 'stale'); assert.equal(older.feed, before, 'an older block or time changes nothing');
  const drop = addSample(before, sample(2n * RF, 25_000));
  assert.equal(drop.event, 'drop'); assert.deepEqual(drop.feed.samples, [sample(2n * RF, 25_000)]);
  assert.equal(drop.feed.rate, GENESIS_RATE, 'accrual goes on after a claim');
  let f = EMPTY_FEED;
  for (let i = 0; i < 40; i++) f = addSample(f, sample(BigInt(i) * GENESIS_RATE * 20n, i * 20_000)).feed;
  assert.ok(f.samples.length <= 12, `window is bounded (${f.samples.length})`);
  assert.equal(f.rate, GENESIS_RATE);
});

test('between snapshots the value is interpolated, clamped at 1.5 poll intervals ahead', () => {
  assert.equal(project(EMPTY_FEED, 0), null);
  const one = addSample(EMPTY_FEED, sample(100n * RF, 1_000)).feed;
  assert.equal(project(one, 60_000), 100n * RF, 'no rate yet: hold the snapshot');
  const two = addSample(one, sample(100n * RF + GENESIS_RATE * 5n, 6_000)).feed;
  const at = two.samples.at(-1).rf;
  assert.equal(project(two, 6_000), at);
  assert.equal(project(two, 16_000), at + GENESIS_RATE * 10n);
  assert.equal(AHEAD_MS, POLL_MS * 1.5);
  assert.equal(project(two, 6_000 + AHEAD_MS), at + GENESIS_RATE * BigInt(AHEAD_MS / 1000));
  assert.equal(project(two, 6_000 + 10 * AHEAD_MS), project(two, 6_000 + AHEAD_MS), 'never runs further ahead');
  assert.equal(project(two, 0), at, 'a clock before the snapshot does not run backwards');
});

test('the shown value eases toward the target, never overshoots and never runs backwards unless reset', () => {
  assert.equal(ease(null, 50n * RF, 0.016), 50n * RF, 'the first value is shown at once');
  const s1 = ease(100n * RF, 110n * RF, 0.05);
  assert.ok(s1 > 100n * RF && s1 < 110n * RF, `eases (${s1})`);
  let s = 100n * RF;
  for (let i = 0; i < 120; i++) s = ease(s, 110n * RF, 1 / 60);
  assert.ok(s <= 110n * RF && 110n * RF - s < RF / 100n, `converges without overshoot (${s})`);
  assert.equal(ease(120n * RF, 110n * RF, 0.05), 120n * RF, 'a target behind the display holds the display');
  assert.equal(ease(120n * RF, 3n * RF, 0.05, true), 3n * RF, 'a reset (claim) jumps to the new value');
  assert.equal(ease(5n, 6n, 0.001), 6n, 'always makes progress');
});

test('the per-coin unit keeps 2-6 coins a second popping at any real rate (1-2-5 steps)', () => {
  assert.equal(coinUnit(GENESIS_RATE), 5n * 10n ** 16n, 'Genesis: 0.05 RF a coin');
  assert.equal(coinUnit(FRIEND_RATE), 10n ** 15n, 'Friend #7730: 0.001 RF a coin');
  assert.equal(coinUnit(null), null); assert.equal(coinUnit(0n), null);
  for (let rate = 7n; rate < 10n ** 24n; rate = rate * 13n / 7n) {
    const u = coinUnit(rate), perSecond = Number(rate) / Number(u);
    assert.ok(perSecond > 2 && perSecond <= 6, `rate ${rate} → ${perSecond.toFixed(2)} coins/s`);
    assert.match(String(u), /^[125]0*$/);
  }
});

test('coins pop when the shown value crosses unit multiples', () => {
  const u = 5n * 10n ** 16n;
  assert.equal(coinsCrossed(0n, u - 1n, u), 0);
  assert.equal(coinsCrossed(u - 1n, u, u), 1);
  assert.equal(coinsCrossed(RF, 2n * RF, u), 20);
  assert.equal(coinsCrossed(2n * RF, RF, u), 0, 'never negative');
  assert.equal(coinsCrossed(0n, RF, null), 0);
});

test('polling: 20 s apart, the second read comes sooner, errors back off, never beyond the cap', () => {
  assert.equal(POLL_MS, 20_000);
  assert.equal(nextDelay({ ok: true, reads: 1, failures: 0, everOk: true }), FIRST_RATE_MS);
  assert.equal(nextDelay({ ok: true, reads: 2, failures: 0, everOk: true }), POLL_MS);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(f => nextDelay({ ok: false, reads: 0, failures: f, everOk: false })), [2_000, 5_000, 20_000, 40_000, 80_000, 160_000]);
  assert.deepEqual([1, 2, 3, 4, 9].map(f => nextDelay({ ok: false, reads: 3, failures: f, everOk: true })), [40_000, 80_000, 160_000, 160_000, 160_000]);
  assert.equal(MAX_BACKOFF_MS, 160_000);
});

test('the reader state: reads and failures count, a success clears failures and reports drops', () => {
  let r = onFail(EMPTY_READER);
  assert.equal(r.failures, 1); assert.equal(r.everOk, false);
  r = onRead(r, sample(10n * RF, 0));
  assert.equal(r.failures, 0); assert.equal(r.reads, 1); assert.equal(r.everOk, true); assert.equal(r.event.kind, 'first');
  r = onRead(r, sample(11n * RF, 5_000));
  assert.equal(r.event.kind, 'grow'); assert.equal(r.feed.rate, RF / 5n);
  r = onRead(r, sample(RF / 10n, 25_000));
  assert.equal(r.event.kind, 'drop'); assert.equal(r.event.prev, 11n * RF); assert.equal(r.event.next, RF / 10n);
  assert.equal(r.event.id, 3);
  assert.equal(r.last.rf, RF / 10n);
  const failed = onFail(r);
  assert.equal(failed.last, r.last, 'a failure keeps the last value'); assert.equal(failed.feed, r.feed);
});

test('mode: real when the NFT accrues; practice when unavailable, failing repeatedly, inactive or not accruing', () => {
  const live = sample(RF, 0);
  assert.deepEqual(decideMode({ available: false, failures: 0, last: null, rate: null }), { mode: 'practice', reason: 'unavailable' });
  assert.deepEqual(decideMode({ available: true, failures: 0, last: null, rate: null }), { mode: 'reading' });
  assert.deepEqual(decideMode({ available: true, failures: FALLBACK_FAILURES - 1, last: null, rate: null }), { mode: 'reading' });
  assert.deepEqual(decideMode({ available: true, failures: FALLBACK_FAILURES, last: null, rate: null }), { mode: 'practice', reason: 'failed' });
  assert.deepEqual(decideMode({ available: true, failures: 0, last: live, rate: null }), { mode: 'real' });
  assert.deepEqual(decideMode({ available: true, failures: 5, last: live, rate: GENESIS_RATE }), { mode: 'real' }, 'a known value outlives errors');
  assert.deepEqual(decideMode({ available: true, failures: 0, last: { ...live, active: false }, rate: null }), { mode: 'practice', reason: 'inactive' });
  assert.deepEqual(decideMode({ available: true, failures: 0, last: live, rate: 0n }), { mode: 'practice', reason: 'inactive' });
});

test('RF amounts: 4 decimals when small, 2 when large, thousands separators, truncated', () => {
  assert.equal(fmtRF(0n), '0.0000');
  assert.equal(fmtRF(38_480n * RF / 1000n), '38.4800');
  assert.equal(fmtRF(123_456_789n * 10n ** 12n), '123.4567');
  assert.equal(fmtRF(38_529n * RF + 129n * 10n ** 16n), '38,529.12');
  assert.equal(fmtRF(1_234_567n * RF), '1,234,567.00');
  assert.equal(fmtRF(-5n), '0.0000', 'never negative');
  assert.equal(fmtRate(GENESIS_RATE), '16.4');
  assert.equal(fmtRate(FRIEND_RATE), '0.200');
  assert.equal(fmtRate(200n * RF / 60n), '200');
  assert.equal(fmtRate(123n * RF / 6000n), '1.23');
  assert.equal(fmtWETH(187n * 10n ** 14n), '0.0187');
  assert.equal(fmtWETH(0n), '0');
  assert.equal(fmtWETH(10n ** 12n), '<0.0001');
});
