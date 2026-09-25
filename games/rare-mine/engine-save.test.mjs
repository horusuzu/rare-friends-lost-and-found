import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, withdraw, askBet, confirmBet, skipRoll, setSound, betOutcome, rested } from './game.ts';
import { serialize, loadGame, SAVE_LIMIT } from './save.ts';
import { TOKEN, GENESIS, run, tapFor, withPot } from './test-kit.mjs';

const kept = s => ({ pot: s.pot, streak: s.streak, safe: s.safe, stats: s.stats, depth: s.depth, rockHp: s.rockHp, mineSeed: s.mineSeed, betSeed: s.betSeed, sound: s.sound });
function played(seed) {
  let s = tapFor(newGame(TOKEN, seed), 20, 4);
  s = withdraw(s); s = run(s, 10);
  s = skipRoll(confirmBet(askBet(s))); s = run(s, 7);
  return s;
}

test('save round trip keeps the pot, streak, safe balance, stats, rock and RNG streams', () => {
  const s = played(3);
  const back = loadGame(serialize(s), TOKEN);
  assert.deepEqual(kept(back), kept(s));
  assert.equal(back.phase, 'mine'); assert.equal(back.token, TOKEN);
  assert.deepEqual(kept(run(back, 30)), kept(run(rested(s), 30)), 'deterministic after reload (timers restart)');
});

test('the sound setting persists in the save', () => {
  const quiet = setSound(played(4), false);
  assert.equal(loadGame(serialize(quiet), TOKEN).sound, false);
  assert.equal(loadGame(serialize(setSound(quiet, true)), TOKEN).sound, true);
});

test('a save made during the suspense is already settled: reloading cannot undo a burn', () => {
  let seed = 1;
  while (betOutcome(newGame(TOKEN, seed).betSeed)[0]) seed++;
  const rolling = confirmBet(askBet(withPot(seed, 250)));
  const back = loadGame(serialize(rolling), TOKEN);
  assert.equal(back.pot, 0); assert.equal(back.stats.burned, 250); assert.equal(back.phase, 'mine');
  const asked = askBet(withPot(seed, 250));
  assert.equal(loadGame(serialize(asked), TOKEN).pot, 250, 'an unconfirmed bet is just the pot');
});

test('saves stay compact', () => {
  const s = { ...played(5), pot: 9e14, safe: 9e14 };
  assert.ok(serialize(s).length < 600, `size ${serialize(s).length}`);
});

test('empty storage loads nothing; malformed or tampered saves are rejected', () => {
  assert.equal(loadGame(null, TOKEN), null); assert.equal(loadGame('', TOKEN), null);
  const good = JSON.parse(serialize(played(6)));
  const at = (key, i, v) => ({ ...good, [key]: good[key].map((x, j) => j === i ? v : x) });
  const bad = [
    'not json', '[]', 'null', '{"v":9}',
    { ...good, v: 2 }, { ...good, t: 'generations:1' }, { ...good, t: GENESIS },
    { ...good, g: [1] }, at('g', 0, -1), at('g', 1, 2 ** 32),
    at('p', 0, good.p[0] + 1), at('p', 0, -1), at('p', 2, good.p[2] + 1000), at('p', 1, 99), at('p', 3, good.p[3] + 1), at('p', 4, 0), at('p', 0, 1.5),
    at('s', 0, good.s[0] + 1), at('s', 2, good.s[2] + 5), at('s', 6, -1), at('s', 7, 1e9), at('s', 9, 1e9), at('s', 8, good.s[8] + 1),
    { ...good, s: good.s.slice(1) }, { ...good, a: 2 }, { ...good, a: 'yes' },
  ];
  for (const b of bad) assert.throws(() => loadGame(typeof b === 'string' ? b : JSON.stringify(b), TOKEN), undefined, JSON.stringify(b).slice(0, 120));
  assert.throws(() => loadGame('x'.repeat(SAVE_LIMIT + 1), TOKEN));
});

test('Genesis and Generations saves are namespaced separately', () => {
  const raw = serialize(run(newGame(GENESIS, 1), 5));
  assert.throws(() => loadGame(raw, TOKEN));
  assert.equal(loadGame(raw, GENESIS).token, GENESIS);
});
