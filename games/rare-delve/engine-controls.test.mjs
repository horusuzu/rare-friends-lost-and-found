import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON_KEYS, CHORD_KEYS, NUMPAD, SOLO_KEYS, combine, roaming, shouldStop } from './controls.ts';
import { press } from './game.ts';
import { dive } from './test-kit.mjs';

test('held cardinal keys combine into diagonals; the latest key wins otherwise', () => {
  assert.equal(combine([]), null);
  assert.equal(combine(['n']), 'n');
  assert.equal(combine(['n', 'e']), 'ne');
  assert.equal(combine(['w', 's']), 'sw');
  assert.equal(combine(['n', 's']), 's');
  assert.equal(combine(['e', 'n', 's']), 'se');
});

test('every direction is reachable from the keyboard: WASD/arrows, QEZC and the keypad', () => {
  assert.deepEqual(new Set(Object.values(CHORD_KEYS)), new Set(['n', 's', 'w', 'e']));
  assert.deepEqual([SOLO_KEYS.q, SOLO_KEYS.e, SOLO_KEYS.z, SOLO_KEYS.c], ['nw', 'ne', 'sw', 'se']);
  assert.equal(Object.keys(NUMPAD).length, 9);
  assert.equal(NUMPAD.Numpad5, 'wait');
  assert.deepEqual([BUTTON_KEYS.i, BUTTON_KEYS.m, BUTTON_KEYS.t, BUTTON_KEYS.enter, BUTTON_KEYS.x], ['menu', 'map', 'turn', 'a', 'b']);
});

test('held walking only happens in the open dungeon and stops when something happens', () => {
  const s = dive(3);
  assert.equal(roaming(s), true);
  assert.equal(roaming(press(s, 'map')), false);
  assert.equal(roaming(press(s, 'turn')), false);
  assert.equal(roaming(press(s, 'menu')), false);
  assert.equal(shouldStop(s, s), true, 'a refused step stops the walk');
  assert.equal(shouldStop(s, press(s, 'wait')), false, 'a quiet turn keeps walking');
  assert.equal(shouldStop(s, { ...press(s, 'wait'), hero: { ...s.hero, hp: s.hero.hp - 1 } }), true, 'damage stops the walk');
});
