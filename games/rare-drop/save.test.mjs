import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSave, serializeSave, EMPTY_RECORD} from './save.ts';
import {TIERS} from './engine.ts';

test('a fresh player has sound on and no record', () => {
  assert.deepEqual(EMPTY_RECORD, {best: 0, bestTier: 0, sound: true});
  assert.equal(parseSave(null, TIERS), null);
  assert.equal(parseSave('', TIERS), null);
});

test('saves written before the sound setting still load, with sound on', () => {
  const old = JSON.stringify({version: 1, best: 812, bestTier: 8});
  assert.deepEqual(parseSave(old, TIERS), {best: 812, bestTier: 8, sound: true});
});

test('the sound setting round-trips through the save', () => {
  for (const sound of [false, true]) {
    const record = {best: 1234, bestTier: TIERS, sound};
    const raw = serializeSave(record);
    assert.deepEqual(JSON.parse(raw), {version: 1, ...record});
    assert.deepEqual(parseSave(raw, TIERS), record);
  }
});

test('a malformed sound field falls back to sound on without losing the record', () => {
  for (const sound of ['off', 0, null, {}]) {
    assert.deepEqual(parseSave(JSON.stringify({version: 1, best: 5, bestTier: 2, sound}), TIERS), {best: 5, bestTier: 2, sound: true});
  }
});

test('invalid records are still rejected', () => {
  for (const raw of ['{', JSON.stringify({version: 2, best: 1, bestTier: 1}), JSON.stringify({version: 1, best: -1, bestTier: 1}),
    JSON.stringify({version: 1, best: 1.5, bestTier: 1}), JSON.stringify({version: 1, best: 1, bestTier: TIERS + 1}), JSON.stringify({version: 1, best: 1e9, bestTier: 1})]) {
    assert.throws(() => parseSave(raw, TIERS), undefined, raw);
  }
});
