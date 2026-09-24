import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from './game.ts';
import { playDive } from './bot.mjs';
import { playDiveSkilled } from './bot-skilled.mjs';
import { TOKEN } from './test-kit.mjs';

const SEEDS = 40;
const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

function survey(play) {
  const runs = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = play(newGame(TOKEN, seed * 7777));
    runs.push({ result: r.result, floor: r.floor, turns: r.turns, level: r.level, cause: r.cause?.[1] ?? '' });
  }
  const clears = runs.filter(r => r.result === 'clear'), deaths = runs.filter(r => r.result === 'dead');
  return { runs, clears, deaths, early: deaths.filter(r => r.floor <= 3), deep: deaths.filter(r => r.floor >= 5) };
}

test('a first dive is a real roguelike: a skilled player sometimes reaches the bottom, most dives end deep', () => {
  const s = survey(playDiveSkilled);
  console.log(JSON.stringify({ clears: s.clears.length, deaths: s.deaths.length, early: s.early.length, deep: s.deep.length,
    clearTurns: avg(s.clears.map(r => r.turns)), clearLevel: avg(s.clears.map(r => r.level)), deathFloors: s.deaths.map(r => r.floor).join(',') }));
  assert.equal(s.runs.filter(r => r.result === 'timeout').length, 0, 'no run stalls');
  assert.ok(s.clears.length >= SEEDS * 0.05, `the hollow can be cleared (${s.clears.length}/${SEEDS})`);
  assert.ok(s.clears.length <= SEEDS * 0.35, `not too easy: a skilled first dive rarely clears (${s.clears.length}/${SEEDS})`);
  assert.ok(s.early.length >= 1, `floors 1-3 carry some danger (${s.early.length} early deaths)`);
  assert.ok(s.early.length <= SEEDS * 0.15, `floors 1-3 stay fair (${s.early.length} early deaths)`);
  assert.ok(s.deep.length >= s.deaths.length * 0.6, `most deaths come from floor 5 on (${s.deep.length}/${s.deaths.length})`);
  assert.ok(s.clears.every(r => r.turns >= 800 && r.turns <= 2600), `a clear is a 15-25 minute dive: ${s.clears.map(r => r.turns)}`);
});

test('careless play is punished: a player who never aims items does worse than a skilled one', () => {
  const basic = survey(playDive), skilled = survey(playDiveSkilled);
  assert.equal(basic.runs.filter(r => r.result === 'timeout').length, 0, 'no run stalls');
  assert.ok(basic.clears.length <= skilled.clears.length, `basic ${basic.clears.length} <= skilled ${skilled.clears.length}`);
  assert.ok(avg(basic.deaths.map(r => r.floor)) <= avg(skilled.deaths.map(r => r.floor)) + 1, 'skill carries you deeper');
});
