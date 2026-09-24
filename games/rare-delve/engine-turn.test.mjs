import test from 'node:test';
import assert from 'node:assert/strict';
import { act, heroAtk, heroDef, maxHpFor } from './turn.ts';
import { makeItem } from './items.ts';
import { SPECIES, expForLevel, FULL_MAX, HUNGER_TURNS, HP_PER_LEVEL, PIT_DAMAGE, BASE_HP } from './data.ts';
import { arena, OPEN, until } from './test-kit.mjs';

const wait = s => act(s, { k: 'wait' });
const move = dir => s => act(s, { k: 'move', dir });

test('a fresh dive starts at level 1 with full HP, strength and belly', () => {
  const s = arena(OPEN);
  assert.equal(s.hero.level, 1); assert.equal(s.hero.hp, BASE_HP); assert.equal(s.hero.maxHp, maxHpFor(1));
  assert.equal(s.hero.full, FULL_MAX); assert.equal(s.run.turn, 0); assert.equal(s.run.floor, 1);
});

test('8-directional moves take one turn; walls and wall corners block without spending a turn', () => {
  let s = arena(OPEN);
  const frozen = structuredClone(s);
  const e = act(s, { k: 'move', dir: 'e' });
  assert.deepEqual(s, frozen, 'input state is not mutated');
  assert.equal(e.hero.x, 6); assert.equal(e.run.turn, 1); assert.equal(e.hero.face, 'e');
  const ne = act(e, { k: 'move', dir: 'ne' }); assert.deepEqual([ne.hero.x, ne.hero.y], [7, 2]); assert.equal(ne.run.turn, 2);
  let wall = arena(OPEN, { hero: { x: 1, y: 1 } });
  const bumped = act(wall, { k: 'move', dir: 'n' });
  assert.deepEqual([bumped.hero.x, bumped.hero.y], [1, 1]); assert.equal(bumped.run.turn, 0); assert.equal(bumped.hero.face, 'n');
  const corner = arena(['#####', '#.#.#', '#.@.#', '#...#', '#####']);
  const c = act(corner, { k: 'move', dir: 'ne' });
  assert.deepEqual([c.hero.x, c.hero.y], [2, 2]); assert.equal(c.run.turn, 0, 'diagonal past a wall corner is refused');
});

test('every action gives every monster a turn: an awake monster closes in', () => {
  let s = arena(OPEN, { mons: [['newt', 9, 3, { sleep: 0, aware: true }]] });
  s = wait(s); assert.equal(s.run.mons[0].x, 8);
  s = wait(s); assert.equal(s.run.mons[0].x, 7);
  s = wait(s); assert.equal(s.run.mons[0].x, 6, 'stops adjacent');
  s = wait(s); assert.equal(s.run.mons[0].x, 6, 'attacks instead of stepping onto the hero');
});

test('attacking by moving into a monster: damage, kill, EXP and level-up', () => {
  const def = SPECIES.newt;
  let s = arena(OPEN, { mons: [['newt', 6, 3, { sleep: 5 }]], hero: { exp: expForLevel(2) - 1 } });
  s = until(s, move('e'), x => x.run.mons.length === 0, 30);
  assert.equal(s.run.mons.length, 0, 'the monster falls');
  assert.equal(s.hero.x, 5, 'attacking does not move the hero');
  assert.equal(s.hero.exp, expForLevel(2) - 1 + def.exp);
  assert.equal(s.hero.level, 2); assert.equal(s.hero.maxHp, maxHpFor(2)); assert.equal(maxHpFor(2) - maxHpFor(1), HP_PER_LEVEL);
  assert.ok(s.log.some(l => l[1].includes('Newt')));
  const swing = act(arena(OPEN), { k: 'attack' }); assert.equal(swing.run.turn, 1, 'swinging at air spends a turn');
});

test('diagonal attacks are blocked by corners, for the hero and for monsters', () => {
  const rows = ['#####', '#.#.#', '#.@.#', '#...#', '#####'];
  let s = arena(rows, { mons: [['newt', 3, 1, { sleep: 0, aware: true }]] });
  const tried = act(s, { k: 'move', dir: 'ne' });
  assert.equal(tried.run.mons[0].hp, s.run.mons[0].hp); assert.equal(tried.run.turn, 0);
  const hp = s.hero.hp; s = wait(s);
  assert.equal(s.hero.hp, hp, 'the newt cannot bite across the corner'); assert.deepEqual([s.run.mons[0].x, s.run.mons[0].y], [3, 2]);
});

test('monsters hurt the hero; equipment raises attack and defence', () => {
  let s = arena(OPEN, { mons: [['newt', 6, 3, { sleep: 0, aware: true }]] });
  s = until(s, wait, x => x.hero.hp < x.hero.maxHp, 20); assert.ok(s.hero.hp < s.hero.maxHp);
  const bare = arena(OPEN).hero;
  assert.ok(heroAtk({ ...bare, weapon: makeItem('knife') }) > heroAtk(bare));
  assert.ok(heroAtk({ ...bare, weapon: makeItem('knife', { e: 3 }) }) > heroAtk({ ...bare, weapon: makeItem('knife') }));
  assert.ok(heroAtk({ ...bare, str: 12 }) > heroAtk(bare));
  assert.ok(heroDef({ ...bare, shield: makeItem('bark', { e: 2 }) }) > heroDef({ ...bare, shield: makeItem('bark') }));
  assert.equal(heroDef(bare), 0);
});

test('hunger: the belly drops 1 per HUNGER_TURNS turns; empty, it drains HP each turn', () => {
  let s = arena(OPEN);
  for (let i = 0; i < HUNGER_TURNS; i++) s = wait(s);
  assert.equal(s.hero.full, FULL_MAX - 1);
  let h = arena(OPEN, { hero: { full: 0, hp: 10 } });
  h = wait(h); assert.equal(h.hero.hp, 9); h = wait(h); assert.equal(h.hero.hp, 8);
  h = until(arena(OPEN, { hero: { full: 0, hp: 2 } }), wait, x => x.scene.k === 'summary', 10);
  assert.equal(h.scene.k, 'summary'); assert.equal(h.scene.result, 'dead'); assert.match(h.scene.cause[1], /hunger/i);
});

test('natural regeneration slowly restores HP', () => {
  let s = arena(OPEN, { hero: { hp: 3 } });
  for (let i = 0; i < 40; i++) s = wait(s);
  assert.ok(s.hero.hp > 3 && s.hero.hp <= s.hero.maxHp);
});

test('waiting searches: hidden traps next to the hero are revealed', () => {
  let s = arena(OPEN, { traps: [{ x: 6, y: 3, kind: 'pit', found: false }, { x: 9, y: 1, kind: 'trip', found: false }] });
  s = wait(s);
  assert.equal(s.run.traps[0].found, true); assert.equal(s.run.traps[1].found, false);
});

test('traps: trip scatters an item, pit drops to the next floor with damage, alarm wakes the floor', () => {
  let trip = arena(OPEN, { traps: [{ x: 6, y: 3, kind: 'trip', found: false }], hero: { bag: [makeItem('bun'), makeItem('loaf')] } });
  trip = act(trip, { k: 'move', dir: 'e' });
  assert.equal(trip.hero.bag.length, 1); assert.equal(trip.run.items.length, 1); assert.equal(trip.run.traps[0].found, true);
  let pit = arena(OPEN, { traps: [{ x: 6, y: 3, kind: 'pit', found: false }] });
  pit = act(pit, { k: 'move', dir: 'e' });
  assert.equal(pit.run.floor, 2); assert.equal(pit.hero.hp, pit.hero.maxHp - PIT_DAMAGE); assert.equal(pit.scene.k, 'dungeon');
  let alarm = arena(OPEN, { traps: [{ x: 6, y: 3, kind: 'alarm', found: false }], mons: [['newt', 9, 1], ['newt', 9, 5]] });
  assert.ok(alarm.run.mons.every(m => m.sleep > 0));
  alarm = act(alarm, { k: 'move', dir: 'e' });
  assert.ok(alarm.run.mons.every(m => m.sleep === 0 && m.aware));
});

test('sleeping or confused heroes lose control', () => {
  let s = arena(OPEN, { hero: { sleep: 2 } });
  s = act(s, { k: 'move', dir: 'e' }); assert.equal(s.hero.x, 5); assert.equal(s.run.turn, 1); assert.equal(s.hero.sleep, 1);
  let c = arena(OPEN, { hero: { conf: 30 } }); const spots = new Set();
  for (let i = 0; i < 20; i++) { c = act({ ...c, hero: { ...c.hero, x: 5, y: 3 } }, { k: 'move', dir: 'e' }); spots.add(`${c.hero.x},${c.hero.y}`); }
  assert.ok(spots.size > 1, 'confusion scrambles direction');
});

test('the hero dies to a strong monster: run summary records floor, turns and cause', () => {
  let s = arena(OPEN, { hero: { hp: 1 }, mons: [['tortoise', 6, 3, { sleep: 0, aware: true }]] });
  s = until(s, wait, x => x.scene.k === 'summary', 30);
  assert.equal(s.scene.k, 'summary'); assert.equal(s.scene.result, 'dead'); assert.equal(s.scene.floor, 1);
  assert.ok(s.scene.turns >= 1); assert.match(s.scene.cause[1], /Magma Tortoise/);
});
