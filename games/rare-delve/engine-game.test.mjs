import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, press, startDive, saveResult, TOWN_MENU, bagRows, actOptions } from './game.ts';
import { act } from './turn.ts';
import { makeItem, sellPrice } from './items.ts';
import { BAG_MAX, CHEST_MAX, CLEAR_BONUS, SHOP_COSTS, FLOORS } from './data.ts';
import { arena, OPEN, TOKEN } from './test-kit.mjs';

const presses = (s, ...buttons) => buttons.reduce(press, s);
const townAt = (s, id) => { const i = TOWN_MENU.indexOf(id); let x = s; for (let n = 0; n < i; n++) x = press(x, 's'); return x; };

test('a new game opens in town with an empty shop, chest and bag', () => {
  const s = newGame(TOKEN, 5);
  assert.equal(s.scene.k, 'town'); assert.equal(s.run, null);
  assert.deepEqual(s.meta, { purse: 0, shopLv: 1, clears: 0, dives: 0, best: 0 });
  assert.deepEqual(s.chest, []); assert.deepEqual(s.hero.bag, []);
  assert.deepEqual(TOWN_MENU, ['dive', 'shop', 'chest', 'bag']);
  assert.throws(() => newGame('nope', 1));
  const frozen = structuredClone(s); press(s, 'a'); assert.deepEqual(s, frozen);
});

test('diving: floor 1, level 1, starting bread by shop level, carried kinds known, save requested', () => {
  const s = press(newGame(TOKEN, 5), 'a');
  assert.equal(s.scene.k, 'dungeon'); assert.equal(s.run.floor, 1); assert.equal(s.meta.dives, 1);
  assert.deepEqual(s.hero.bag.map(i => i.k), ['bun']); assert.ok(s.saveTick > 0);
  const lv3 = startDive({ ...newGame(TOKEN, 5), meta: { purse: 0, shopLv: 3, clears: 0, dives: 0, best: 0 }, hero: { ...newGame(TOKEN, 5).hero, bag: [makeItem('p_rise')] } });
  assert.deepEqual(lv3.hero.bag.map(i => i.k).sort(), ['bun', 'bun', 'mendleaf', 'p_rise'].sort());
  assert.ok(lv3.run.known.includes('p_rise'));
  const other = press(newGame(TOKEN, 6), 'a');
  assert.notEqual(other.run.map.tiles, s.run.map.tiles, 'each seed digs a different hollow');
});

test('dungeon buttons: move, wait, map overlay, turn in place, menu and item actions', () => {
  let s = arena(OPEN, { hero: { bag: [makeItem('bun'), makeItem('knife')] } });
  s = press(s, 'e'); assert.equal(s.hero.x, 6); assert.equal(s.run.turn, 1);
  s = press(s, 'wait'); assert.equal(s.run.turn, 2);
  s = press(s, 'map'); assert.equal(s.showMap, true); s = press(s, 'b'); assert.equal(s.showMap, false);
  s = press(s, 'turn'); assert.equal(s.turnMode, true); s = press(s, 'sw'); assert.equal(s.hero.face, 'sw'); assert.equal(s.hero.x, 6); assert.equal(s.turnMode, false); assert.equal(s.run.turn, 2);
  s = press(s, 'menu'); assert.equal(s.scene.k, 'bag'); assert.equal(bagRows(s).length, 2);
  s = press(s, 's'); assert.equal(s.scene.cur, 1);
  s = press(s, 'a'); assert.equal(s.scene.k, 'act'); assert.deepEqual(actOptions(s, 1), ['equip', 'throw', 'drop']);
  s = press(s, 'a'); assert.equal(s.scene.k, 'dungeon'); assert.equal(s.hero.weapon.k, 'knife'); assert.equal(s.run.turn, 3);
  s = presses(s, 'menu'); assert.equal(bagRows(s)[0].slot, 'weapon'); assert.deepEqual(actOptions(s, 0), ['unequip']);
  s = presses(s, 'b'); assert.equal(s.scene.k, 'dungeon');
});

test('A on the stairs descends and asks for a save; floors deepen up to the last', () => {
  let s = arena(OPEN, { hero: { x: 9, y: 5 } });
  const before = s.saveTick;
  s = press(s, 'a'); assert.equal(s.run.floor, 2); assert.ok(s.saveTick > before); assert.equal(s.meta.best, 2);
  assert.equal(FLOORS, 10);
  const off = press(arena(OPEN), 'a'); assert.equal(off.run.floor, 1);
});

test('the homeward scroll brings the hero home with items and banks carried gold', () => {
  let s = arena(OPEN, { hero: { gold: 120, bag: [makeItem('s_home'), makeItem('geode')] }, run: { known: ['s_home'] } });
  s = act(s, { k: 'use', i: 0 });
  assert.equal(s.scene.k, 'summary'); assert.equal(s.scene.result, 'home');
  s = press(s, 'a'); assert.equal(s.scene.k, 'town'); assert.equal(s.run, null);
  assert.deepEqual(s.hero.bag.map(i => i.k), ['geode']); assert.equal(s.meta.purse, 120); assert.equal(s.hero.gold, 0);
  assert.equal(s.hero.hp, s.hero.maxHp);
});

test('death loses everything carried but keeps the chest, purse and shop', () => {
  let s = arena(OPEN, { hero: { hp: 1, gold: 300, bag: [makeItem('opal')], weapon: makeItem('amber', { e: 2 }), level: 6 }, mons: [['tortoise', 6, 3, { sleep: 0, aware: true }]] });
  s = { ...s, chest: [makeItem('loaf')], meta: { ...s.meta, purse: 77, shopLv: 2 } };
  let n = 0; while (s.scene.k !== 'summary' && n++ < 40) s = act(s, { k: 'wait' });
  assert.equal(s.scene.result, 'dead'); assert.ok(s.saveTick > 0);
  s = press(s, 'a');
  assert.equal(s.scene.k, 'town'); assert.deepEqual(s.hero.bag, []); assert.equal(s.hero.weapon, null); assert.equal(s.hero.gold, 0); assert.equal(s.hero.level, 1);
  assert.deepEqual(s.chest, [makeItem('loaf')]); assert.equal(s.meta.purse, 77); assert.equal(s.meta.shopLv, 2);
});

test('grabbing the Heart Lantern on the last floor clears the hollow', () => {
  let s = arena(OPEN, { run: { floor: FLOORS }, items: [{ x: 6, y: 3, item: makeItem('lantern') }], hero: { gold: 50 } });
  s = press(s, 'e');
  assert.equal(s.scene.k, 'summary'); assert.equal(s.scene.result, 'clear');
  s = press(s, 'a'); assert.equal(s.meta.clears, 1); assert.equal(s.meta.purse, 50 + CLEAR_BONUS); assert.equal(s.scene.k, 'town');
});

test('shop counter: sell carried items for gold, upgrade the shop with enough gold', () => {
  let s = { ...newGame(TOKEN, 1), hero: { ...newGame(TOKEN, 1).hero, bag: [makeItem('geode'), makeItem('knife', { e: 1 })] } };
  s = press(townAt(s, 'shop'), 'a'); assert.equal(s.scene.k, 'shop');
  // Row 0 is the upgrade, rows 1.. are items.
  s = press(s, 's'); s = press(s, 'a');
  assert.equal(s.meta.purse, sellPrice(makeItem('geode'))); assert.deepEqual(s.hero.bag.map(i => i.k), ['knife']);
  s = press(press(s, 'n'), 'a'); assert.equal(s.meta.shopLv, 1, 'not enough gold');
  s = { ...s, meta: { ...s.meta, purse: SHOP_COSTS[2] + 5 } };
  s = press(s, 'a'); assert.equal(s.meta.shopLv, 2); assert.equal(s.meta.purse, 5); assert.ok(s.saveTick > 0);
  s = press(s, 'b'); assert.equal(s.scene.k, 'town');
});

test('storage chest keeps up to eight items and gives them back', () => {
  let s = { ...newGame(TOKEN, 1), hero: { ...newGame(TOKEN, 1).hero, bag: Array.from({ length: 10 }, () => makeItem('bun')) } };
  s = press(townAt(s, 'chest'), 'a'); assert.equal(s.scene.k, 'chest');
  for (let i = 0; i < 10; i++) s = press(s, 'a');
  assert.equal(s.chest.length, CHEST_MAX); assert.equal(s.hero.bag.length, 2);
  s = press(s, 'n'); for (let i = 0; i < 20; i++) s = press(s, 'n');
  s = { ...s, scene: { ...s.scene, cur: 0 } }; s = press(s, 'a');
  assert.equal(s.chest.length, CHEST_MAX - 1); assert.equal(s.hero.bag.length, 3);
  const full = { ...s, hero: { ...s.hero, bag: Array.from({ length: BAG_MAX }, () => makeItem('bun')) } };
  assert.equal(press(full, 'a').chest.length, CHEST_MAX - 1, 'a full bag cannot take more');
});

test('the town bag can equip gear; item menu shows equipped rows', () => {
  let s = { ...newGame(TOKEN, 1), hero: { ...newGame(TOKEN, 1).hero, bag: [makeItem('bark')] } };
  s = press(townAt(s, 'bag'), 'a'); assert.equal(s.scene.k, 'bag');
  s = press(s, 'a'); assert.deepEqual(actOptions(s, 0), ['equip']);
  s = press(s, 'a'); assert.equal(s.hero.shield.k, 'bark'); assert.equal(s.scene.k, 'bag');
});

test('saveResult reports failure without blocking play', () => {
  const s = press(newGame(TOKEN, 1), 'a');
  assert.equal(saveResult(s, false).saveError, true); assert.equal(saveResult(saveResult(s, false), true).saveError, false);
});
