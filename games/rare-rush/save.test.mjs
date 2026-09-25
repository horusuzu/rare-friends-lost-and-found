import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSave, serializeSave, EMPTY_RECORD} from './save.ts';

test('a fresh rider has sound on and no record', () => {
  assert.deepEqual(EMPTY_RECORD, {best: 0, bestDistance: 0, topSpeed: 0, sound: true});
  assert.equal(parseSave(null), null); assert.equal(parseSave(''), null);
});

test('saves written before the sound setting still load, with sound on', () => {
  const old = JSON.stringify({version: 1, best: 4321, bestDistance: 2100, topSpeed: 388});
  assert.deepEqual(parseSave(old), {best: 4321, bestDistance: 2100, topSpeed: 388, sound: true});
});

test('the sound setting round-trips through the save', () => {
  for (const sound of [false, true]) {
    const record = {best: 99, bestDistance: 1500, topSpeed: 250, sound};
    const raw = serializeSave(record);
    assert.deepEqual(JSON.parse(raw), {version: 1, ...record});
    assert.deepEqual(parseSave(raw), record);
  }
});

test('a malformed sound field falls back to sound on without losing the record', () => {
  for (const sound of ['off', 0, null, []]) {
    assert.deepEqual(parseSave(JSON.stringify({version: 1, best: 5, bestDistance: 6, topSpeed: 7, sound})), {best: 5, bestDistance: 6, topSpeed: 7, sound: true});
  }
});

test('invalid records are still rejected', () => {
  for (const raw of ['{', JSON.stringify({version: 2, best: 1, bestDistance: 1, topSpeed: 1}), JSON.stringify({version: 1, best: -1, bestDistance: 1, topSpeed: 1}),
    JSON.stringify({version: 1, best: 1, bestDistance: 1.5, topSpeed: 1}), JSON.stringify({version: 1, best: 1, bestDistance: 1}), JSON.stringify({version: 1, best: 1e9, bestDistance: 1, topSpeed: 1})]) {
    assert.throws(() => parseSave(raw), undefined, raw);
  }
});
