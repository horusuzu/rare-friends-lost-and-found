import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FX_CUE_KINDS, REACH_AT, REACH_REDUCED, SYMBOLS, TEASE_HANG, WIN_TIME, LOSE_TIME, cuesBetween, loseTimeline, reachPlan, reachStage,
  reachTimeline, reelPosition, revealTime, suspenseFor, winTier, winTimeline,
} from './reach.ts';
import { askBet, betOutcome, confirmBet, settle } from './game.ts';
import { run, withPot } from './test-kit.mjs';
import { ROLL_TIME } from './economy.ts';

const seeds = Array.from({ length: 4000 }, (_, i) => (i * 2654435761) >>> 0);
const shown = p => ((Math.round(p) % SYMBOLS) + SYMBOLS) % SYMBOLS;

test('the plan is the same every time for a given bet seed', () => {
  for (const seed of seeds.slice(0, 200)) for (const win of [true, false]) assert.deepEqual(reachPlan(seed, win), reachPlan(seed, win));
});

test('the plan mirrors the outcome it is given and never decides one', () => {
  for (const seed of seeds) {
    const win = betOutcome(seed)[0];
    const plan = reachPlan(seed, win);
    assert.equal(plan.win, win);
    assert.equal(plan.final[0], plan.match); assert.equal(plan.final[1], plan.match, 'the first two reels always match (リーチ)');
    assert.equal(plan.final[2] === plan.match, win, 'the last reel matches exactly when the engine said win');
    assert.ok(Object.values(plan).every(v => typeof v !== 'function'));
  }
});

test('tier, tease and the reach symbol all occur, and hot tiers lean toward wins without touching the odds', () => {
  const count = { win: [0, 0, 0], lose: [0, 0, 0] };
  let teases = 0; const symbols = new Set();
  for (const seed of seeds) for (const win of [true, false]) {
    const p = reachPlan(seed, win); count[win ? 'win' : 'lose'][p.tier]++; teases += p.tease ? 1 : 0; symbols.add(p.match);
  }
  for (const t of [0, 1, 2]) { assert.ok(count.win[t] > 0 && count.lose[t] > 0, `tier ${t} occurs both ways`); }
  assert.ok(count.win[2] > count.lose[2] * 2, '超激アツ is much more common before a win');
  assert.ok(count.lose[0] > count.win[0], 'a plain リーチ is more common before a loss');
  assert.ok(teases > seeds.length * 0.5 && teases < seeds.length * 0.9, `teases ${teases}`);
  assert.equal(symbols.size, SYMBOLS);
});

test('suspense lasts 2.5–4 s with full motion and 0.3 s with reduced motion', () => {
  for (const seed of seeds.slice(0, 500)) for (const win of [true, false]) {
    const p = reachPlan(seed, win);
    assert.ok(p.duration >= 2.5 && p.duration <= 4, `duration ${p.duration}`);
    assert.equal(suspenseFor(p, false), p.duration); assert.equal(suspenseFor(p, true), REACH_REDUCED);
  }
});

test('passing the plan to the engine changes only the suspense, never the outcome or the totals', () => {
  for (const seed of seeds.slice(0, 300)) {
    const asked = askBet(withPot(seed, 90));
    const plan = reachPlan(asked.betSeed, betOutcome(asked.betSeed)[0]);
    const plain = confirmBet(asked), dressed = confirmBet(asked, suspenseFor(plan, false));
    assert.equal(dressed.roll.win, plan.win); assert.equal(dressed.roll.win, plain.roll.win);
    assert.equal(dressed.roll.total, plan.duration); assert.equal(plain.roll.total, ROLL_TIME);
    assert.deepEqual(settle(dressed), settle(plain), 'revealing early gives the same result');
    assert.equal(run(dressed, plan.duration - 0.05).phase, 'roll');
    const done = run(dressed, plan.duration + 0.05), ref = settle(plain);
    assert.deepEqual([done.phase, done.stats.burned, done.stats.winnings, done.streak, done.last.win], ['mine', ref.stats.burned, ref.stats.winnings, ref.streak, ref.last.win]);
  }
});

test('reels stop on the planned symbols: two at their stop times, the last exactly at the reveal', () => {
  for (const seed of seeds.slice(0, 400)) for (const win of [true, false]) {
    const p = reachPlan(seed, win);
    assert.equal(shown(reelPosition(p, 0, 0.6)), p.match); assert.equal(shown(reelPosition(p, 1, 1.05)), p.match);
    for (const r of [0, 1, 2]) assert.equal(shown(reelPosition(p, r, p.duration)), p.final[r]);
    assert.equal(shown(reelPosition(p, 2, p.duration + 1)), p.final[2]);
    // Reels only ever move forward while they spin.
    for (let r = 0; r < 3; r++) for (let t = 0.02; t < (r < 2 ? 0.6 + r * 0.45 : p.duration); t += 0.02) {
      assert.ok(reelPosition(p, r, t) >= reelPosition(p, r, t - 0.02) - 1e-9, `reel ${r} moves forward at ${t}`);
    }
  }
});

test('a near miss hangs on or next to the match before it resolves', () => {
  const tease = seeds.map(s => reachPlan(s, false)).find(p => p.tease);
  assert.equal(shown(reelPosition(tease, 2, tease.duration - TEASE_HANG + 0.05)), tease.match, 'a losing tease sits on the match');
  assert.notEqual(shown(reelPosition(tease, 2, tease.duration)), tease.match, '…then slides off');
  const bump = seeds.map(s => reachPlan(s, true)).find(p => p.tease);
  const hang = reelPosition(bump, 2, bump.duration - TEASE_HANG + 0.05);
  assert.ok(Math.abs(hang - bump.final[2]) > 0.3 && shown(hang) === bump.match, 'a winning tease stops just short…');
  assert.equal(reelPosition(bump, 2, bump.duration), bump.final[2], '…then bumps into place');
});

test('stages escalate リーチ → 激アツ → 超激アツ, with the tease last; reduced motion is static', () => {
  const plans = seeds.map(s => reachPlan(s, true));
  const hot = plans.find(p => p.tier === 2 && p.tease);
  assert.equal(reachStage(hot, 0.2, false), 'spin'); assert.equal(reachStage(hot, REACH_AT + 0.01, false), 'reach');
  assert.equal(reachStage(hot, 1.8, false), 'hot'); assert.equal(reachStage(hot, 2.4, false), 'super');
  assert.equal(reachStage(hot, hot.duration - 0.1, false), 'tease'); assert.equal(reachStage(hot, 1, true), 'static');
  const plain = plans.find(p => p.tier === 0 && !p.tease);
  assert.equal(reachStage(plain, plain.duration, false), 'reach');
});

test('timelines are sorted, inside their windows and use only known cue kinds', () => {
  const all = [];
  for (const seed of seeds.slice(0, 200)) for (const win of [true, false]) for (const reduced of [false, true]) {
    const p = reachPlan(seed, win), tl = reachTimeline(p, reduced);
    all.push(...tl);
    assert.ok(tl.every((q, i) => i === 0 || q.t >= tl[i - 1].t));
    assert.ok(tl.every(q => q.t >= 0 && q.t < suspenseFor(p, reduced) + 1e-9));
  }
  for (const reduced of [false, true]) {
    for (const t of [0, 1, 2, 3]) { const tl = winTimeline(t, reduced); all.push(...tl); assert.ok(tl.every(q => q.t < revealTime(true, t, reduced))); }
    const tl = loseTimeline(reduced); all.push(...tl); assert.ok(tl.every(q => q.t < revealTime(false, 0, reduced)));
  }
  assert.ok(all.every(q => FX_CUE_KINDS.includes(q.k)), 'known cue kinds');
  assert.deepEqual([...new Set(all.map(q => q.k))].sort(), [...FX_CUE_KINDS].sort(), 'every cue kind is used somewhere');
});

test('the full suspense has the reach call, a siren, an accelerating heartbeat and the tier-ups', () => {
  const p = seeds.map(s => reachPlan(s, true)).find(q => q.tier === 2);
  const tl = reachTimeline(p, false), kinds = tl.map(q => q.k);
  for (const k of ['spin', 'stop', 'reach', 'siren', 'beat']) assert.ok(kinds.includes(k), k);
  assert.deepEqual(tl.filter(q => q.k === 'hot').map(q => q.n), [1, 2]);
  const beats = tl.filter(q => q.k === 'beat').map(q => q.t), gaps = beats.slice(1).map((t, i) => t - beats[i]);
  assert.ok(gaps.at(-1) < gaps[0], 'the heartbeat speeds up');
});

test('wins escalate with the streak: 大当たり, 連チャン, 確変突入, then FEVER with fever bars', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 12].map(winTier), [0, 1, 2, 3, 3, 3]);
  assert.equal(winTimeline(0, false).some(q => q.k === 'fever'), false);
  assert.equal(winTimeline(1, false).some(q => q.k === 'fever'), false);
  assert.ok(winTimeline(2, false).filter(q => q.k === 'fever').length >= 3);
  assert.ok(winTimeline(3, false).filter(q => q.k === 'fever').length > winTimeline(2, false).filter(q => q.k === 'fever').length);
  assert.equal(winTimeline(3, true).some(q => q.k === 'fever'), false, 'reduced motion keeps it short');
  const jara = winTimeline(0, false).filter(q => q.k === 'jara');
  assert.ok(jara.at(-1).t - jara[0].t >= 2 && jara.length >= 20, 'ジャラジャラ pours for 2–3 s');
  assert.deepEqual(WIN_TIME.map(t => t >= 3 && t <= 4.5), [true, true, true, true]);
});

test('the burn is short, with a beat of silence before the boom', () => {
  assert.ok(LOSE_TIME <= 2.5);
  const tl = loseTimeline(false);
  assert.equal(tl[0].k, 'clunk');
  assert.ok(tl[1].t >= 0.3, 'silence after the clunk');
  for (const k of ['boom', 'whoosh', 'wah', 'clatter', 'crackle']) assert.ok(tl.some(q => q.k === k), k);
});

test('cuesBetween fires each cue once as time advances in any step size', () => {
  const tl = winTimeline(3, false);
  for (const step of [1 / 60, 0.05, 0.1, 0.37]) {
    const fired = [];
    let prev = -1;
    for (let t = 0; t < 5; t += step) { fired.push(...cuesBetween(tl, prev, t)); prev = t; }
    assert.equal(fired.length, tl.length, `step ${step}`);
  }
  assert.deepEqual(cuesBetween(tl, 1, 1), []); assert.deepEqual(cuesBetween(tl, 2, 1), [], 'time never runs backwards');
});
