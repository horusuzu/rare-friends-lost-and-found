import test from 'node:test';
import assert from 'node:assert/strict';
import {STYLES, openPack, stickerName, encodeCode, decodeCode, newAlbum, refillPacks, usePack, addSticker, moveSticker, serializeAlbum, parseAlbum,
  PACKS_PER_DAY, MAX_PACKS, MAX_ITEMS, PAGE_CAP} from './album.ts';
const me = {collection:'generations', tokenId:7730n};
const genesis = {collection:'genesis', tokenId:597n};

test('packs are deterministic, use my Friend, and follow the rarity weights', () => {
  assert.equal(STYLES.length, 8);
  assert.deepEqual(openPack(me, 42), openPack(me, 42));
  const s = openPack(me, 42); assert.equal(s.tokenId, 7730n); assert.equal(s.collection, 'generations');
  const counts = new Array(8).fill(0); const N = 20000;
  for (let i = 0; i < N; i++) counts[openPack(me, i * 2654435761 >>> 0).style]++;
  const total = STYLES.reduce((a, st) => a + st.weight, 0);
  STYLES.forEach((st, i) => assert.ok(Math.abs(counts[i] / N - st.weight / total) < 0.015, `${st.id} ${counts[i] / N}`));
  assert.ok(STYLES.find(st => st.id === 'gold').weight < STYLES.find(st => st.id === 'matte').weight);
  for (let i = 0; i < 200; i++) { const p = openPack(genesis, i); assert.ok(p.backdrop >= 0 && p.backdrop < 8 && p.hue >= 0 && p.hue < 12 && p.serial >= 1 && p.serial <= 9999); }
  assert.match(stickerName(s, 'ja'), /\S/); assert.match(stickerName(s, 'en'), /\S/);
});

test('trade codes round-trip, forgive formatting and reject typos', () => {
  for (const owner of [me, genesis, {collection:'generations', tokenId:(1n << 60n) + 12345n}]) for (let i = 0; i < 50; i++) {
    const s = openPack(owner, i); const code = encodeCode(s);
    assert.match(code, /^RF-[0-9A-Z]{4}(-[0-9A-Z]{1,4})+$/); assert.deepEqual(decodeCode(code), s);
    assert.deepEqual(decodeCode(` ${code.toLowerCase().replaceAll('-', ' ')} `), s);
  }
  const code = encodeCode(openPack(me, 7)), body = code.replace(/^RF-/, '').replaceAll('-', '');
  for (let i = 0; i < body.length; i++) {
    const swapped = body.slice(0, i) + (body[i] === 'A' ? 'B' : 'A') + body.slice(i + 1);
    assert.throws(() => decodeCode(`RF-${swapped}`), /code/i, `typo at ${i}`);
  }
  for (const bad of ['', 'hello', 'RF-', 'RF-ZZZZ', code.slice(0, -3)]) assert.throws(() => decodeCode(bad), /code/i);
  assert.equal(decodeCode(code.replaceAll('0', 'O')).tokenId, decodeCode(code).tokenId, 'O reads as 0');
});

test('daily packs refill once per day up to a cap; opening spends one', () => {
  let a = newAlbum('2026-09-24'); assert.equal(a.packs, PACKS_PER_DAY);
  assert.equal(refillPacks(a, '2026-09-24'), a, 'same day: unchanged');
  a = refillPacks(a, '2026-09-25'); assert.equal(a.packs, Math.min(MAX_PACKS, PACKS_PER_DAY * 2)); assert.equal(a.day, '2026-09-25');
  for (let d = 26; d < 30; d++) a = refillPacks(a, `2026-09-${d}`); assert.equal(a.packs, MAX_PACKS);
  const before = structuredClone(a); const used = usePack(a); assert.equal(used.packs, MAX_PACKS - 1); assert.deepEqual(a, before);
  assert.throws(() => usePack({...a, packs:0}), /pack/i);
});

test('stickers land on pages, never twice from the same trade code, within limits', () => {
  let a = newAlbum('2026-09-24');
  for (let i = 0; i < PAGE_CAP + 1; i++) a = addSticker(a, openPack(me, i), 'pack', i + 1);
  assert.equal(a.items.length, PAGE_CAP + 1);
  assert.ok(a.items.every(it => it.x >= 0 && it.x <= 1 && it.y >= 0 && it.y <= 1 && Math.abs(it.rot) <= 0.25));
  assert.equal(a.items.filter(it => it.page === 0).length, PAGE_CAP); assert.equal(a.items.at(-1).page, 1);
  const traded = openPack(genesis, 3);
  a = addSticker(a, traded, 'trade', 99);
  assert.throws(() => addSticker(a, traded, 'trade', 100), /already/i);
  assert.equal(addSticker(a, openPack(me, 0), 'pack', 5).items.length, a.items.length + 1, 'duplicate pack pulls are allowed');
  assert.throws(() => addSticker(a, openPack(me, 0), 'trade', 6), /already/i, 'a pack sticker cannot be copied in through its own trade code');
  let full = newAlbum('2026-09-24'); for (let i = 0; i < MAX_ITEMS; i++) full = addSticker(full, openPack(me, i), 'pack', i);
  assert.throws(() => addSticker(full, openPack(me, 999), 'pack', 1), /full/i);
  const moved = moveSticker(a, 0, 3, -2); assert.equal(moved.items[0].x, 1); assert.equal(moved.items[0].y, 0); assert.notEqual(a.items[0].x, 1);
  assert.throws(() => moveSticker(a, 999, .5, .5), /sticker/i);
});

test('albums save compactly and reject tampered or oversized data', () => {
  let a = newAlbum('2026-09-24');
  for (let i = 0; i < MAX_ITEMS; i++) a = addSticker(a, openPack(i % 2 ? me : genesis, i), i % 3 ? 'pack' : 'trade', i);
  const raw = serializeAlbum(a); assert.ok(new TextEncoder().encode(raw).byteLength < 32 * 1024, `size ${raw.length}`);
  assert.deepEqual(parseAlbum(raw), a);
  for (const bad of ['nope', '{}', JSON.stringify({...JSON.parse(raw), version:2}), JSON.stringify({...JSON.parse(raw), packs:-1}),
    JSON.stringify({...JSON.parse(raw), items:[['bogus']]}),
    JSON.stringify({...JSON.parse(raw), items:[[JSON.parse(raw).items[0][0],'p',0,1001,0,0]]}),
    JSON.stringify({...JSON.parse(raw), items:[['RF-ZZZZ-ZZZZ-ZZZZ','t',0,0,0,0]]}),
    JSON.stringify({...JSON.parse(raw), items:new Array(MAX_ITEMS + 1).fill(JSON.parse(raw).items[0])})]) assert.throws(() => parseAlbum(bad));
  assert.equal(parseAlbum(null), null);
});

test('RF packs: the SDK outcome decides the finish; RF spent is counted and saved', async () => {
  const {premiumSticker, recordRfPack, RF_PACK_OUTCOMES} = await import('./album.ts');
  assert.equal(RF_PACK_OUTCOMES.length, 4);
  const styleOf = id => STYLES[premiumSticker(me, id, 5).style].id;
  for (let seed = 0; seed < 50; seed++) assert.ok(['puffy', 'clear', 'glitter'].includes(STYLES[premiumSticker(me, 1, seed).style].id));
  assert.equal(styleOf(2), 'holo'); assert.equal(styleOf(3), 'prism'); assert.equal(styleOf(4), 'gold');
  assert.equal(premiumSticker(me, 4, 5).tokenId, 7730n);
  assert.throws(() => premiumSticker(me, 0, 1), /outcome/i); assert.throws(() => premiumSticker(me, 5, 1), /outcome/i);
  let a = newAlbum('2026-09-24'); assert.equal(a.rfPacks, 0);
  a = recordRfPack(recordRfPack(a)); assert.equal(a.rfPacks, 2);
  assert.deepEqual(parseAlbum(serializeAlbum(a)), a);
  const old = JSON.parse(serializeAlbum(a)); delete old.rfPacks;
  assert.equal(parseAlbum(JSON.stringify(old)).rfPacks, 0, 'older saves without the counter still load');
  assert.throws(() => parseAlbum(JSON.stringify({...old, rfPacks:-1})));
});
