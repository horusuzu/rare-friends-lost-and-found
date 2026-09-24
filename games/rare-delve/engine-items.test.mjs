import test from 'node:test';
import assert from 'node:assert/strict';
import { act, heroAtk, heroDef } from './turn.ts';
import { press } from './game.ts';
import { makeItem, itemName, appearance, isKnown, itemCode, parseItem, sellPrice, rollItem } from './items.ts';
import { ITEMS, FULL_MAX, BAG_MAX, BLAZE_DAMAGE, SPECIES } from './data.ts';
import { rngFrom } from './rng.ts';
import { arena, OPEN, until } from './test-kit.mjs';

const POTIONS = ['p_mend', 'p_doze', 'p_muddle', 'p_sight', 'p_rise', 'p_swift'];
const SCROLLS = ['s_know', 's_edge', 's_guard', 's_chart', 's_home', 's_blaze'];
const WANDS = ['w_gust', 'w_lull', 'w_swap', 'w_slow'];
const use = (s, i = 0) => act(s, { k: 'use', i });
const withBag = (items, extra = {}) => arena(OPEN, { ...extra, hero: { ...(extra.hero ?? {}), bag: items.map(k => typeof k === 'string' ? makeItem(k) : k) } });

test('about twenty item kinds with names, notes and sell prices', () => {
  const kinds = Object.keys(ITEMS).filter(k => !['gold', 'lantern'].includes(k));
  assert.ok(kinds.length >= 20, `kinds ${kinds.length}`);
  for (const k of kinds) {
    const d = ITEMS[k]; assert.equal(d.name.length, 2); assert.ok(d.name[0] && d.name[1] && d.note[0] && d.note[1], k);
    assert.ok(sellPrice(makeItem(k)) > 0, `${k} sells`);
  }
  for (const k of [...POTIONS, ...SCROLLS, ...WANDS]) assert.ok(Object.hasOwn(ITEMS, k), k);
});

test('unidentified looks are shuffled per run seed and stable within a run', () => {
  const looks = seed => POTIONS.map(k => appearance(k, seed)[1]);
  assert.deepEqual(looks(5), looks(5)); assert.equal(new Set(looks(5)).size, 6);
  assert.ok([1, 2, 3, 4, 6, 7, 8, 9].some(seed => looks(seed).join() !== looks(5).join()));
  assert.equal(new Set(SCROLLS.map(k => appearance(k, 5)[1])).size, 6);
  assert.equal(new Set(WANDS.map(k => appearance(k, 5)[1])).size, 4);
  assert.match(appearance('p_mend', 5)[1], /Bottle/); assert.match(appearance('s_know', 5)[1], /Scroll/); assert.match(appearance('w_gust', 5)[1], /Wand/);
  assert.equal(appearance('bun', 5), null);
  assert.equal(isKnown([], 'bun'), true); assert.equal(isKnown([], 'p_mend'), false); assert.equal(isKnown(['p_mend'], 'p_mend'), true);
  assert.equal(itemName(makeItem('p_mend'), [], 5)[1], appearance('p_mend', 5)[1]);
  assert.match(itemName(makeItem('p_mend'), ['p_mend'], 5)[1], /Mending/);
  assert.match(itemName(makeItem('knife', { e: 2 }), [], 5)[1], /\+2/);
  assert.match(itemName(makeItem('w_gust', { c: 4 }), ['w_gust'], 5)[1], /\(4\)/);
  assert.match(itemName(makeItem('dart', { c: 7 }), [], 5)[1], /7/);
});

test('item codes round-trip and reject junk', () => {
  for (const it of [makeItem('bun'), makeItem('knife', { e: 3 }), makeItem('shell', { e: -2 }), makeItem('w_swap', { c: 0 }), makeItem('dart', { c: 12 }), makeItem('gold', { c: 350 })]) {
    assert.deepEqual(parseItem(itemCode(it)), it, itemCode(it));
  }
  for (const bad of ['', 'sword', 'knife+99', 'w_swap:-1', 'dart*0', 'bun+1', 'p_mend:3', 42, null, 'gold*0']) assert.equal(parseItem(bad), null, String(bad));
});

test('random items are valid for every floor', () => {
  const r = rngFrom(99);
  for (let floor = 1; floor <= 10; floor++) for (let i = 0; i < 60; i++) {
    const it = rollItem(r, floor); assert.ok(Object.hasOwn(ITEMS, it.k)); assert.deepEqual(parseItem(itemCode(it)), it);
  }
});

test('food fills the belly; herbs heal, cure and strengthen', () => {
  let s = use(withBag(['bun'], { hero: { full: 20 } })); assert.equal(s.hero.full, 20 + 50 - 0); assert.equal(s.hero.bag.length, 0); assert.equal(s.run.turn, 1);
  s = use(withBag(['loaf'], { hero: { full: 20 } })); assert.equal(s.hero.full, FULL_MAX);
  s = use(withBag(['mendleaf'], { hero: { hp: 2 } })); assert.ok(s.hero.hp >= 2 + 20);
  const full = withBag(['mendleaf']); s = use(full); assert.equal(s.hero.maxHp, full.hero.maxHp + 1, 'a full-health herb raises max HP');
  s = use(withBag(['clearroot'], { hero: { str: 3, conf: 9 } })); assert.equal(s.hero.str, s.hero.maxStr); assert.equal(s.hero.conf, 0);
  const b = withBag(['sprout']); s = use(b); assert.equal(s.hero.maxStr, b.hero.maxStr + 1); assert.equal(s.hero.str, b.hero.str + 1);
});

test('potions: drinking identifies them and applies their effect', () => {
  const drink = (k, extra) => { const s = use(withBag([k], extra)); assert.ok(s.run.known.includes(k), `${k} identified`); return s; };
  let s = drink('p_mend', { hero: { hp: 4 } }); assert.equal(s.hero.hp, s.hero.maxHp); assert.ok(s.hero.maxHp > withBag([]).hero.maxHp);
  s = drink('p_doze'); assert.ok(s.hero.sleep > 0);
  s = drink('p_muddle'); assert.ok(s.hero.conf > 0);
  s = drink('p_sight'); assert.equal(s.run.sight, true);
  s = drink('p_rise'); assert.equal(s.hero.level, 2);
  s = drink('p_swift'); assert.ok(s.hero.haste > 0);
});

test('swift: monsters act only every other hero action', () => {
  let s = arena(OPEN, { hero: { haste: 10 }, mons: [['newt', 9, 1, { sleep: 0, aware: true }]] });
  const xs = [];
  for (let i = 0; i < 4; i++) { s = act(s, { k: 'wait' }); xs.push(s.run.mons[0].x); }
  assert.equal(new Set(xs).size, 2, `moved on half the turns: ${xs}`);
});

test('scrolls: insight identifies a chosen item, honing and bracing enchant, chart maps, homeward escapes, cinders burn', () => {
  let s = withBag(['s_know', 'p_rise', 'w_slow']);
  s = use(s, 0); assert.equal(s.scene.k, 'pick'); assert.ok(s.run.known.includes('s_know'));
  s = press(s, 'down'); s = press(s, 'a');
  assert.ok(s.run.known.includes('w_slow')); assert.ok(!s.run.known.includes('p_rise')); assert.equal(s.scene.k, 'dungeon');
  s = use(withBag(['s_edge'], { hero: { weapon: makeItem('knife', { e: 1 }) } })); assert.equal(s.hero.weapon.e, 2);
  s = use(withBag(['s_guard'], { hero: { shield: makeItem('bark') } })); assert.equal(s.hero.shield.e, 1);
  s = use(withBag(['s_edge'])); assert.equal(s.hero.bag.length, 0, 'wasted without a weapon');
  s = use(withBag(['s_chart'])); assert.ok(!s.run.seen.includes('0') || s.run.seen.split('').filter(c => c === '1').length > 30);
  const [sx, sy] = s.run.map.stairs; assert.equal(s.run.seen[sy * s.run.map.w + sx], '1');
  s = use(withBag(['s_home', 'bun'])); assert.equal(s.scene.k, 'summary'); assert.equal(s.scene.result, 'home');
  const hot = withBag(['s_blaze'], { mons: [['crab', 8, 3, { sleep: 0 }], ['newt', 2, 1]] });
  s = use(hot);
  for (const m of s.run.mons) { const before = hot.run.mons.find(x => x.id === m.id); assert.ok(m.hp <= before.hp - BLAZE_DAMAGE || m.hp < before.hp, m.sp); }
});

test('wands zap along the facing line: gust pushes, lull sleeps, swap trades places, slow slows; charges run out', () => {
  const zap = (k, c = 3) => withBag([makeItem(k, { c })], { hero: { face: 'e' }, mons: [['crab', 7, 3, { sleep: 0, aware: true }]] });
  let s = act(zap('w_gust'), { k: 'zap', i: 0 });
  assert.ok(s.run.mons[0].x >= 9, `pushed to ${s.run.mons[0].x}`); assert.equal(s.hero.bag[0].c, 2); assert.ok(s.run.known.includes('w_gust'));
  s = act(zap('w_lull'), { k: 'zap', i: 0 }); assert.ok(s.run.mons[0].sleep > 1);
  s = act(zap('w_swap'), { k: 'zap', i: 0 }); assert.deepEqual([s.hero.x, s.hero.y], [7, 3]); assert.equal(s.run.mons[0].x, 5);
  s = act(zap('w_slow'), { k: 'zap', i: 0 }); assert.ok(s.run.mons[0].slow > 0);
  const empty = act(zap('w_lull', 0), { k: 'zap', i: 0 }); assert.equal(empty.run.mons[0].sleep, 0); assert.equal(empty.run.turn, 1);
  const miss = act(withBag([makeItem('w_lull', { c: 2 })], { hero: { face: 'n' } }), { k: 'zap', i: 0 }); assert.equal(miss.hero.bag[0].c, 1);
});

test('throwing: darts hurt the first monster in line, potions shatter on it, misses land on the floor', () => {
  let s = withBag([makeItem('dart', { c: 5 })], { hero: { face: 'e' }, mons: [['tortoise', 8, 3, { sleep: 9 }]] });
  const hp = s.run.mons[0].hp;
  s = until(s, x => act(x, { k: 'throw', i: 0 }), x => x.run.mons[0].hp < hp, 5);
  assert.ok(s.run.mons[0].hp < hp); assert.ok(s.hero.bag.length === 0 || s.hero.bag[0].c < 5);
  let p = withBag(['p_doze'], { hero: { face: 'e' }, mons: [['moth', 7, 3, { sleep: 0, aware: true }]] });
  p = until(p, x => x.hero.bag.length ? act(x, { k: 'throw', i: 0 }) : x, x => x.hero.bag.length === 0, 3);
  assert.ok(p.run.mons[0].sleep > 0 || p.run.items.length === 1);
  let b = withBag(['bun'], { hero: { face: 'e' } });
  b = act(b, { k: 'throw', i: 0 });
  assert.equal(b.hero.bag.length, 0); assert.deepEqual([b.run.items[0].x, b.run.items[0].y], [9, 3], 'stops at the wall');
});

test('equip, unequip, drop and pick up; the bag holds at most BAG_MAX items', () => {
  let s = withBag(['knife', 'bark']);
  const atk = heroAtk(s.hero);
  s = act(s, { k: 'equip', i: 0 }); assert.equal(s.hero.weapon.k, 'knife'); assert.equal(s.hero.bag.length, 1); assert.ok(heroAtk(s.hero) > atk);
  s = act(s, { k: 'equip', i: 0 }); assert.equal(s.hero.shield.k, 'bark'); assert.ok(heroDef(s.hero) > 0); assert.equal(s.hero.bag.length, 0);
  s = act({ ...s, hero: { ...s.hero, bag: [makeItem('pick')] } }, { k: 'equip', i: 0 });
  assert.equal(s.hero.weapon.k, 'pick'); assert.equal(s.hero.bag[0].k, 'knife', 'the old weapon returns to the bag');
  s = act(s, { k: 'unequip', slot: 'shield' }); assert.equal(s.hero.shield, null); assert.equal(s.hero.bag.at(-1).k, 'bark');
  s = act(s, { k: 'drop', i: 0 }); assert.deepEqual(s.run.items.map(f => [f.x, f.y, f.item.k]), [[5, 3, 'knife']]);
  s = act(s, { k: 'move', dir: 'e' }); s = act(s, { k: 'move', dir: 'w' });
  assert.equal(s.run.items.length, 0, 'stepping on an item picks it up'); assert.ok(s.hero.bag.some(i => i.k === 'knife'));
  let full = withBag(Array(BAG_MAX).fill('bun'), { items: [{ x: 6, y: 3, item: makeItem('loaf') }, { x: 7, y: 3, item: makeItem('gold', { c: 40 }) }] });
  full = act(full, { k: 'move', dir: 'e' }); assert.equal(full.hero.bag.length, BAG_MAX); assert.equal(full.run.items.length, 2);
  full = act(full, { k: 'move', dir: 'e' }); assert.equal(full.hero.gold, 40, 'gold never needs a bag slot');
});

test('item use outside the rules is refused without spending a turn', () => {
  const s = withBag(['knife']);
  assert.equal(act(s, { k: 'use', i: 0 }).run.turn, 0);
  assert.equal(act(s, { k: 'use', i: 5 }).run.turn, 0);
  assert.equal(act(s, { k: 'unequip', slot: 'weapon' }).run.turn, 0);
  assert.equal(act(s, { k: 'zap', i: 0 }).run.turn, 0);
});

test('every monster species is defined with stats and a quirk', () => {
  assert.ok(Object.keys(SPECIES).length >= 10);
  for (const [id, d] of Object.entries(SPECIES)) {
    assert.ok(d.hp > 0 && d.atk > 0 && d.def >= 0 && d.exp > 0 && d.minFloor >= 1 && d.maxFloor >= d.minFloor, id);
    assert.ok(d.quirk && d.name[0] && d.name[1] && d.note[0] && d.note[1], id);
  }
});
