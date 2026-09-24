import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, START, tileAt, isBlocked, isWalkableTile, warpAt, isGrass, npcAt, signAt, facingTarget, rollEncounter, stepFrom, ENCOUNTER_RATE, TILE_CHARS } from './world.ts';
import { SPECIES, WILD_SPECIES } from './data.ts';

const key = (m, x, y) => `${m}:${x},${y}`;

test('every map is rectangular and uses only known tiles', () => {
  for (const map of Object.values(MAPS)) {
    assert.ok(map.rows.length >= 7);
    for (const row of map.rows) { assert.equal(row.length, map.rows[0].length, `${map.id} row width`); for (const c of row) assert.ok(TILE_CHARS.includes(c), `${map.id}: ${c}`); }
    assert.ok(map.name[0] && map.name[1]);
  }
});

test('collision: out of bounds, trees, water, walls and NPCs block; paths, floors and grass do not', () => {
  assert.equal(isBlocked('moegi', -1, 0), true); assert.equal(isBlocked('moegi', 0, 0), true, 'tree');
  assert.equal(isBlocked('moegi', 99, 99), true); assert.equal(tileAt('moegi', 99, 99), null);
  assert.equal(isBlocked('moegi', START.x, START.y), false);
  for (const map of Object.values(MAPS)) for (const npc of map.npcs) assert.equal(isBlocked(map.id, npc.x, npc.y), true, npc.id);
  assert.equal(isWalkableTile('"'), true); assert.equal(isWalkableTile('~'), false); assert.equal(isWalkableTile('T'), false);
  assert.throws(() => tileAt('nowhere', 0, 0));
  assert.deepEqual(stepFrom(3, 4, 'up'), { x: 3, y: 3 }); assert.deepEqual(stepFrom(3, 4, 'right'), { x: 4, y: 4 });
});

test('warps sit on walkable tiles, land on walkable non-warp tiles and have a way back', () => {
  for (const map of Object.values(MAPS)) for (const w of map.warps) {
    assert.equal(isBlocked(map.id, w.x, w.y), false, `${map.id} warp ${w.x},${w.y}`);
    assert.equal(warpAt(map.id, w.x, w.y), w);
    assert.ok(MAPS[w.to]); assert.equal(isBlocked(w.to, w.tx, w.ty), false, `dest ${w.to} ${w.tx},${w.ty}`);
    assert.equal(warpAt(w.to, w.tx, w.ty), null, 'landing is not a warp');
    const back = ['up', 'down', 'left', 'right'].map(d => stepFrom(w.tx, w.ty, d)).some(p => warpAt(w.to, p.x, p.y)?.to === map.id);
    assert.ok(back, `${map.id}->${w.to} has a way back`);
  }
});

test('the whole world is connected from the start and every NPC and sign can be reached', () => {
  const seen = new Set([key(START.map, START.x, START.y)]), queue = [[START.map, START.x, START.y]];
  while (queue.length) {
    const [m, x, y] = queue.shift();
    const warp = warpAt(m, x, y);
    const next = warp ? [[warp.to, warp.tx, warp.ty]] : [];
    for (const d of ['up', 'down', 'left', 'right']) { const p = stepFrom(x, y, d); if (!isBlocked(m, p.x, p.y)) next.push([m, p.x, p.y]); }
    for (const n of next) { const k = key(...n); if (!seen.has(k)) { seen.add(k); queue.push(n); } }
  }
  const maps = new Set([...seen].map(k => k.split(':')[0]));
  assert.deepEqual([...maps].sort(), Object.keys(MAPS).sort());
  for (const map of Object.values(MAPS)) {
    for (const t of [...map.npcs, ...map.signs]) {
      const reachable = ['up', 'down', 'left', 'right'].some(d => {
        const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[d];
        const p = stepFrom(t.x, t.y, d); if (seen.has(key(map.id, p.x, p.y))) return facingTarget(map.id, p.x, p.y, back)?.id === t.id;
        const q = stepFrom(p.x, p.y, d); return tileAt(map.id, p.x, p.y) === 'C' && seen.has(key(map.id, q.x, q.y)) && facingTarget(map.id, q.x, q.y, back)?.id === t.id;
      });
      assert.ok(reachable, `${map.id}:${t.id}`);
    }
  }
});

test('interaction targets: signs, NPCs and NPCs across a counter', () => {
  const keeper = MAPS.rest.npcs.find(n => n.id === 'keeper');
  assert.equal(facingTarget('rest', keeper.x, keeper.y + 2, 'up').id, 'keeper');
  const sign = MAPS.moegi.signs[0];
  assert.equal(facingTarget('moegi', sign.x, sign.y + 1, 'up').kind, 'sign');
  assert.equal(signAt('moegi', sign.x, sign.y), sign); assert.equal(npcAt('rest', keeper.x, keeper.y), keeper);
  assert.equal(facingTarget('moegi', START.x, START.y, 'down'), null);
});

test('tall grass only on the route; its encounter table covers every wild species', () => {
  const grassy = Object.values(MAPS).filter(m => m.rows.some(r => r.includes('"'))).map(m => m.id);
  assert.deepEqual(grassy, ['wakaba']);
  assert.equal(isGrass('wakaba', 9, 23), true);
  const table = MAPS.wakaba.encounters.map(e => e.species);
  assert.deepEqual([...new Set(table)].sort(), [...WILD_SPECIES].sort());
  for (const e of MAPS.wakaba.encounters) { assert.ok(SPECIES[e.species]); assert.ok(e.min >= 2 && e.max >= e.min && e.max <= 8); }
});

test('rollEncounter is deterministic, near its rate and within level ranges', () => {
  assert.deepEqual(rollEncounter('wakaba', 5), rollEncounter('wakaba', 5));
  assert.equal(rollEncounter('moegi', 5).mon, null);
  let seed = 11, hits = 0; const N = 4000;
  for (let i = 0; i < N; i++) {
    const r = rollEncounter('wakaba', seed); seed = r.seed;
    if (r.mon) { hits++; const e = MAPS.wakaba.encounters.find(x => x.species === r.mon.species); assert.ok(r.mon.level >= e.min && r.mon.level <= e.max); }
  }
  assert.ok(Math.abs(hits / N - ENCOUNTER_RATE) < 0.03, `rate ${hits / N}`);
});
