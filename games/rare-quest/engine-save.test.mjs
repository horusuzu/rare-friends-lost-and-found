import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, loadGame, SAVE_LIMIT } from './save.ts';
import { newGame, press } from './game.ts';
import { createMon, expForLevel } from './mon.ts';

const TOKEN = 'generations:7730';
const ready = () => { let s = newGame(TOKEN, 3); while (s.scene.k === 'talk') s = press(s, 'a'); return s; };

test('round trip: a saved game restores position, party, items, acorns, flags and notes in the world', () => {
  const s = { ...ready(), map: 'wakaba', x: 9, y: 20, face: 'left', coins: 321, items: { ribbon: 7, herb: 1 },
    party: [createMon('friend', 9, TOKEN), { ...createMon('mossball', 6), hp: 4 }], flags: { lab: true, badge: true, rest: true },
    seen: ['mossball', 'yamyam'], caught: ['mossball'], steps: 55 };
  const raw = serialize(s);
  assert.ok(raw.length < 2000, `compact: ${raw.length}`); assert.ok(raw.length <= SAVE_LIMIT);
  const back = loadGame(raw, TOKEN, 77);
  for (const k of ['map', 'x', 'y', 'face', 'coins', 'items', 'party', 'flags', 'seen', 'caught', 'steps']) assert.deepEqual(back[k], s[k], k);
  assert.equal(back.scene.k, 'world'); assert.equal(back.seed, 77); assert.equal(back.token, TOKEN); assert.equal(back.saving, false);
});

test('empty storage loads nothing; malformed or tampered saves are rejected', () => {
  assert.equal(loadGame(null, TOKEN, 1), null); assert.equal(loadGame('', TOKEN, 1), null);
  const good = JSON.parse(serialize(ready()));
  const bad = [
    'not json', '[]', '{"v":2}',
    { ...good, t: 'generations:1' },
    { ...good, m: 'mars' }, { ...good, x: 0, y: 0 }, { ...good, x: 1.5 }, { ...good, f: 'north' },
    { ...good, p: [] }, { ...good, p: Array.from({ length: 7 }, () => good.p[0]) },
    { ...good, p: [['dragon', 5, 100, 10, [['dot-tackle', 1]]]] },
    { ...good, p: [[good.p[0][0], 0, 0, 10, good.p[0][4]]] },
    { ...good, p: [[good.p[0][0], 5, expForLevel(9), 10, good.p[0][4]]] },
    { ...good, p: [[good.p[0][0], 5, expForLevel(5), 9999, good.p[0][4]]] },
    { ...good, p: [[good.p[0][0], 5, expForLevel(5), 10, [['laser', 1]]]] },
    { ...good, p: [[good.p[0][0], 5, expForLevel(5), 10, [['dot-tackle', 999]]]] },
    { ...good, p: [[good.p[0][0], 5, expForLevel(5), 10, []]] },
    { ...good, p: [['mossball', 5, expForLevel(5), 10, [['dot-tackle', 1]]]] },
    { ...good, i: [-1, 0] }, { ...good, i: [1] }, { ...good, c: 1e12 }, { ...good, g: [1, 1] }, { ...good, g: [1, 2, 0] },
    { ...good, s: ['mossball', 'mossball'] }, { ...good, s: ['unicorn'] }, { ...good, k: ['mossball'], s: [] }, { ...good, n: -3 },
  ];
  for (const b of bad) assert.throws(() => loadGame(typeof b === 'string' ? b : JSON.stringify(b), TOKEN, 1), undefined, JSON.stringify(b).slice(0, 120));
  assert.throws(() => loadGame('x'.repeat(SAVE_LIMIT + 1), TOKEN, 1));
});

test('a save whose whole party had fainted resumes healed', () => {
  const s = { ...ready(), party: [{ ...createMon('friend', 5, TOKEN), hp: 0 }] };
  const back = loadGame(serialize(s), TOKEN, 1); assert.ok(back.party[0].hp > 0);
});

test('Genesis tokens are namespaced separately', () => {
  const g = newGame('genesis:597', 1);
  const raw = serialize(g); assert.throws(() => loadGame(raw, 'generations:597', 1));
  assert.equal(loadGame(raw, 'genesis:597', 1).party[0].token, 'genesis:597');
});
