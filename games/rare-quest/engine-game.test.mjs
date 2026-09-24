import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, press, tick, saveResult, battleView, STEP_TIME, MAIN_MENU, BATTLE_MENU } from './game.ts';
import { MAPS, START } from './world.ts';
import { createMon, statsOf, healMon } from './mon.ts';
import { ITEMS } from './data.ts';

const TOKEN = 'generations:7730';
const presses = (s, ...buttons) => buttons.reduce(press, s);
const walk = (s, dir, tiles = 1) => { for (let i = 0; i < tiles; i++) s = tick(tick(s, dir, STEP_TIME / 2), null, STEP_TIME / 2 + 1e-6); return s; };
const ready = (seed = 3) => { let s = newGame(TOKEN, seed); while (s.scene.k === 'talk') s = press(s, 'a'); return s; };
const at = (s, map, x, y, face = 'up') => ({ ...s, map, x, y, face, walk: null, scene: { k: 'world' } });
const strong = s => ({ ...s, party: [createMon('friend', 40, TOKEN)] });
/** Mash A (and pick the first menu entry) until the scene leaves battle. */
function fightOut(s, limit = 400) {
  for (let i = 0; i < limit && s.scene.k === 'battle'; i++) s = press(s, 'a');
  return s;
}

test('new game: intro dialog, partner Friend at level 5, starter items and acorns; input objects stay unchanged', () => {
  const s = newGame(TOKEN, 1);
  assert.equal(s.scene.k, 'talk'); assert.equal(s.map, START.map); assert.equal(s.x, START.x); assert.equal(s.y, START.y);
  assert.equal(s.party.length, 1); assert.equal(s.party[0].species, 'friend'); assert.equal(s.party[0].token, TOKEN); assert.equal(s.party[0].level, 5);
  assert.deepEqual(s.items, { ribbon: 3, herb: 2 }); assert.ok(s.coins > 0);
  const frozen = structuredClone(s); press(s, 'a'); tick(s, 'up', 1); assert.deepEqual(s, frozen);
  const w = ready(); assert.equal(w.scene.k, 'world');
  assert.throws(() => newGame('bad token', 1));
});

test('grid movement: a step takes STEP_TIME, is interpolated, and blocked tiles only turn the player', () => {
  const s = ready();
  const half = tick(s, 'up', STEP_TIME / 2); assert.equal(half.y, START.y - 1); assert.ok(half.walk && half.walk.t > 0 && half.walk.fromY === START.y);
  const done = tick(half, null, STEP_TIME); assert.equal(done.walk, null); assert.equal(done.y, START.y - 1);
  const turned = tick(done, 'left', 0.01); assert.equal(turned.face, 'left');
  let b = at(s, 'moegi', 1, 1); b = tick(b, 'left', STEP_TIME * 2); assert.equal(b.x, 1); assert.equal(b.face, 'left'); assert.equal(b.sfx.id, 'bump');
  const held = tick(s, 'up', STEP_TIME * 2.5); assert.ok(held.y <= START.y - 2, 'holding keeps walking');
  assert.equal(tick(s, 'up', NaN), s); assert.equal(tick(s, 'up', -1), s);
  const talking = newGame(TOKEN, 1); assert.equal(tick(talking, 'up', 1).y, START.y, 'no walking during dialog');
});

test('walking north leaves the village for the route through its edge warp', () => {
  let s = ready(); s = walk(s, 'up', START.y);
  assert.equal(s.map, 'wakaba'); assert.equal(s.scene.k === 'world' || s.scene.k === 'battle', true);
});

test('tall grass starts wild battles; the monster is recorded as seen', () => {
  let s = at(ready(9), 'wakaba', 9, 22), n = 0;
  while (s.scene.k === 'world' && n++ < 400) s = walk(s, n % 2 ? 'up' : 'down');
  assert.equal(s.scene.k, 'battle'); assert.equal(s.scene.b.kind, 'wild');
  assert.ok(s.seen.includes(s.scene.b.foes[0].species));
  assert.equal(tick(s, 'up', 1).y, s.y, 'no walking during battle');
});

function wildBattle(seed = 9, prep = x => x) {
  let s = prep(at(ready(seed), 'wakaba', 9, 22)), n = 0;
  while (s.scene.k === 'world' && n++ < 400) s = walk(s, n % 2 ? 'up' : 'down');
  return s;
}
const toMenu = s => { let n = 0; while (s.scene.k === 'battle' && s.scene.ui === 'lines' && n++ < 50) s = press(s, 'a'); return s; };

test('battle: FIGHT with the first move until the foe faints, then back to the world with exp', () => {
  let s = toMenu(wildBattle(9, strong)); assert.equal(s.scene.ui, 'main'); assert.deepEqual(BATTLE_MENU.map(m => m[1]), ['FIGHT', 'ITEM', 'PARTY', 'RUN']);
  const exp = s.party[0].exp, coins = s.coins;
  const v = battleView(s); assert.equal(v.me.name, 'Friend #7730'); assert.ok(v.foe.hp > 0);
  s = press(s, 'a'); assert.equal(s.scene.ui, 'fight'); s = press(s, 'b'); assert.equal(s.scene.ui, 'main');
  s = fightOut(s); assert.equal(s.scene.k, 'world'); assert.equal(s.last, 'win'); assert.ok(s.party[0].exp > exp); assert.ok(s.coins > coins);
});

test('battle: cursor moves the 2x2 menu; RUN escapes when faster', () => {
  let s = toMenu(wildBattle(9, strong));
  s = press(s, 'right'); assert.equal(s.scene.cur, 1); s = press(s, 'down'); assert.equal(s.scene.cur, 3); s = press(s, 'left'); assert.equal(s.scene.cur, 2); s = press(s, 'up'); assert.equal(s.scene.cur, 0);
  s = presses(s, 'right', 'down', 'a'); s = fightOut(s); assert.equal(s.last, 'run'); assert.equal(s.scene.k, 'world');
});

test('battle: ITEM → ribbon captures a weakened monster into the party and the notes', () => {
  let caughtOnce = false;
  for (let seed = 1; seed < 30 && !caughtOnce; seed++) {
    let s = toMenu(wildBattle(seed, strong));
    s = { ...s, scene: { ...s.scene, b: { ...s.scene.b, foes: s.scene.b.foes.map(f => ({ ...f, hp: 1 })) } } };
    s = presses(s, 'right', 'a'); assert.equal(s.scene.ui, 'bag');
    s = press(s, 'a'); s = fightOut(s);
    if (s.last === 'caught') { caughtOnce = true; assert.equal(s.party.length, 2); assert.equal(s.items.ribbon, 2); assert.ok(s.caught.includes(s.party[1].species)); }
  }
  assert.ok(caughtOnce);
});

test('battle: PARTY switches to another member; losing everything returns you healed to the respawn point', () => {
  let s = toMenu(wildBattle(9, x => ({ ...x, party: [createMon('friend', 5, TOKEN), createMon('mossball', 5)] })));
  s = presses(s, 'down', 'a'); assert.equal(s.scene.ui, 'party'); s = presses(s, 'down', 'a');
  assert.equal(s.scene.b.active, 1);
  let l = toMenu(wildBattle(9, x => ({ ...x, party: [{ ...createMon('mossball', 2), hp: 1 }] })));
  for (let i = 0; i < 20 && l.scene.k === 'battle'; i++) l = fightOut(l, 50);
  if (l.scene.k === 'talk') while (l.scene.k === 'talk') l = press(l, 'a');
  assert.equal(l.last, 'lose'); assert.equal(l.map, 'home'); assert.equal(l.party[0].hp, statsOf(l.party[0]).hp);
});

test('forced switch after a faint with a healthy back-up', () => {
  let s = toMenu(wildBattle(9, x => ({ ...x, party: [{ ...createMon('mossball', 2), hp: 1 }, createMon('friend', 40, TOKEN)] })));
  for (let i = 0; i < 60 && !(s.scene.k === 'battle' && s.scene.ui === 'party'); i++) s = press(s, 'a');
  if (s.scene.k === 'battle') {
    assert.equal(s.scene.forced, true); s = press(s, 'b'); assert.equal(s.scene.ui, 'party', 'cannot back out');
    s = press(s, 'a'); assert.equal(s.scene.ui, 'party', 'fainted member refused'); s = presses(s, 'down', 'a'); assert.equal(s.scene.b.active, 1);
  }
});

test('menu: party, items, notes, save and close; save success and failure messages', () => {
  let s = ready(); s = press(s, 'menu'); assert.equal(s.scene.k, 'menu'); assert.deepEqual(MAIN_MENU.map(m => m[1]), ['PARTY', 'ITEMS', 'NOTES', 'SAVE', 'CLOSE']);
  s = press(s, 'a'); assert.equal(s.scene.k, 'party'); s = press(s, 'b'); assert.equal(s.scene.k, 'menu');
  s = presses(s, 'down', 'a'); assert.equal(s.scene.k, 'bag'); s = press(s, 'b');
  s = presses(s, 'down', 'a'); assert.equal(s.scene.k, 'talk'); while (s.scene.k === 'talk') s = press(s, 'a');
  s = presses(s, 'menu', 'down', 'down', 'down', 'a'); assert.equal(s.saving, true); const tickNo = s.saveTick; assert.ok(tickNo > 0);
  assert.equal(press(s, 'a'), s, 'input ignored while saving');
  const ok = saveResult(s, true); assert.equal(ok.saving, false); assert.match(ok.scene.lines[0][1], /saved/i);
  const bad = saveResult(s, false); assert.match(bad.scene.lines[0][1], /could not/i); assert.equal(bad.saveError, true);
  const silent = saveResult({ ...s, saving: false, scene: { k: 'world' } }, false); assert.equal(silent.scene.k, 'world'); assert.equal(silent.saveError, true);
  let c = presses(ready(), 'menu', 'up', 'a'); assert.equal(c.scene.k, 'world');
  assert.equal(presses(ready(), 'menu', 'menu').scene.k, 'world');
});

test('using a herb from the bag heals the chosen member outside battle', () => {
  let s = ready(); const max = statsOf(s.party[0]).hp; s = { ...s, party: [{ ...s.party[0], hp: 1 }] };
  s = presses(s, 'menu', 'down', 'a', 'down', 'a'); assert.equal(s.scene.k, 'party'); s = press(s, 'a');
  assert.ok(s.party[0].hp > 1 && s.party[0].hp <= max); assert.equal(s.items.herb, 1);
});

test('reordering the party from the menu makes a member the lead', () => {
  let s = { ...ready(), party: [createMon('friend', 5, TOKEN), createMon('mossball', 4)] };
  s = presses(s, 'menu', 'a', 'down', 'a'); assert.equal(s.party[0].species, 'mossball');
});

test('talking: signs, the lab gift once, healing at the rest house, shop purchases', () => {
  const sign = MAPS.moegi.signs[0];
  let s = press(at(ready(), 'moegi', sign.x, sign.y + 1, 'up'), 'a'); assert.equal(s.scene.k, 'talk');
  const doc = MAPS.lab.npcs.find(n => n.id === 'doctor');
  let l = press(at(ready(), 'lab', doc.x, doc.y + 1, 'up'), 'a'); while (l.scene.k === 'talk') l = press(l, 'a');
  assert.equal(l.items.ribbon, 8); assert.equal(l.flags.lab, true);
  l = press(l, 'a'); while (l.scene.k === 'talk') l = press(l, 'a'); assert.equal(l.items.ribbon, 8, 'gift only once');
  const keeper = MAPS.rest.npcs.find(n => n.id === 'keeper');
  let h = at(ready(), 'rest', keeper.x, keeper.y + 2, 'up'); h = { ...h, party: h.party.map(m => ({ ...m, hp: 1 })) };
  h = press(h, 'a'); while (h.scene.k === 'talk') h = press(h, 'a');
  assert.equal(h.party[0].hp, statsOf(h.party[0]).hp); assert.equal(h.flags.rest, true); assert.ok(h.saveTick > 0, 'autosave after healing');
  const clerk = MAPS.rest.npcs.find(n => n.id === 'clerk');
  let p = press(at(ready(), 'rest', clerk.x, clerk.y + 2, 'up'), 'a'); while (p.scene.k === 'talk') p = press(p, 'a');
  assert.equal(p.scene.k, 'shop'); const coins = p.coins;
  p = press(p, 'a'); assert.equal(p.items.ribbon, 4); assert.equal(p.coins, coins - ITEMS.ribbon.price);
  p = presses(p, 'down', 'a'); assert.equal(p.items.herb, 3);
  const broke = press({ ...p, coins: 0 }, 'a'); assert.equal(broke.items.ribbon, 4); assert.equal(broke.coins, 0);
  p = presses(p, 'down', 'a'); assert.equal(p.scene.k, 'world');
  const g = MAPS.home.npcs.find(n => n.id === 'grandma');
  let gh = at(ready(), 'home', g.x, g.y + 1, 'up'); gh = { ...gh, party: gh.party.map(m => ({ ...m, hp: 1 })) };
  gh = press(gh, 'a'); while (gh.scene.k === 'talk') gh = press(gh, 'a'); assert.equal(gh.party[0].hp, statsOf(gh.party[0]).hp);
});

test('the dojo leader fights with three monsters and awards the badge once', () => {
  const leader = MAPS.dojo.npcs.find(n => n.id === 'leader');
  let s = press(strong(at(ready(), 'dojo', leader.x, leader.y + 1, 'up')), 'a');
  while (s.scene.k === 'talk') s = press(s, 'a');
  assert.equal(s.scene.k, 'battle'); assert.equal(s.scene.b.kind, 'boss'); assert.equal(s.scene.b.foes.length, 3);
  s = toMenu(s); s = presses(s, 'right', 'down', 'a'); assert.equal(s.scene.k, 'battle', 'no running from the leader');
  const coins = s.coins; s = fightOut(s); while (s.scene.k === 'talk') s = press(s, 'a');
  assert.equal(s.last, 'win'); assert.equal(s.flags.badge, true); assert.ok(s.coins > coins); assert.ok(s.saveTick > 0);
  let again = press(at(s, 'dojo', leader.x, leader.y + 1, 'up'), 'a'); while (again.scene.k === 'talk') again = press(again, 'a');
  assert.equal(again.scene.k, 'world', 'no rematch once the badge is won');
});

test('entering buildings through doors and leaving by the mat', () => {
  const door = MAPS.moegi.warps.find(w => w.to === 'lab');
  let s = at(ready(), 'moegi', door.x, door.y + 1, 'up'); s = walk(s, 'up'); assert.equal(s.map, 'lab');
  s = walk(s, 'down'); assert.equal(s.map, 'moegi'); assert.equal(s.sfx.id, 'door');
  assert.ok(healMon(s.party[0]));
});
