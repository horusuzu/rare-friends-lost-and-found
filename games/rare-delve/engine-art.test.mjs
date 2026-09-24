import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTER_ART, ITEM_ART, TILE_ART, PALETTE, artFor } from './art.ts';
import { SPECIES, ITEMS } from './data.ts';

const check = (sprite, label) => {
  assert.equal(sprite.rows.length, 16, label);
  for (const r of sprite.rows) { assert.equal(r.length, 16, `${label}: ${r}`); for (const ch of r) assert.ok(ch === '.' || Object.hasOwn(sprite.colors, ch), `${label}: '${ch}'`); }
};

test('every monster, item kind and tile has valid 16x16 pixel art in the cave palette', () => {
  assert.ok(Object.keys(PALETTE).length >= 8);
  for (const sp of Object.keys(SPECIES)) check(MONSTER_ART[sp], sp);
  for (const k of Object.keys(ITEMS)) check(artFor(k), k);
  for (const k of Object.keys(ITEM_ART)) check(ITEM_ART[k], k);
  for (const k of ['wall', 'floor', 'corridor', 'stairs', 'trip', 'pit', 'alarm', 'pedestal']) check(TILE_ART[k], k);
});
