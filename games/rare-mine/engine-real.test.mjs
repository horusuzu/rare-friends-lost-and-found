import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STREAK } from './economy.ts';
import { betOutcome, askBet, cancelBet, newGame, realBank, realRoll, realStrike, syncReal, tap, tick, settle, skipRoll } from './game.ts';
import { accrued, balancedReal, canRealBet, newLedger, realBet, realClaimed, realPot, realWithdraw } from './real.ts';
import { TOKEN, GENESIS, run } from './test-kit.mjs';

const RF = 10n ** 18n;
/** mined-equivalent + winnings = withdrawn + burned + pot, at the given real earned value. */
const identity = (l, earned) => l.realized + accrued(l, earned) + l.winnings === l.withdrawn + l.burned + realPot(l, earned)
  && l.staked === l.winnings + l.burned && balancedReal(l);
/** A ledger whose next bets come out as `pattern` (true = win). */
function ledgerFor(pattern) {
  for (let seed = 1; seed < 10_000; seed++) {
    const l = newLedger(TOKEN, seed);
    let b = l.betSeed, ok = true;
    for (const want of pattern) { const [win, next] = betOutcome(b); if (win !== want) { ok = false; break; } b = next; }
    if (ok) return l;
  }
  throw new Error('no seed');
}

test('the first-ever baseline is 0, so the first pot is the whole claimable amount', () => {
  const l = newLedger(TOKEN, 1);
  assert.equal(l.baseline, 0n); assert.equal(l.bonus, 0n); assert.equal(l.streak, 0);
  assert.equal(realPot(l, 38_529n * RF), 38_529n * RF);
  assert.ok(identity(l, 38_529n * RF));
  assert.notEqual(newLedger(TOKEN, 1).betSeed, newLedger(GENESIS, 1).betSeed, 'two NFTs never share a bet stream');
});

test('the pot is real accrual since the baseline plus the streak bonus, never negative', () => {
  const l = { ...newLedger(TOKEN, 1), baseline: 100n * RF, bonus: 0n };
  assert.equal(realPot(l, 130n * RF), 30n * RF);
  assert.equal(realPot(l, 90n * RF), 0n, 'below the baseline the pot is empty, not negative');
  assert.equal(accrued(l, 90n * RF), 0n);
});

test('withdraw records the pot, moves the baseline to the current real value and ends the streak', () => {
  const l0 = newLedger(TOKEN, 1);
  const l1 = realWithdraw(l0, 500n * RF);
  assert.equal(l1.withdrawn, 500n * RF); assert.equal(l1.baseline, 500n * RF); assert.equal(l1.realized, 500n * RF);
  assert.equal(realPot(l1, 500n * RF), 0n); assert.equal(realPot(l1, 503n * RF), 3n * RF, 'accrual continues after a withdraw');
  assert.ok(identity(l1, 503n * RF));
  assert.equal(realWithdraw(l1, 500n * RF), l1, 'an empty pot changes nothing');
  assert.equal(realWithdraw(l1, 400n * RF).baseline, 500n * RF, 'the baseline never moves backwards on a withdraw');
  assert.deepEqual(l0, newLedger(TOKEN, 1), 'the input is not mutated');
});

test('a win adds the stake to the streak bonus: the pot doubles, stays at risk, and real accrual continues on top', () => {
  const l0 = ledgerFor([true, true]);
  const r = realBet(l0, 100n * RF);
  assert.equal(r.win, true); assert.equal(r.stake, 100n * RF); assert.equal(r.pot, 200n * RF);
  assert.equal(r.ledger.bonus, 100n * RF); assert.equal(r.ledger.baseline, 0n); assert.equal(r.ledger.streak, 1);
  assert.equal(realPot(r.ledger, 100n * RF), 200n * RF);
  assert.equal(realPot(r.ledger, 101n * RF), 201n * RF, 'real accrual continues on top');
  assert.ok(identity(r.ledger, 101n * RF));
  const r2 = realBet(r.ledger, 101n * RF);
  assert.equal(r2.win, true); assert.equal(r2.stake, 201n * RF); assert.equal(realPot(r2.ledger, 101n * RF), 402n * RF);
  assert.equal(r2.ledger.streak, 2); assert.equal(r2.ledger.bestStreak, 2);
  assert.ok(identity(r2.ledger, 150n * RF));
});

test('a loss burns the pot, moves the baseline to the real value at that moment and ends the streak', () => {
  const l0 = ledgerFor([true, false]);
  const won = realBet(l0, 100n * RF).ledger;
  const r = realBet(won, 110n * RF);
  assert.equal(r.win, false); assert.equal(r.stake, 210n * RF); assert.equal(r.pot, 0n);
  assert.equal(r.ledger.burned, 210n * RF); assert.equal(r.ledger.baseline, 110n * RF); assert.equal(r.ledger.bonus, 0n);
  assert.equal(r.ledger.streak, 0); assert.equal(r.ledger.betsLost, 1); assert.equal(r.ledger.betsWon, 1);
  assert.equal(realPot(r.ledger, 110n * RF), 0n); assert.equal(realPot(r.ledger, 112n * RF), 2n * RF);
  assert.ok(identity(r.ledger, 112n * RF));
});

test('the outcome comes from the seeded bet stream; the stream advances once per bet', () => {
  const l = newLedger(TOKEN, 42);
  const [win, next] = betOutcome(l.betSeed);
  const r = realBet(l, 7n * RF);
  assert.equal(r.win, win); assert.equal(r.ledger.betSeed, next);
  assert.equal(realBet(l, 7n * RF).win, win, 'deterministic');
});

test('no bet on an empty pot, and the streak is capped', () => {
  const l = newLedger(TOKEN, 1);
  assert.equal(canRealBet(l, 0n), false); assert.equal(realBet(l, 0n), null);
  const capped = { ...l, streak: MAX_STREAK, bestStreak: MAX_STREAK, betsWon: MAX_STREAK, bonus: RF, winnings: RF, staked: RF, withdrawn: 0n, realized: 0n };
  assert.equal(canRealBet(capped, 5n * RF), false); assert.equal(realBet(capped, 5n * RF), null);
});

test('a drop in the real value (claimed on the official site) banks the pot and restarts cleanly from the new value', () => {
  const won = realBet(ledgerFor([true]), 100n * RF).ledger;
  const l = realClaimed(won, 120n * RF, 2n * RF);
  assert.equal(realPot(l, 2n * RF), 0n, 'no negative pot, no stale bonus');
  assert.equal(l.baseline, 2n * RF); assert.equal(l.bonus, 0n); assert.equal(l.streak, 0);
  assert.equal(l.withdrawn, 220n * RF, 'the pot as last seen is recorded');
  assert.equal(l.claims, 1);
  assert.equal(realPot(l, 3n * RF), RF, 'accrual after the claim fills the pot again');
  assert.ok(identity(l, 3n * RF));
  assert.equal(realClaimed(won, 120n * RF, 121n * RF), won, 'a rise is not a claim');
});

test('the ledger identities hold over a long session of accrual, bets, withdraws and claims', () => {
  let l = newLedger(TOKEN, 9), earned = 38_529n * RF;
  for (let i = 0; i < 400; i++) {
    earned += 16n * RF / 60n * BigInt(1 + (i % 7));
    if (i % 97 === 96) { l = realClaimed(l, earned, RF / 10n); earned = RF / 10n; }
    else if (i % 5 === 4) l = realWithdraw(l, earned);
    else if (canRealBet(l, earned)) l = realBet(l, earned).ledger;
    assert.ok(identity(l, earned), `step ${i}`);
    assert.ok(realPot(l, earned) >= 0n);
  }
  assert.ok(l.betsWon > 20 && l.betsLost > 20, `${l.betsWon} won, ${l.betsLost} lost`);
});

test('real mode shell: the Friend strikes only when real coins are due; taps are cosmetic and never add to the pot', () => {
  const s0 = newGame(TOKEN, 3, true, 'real');
  assert.equal(s0.mode, 'real');
  const idle = run(s0, 5);
  assert.equal(idle.stats.strikes, 0, 'no simulated auto mining in real mode');
  assert.equal(idle.fx.length, 0);
  const struck = realStrike(s0, 3);
  assert.equal(struck.stats.strikes, 1); assert.equal(struck.fx.at(-1).kind, 'strike'); assert.equal(struck.fx.at(-1).coins, 3);
  assert.ok(!struck.fx.at(-1).cosmetic);
  assert.equal(struck.pot, s0.pot, 'the pot mirrors the ledger only through syncReal');
  const synced = syncReal(s0, 40.5, 2, 1);
  assert.deepEqual([synced.pot, synced.safe, synced.streak], [40.5, 2, 1]);
  assert.equal(syncReal(synced, 40.5, 2, 1), synced, 'an unchanged mirror returns the same state');
  let t = synced;
  for (let i = 0; i < 12; i++) { t = tap(t); t = tick(t, 0.1); }
  assert.equal(t.pot, 40.5, 'taps cannot create RF');
  assert.ok(t.combo > 1 && t.stats.strikes >= 10, 'taps still strike and build the combo');
  assert.ok(t.fx.filter(f => f.tap).every(f => f.cosmetic && (f.kind === 'strike' || f.kind === 'break')), 'tap strikes are cosmetic: no veins or gems');
  for (let i = 0; i < 20; i++) t = realStrike(t, 1);
  assert.equal(t.stats.mined, 0, 'nothing is mined in the simulated sense');
});

test('real mode shell: odds first, a fixed outcome rolls with suspense, then the reveal', () => {
  const s = syncReal(newGame(TOKEN, 3, true, 'real'), 100, 0, 0);
  const asked = askBet(s);
  assert.equal(asked.phase, 'confirm'); assert.equal(cancelBet(asked).phase, 'mine');
  const rolling = realRoll(asked, false, 100, 1.6);
  assert.equal(rolling.phase, 'roll'); assert.equal(rolling.roll.stake, 100); assert.equal(rolling.roll.win, false);
  assert.equal(realRoll(s, true, 100, 1.6), s, 'no roll without the odds on screen');
  const mid = tick(rolling, 0.5);
  assert.equal(mid.phase, 'roll');
  const done = run(mid, 2);
  assert.equal(done.phase, 'mine'); assert.equal(done.last.win, false); assert.equal(done.last.stake, 100);
  assert.equal(done.fx.at(-1).kind, 'burn');
  assert.equal(done.stats.burned, 0, 'the real ledger, not the shell, keeps the totals');
  const won = settle(realRoll(asked, true, 100, 1.6));
  assert.equal(won.last.win, true); assert.equal(won.last.pot, 200); assert.equal(won.fx.at(-1).kind, 'win');
  assert.equal(skipRoll(realRoll(asked, true, 100, 1.6)).phase, 'mine');
  const banked = realBank(syncReal(s, 50, 0, 0), 50);
  assert.equal(banked.fx.at(-1).kind, 'withdraw'); assert.equal(banked.fx.at(-1).coins, 50); assert.equal(banked.phase, 'mine');
});
