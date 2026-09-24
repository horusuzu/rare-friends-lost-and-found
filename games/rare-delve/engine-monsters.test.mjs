import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from './turn.ts';
import { makeItem } from './items.ts';
import { pickSpecies, makeMon } from './monsters.ts';
import { newFloor } from './run.ts';
import { SPECIES } from './data.ts';
import { rngFrom } from './rng.ts';
import { arena, dive, OPEN, until } from './test-kit.mjs';

const wait = s => act(s, { k: 'wait' });
const awake = { sleep: 0, aware: true };
const adjacent = (s, m) => Math.max(Math.abs(m.x - s.hero.x), Math.abs(m.y - s.hero.y)) <= 1;

test('monsters path around walls to reach the hero', () => {
  const rows = [
    '#########',
    '#.......#',
    '#.#####.#',
    '#.#...#.#',
    '#.#.@.#.#',
    '#.#...#.#',
    '#.##.##.#',
    '#.......#',
    '#########',
  ];
  let s = arena(rows, { mons: [['newt', 7, 1, awake]] });
  s = until(s, wait, x => adjacent(x, x.run.mons[0]), 30);
  assert.ok(adjacent(s, s.run.mons[0]), 'found the gap at the bottom'); assert.ok(s.run.turn <= 14, `turns ${s.run.turn}`);
});

test('sleepers stay put until woken by a hit', () => {
  let s = arena(OPEN, { mons: [['newt', 8, 3]] });
  assert.ok(s.run.mons[0].sleep > 0);
  for (let i = 0; i < 5; i++) s = wait(s);
  assert.equal(s.run.mons[0].x, 8);
  let h = arena(OPEN, { mons: [['newt', 6, 3]] });
  h = until(h, x => act(x, { k: 'move', dir: 'e' }), x => x.run.mons[0]?.hp < SPECIES.newt.hp, 10);
  assert.equal(h.run.mons[0].sleep, 0);
});

test('fast monsters move twice per turn; slow ones every other turn', () => {
  let s = arena(OPEN, { hero: { x: 1, y: 3 }, mons: [['moth', 9, 3, awake]] });
  s = wait(s); assert.equal(s.run.mons[0].x, 7);
  let c = arena(OPEN, { hero: { x: 1, y: 3 }, mons: [['crab', 9, 3, awake]] });
  const xs = []; for (let i = 0; i < 4; i++) { c = wait(c); xs.push(c.run.mons[0].x); }
  assert.equal(9 - xs[3], 2, `crab steps ${xs}`);
});

test('coin mites steal gold and warp away; defeating one returns the gold', () => {
  const rows = ['###############', '#.....#########', '#..@..,,,,,...#', '#.....#####...#', '###############'];
  let s = arena(rows, { hero: { gold: 200 }, mons: [['mite', 4, 2, awake]] });
  s = until(s, wait, x => x.hero.gold < 200, 30);
  assert.ok(s.hero.gold < 200); const mite = s.run.mons[0]; assert.ok(mite.loot > 0); assert.ok(!adjacent(s, mite), 'warped away');
  const killed = until({ ...s, run: { ...s.run, mons: [{ ...mite, x: 4, y: 2, hp: 1, sleep: 5 }] } }, x => act(x, { k: 'move', dir: 'e' }), x => x.run.mons.length === 0, 10);
  assert.ok(killed.run.items.some(f => f.item.k === 'gold' && f.item.c === mite.loot));
});

test('rust slugs corrode the shield; thorn wasps sap strength; muddle bats confuse', () => {
  let s = arena(OPEN, { hero: { shield: makeItem('slate', { e: 3 }), hp: 999, maxHp: 999 }, mons: [['slug', 6, 3, awake]] });
  s = until(s, wait, x => x.hero.shield.e < 3, 60); assert.ok(s.hero.shield.e < 3);
  let w = arena(OPEN, { hero: { hp: 999, maxHp: 999 }, mons: [['wasp', 6, 3, awake]] });
  w = until(w, wait, x => x.hero.str < x.hero.maxStr, 60); assert.ok(w.hero.str < w.hero.maxStr);
  let b = arena(OPEN, { hero: { hp: 999, maxHp: 999 }, mons: [['bat', 6, 3, awake]] });
  b = until(b, wait, x => x.hero.conf > 0, 80); assert.ok(b.hero.conf > 0);
});

test('twig archers shoot along a clear line instead of closing in', () => {
  let s = arena(OPEN, { hero: { x: 1, y: 3, hp: 999, maxHp: 999 }, mons: [['archer', 6, 3, awake]] });
  s = until(s, wait, x => x.hero.hp < 999, 20);
  assert.ok(s.hero.hp < 999); assert.ok(s.run.mons[0].x >= 3, 'hit from range');
  assert.ok(s.log.some(l => /arrow/i.test(l[1])));
});

test('twin jellies split when struck', () => {
  let s = arena(OPEN, { hero: { hp: 999, maxHp: 999 }, mons: [['jelly', 6, 3, { ...awake, hp: 999 }]] });
  s = until(s, x => act(x, { k: 'move', dir: 'e' }), x => x.run.mons.length > 1, 40);
  assert.ok(s.run.mons.length > 1); assert.ok(s.run.mons.every(m => m.sp === 'jelly'));
  assert.equal(new Set(s.run.mons.map(m => m.id)).size, s.run.mons.length, 'unique ids');
});

test('gulp toads eat items on the floor', () => {
  let s = arena(OPEN, { hero: { x: 1, y: 1 }, mons: [['toad', 8, 3, { sleep: 0 }]], items: [{ x: 8, y: 3, item: makeItem('loaf') }, { x: 1, y: 5, item: makeItem('bun') }] });
  s = wait(s);
  assert.equal(s.run.items.length, 1); assert.equal(s.run.items[0].item.k, 'bun');
});

test('species appear on their floors; deeper floors hold more monsters', () => {
  const r = rngFrom(3);
  for (let floor = 1; floor <= 10; floor++) for (let i = 0; i < 40; i++) {
    const sp = pickSpecies(r, floor), d = SPECIES[sp]; assert.ok(floor >= d.minFloor && floor <= d.maxFloor, `${sp} on ${floor}`);
  }
  let shallow = 0, deep = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = dive(seed);
    shallow += newFloor(s, 1).run.mons.length; deep += newFloor(s, 9).run.mons.length;
  }
  assert.ok(deep > shallow, `${shallow} vs ${deep}`);
  const m = makeMon('newt', 1, 2, 7); assert.equal(m.hp, SPECIES.newt.hp); assert.ok(m.sleep > 0); assert.equal(makeMon('moth', 1, 2, 8).sleep, 0);
});

test('new monsters spawn over time, out of the hero\'s sight', () => {
  const rows = ['##############', '#...#####....#', '#.@.,,,,,....#', '#...#####....#', '##############'];
  let s = arena(rows, { run: { spawnIn: 3 } });
  s = until(s, wait, x => x.run.mons.length > 0, 10);
  assert.equal(s.run.mons.length, 1); assert.ok(s.run.mons[0].x >= 9, 'spawned in the other room');
});

test('generated floors place the hero, monsters, items and traps on distinct floor tiles', () => {
  for (let seed = 1; seed <= 10; seed++) for (const floor of [1, 5, 10]) {
    const s = newFloor(dive(seed), floor), r = s.run;
    assert.equal(r.floor, floor);
    const taken = new Set([`${s.hero.x},${s.hero.y}`]);
    for (const p of [...r.mons, ...r.items, ...r.traps]) assert.ok(r.map.tiles[p.y * r.map.w + p.x] !== '#', 'on floor');
    for (const m of r.mons) { const k = `${m.x},${m.y}`; assert.ok(!taken.has(k)); taken.add(k); }
    assert.equal(r.items.some(f => f.item.k === 'lantern'), floor === 10, 'the Heart Lantern waits on floor 10');
    if (floor === 10) assert.ok(!r.traps.some(t => t.kind === 'pit'), 'no pits on the last floor');
  }
});
