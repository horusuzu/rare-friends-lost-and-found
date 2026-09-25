import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, tick, tap, comboLevel, strikeInterval } from './game.ts';
import { AUTO_INTERVAL, COMBO_MAX, GEM_P, ROCK_BONUS, ROCK_HP, VEIN_P, strikeRoll } from './economy.ts';
import { TOKEN, run, tapFor, balanced } from './test-kit.mjs';

test('a new mine starts empty, in the mining phase, with sound on', () => {
  const s = newGame(TOKEN, 1);
  assert.equal(s.pot, 0); assert.equal(s.safe, 0); assert.equal(s.streak, 0); assert.equal(s.phase, 'mine');
  assert.equal(s.sound, true); assert.equal(s.rockHp, ROCK_HP); assert.equal(s.depth, 0);
  assert.throws(() => newGame('generations:0', 1)); assert.throws(() => newGame('other:5', 1));
});

test('the Friend mines on its own: one strike per second while idle, coins land in the pot', () => {
  const s = run(newGame(TOKEN, 2), 10);
  assert.equal(s.stats.strikes, 10);
  assert.ok(s.pot >= 10, `pot ${s.pot}`);
  assert.equal(s.pot, s.stats.mined);
  assert.ok(balanced(s));
});

test('engine functions never mutate their input', () => {
  const s = newGame(TOKEN, 3);
  const snap = JSON.stringify(s);
  tick(s, 2); tap(s); run(s, 3);
  assert.equal(JSON.stringify(s), snap);
});

test('the same seed and inputs give the same mine (deterministic events)', () => {
  const a = tapFor(newGame(TOKEN, 44), 30, 4), b = tapFor(newGame(TOKEN, 44), 30, 4);
  assert.deepEqual(a, b);
  const c = tapFor(newGame(TOKEN, 45), 30, 4);
  assert.notDeepEqual(a.stats, c.stats);
});

test('tapping strikes immediately and builds a combo that speeds up auto mining', () => {
  let s = newGame(TOKEN, 4);
  s = tap(s);
  assert.equal(s.stats.strikes, 1); assert.equal(comboLevel(s), 1);
  for (let i = 0; i < 30; i++) s = tick(tap(s), 0.1);
  assert.equal(comboLevel(s), COMBO_MAX, 'combo caps');
  assert.ok(strikeInterval(s) < AUTO_INTERVAL / 2, `interval ${strikeInterval(s)}`);
  s = run(s, 4);
  assert.equal(comboLevel(s), 0, 'combo drains after you stop tapping');
  assert.equal(strikeInterval(s), AUTO_INTERVAL);
});

test('taps faster than the minimum gap are ignored', () => {
  let s = newGame(TOKEN, 5);
  s = tap(tap(tap(s)));
  assert.equal(s.stats.strikes, 1);
  s = tap(tick(s, 0.1));
  assert.equal(s.stats.strikes, 2);
});

test('tapping mines far more than idling', () => {
  const idle = run(newGame(TOKEN, 6), 60), busy = tapFor(newGame(TOKEN, 6), 60, 5);
  assert.ok(busy.stats.mined > idle.stats.mined * 4, `idle ${idle.stats.mined} busy ${busy.stats.mined}`);
});

test('the first real choice comes within 30-60 s of idle play', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = run(newGame(TOKEN, seed), 45);
    assert.ok(s.pot >= 100 && s.pot <= 400, `seed ${seed}: pot ${s.pot} after 45 s`);
  }
});

test('every ROCK_HP strikes the rock breaks: depth grows and a bonus is paid', () => {
  let s = newGame(TOKEN, 7);
  s = run(s, ROCK_HP - 1 + 0.5);
  assert.equal(s.depth, 0); assert.equal(s.rockHp, 1);
  s = run(s, 1);
  assert.equal(s.depth, 1); assert.equal(s.rockHp, ROCK_HP); assert.equal(s.stats.rocks, 1);
  assert.ok(s.fx.some(f => f.kind === 'break' && f.coins === ROCK_BONUS));
});

test('strike rolls: base 1-3 coins, gold veins and gems at their documented rates', () => {
  let seed = 99, veins = 0, gems = 0, n = 200_000;
  const bases = new Set();
  for (let i = 0; i < n; i++) {
    const r = strikeRoll(seed, 5); seed = r.seed; bases.add(r.base);
    if (r.kind === 'vein') { veins++; assert.ok(r.extra >= 12 && r.extra <= 30); }
    if (r.kind === 'gem') { gems++; assert.ok(r.extra >= 60 && r.extra <= 120); }
    if (r.kind === 'strike') assert.equal(r.extra, 0);
  }
  assert.deepEqual([...bases].sort(), [1, 2, 3]);
  assert.ok(Math.abs(veins / n - VEIN_P) < 0.002, `vein rate ${veins / n}`);
  assert.ok(Math.abs(gems / n - GEM_P) < 0.001, `gem rate ${gems / n}`);
});

test('strike effects are queued for the presentation with increasing ids', () => {
  const s = tapFor(newGame(TOKEN, 8), 20, 5);
  const ids = s.fx.map(f => f.id);
  assert.ok(ids.length > 0 && ids.length <= 24);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(s.fxId, ids.at(-1));
  assert.ok(s.fx.some(f => f.tap) && s.fx.every(f => ['strike', 'vein', 'gem', 'break'].includes(f.kind)));
});

test('a long tick is clamped so a background tab cannot mine for hours at once', () => {
  const s = tick(newGame(TOKEN, 9), 3600);
  assert.ok(s.stats.strikes <= 2, `strikes ${s.stats.strikes}`);
  assert.equal(tick(newGame(TOKEN, 9), -5).stats.strikes, 0);
  assert.equal(tick(newGame(TOKEN, 9), Number.NaN).stats.strikes, 0);
});

test('the engine asks for a save every 20 strikes', () => {
  const s = run(newGame(TOKEN, 10), 41);
  assert.equal(s.saveTick, 2);
});
