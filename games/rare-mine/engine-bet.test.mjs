import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, tick, tap, withdraw, askBet, cancelBet, confirmBet, skipRoll, betOutcome, setSound } from './game.ts';
import { MAX_STREAK, PAYOUT, ROLL_TIME, WIN_CHANCE } from './economy.ts';
import { mix } from './rng.ts';
import { TOKEN, withPot, run, balanced } from './test-kit.mjs';

/** Place one bet with a pre-computed outcome, skipping the suspense. */
const bet = s => skipRoll(confirmBet(askBet(s)));
/** Search seeds for a mine whose next bets come out as `pattern` (true = win). */
function seedFor(pattern) {
  for (let seed = 1; seed < 10_000; seed++) {
    let b = newGame(TOKEN, seed).betSeed, ok = true;
    for (const want of pattern) { const [win, next] = betOutcome(b); if (win !== want) { ok = false; break; } b = next; }
    if (ok) return seed;
  }
  throw new Error('no seed');
}

test('the bet win rate converges to 45 % over many seeds', () => {
  let wins = 0; const n = 40_000;
  for (let i = 0; i < n; i++) if (betOutcome(mix(i, 0xbe7))[0]) wins++;
  assert.ok(Math.abs(wins / n - WIN_CHANCE) < 0.006, `first-bet win rate ${wins / n}`);
  let seed = 12345, streamWins = 0;
  for (let i = 0; i < n; i++) { const [win, next] = betOutcome(seed); seed = next; if (win) streamWins++; }
  assert.ok(Math.abs(streamWins / n - WIN_CHANCE) < 0.006, `stream win rate ${streamWins / n}`);
  let games = 0;
  for (let i = 0; i < 20_000; i++) if (bet(withPot(i, 50)).pot > 0) games++;
  assert.ok(Math.abs(games / 20_000 - WIN_CHANCE) < 0.01, `in-game win rate ${games / 20_000}`);
});

test('the expected value of a bet is 0.9x the stake: 10 % burns on average', () => {
  let out = 0, burned = 0; const n = 20_000, stake = 100;
  for (let i = 0; i < n; i++) { const s = bet(withPot(i, stake)); out += s.pot; burned += s.stats.burned; }
  assert.ok(Math.abs(out / (n * stake) - WIN_CHANCE * PAYOUT) < 0.02, `EV ${out / (n * stake)}`);
  assert.ok(Math.abs(burned / (n * stake) - (1 - WIN_CHANCE)) < 0.01);
});

test('asking to bet shows the odds first; cancel returns to mining untouched', () => {
  const s = withPot(1, 80);
  const asked = askBet(s);
  assert.equal(asked.phase, 'confirm'); assert.equal(asked.pot, 80);
  assert.deepEqual(cancelBet(asked), { ...s, phase: 'mine' });
  assert.equal(askBet(newGame(TOKEN, 1)).phase, 'mine', 'no bet with an empty pot');
  assert.equal(confirmBet(s).phase, 'mine', 'confirm only after asking');
});

test('mining pauses while the odds are shown and during the suspense', () => {
  const asked = askBet(withPot(2, 80));
  assert.equal(run(asked, 3).stats.strikes, 0);
  assert.equal(tap(asked).stats.strikes, 0);
  const rolling = confirmBet(asked);
  assert.equal(rolling.phase, 'roll'); assert.equal(rolling.roll.stake, 80);
  assert.equal(tick(rolling, ROLL_TIME / 2).stats.strikes, 0);
});

test('a win doubles the pot, keeps it at risk and starts a streak', () => {
  const s = bet(withPot(seedFor([true]), 100));
  assert.equal(s.pot, 200); assert.equal(s.streak, 1); assert.equal(s.safe, 0); assert.equal(s.phase, 'mine');
  assert.equal(s.stats.betsWon, 1); assert.equal(s.stats.winnings, 100); assert.equal(s.stats.bestStreak, 1);
  assert.deepEqual({ win: s.last.win, stake: s.last.stake, pot: s.last.pot, streak: s.last.streak }, { win: true, stake: 100, pot: 200, streak: 1 });
  assert.ok(s.fx.some(f => f.kind === 'win' && f.coins === 100));
  assert.ok(balanced(s));
});

test('streaks double again and again: x2, x4, x8', () => {
  let s = withPot(seedFor([true, true, true]), 50);
  s = bet(s); assert.equal(s.pot, 100);
  s = bet(s); assert.equal(s.pot, 200); assert.equal(s.streak, 2);
  s = bet(s); assert.equal(s.pot, 400); assert.equal(s.streak, 3);
  assert.equal(s.stats.bestStreak, 3); assert.equal(s.stats.staked, 350);
  assert.ok(balanced(s));
});

test('a loss burns the whole stake and resets the streak', () => {
  let s = withPot(seedFor([true, false]), 60);
  s = bet(s); assert.equal(s.pot, 120);
  s = bet(s);
  assert.equal(s.pot, 0); assert.equal(s.streak, 0); assert.equal(s.stats.burned, 120);
  assert.equal(s.stats.betsLost, 1); assert.equal(s.stats.bestStreak, 1);
  assert.equal(s.last.win, false); assert.equal(s.last.stake, 120);
  assert.ok(s.fx.some(f => f.kind === 'burn' && f.coins === 120));
  assert.ok(balanced(s));
});

test('the outcome is fixed when the bet is confirmed; the suspense only reveals it', () => {
  const seed = seedFor([false]);
  const rolling = confirmBet(askBet(withPot(seed, 90)));
  assert.equal(rolling.roll.win, false);
  assert.equal(rolling.pot, 90, 'the pot is shown until the reveal');
  assert.equal(rolling.stats.burned, 0);
  const half = tick(rolling, ROLL_TIME / 2); assert.equal(half.phase, 'roll');
  const done = run(rolling, ROLL_TIME + 0.1);
  assert.equal(done.phase, 'mine'); assert.equal(done.stats.burned, 90);
  assert.deepEqual(skipRoll(rolling).stats, done.stats);
  assert.equal(tap(rolling).phase, 'mine', 'a tap skips the suspense');
  assert.equal(confirmBet(askBet(withPot(seed, 90)), 0.3).roll.left, 0.3, 'reduced motion uses a short reveal');
});

test('withdraw moves the pot to the safe balance and ends the streak', () => {
  let s = bet(withPot(seedFor([true]), 70));
  s = withdraw(s);
  assert.equal(s.safe, 140); assert.equal(s.pot, 0); assert.equal(s.streak, 0);
  assert.equal(s.stats.withdrawn, 140); assert.equal(s.stats.bestStreak, 1);
  assert.ok(s.fx.some(f => f.kind === 'withdraw' && f.coins === 140));
  assert.ok(balanced(s));
  assert.equal(withdraw(newGame(TOKEN, 3)).safe, 0, 'nothing to withdraw');
  const asked = askBet(withPot(4, 30));
  assert.equal(withdraw(asked).safe, 30, 'withdraw is always available, even with the odds on screen');
  assert.equal(withdraw(asked).phase, 'mine');
  const rolling = confirmBet(askBet(withPot(4, 30)));
  assert.equal(withdraw(rolling), rolling, 'a staked pot cannot be withdrawn mid-roll');
});

test('stats totals add up over a long session of mining, betting and withdrawing', () => {
  let s = newGame(TOKEN, 77);
  for (let round = 0; round < 60; round++) {
    s = run(s, 5);
    if (round % 3 === 0) s = withdraw(s);
    else s = run(confirmBet(askBet(s)), ROLL_TIME + 0.05);
    assert.ok(balanced(s), `round ${round}`);
  }
  const t = s.stats;
  assert.ok(t.betsWon > 5 && t.betsLost > 5, `${t.betsWon} won / ${t.betsLost} lost`);
  assert.ok(t.burned > 0 && t.withdrawn > 0);
  assert.ok(t.bestStreak >= 1);
});

test('the streak is capped; at the cap only withdraw is offered', () => {
  const s = { ...withPot(5, 10), streak: MAX_STREAK };
  assert.equal(askBet(s).phase, 'mine');
  assert.equal(withdraw(s).safe, 10);
});

test('confirming and settling a bet ask for a save; the sound toggle too', () => {
  const s = withPot(6, 10);
  assert.ok(confirmBet(askBet(s)).saveTick > s.saveTick);
  assert.ok(withdraw(s).saveTick > s.saveTick);
  const quiet = setSound(s, false);
  assert.equal(quiet.sound, false); assert.ok(quiet.saveTick > s.saveTick);
  assert.equal(setSound(quiet, true).sound, true);
});
