import test from 'node:test';
import assert from 'node:assert/strict';
import { PET_GAMES, petGame } from '../dist/pet-games.js';
import { createPetPoller, detectPetSupport, petMustClose, petSessionKey, petStatus, petToggleVisible, PET_WINDOW } from '../dist/desktop-pet-control.js';
import {
  AHEAD_MS, EMPTY_FEED, EMPTY_READER, FIRST_RATE_MS, MAX_BACKOFF_MS, POLL_MS, RF,
  addSample, coinUnit, coinsCrossed, ease, estimateRate, fmtRF, fmtRate, nextDelay, onFail, onRead, project, readSample,
} from '../dist/reward-feed.js';

const RATE = 164n * RF / 600n; // Genesis #597: about 16.4 RF a minute
const sample = (rf, at, extra = {}) => ({ rf, weth: 0n, at, block: BigInt(at), active: true, ...extra });
const snapshot = (over = {}) => ({
  friendId: 7730n, blockNumber: 1000n, checkedAt: 1_000_000, walletAddress: '0x3333333333333333333333333333333333333333', active: true,
  claimableRF: 38n * RF, claimableWETH: 0n, walletRF: 0n, walletWETH: 0n, ...over,
});

test('the pet is enabled only by the fixed host table, never by game code', () => {
  assert.ok(petGame('Rare Mine'));
  for (const name of ['Rare Drop', 'Rare Invaders', 'Other', '', 'rare mine', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal(petGame(name), undefined, name);
  assert.ok(Object.isFrozen(PET_GAMES));
  assert.throws(() => { PET_GAMES['Evil'] = {}; });
  assert.equal(petGame('Evil'), undefined);
});

test('support detection needs Document Picture-in-Picture with requestWindow, on a non-mobile browser', () => {
  const api = { requestWindow() {} };
  assert.equal(detectPetSupport({ documentPictureInPicture: api, navigator: {} }), true);
  assert.equal(detectPetSupport({ documentPictureInPicture: api, navigator: { userAgentData: { mobile: false } } }), true);
  assert.equal(detectPetSupport({ documentPictureInPicture: api, navigator: { userAgentData: { mobile: true } } }), false, 'phones');
  for (const win of [undefined, null, {}, { navigator: {} }, { documentPictureInPicture: null }, { documentPictureInPicture: {} }, { documentPictureInPicture: { requestWindow: 1 } }]) {
    assert.equal(detectPetSupport(win), false, JSON.stringify(win));
  }
  assert.ok(PET_WINDOW.width >= 200 && PET_WINDOW.width <= 240 && PET_WINDOW.height >= 240 && PET_WINDOW.height <= 280);
});

test('the toggle shows only for a pet game, a verified running session and a supported browser', () => {
  assert.equal(petToggleVisible({ gameName: 'Rare Mine', verified: true, supported: true }), true);
  assert.equal(petToggleVisible({ gameName: 'Rare Drop', verified: true, supported: true }), false);
  assert.equal(petToggleVisible({ gameName: 'Rare Mine', verified: false, supported: true }), false);
  assert.equal(petToggleVisible({ gameName: 'Rare Mine', verified: true, supported: false }), false);
});

test('an open pet closes on any Friend, account, network or wallet change, or when the session stops', () => {
  const base = { friendId: 7730n, collection: 'generations', account: '0x1111111111111111111111111111111111111111', chainId: 4663, walletAddress: '0x3333333333333333333333333333333333333333', running: true };
  const key = petSessionKey(base);
  assert.equal(typeof key, 'string');
  assert.equal(petSessionKey({ ...base, account: base.account.toUpperCase().replace('0X', '0x') }), key, 'address case is not a change');
  assert.equal(petSessionKey({ ...base, running: false }), null);
  assert.equal(petSessionKey(null), null);
  assert.equal(petMustClose(key, base), false);
  assert.equal(petMustClose(null, null), false, 'nothing open');
  assert.equal(petMustClose(null, base), false);
  for (const change of [{ friendId: 3412n }, { collection: 'genesis' }, { account: '0x2222222222222222222222222222222222222222' }, { chainId: 1 }, { chainId: null },
    { walletAddress: '0x4444444444444444444444444444444444444444' }, { running: false }]) {
    assert.equal(petMustClose(key, { ...base, ...change }), true, JSON.stringify(change, (_, v) => typeof v === 'bigint' ? `${v}` : v));
  }
  assert.equal(petMustClose(key, null), true, 'disconnect or unmount');
});

test('pet status: reading, measuring, accruing, no rewards and failed reads', () => {
  assert.equal(petStatus(EMPTY_READER), 'reading');
  const one = onRead(EMPTY_READER, sample(10n * RF, 0));
  assert.equal(petStatus(one), 'measuring');
  const two = onRead(one, sample(10n * RF + RATE * 5n, 5_000));
  assert.equal(petStatus(two), 'accruing');
  assert.equal(petStatus(onFail(two)), 'failed');
  assert.equal(petStatus(onFail(EMPTY_READER)), 'failed');
  assert.equal(petStatus(onRead(EMPTY_READER, sample(0n, 0, { active: false }))), 'none', 'not activated');
  assert.equal(petStatus(onRead(onRead(EMPTY_READER, sample(5n, 0)), sample(5n, 20_000))), 'none', 'no accrual');
});

test('reward snapshots are validated and rates come from successive snapshots', () => {
  assert.deepEqual(readSample(snapshot(), 7730n, 'generations'), { rf: 38n * RF, weth: 0n, at: 1_000_000, block: 1000n, active: true });
  for (const bad of [null, snapshot({ friendId: 1n }), snapshot({ claimableRF: 5 }), snapshot({ claimableRF: -1n }), snapshot({ checkedAt: Number.NaN }), snapshot({ active: 'yes' }), snapshot({ collection: 'genesis' })]) {
    assert.throws(() => readSample(bad, 7730n, 'generations'));
  }
  assert.equal(estimateRate([sample(1n, 0)]), null);
  assert.equal(estimateRate([sample(RF, 0), sample(2n * RF, 1_000)]), null, 'spans under 2 s are noise');
  assert.equal(estimateRate([sample(38n * RF, 0), sample(38n * RF + RATE * 20n, 20_000)]), RATE);
  let r = addSample(EMPTY_FEED, sample(100n * RF, 0));
  r = addSample(r.feed, sample(100n * RF + RATE * 5n, 5_000));
  assert.equal(r.event, 'grow'); assert.equal(r.feed.rate, RATE);
  assert.equal(addSample(r.feed, sample(1n, 4_000)).event, 'stale');
  const drop = addSample(r.feed, sample(RF, 25_000));
  assert.equal(drop.event, 'drop'); assert.equal(drop.feed.rate, RATE, 'a claim keeps the rate');
});

test('between reads the value is interpolated (clamped) and eased without running backwards', () => {
  assert.equal(project(EMPTY_FEED, 0), null);
  const one = addSample(EMPTY_FEED, sample(100n * RF, 1_000)).feed;
  assert.equal(project(one, 50_000), 100n * RF, 'no rate yet: hold');
  const two = addSample(one, sample(100n * RF + RATE * 5n, 6_000)).feed;
  assert.equal(project(two, 16_000), 100n * RF + RATE * 15n);
  assert.equal(project(two, 6_000 + AHEAD_MS * 10), 100n * RF + RATE * 5n + RATE * BigInt(AHEAD_MS) / 1000n, 'clamped');
  assert.equal(ease(null, 5n, 0.1), 5n);
  assert.equal(ease(10n, 5n, 0.1), 10n, 'holds instead of running backwards');
  assert.equal(ease(10n, 5n, 0.1, true), 5n, 'reset after a claim');
  const e = ease(0n, 1000n, 0.05);
  assert.ok(e > 0n && e < 1000n);
});

test('pet coins pop about 1-4 a second at the real accrual', () => {
  assert.equal(coinUnit(null), null);
  assert.equal(coinUnit(0n), null);
  for (const rate of [RATE, 2n * RF / 600n, 1n, 7n * RF, 123_456_789n]) {
    const unit = coinUnit(rate, 4n);
    const perSecond = Number(rate) / Number(unit);
    assert.ok(perSecond <= 4 && perSecond >= 1.6 - 1e-9 || rate < 2n, `${rate}: ${perSecond}/s`);
  }
  assert.equal(coinsCrossed(0n, 10n, 3n), 3);
  assert.equal(coinsCrossed(10n, 0n, 3n), 0);
  assert.equal(coinsCrossed(0n, 10n, null), 0);
});

test('reads back off on errors, and labels format real RF and the per-minute rate', () => {
  assert.equal(nextDelay({ ok: true, reads: 1, failures: 0, everOk: true }), FIRST_RATE_MS);
  assert.equal(nextDelay({ ok: true, reads: 5, failures: 0, everOk: true }), POLL_MS);
  assert.deepEqual([1, 2, 3, 4].map(failures => nextDelay({ ok: false, reads: 0, failures, everOk: false })), [2_000, 5_000, 20_000, 40_000]);
  assert.deepEqual([1, 2, 3, 9].map(failures => nextDelay({ ok: false, reads: 3, failures, everOk: true })), [40_000, 80_000, 160_000, MAX_BACKOFF_MS]);
  assert.equal(fmtRF(38n * RF + RF / 2n), '38.5000');
  assert.equal(fmtRF(38_529n * RF + RF / 8n), '38,529.12');
  assert.equal(fmtRate(RATE), '16.4');
});

/** Fake timers and visibility for the poller. */
function harness(reads) {
  const timers = new Map(); let id = 0, now = 0, hidden = false;
  const updates = [];
  const poller = createPetPoller({
    friendId: 7730n, collection: 'generations', read: () => reads.shift()(), now: () => now, hidden: () => hidden,
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id; }, clearTimer: t => { timers.delete(t); },
    onUpdate: reader => updates.push(reader),
  });
  return {
    poller, updates, timers,
    setHidden(value) { hidden = value; poller.visibilityChanged(); },
    /** Run the next due timer, advancing time to it. */
    async next() {
      const [key, t] = [...timers].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      if (!t) return null;
      timers.delete(key); const waited = t.at - now; now = t.at; t.fn(); await new Promise(r => setImmediate(r)); return waited;
    },
    get now() { return now; },
  };
}

test('the pet poller reads one at a time, 20 s apart after a quick second read, backs off and pauses while hidden', async () => {
  let release;
  const slow = () => new Promise(r => { release = () => r(snapshot({ checkedAt: 1 })); });
  const reads = [slow, async () => snapshot({ checkedAt: 5_001, blockNumber: 1001n, claimableRF: 39n * RF }),
    async () => { throw new Error('rpc'); }, async () => snapshot({ checkedAt: 60_000, blockNumber: 1002n, claimableRF: 40n * RF })];
  const h = harness(reads);
  h.poller.start();
  assert.equal(await h.next(), 0, 'first read at once');
  h.poller.start(); h.poller.visibilityChanged();
  assert.equal(h.timers.size, 0, 'no second read while one is in flight');
  release(); await new Promise(r => setImmediate(r));
  assert.equal(h.updates.length, 1);
  assert.equal(await h.next(), FIRST_RATE_MS);
  assert.equal(h.updates[1].feed.rate !== null, true);
  // Hidden: the timer is dropped and no read happens until visible again.
  h.setHidden(true);
  assert.equal(h.timers.size, 0, 'paused while hidden');
  h.setHidden(false);
  assert.equal(h.timers.size, 1);
  assert.equal(await h.next(), POLL_MS);
  assert.equal(h.updates.at(-1).failures, 1);
  assert.equal(await h.next(), 40_000, 'backoff after a failure');
  assert.equal(h.updates.at(-1).failures, 0);
  h.poller.stop();
  assert.equal(h.timers.size, 0, 'stopped');
  h.poller.start();
  assert.equal(h.timers.size, 0, 'a stopped poller stays stopped');
});

test('a read that lands after stop never updates the pet', async () => {
  let release;
  const h = harness([() => new Promise(r => { release = () => r(snapshot()); })]);
  h.poller.start(); await h.next();
  h.poller.stop(); release(); await new Promise(r => setImmediate(r));
  assert.equal(h.updates.length, 0);
  assert.equal(h.timers.size, 0);
});
