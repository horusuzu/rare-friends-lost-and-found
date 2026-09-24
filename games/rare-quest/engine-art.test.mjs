import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE_ART_CHARS, tileArt, npcArt, PALETTE } from './art.ts';
import { TILE_CHARS, MAPS } from './world.ts';

const check = (grid, label) => { assert.equal(grid.length, 16, label); for (const r of grid) assert.match(r, /^[.0-3]{16}$/, `${label}: ${r}`); };

test('every map tile and every NPC has valid 16x16 four-shade art', () => {
  assert.equal(PALETTE.length, 4);
  for (const ch of TILE_CHARS) { const t = tileArt(ch); assert.ok(t, `tile ${ch}`); check(t.art, `tile ${ch}`); if (t.base) check(t.base, `base ${ch}`); }
  assert.deepEqual([...TILE_ART_CHARS].sort(), [...TILE_CHARS].sort());
  assert.equal(tileArt('?'), null);
  for (const map of Object.values(MAPS)) for (const n of map.npcs) check(npcArt(n.look), n.look);
});
