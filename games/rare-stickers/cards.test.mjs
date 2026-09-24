import test from 'node:test';
import assert from 'node:assert/strict';
import {openPack, premiumSticker, STYLES} from './album.ts';
import {cardStats, ELEMENTS, advantage, battle, encodeBattle, decodeBattle, DECK_SIZE, battleSeed} from './cards.ts';
const me = {collection:'generations', tokenId:7730n}, you = {collection:'genesis', tokenId:597n};
const deck = (owner, base) => Array.from({length:DECK_SIZE}, (_, i) => openPack(owner, base + i));

test('card stats come from the sticker: rarer finishes are stronger, the element follows the colour', () => {
  assert.equal(ELEMENTS.length, 3);
  const byRarity = r => { const s = premiumSticker(me, r, 11); return cardStats(s); };
  const common = cardStats({...openPack(me, 1), style:0}), gold = byRarity(4);
  assert.ok(gold.hp > common.hp && gold.atk > common.atk && gold.def >= common.def);
  for (let i = 0; i < 200; i++) {
    const c = cardStats(openPack(me, i));
    assert.ok(c.hp >= 20 && c.hp <= 60 && c.atk >= 5 && c.atk <= 20 && c.def >= 2 && c.def <= 12, JSON.stringify(c));
    assert.ok(c.element >= 0 && c.element < 3);
  }
  assert.deepEqual(cardStats(openPack(me, 3)), cardStats(openPack(me, 3)));
});

test('elements form a triangle: each beats one and loses to one', () => {
  for (let a = 0; a < 3; a++) {
    assert.equal(advantage(a, a), 1);
    const wins = [0, 1, 2].filter(b => advantage(a, b) > 1), loses = [0, 1, 2].filter(b => advantage(a, b) < 1);
    assert.equal(wins.length, 1); assert.equal(loses.length, 1);
    assert.equal(advantage(wins[0], a) < 1, true);
  }
});

test('battles are deterministic best-of-five with a full, replayable log', () => {
  const a = deck(me, 100), b = deck(you, 200), seed = battleSeed(a, b, 42);
  const r1 = battle(a, b, seed), r2 = battle(a, b, seed);
  assert.deepEqual(r1, r2);
  assert.equal(r1.rounds.length, DECK_SIZE);
  assert.ok(['a', 'b', 'draw'].includes(r1.winner));
  const aWins = r1.rounds.filter(r => r.winner === 'a').length, bWins = r1.rounds.filter(r => r.winner === 'b').length;
  if (aWins !== bWins) assert.equal(r1.winner, aWins > bWins ? 'a' : 'b');
  for (const round of r1.rounds) {
    assert.ok(round.hits.length > 0 && round.hits.length <= 40);
    assert.ok(round.hits.every(h => h.damage >= 1 && ['a', 'b'].includes(h.by)));
    assert.ok(round.hpA >= 0 && round.hpB >= 0 && (round.hpA === 0 || round.hpB === 0 || round.hits.length === 40));
  }
  // Mirror: swapping sides swaps the result.
  const mirror = battle(b, a, seed);
  assert.equal(mirror.winner, r1.winner === 'draw' ? 'draw' : r1.winner === 'a' ? 'b' : 'a');
  // A stronger deck wins most seeds.
  const strong = Array.from({length:DECK_SIZE}, (_, i) => premiumSticker(me, 4, i)), weak = Array.from({length:DECK_SIZE}, (_, i) => ({...openPack(you, i), style:0}));
  let wins = 0; for (let s = 0; s < 100; s++) if (battle(strong, weak, s).winner === 'a') wins++;
  assert.ok(wins >= 80, `strong deck won ${wins}/100`);
  assert.throws(() => battle(a.slice(0, 4), b, 1), /deck/i);
});

test('battle codes carry the owner, the nonce and the ordered deck, and reject typos', () => {
  const d = deck(me, 7), code = encodeBattle({owner:me, nonce:123456789, deck:d});
  assert.match(code, /^RFB-[0-9A-Z-]+$/);
  const back = decodeBattle(code);
  assert.deepEqual(back, {owner:me, nonce:123456789, deck:d});
  assert.deepEqual(decodeBattle(code.toLowerCase().replaceAll('-', ' ')), back);
  const body = code.replace(/^RFB-/, '').replaceAll('-', '');
  for (const i of [0, 5, 20, body.length - 1]) {
    const bad = body.slice(0, i) + (body[i] === 'A' ? 'B' : 'A') + body.slice(i + 1);
    assert.throws(() => decodeBattle(`RFB-${bad}`), /code/i);
  }
  for (const bad of ['', 'RF-1234-5678', 'RFB-', 'hello']) assert.throws(() => decodeBattle(bad), /code/i);
  const g = encodeBattle({owner:you, nonce:0, deck:deck(you, 9)}); assert.deepEqual(decodeBattle(g).owner, you);
  assert.throws(() => encodeBattle({owner:me, nonce:1, deck:d.slice(0, 3)}), /deck/i);
  assert.equal(battleSeed(d, deck(you, 1), 5), battleSeed(d, deck(you, 1), 5));
  assert.notEqual(battleSeed(d, deck(you, 1), 5), battleSeed(d, deck(you, 1), 6));
});
