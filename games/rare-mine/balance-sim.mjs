/** Prints Rare Mine's measured pace and odds: `node games/rare-mine/balance-sim.mjs [seeds]`. Not shipped. */
import { newGame, betOutcome } from './game.ts';
import { EXPECTED_STRIKE, WIN_CHANCE } from './economy.ts';
import { mix } from './rng.ts';
import { TOKEN, run, tapFor } from './test-kit.mjs';

const seeds = Number(process.argv[2] ?? 40);
const avg = f => { let n = 0; for (let i = 1; i <= seeds; i++) n += f(i); return n / seeds; };
const idle = avg(i => run(newGame(TOKEN, i), 60).stats.mined);
const tap3 = avg(i => tapFor(newGame(TOKEN, i), 60, 3).stats.mined);
const tap6 = avg(i => tapFor(newGame(TOKEN, i), 60, 6).stats.mined);
const first = avg(i => { let s = newGame(TOKEN, i), t = 0; while (s.pot < 150) { s = run(s, 1); t++; } return t; });
const long = tapFor(newGame(TOKEN, 1), 3600, 2).stats;
let wins = 0; const bets = 100_000;
for (let i = 0; i < bets; i++) if (betOutcome(mix(i, 7))[0]) wins++;
console.log(JSON.stringify({
  expectedCoinsPerStrike: +EXPECTED_STRIKE.toFixed(3), idlePerMin: Math.round(idle), tap3PerMin: Math.round(tap3), tap6PerMin: Math.round(tap6),
  secondsTo150Idle: +first.toFixed(1), hourAt2Taps: { strikes: long.strikes, veinRate: +(long.veins / long.strikes).toFixed(4), gemRate: +(long.gems / long.strikes).toFixed(4) },
  winRate: wins / bets, winChance: WIN_CHANCE, evPerStake: WIN_CHANCE * 2,
}, null, 1));
