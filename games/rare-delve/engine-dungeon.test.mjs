import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, mapFromRows, canStep, isFloor, roomIndex, visibleIdx, distanceMap } from './dungeon.ts';
import { rand, rngFrom, hashString, mix } from './rng.ts';
import { W, H } from './data.ts';

test('rng: mulberry32 steps are deterministic and in range; helpers stay pure', () => {
  assert.deepEqual(rand(42), rand(42));
  const a = rngFrom(7), b = rngFrom(7);
  const xs = Array.from({ length: 50 }, () => a.int(10)), ys = Array.from({ length: 50 }, () => b.int(10));
  assert.deepEqual(xs, ys); assert.ok(xs.every(v => v >= 0 && v < 10));
  assert.equal(a.seed, b.seed);
  assert.ok(Array.from({ length: 100 }, () => a.range(3, 5)).every(v => v >= 3 && v <= 5));
  const arr = [1, 2, 3, 4, 5]; const sh = a.shuffle(arr); assert.deepEqual(arr, [1, 2, 3, 4, 5]); assert.deepEqual([...sh].sort(), arr);
  assert.ok([1, 2, 3].includes(a.pick([1, 2, 3])));
  assert.equal(a.chance(0), false); assert.equal(a.chance(1), true);
  assert.equal(hashString('abc'), hashString('abc')); assert.notEqual(mix(1, 2), mix(2, 1));
});

test('generation is deterministic per seed and differs across seeds', () => {
  assert.deepEqual(generateMap(1234), generateMap(1234));
  assert.notEqual(generateMap(1234).tiles, generateMap(4321).tiles);
});

test('floors are 40x28, walled in, with at least five rooms, and everything is reachable', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const m = generateMap(seed * 7919);
    assert.equal(m.w, W); assert.equal(m.h, H); assert.equal(m.tiles.length, W * H);
    for (let x = 0; x < W; x++) { assert.ok(!isFloor(m, x, 0)); assert.ok(!isFloor(m, x, H - 1)); }
    for (let y = 0; y < H; y++) { assert.ok(!isFloor(m, 0, y)); assert.ok(!isFloor(m, W - 1, y)); }
    assert.ok(m.rooms.length >= 5, `rooms ${m.rooms.length}`);
    const [sx, sy] = m.start, [tx, ty] = m.stairs;
    assert.ok(roomIndex(m, sx, sy) >= 0 && roomIndex(m, tx, ty) >= 0, 'start and stairs are in rooms');
    assert.ok(sx !== tx || sy !== ty);
    const d = distanceMap(m, sx, sy);
    assert.ok(d[ty * W + tx] > 0, `stairs reachable (seed ${seed})`);
    for (const r of m.rooms) assert.ok(d[r.y * W + r.x] >= 0, `room ${JSON.stringify(r)} reachable`);
    for (let i = 0; i < W * H; i++) if (m.tiles[i] !== '#') assert.ok(d[i] >= 0, `tile ${i % W},${Math.floor(i / W)} reachable (seed ${seed})`);
  }
});

test('mapFromRows reads rooms, corridors, stairs and the start', () => {
  const m = mapFromRows(['#######', '#..#..#', '#.@,.>#', '#..#..#', '#######']);
  assert.deepEqual(m.start, [2, 2]); assert.deepEqual(m.stairs, [5, 2]);
  assert.equal(m.rooms.length, 2); assert.ok(roomIndex(m, 3, 2) >= 0, 'a door tile belongs to a room');
  assert.ok(isFloor(m, 3, 2)); assert.ok(!isFloor(m, 3, 1)); assert.ok(!isFloor(m, -1, 0));
});

test('8-way steps: diagonals are blocked by wall corners', () => {
  const m = mapFromRows([
    '#####',
    '#.#.#',
    '#.@.#',
    '#...#',
    '#####',
  ]);
  assert.ok(canStep(m, 2, 2, 's')); assert.ok(canStep(m, 2, 2, 'e')); assert.ok(!canStep(m, 2, 2, 'n'));
  assert.ok(!canStep(m, 2, 2, 'ne'), 'wall at north blocks the corner'); assert.ok(!canStep(m, 2, 2, 'nw'));
  assert.ok(canStep(m, 2, 2, 'se')); assert.ok(canStep(m, 2, 2, 'sw'));
  assert.ok(!canStep(m, 1, 3, 'w'));
});

test('lit rooms reveal the whole room plus its walls; corridors reveal one tile around', () => {
  const m = mapFromRows([
    '############',
    '#...####...#',
    '#.@.,,,,...#',
    '#...####...#',
    '############',
  ]);
  const inRoom = new Set(visibleIdx(m, 2, 2));
  assert.ok(inRoom.has(1 * m.w + 1) && inRoom.has(3 * m.w + 3) && inRoom.has(0));
  assert.ok(!inRoom.has(2 * m.w + 6), 'corridor beyond the door stays dark');
  assert.ok(roomIndex(m, 4, 2) >= 0, 'doorway belongs to the room');
  const inCorridor = new Set(visibleIdx(m, 5, 2));
  assert.equal(inCorridor.size, 9); assert.ok(inCorridor.has(2 * m.w + 6) && !inCorridor.has(2 * m.w + 7));
  const d = distanceMap(m, 2, 2); assert.equal(d[2 * m.w + 10], 8); assert.equal(d[0], -1);
});
