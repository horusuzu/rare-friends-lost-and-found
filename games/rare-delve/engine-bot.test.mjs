import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from './game.ts';
import { playDive } from './bot.mjs';
import { TOKEN } from './test-kit.mjs';

test('a scripted player can clear the hollow; early floors are gentle, late floors are tense', () => {
  const runs = [];
  for (let seed = 1; seed <= 40; seed++) {
    const r = playDive(newGame(TOKEN, seed * 7777));
    runs.push({ seed, result: r.result, floor: r.floor, turns: r.turns, level: r.level, cause: r.cause?.[1] ?? '' });
  }
  const clears = runs.filter(r => r.result === 'clear'), deaths = runs.filter(r => r.result === 'dead');
  const early = deaths.filter(r => r.floor <= 3), late = deaths.filter(r => r.floor >= 7);
  const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const stats = { runs: runs.length, clears: clears.length, deaths: deaths.length, earlyDeaths: early.length, lateDeaths: late.length,
    other: runs.length - clears.length - deaths.length, clearTurns: avg(clears.map(r => r.turns)), clearLevel: avg(clears.map(r => r.level)),
    deathFloors: deaths.map(r => r.floor).join(','), causes: [...new Set(deaths.map(r => r.cause))].join(' | ') };
  console.log(JSON.stringify(stats));
  assert.equal(runs.filter(r => r.result === 'timeout').length, 0, 'no run stalls');
  assert.ok(clears.length >= runs.length * 0.2, `the hollow can be cleared (${clears.length}/${runs.length})`);
  assert.ok(deaths.length >= runs.length * 0.2, `deaths happen (${deaths.length})`);
  assert.ok(early.length <= runs.length * 0.1, `floors 1-3 are gentle (${early.length} early deaths)`);
  assert.ok(late.length >= deaths.length * 0.4, `most deaths come deep (${late.length}/${deaths.length})`);
  assert.ok(clears.every(r => r.turns >= 800 && r.turns <= 2600), `a clear is a 15-25 minute dive: ${clears.map(r => r.turns)}`);
});
