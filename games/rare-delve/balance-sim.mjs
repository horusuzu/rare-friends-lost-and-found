// Balance report (dev tool, not shipped): node games/rare-delve/balance-sim.mjs [runs]
import { newGame } from './game.ts';
import { playDive } from './bot.mjs';
import { playDiveSkilled } from './bot-skilled.mjs';
import { TOKEN } from './test-kit.mjs';

const N = Number(process.argv[2] ?? 60);
for (const [name, play] of [['basic', playDive], ['skilled', playDiveSkilled]]) {
  const runs = [];
  for (let i = 1; i <= N; i++) runs.push(play(newGame(TOKEN, i * 7777)));
  const by = k => runs.filter(r => r.result === k);
  const floors = Array(11).fill(0); by('dead').forEach(r => floors[r.floor]++);
  const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const clears = by('clear');
  console.log(name.padEnd(8), `clear ${clears.length}/${N} (${Math.round(clears.length / N * 100)}%)`, `dead ${by('dead').length}`, `home ${by('home').length} timeout ${by('timeout').length}`,
    `| deaths by floor 1-10: ${floors.slice(1).join(' ')}`, `| clear turns ${avg(clears.map(r => r.turns))} lv ${avg(clears.map(r => r.level))}`);
}
