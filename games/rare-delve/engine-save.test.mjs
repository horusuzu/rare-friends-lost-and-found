import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, loadGame, SAVE_LIMIT } from './save.ts';
import { newGame, press } from './game.ts';
import { act } from './turn.ts';
import { makeItem } from './items.ts';
import { BAG_MAX, CHEST_MAX } from './data.ts';
import { TOKEN, dive } from './test-kit.mjs';

const essentials = s => ({ meta: s.meta, chest: s.chest, hero: s.hero, run: s.run && { ...s.run, map: s.run.map.tiles } });
const walk = (s, n) => { const dirs = ['e', 's', 'w', 'n', 'se', 'nw']; for (let i = 0; i < n; i++) s = act(s, { k: 'move', dir: dirs[i % dirs.length] }); return s; };

test('town round trip: purse, shop, chest, bag and gear', () => {
  const base = newGame(TOKEN, 9);
  const s = { ...base, meta: { purse: 1234, shopLv: 2, clears: 1, dives: 4, best: 7 }, chest: [makeItem('loaf'), makeItem('crystal', { e: 3 })],
    hero: { ...base.hero, bag: [makeItem('geode'), makeItem('w_lull', { c: 2 })], weapon: makeItem('pick', { e: 1 }), shield: null } };
  const back = loadGame(serialize(s), TOKEN, 1);
  assert.deepEqual(essentials(back), essentials(s)); assert.equal(back.scene.k, 'town'); assert.equal(back.seed, 9);
});

test('mid-dungeon suspend: the floor, monsters, items, traps, fog and knowledge come back and play on identically', () => {
  let s = walk(dive(21), 25);
  s = { ...s, hero: { ...s.hero, bag: [makeItem('p_mend'), makeItem('dart', { c: 6 })], gold: 88, conf: 2 }, run: { ...s.run, known: ['p_mend'], sight: true } };
  const raw = serialize(s);
  const back = loadGame(raw, TOKEN, 1);
  assert.deepEqual(essentials(back), essentials(s));
  assert.equal(back.scene.k, 'dungeon');
  const a = walk(s, 30), b = walk(back, 30);
  assert.equal(serialize(a), serialize(b), 'deterministic after resume');
});

test('saves stay compact even with a full bag, chest and busy floor', () => {
  let s = dive(33);
  const many = Array.from({ length: BAG_MAX }, (_, i) => makeItem(i % 2 ? 'w_gust' : 'cleaver', i % 2 ? { c: 5 } : { e: 9 }));
  s = { ...s, chest: many.slice(0, CHEST_MAX), hero: { ...s.hero, bag: many }, run: { ...s.run, seen: '1'.repeat(s.run.seen.length),
    items: s.run.items.concat(Array.from({ length: 30 }, (_, i) => ({ x: s.hero.x, y: s.hero.y, item: makeItem('opal') }))) } };
  const raw = serialize(s);
  assert.ok(raw.length < 8 * 1024, `size ${raw.length}`);
  assert.ok(loadGame(raw, TOKEN, 1));
});

test('empty storage loads nothing; malformed or tampered saves are rejected', () => {
  assert.equal(loadGame(null, TOKEN, 1), null); assert.equal(loadGame('', TOKEN, 1), null);
  const town = JSON.parse(serialize(newGame(TOKEN, 3)));
  const deep = JSON.parse(serialize(walk(dive(4), 6)));
  const r = deep.r;
  const bad = [
    'not json', '[]', '{"v":9}', 'null',
    { ...town, t: 'generations:1' }, { ...town, s: -1 }, { ...town, m: [1, 9, 0, 0, 0] }, { ...town, m: [-5, 1, 0, 0, 0] }, { ...town, m: [0, 1, 0] },
    { ...town, c: Array(CHEST_MAX + 1).fill('bun') }, { ...town, c: ['laser'] }, { ...town, b: Array(BAG_MAX + 1).fill('bun') }, { ...town, b: ['knife+99'] },
    { ...town, e: ['bun', ''] }, { ...town, e: ['', 'knife'] }, { ...town, e: [''] },
    { ...deep, r: { ...r, f: 11 } }, { ...deep, r: { ...r, f: 0 } },
    { ...deep, r: { ...r, h: r.h.map((v, i) => i === 0 ? 0 : v) } },
    { ...deep, r: { ...r, h: r.h.map((v, i) => i === 0 ? 9999 : v) } },
    { ...deep, r: { ...r, h: r.h.map((v, i) => i === 10 ? 0 : v).map((v, i) => i === 11 ? 0 : v) } },
    { ...deep, r: { ...r, h: r.h.slice(1) } },
    { ...deep, r: { ...r, v: 'zz' } }, { ...deep, r: { ...r, v: r.v.slice(2) } },
    { ...deep, r: { ...r, i: [[0, 0, 'bun']] } }, { ...deep, r: { ...r, i: [[r.h[10], r.h[11], 'sword']] } },
    { ...deep, r: { ...r, p: [[r.h[10], r.h[11], 'lava', 1]] } },
    { ...deep, r: { ...r, m: [[1, 'dragon', r.h[10], r.h[11], 5, 0, 0, 0, 0, 0, 0, 0]] } },
    { ...deep, r: { ...r, m: [[1, 'newt', 0, 0, 5, 0, 0, 0, 0, 0, 0, 0]] } },
    { ...deep, r: { ...r, m: [[1, 'newt', r.h[10], r.h[11], 9999, 0, 0, 0, 0, 0, 0, 0]] } },
    { ...deep, r: { ...r, k: ['p_mend', 'p_mend'] } }, { ...deep, r: { ...r, k: ['bun?'] } },
    { ...deep, r: { ...r, g: 1.5 } }, { ...deep, r: 'x' },
  ];
  for (const b of bad) assert.throws(() => loadGame(typeof b === 'string' ? b : JSON.stringify(b), TOKEN, 1), undefined, JSON.stringify(b).slice(0, 160));
  assert.throws(() => loadGame('x'.repeat(SAVE_LIMIT + 1), TOKEN, 1));
});

test('Genesis and Generations saves are namespaced separately', () => {
  const raw = serialize(newGame('genesis:597', 1));
  assert.throws(() => loadGame(raw, 'generations:597', 1));
  assert.equal(loadGame(raw, 'genesis:597', 1).token, 'genesis:597');
});

test('a save made on the summary screen resumes in town', () => {
  let s = press(newGame(TOKEN, 1), 'a');
  s = { ...s, hero: { ...s.hero, bag: [makeItem('s_home')] }, run: { ...s.run, known: ['s_home'] } };
  s = act(s, { k: 'use', i: 0 }); assert.equal(s.scene.k, 'summary');
  const back = loadGame(serialize(s), TOKEN, 1); assert.equal(back.scene.k, 'town'); assert.equal(back.run, null);
});
