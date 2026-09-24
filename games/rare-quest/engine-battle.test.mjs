import test from 'node:test';
import assert from 'node:assert/strict';
import { rand, hashString } from './rng.ts';
import { TYPES, effectiveness, MOVES, SPECIES, WILD_SPECIES, ITEMS } from './data.ts';
import { createMon, speciesOf, partnerSpecies, statsOf, expForLevel, gainExp, healMon, isFainted, monName, MAX_LEVEL, MAX_MOVES } from './mon.ts';
import { damage, captureChance, runChance, startBattle, takeTurn, switchIn, expReward, coinReward, HERB_HEAL } from './battle.ts';

const ctxOf = (party, foes, kind = 'wild', extra = {}) => ({ party, items: { ribbon: 3, herb: 2 }, coins: 0, seed: 42, battle: startBattle(kind, foes), ...extra });
const texts = lines => lines.map(l => l.text[1]).join(' | ');

test('rng is deterministic, uniform in [0,1) and returns a new uint32 seed', () => {
  const [a, s1] = rand(1), [b, s2] = rand(1);
  assert.equal(a, b); assert.equal(s1, s2); assert.ok(a >= 0 && a < 1);
  assert.ok(Number.isInteger(s1) && s1 >= 0 && s1 <= 0xffffffff); assert.notEqual(s1, 1);
  let seed = 7, sum = 0; for (let i = 0; i < 2000; i++) { const [v, n] = rand(seed); sum += v; seed = n; }
  assert.ok(Math.abs(sum / 2000 - 0.5) < 0.05);
  assert.equal(hashString('generations:7730'), hashString('generations:7730'));
  assert.notEqual(hashString('generations:7730'), hashString('genesis:7730'));
});

test('six original types with a small, symmetric-enough type chart', () => {
  assert.equal(TYPES.length, 6);
  for (const a of TYPES) for (const d of TYPES) assert.ok([0.5, 1, 2].includes(effectiveness(a, d)));
  assert.equal(effectiveness('sprout', 'tide'), 2); assert.equal(effectiveness('tide', 'ember'), 2); assert.equal(effectiveness('ember', 'sprout'), 2);
  assert.equal(effectiveness('stone', 'gale'), 2); assert.equal(effectiveness('ember', 'tide'), 0.5); assert.equal(effectiveness('pixel', 'pixel'), 1);
  for (const a of TYPES) assert.ok(TYPES.some(d => effectiveness(a, d) === 2) || a === 'pixel', `${a} has a strength`);
});

test('at least 8 original wild species with valid moves, learnsets and 16x16 four-shade art', () => {
  assert.ok(WILD_SPECIES.length >= 8);
  const names = new Set();
  for (const id of Object.keys(SPECIES)) {
    const s = SPECIES[id];
    assert.equal(s.id, id); assert.ok(TYPES.includes(s.type));
    assert.ok(s.name[0] && s.name[1]); names.add(s.name[1]);
    assert.ok(s.catchRate > 0 && s.catchRate <= 1); assert.ok(s.expYield > 0);
    assert.ok(s.learnset.length >= 2 && s.learnset[0][0] === 1);
    for (const [lv, move] of s.learnset) { assert.ok(MOVES[move], move); assert.ok(lv >= 1 && lv <= MAX_LEVEL); }
    assert.equal(s.art.length, 16); for (const row of s.art) assert.match(row, /^[.0-3]{16}$/);
  }
  assert.equal(names.size, Object.keys(SPECIES).length, 'unique names');
  for (const m of Object.values(MOVES)) {
    assert.ok(TYPES.includes(m.type)); assert.ok(m.power >= 20 && m.power <= 120); assert.ok(m.accuracy > 50 && m.accuracy <= 100); assert.ok(m.pp >= 5 && m.pp <= 40);
  }
  assert.ok(ITEMS.ribbon.price > 0 && ITEMS.herb.price > 0);
});

test('partner species is derived deterministically from the token id', () => {
  const a = partnerSpecies('generations:7730'), b = partnerSpecies('generations:7730'), c = partnerSpecies('generations:1');
  assert.deepEqual(a, b); assert.ok(TYPES.includes(a.type));
  const total = s => s.base.hp + s.base.atk + s.base.def + s.base.spd;
  assert.ok(total(a) >= 230 && total(a) <= 290, `balanced total ${total(a)}`);
  assert.ok(['generations:1', 'generations:2', 'generations:3', 'generations:4', 'generations:5', 'generations:6'].map(t => JSON.stringify(partnerSpecies(t).base)).some(x => x !== JSON.stringify(a.base)));
  assert.equal(a.name[1], 'Friend #7730'); assert.equal(partnerSpecies('genesis:597').name[1], 'Genesis #597');
  assert.ok(c.learnset.some(([, m]) => MOVES[m].type === c.type), 'learns a STAB move');
  assert.throws(() => partnerSpecies('bogus'));
  const mon = createMon('friend', 5, 'generations:7730');
  assert.equal(speciesOf(mon).name[1], 'Friend #7730'); assert.equal(monName(mon, 'en'), 'Friend #7730');
});

test('stats grow with level; createMon starts full with learned moves', () => {
  const low = createMon('mossball', 3), high = createMon('mossball', 20);
  const a = statsOf(low), b = statsOf(high);
  for (const k of ['hp', 'atk', 'def', 'spd']) assert.ok(b[k] > a[k], k);
  assert.equal(low.hp, a.hp); assert.equal(low.exp, expForLevel(3));
  assert.ok(low.moves.length >= 1 && low.moves.length <= MAX_MOVES);
  for (const m of low.moves) assert.equal(m.pp, MOVES[m.id].pp);
  assert.ok(high.moves.length >= low.moves.length);
  assert.throws(() => createMon('nope', 3)); assert.throws(() => createMon('mossball', 0)); assert.throws(() => createMon('mossball', MAX_LEVEL + 1));
  assert.equal(expForLevel(1), 0); assert.ok(expForLevel(6) > expForLevel(5));
});

test('gainExp levels up (possibly several times), grows hp, learns moves and never mutates', () => {
  const mon = createMon('mossball', 5), frozen = structuredClone(mon);
  const same = gainExp(mon, 1); assert.deepEqual(same.levels, []); assert.equal(same.mon.exp, mon.exp + 1);
  const r = gainExp({ ...mon, hp: 3 }, expForLevel(12) - mon.exp);
  assert.equal(r.mon.level, 12); assert.deepEqual(r.levels, [6, 7, 8, 9, 10, 11, 12]);
  assert.equal(r.mon.hp, 3 + statsOf(r.mon).hp - statsOf(mon).hp, 'hp grows by the max-hp gain');
  const learnable = SPECIES.mossball.learnset.filter(([lv]) => lv > 5 && lv <= 12).map(([, m]) => m);
  assert.deepEqual(r.learned, learnable); for (const m of learnable) assert.ok(r.mon.moves.some(x => x.id === m));
  assert.deepEqual(mon, frozen);
  const capped = gainExp(createMon('mossball', MAX_LEVEL), 1e9); assert.equal(capped.mon.level, MAX_LEVEL); assert.equal(capped.mon.exp, expForLevel(MAX_LEVEL));
  const full = { ...createMon('mossball', 5), moves: ['dot-tackle', 'hop-kick', 'moss-punch', 'breeze-chop'].map(id => ({ id, pp: 1 })) };
  const learnedOver = gainExp(full, expForLevel(12) - full.exp);
  assert.ok(learnedOver.mon.moves.length <= MAX_MOVES);
  const fainted = gainExp({ ...mon, hp: 0 }, expForLevel(7) - mon.exp); assert.equal(fainted.mon.hp, 0, 'fainted stays fainted');
});

test('heal restores hp and pp; fainted detection', () => {
  const mon = createMon('brinebub', 6); const hurt = { ...mon, hp: 0, moves: mon.moves.map(m => ({ ...m, pp: 0 })) };
  assert.ok(isFainted(hurt)); const h = healMon(hurt); assert.equal(h.hp, statsOf(mon).hp); assert.deepEqual(h.moves, mon.moves); assert.ok(!isFainted(h));
});

test('damage: STAB, type effectiveness, random factor and level scaling', () => {
  const att = createMon('mossball', 10), def = createMon('brinebub', 10), ember = createMon('yamyam', 10), plain = createMon('dotton', 10);
  const stab = damage(att, def, 'moss-punch', 1), nostab = damage(att, def, 'dot-tackle', 1);
  assert.equal(stab.effect, 2); assert.equal(stab.stab, true); assert.equal(nostab.stab, false);
  assert.ok(stab.amount > nostab.amount * 2);
  assert.equal(damage(att, ember, 'moss-punch', 1).effect, 0.5);
  const lo = damage(att, plain, 'moss-punch', 0), hi = damage(att, plain, 'moss-punch', 0.999);
  assert.ok(lo.amount < hi.amount && lo.amount >= Math.floor(hi.amount * 0.84), `${lo.amount} vs ${hi.amount}`);
  assert.ok(damage(createMon('mossball', 30), plain, 'moss-punch', 0.5).amount > damage(createMon('mossball', 5), plain, 'moss-punch', 0.5).amount);
  assert.ok(damage(createMon('mossball', 2), createMon('pillowstone', 30), 'dot-tackle', 0).amount >= 1, 'at least 1');
  assert.throws(() => damage(att, def, 'unknown', 0.5));
});

test('capture chance rises as hp falls; runChance depends on speed and attempts', () => {
  const m = createMon('mossball', 5), max = statsOf(m).hp;
  const full = captureChance(m), low = captureChance({ ...m, hp: 1 });
  assert.ok(low > full && low <= 1 && full > 0);
  assert.ok(captureChance({ ...createMon('glitchmoth', 5), hp: 1 }) < captureChance({ ...createMon('mossball', 5), hp: 1 }) || SPECIES.glitchmoth.catchRate >= SPECIES.mossball.catchRate);
  assert.ok(Math.abs(full - SPECIES.mossball.catchRate / 3) < 0.01 && max > 0);
  const fast = createMon('vanebird', 10), slow = createMon('pillowstone', 3);
  assert.equal(runChance(fast, slow, 0), 1); assert.ok(runChance(slow, fast, 0) < 1); assert.ok(runChance(slow, fast, 2) > runChance(slow, fast, 0));
});

test('rewards: exp and acorns scale with foe level; the boss pays more', () => {
  const foe = createMon('mossball', 4);
  assert.ok(expReward(createMon('mossball', 8), 'wild') > expReward(foe, 'wild'));
  assert.ok(expReward(foe, 'boss') > expReward(foe, 'wild')); assert.ok(coinReward(foe, 'boss') > coinReward(foe, 'wild'));
});

test('turn: attacking the foe until it faints wins, grants exp and acorns, does not mutate input', () => {
  const me = createMon('friend', 12, 'generations:7730');
  let ctx = ctxOf([me], [createMon('mossball', 2)]); const before = structuredClone(ctx);
  let lines = [], rounds = 0;
  while (!ctx.battle.over && rounds++ < 20) { const r = takeTurn(ctx, { kind: 'move', slot: 0 }); ctx = r.ctx; lines.push(...r.lines); }
  assert.deepEqual(before, ctxOf([me], [createMon('mossball', 2)]));
  assert.equal(ctx.battle.over, 'win'); assert.ok(ctx.party[0].exp > me.exp); assert.ok(ctx.coins > 0);
  assert.ok(ctx.party[0].moves[0].pp < me.moves[0].pp, 'pp spent');
  assert.match(texts(lines), /fainted/i);
  for (const l of lines) { assert.ok(l.text[0] && l.text[1]); assert.ok(l.snap && Number.isInteger(l.snap.myHp) && Number.isInteger(l.snap.foeHp)); }
  assert.throws(() => takeTurn(ctx, { kind: 'move', slot: 0 }), /over/);
});

test('turn order follows speed; a slower foe that faints first does not act', () => {
  const me = createMon('vanebird', 30), foe = createMon('pillowstone', 2);
  const r = takeTurn(ctxOf([me], [foe]), { kind: 'move', slot: 0 });
  assert.equal(r.ctx.battle.over, 'win'); assert.equal(r.ctx.party[0].hp, me.hp, 'foe never attacked');
});

test('no pp: the move cannot be used and the turn is not spent', () => {
  const me = createMon('mossball', 5); const empty = { ...me, moves: me.moves.map(m => ({ ...m, pp: 0 })) };
  const ctx = ctxOf([empty], [createMon('mossball', 5)]); const r = takeTurn(ctx, { kind: 'move', slot: 0 });
  assert.equal(r.ctx.party[0].hp, empty.hp); assert.match(texts(r.lines), /PP/);
  assert.throws(() => takeTurn(ctx, { kind: 'move', slot: 9 }));
});

test('losing: when every party member faints the battle is lost', () => {
  const me = { ...createMon('mossball', 2), hp: 1 }, foe = createMon('vanebird', 30);
  const r = takeTurn(ctxOf([me], [foe]), { kind: 'move', slot: 0 });
  assert.equal(r.ctx.battle.over, 'lose'); assert.equal(r.ctx.party[0].hp, 0);
});

test('fainting with a healthy back-up forces a switch; switchIn sends it out', () => {
  const weak = { ...createMon('mossball', 2), hp: 1 }, backup = createMon('dotton', 10), foe = createMon('vanebird', 30);
  const r = takeTurn(ctxOf([weak, backup], [foe]), { kind: 'move', slot: 0 });
  assert.equal(r.ctx.battle.over, undefined); assert.equal(r.ctx.battle.mustSwitch, true);
  assert.throws(() => takeTurn(r.ctx, { kind: 'move', slot: 0 }), /switch/);
  assert.throws(() => switchIn(r.ctx, 0), /fainted/);
  const s = switchIn(r.ctx, 1); assert.equal(s.ctx.battle.active, 1); assert.equal(s.ctx.battle.mustSwitch, false);
  assert.equal(s.ctx.party[1].hp, backup.hp, 'forced switch-in takes no hit'); assert.ok(s.lines.length > 0);
});

test('voluntary switch spends the turn and the foe hits the new member', () => {
  const a = createMon('mossball', 10), b = createMon('pillowstone', 10), foe = createMon('dotton', 10);
  const r = takeTurn(ctxOf([a, b], [foe]), { kind: 'switch', to: 1 });
  assert.equal(r.ctx.battle.active, 1); assert.equal(r.ctx.party[0].hp, a.hp);
  assert.ok(r.ctx.party[1].hp <= b.hp);
  assert.throws(() => takeTurn(ctxOf([a, b], [foe]), { kind: 'switch', to: 0 }), /already/);
  assert.throws(() => takeTurn(ctxOf([a], [foe]), { kind: 'switch', to: 3 }));
});

test('ribbon capture: succeeds at low hp, joins the party, consumes a ribbon; seeds vary outcomes', () => {
  const me = createMon('friend', 10, 'generations:7730'); const foe = { ...createMon('mossball', 3), hp: 1 };
  let caught = 0, failed = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const r = takeTurn(ctxOf([me], [foe], 'wild', { seed }), { kind: 'item', item: 'ribbon' });
    assert.equal(r.ctx.items.ribbon, 2);
    if (r.ctx.battle.over === 'caught') { caught++; assert.equal(r.ctx.party.length, 2); assert.equal(r.ctx.party[1].species, 'mossball'); assert.equal(r.ctx.party[1].hp, 1); }
    else { failed++; assert.equal(r.ctx.party.length, 1); }
  }
  assert.ok(caught > 30 && failed >= 0, `caught ${caught}`);
  const none = takeTurn(ctxOf([me], [foe], 'wild', { items: { ribbon: 0, herb: 0 } }), { kind: 'item', item: 'ribbon' });
  assert.equal(none.ctx.battle.over, undefined); assert.equal(none.ctx.party[0].hp, me.hp, 'no turn spent');
  const boss = takeTurn(ctxOf([me], [foe], 'boss'), { kind: 'item', item: 'ribbon' });
  assert.equal(boss.ctx.items.ribbon, 3); assert.equal(boss.ctx.battle.over, undefined);
  const full = takeTurn(ctxOf(Array.from({ length: 6 }, () => me), [foe]), { kind: 'item', item: 'ribbon' });
  assert.equal(full.ctx.items.ribbon, 3); assert.match(texts(full.lines), /full/i);
});

test('herb heals the active member and spends the turn; useless herb is refused', () => {
  const me = createMon('mossball', 10), foe = createMon('mossball', 2);
  const hurt = { ...me, hp: 5 };
  const r = takeTurn(ctxOf([hurt], [foe]), { kind: 'item', item: 'herb' });
  assert.equal(r.ctx.items.herb, 1); assert.ok(r.ctx.party[0].hp > 5); assert.ok(r.ctx.party[0].hp <= 5 + HERB_HEAL);
  const refused = takeTurn(ctxOf([me], [foe]), { kind: 'item', item: 'herb' }); assert.equal(refused.ctx.items.herb, 2);
  const empty = takeTurn(ctxOf([hurt], [foe], 'wild', { items: { ribbon: 0, herb: 0 } }), { kind: 'item', item: 'herb' }); assert.equal(empty.ctx.party[0].hp, 5);
  assert.throws(() => takeTurn(ctxOf([me], [foe]), { kind: 'item', item: 'sword' }));
});

test('running: always escapes when faster; cannot run from the boss', () => {
  const me = createMon('vanebird', 20), foe = createMon('pillowstone', 2);
  assert.equal(takeTurn(ctxOf([me], [foe]), { kind: 'run' }).ctx.battle.over, 'run');
  const boss = takeTurn(ctxOf([me], [foe], 'boss'), { kind: 'run' });
  assert.equal(boss.ctx.battle.over, undefined); assert.match(texts(boss.lines), /can't run|cannot/i);
  const slow = createMon('pillowstone', 2), fast = createMon('vanebird', 30); let escaped = 0, stayed = 0;
  for (let seed = 1; seed < 40; seed++) { const r = takeTurn(ctxOf([{ ...slow, hp: 999 }], [fast], 'wild', { seed }), { kind: 'run' }); r.ctx.battle.over === 'run' ? escaped++ : stayed++; }
  assert.ok(escaped > 0 && stayed > 0);
});

test('boss battle: defeating each monster sends out the next; the last one wins', () => {
  const me = createMon('friend', 40, 'generations:7730');
  let ctx = ctxOf([me], [createMon('pillowstone', 3), createMon('vanebird', 3), createMon('grovelet', 4)], 'boss'); const all = [];
  let n = 0; while (!ctx.battle.over && n++ < 30) { const r = takeTurn(ctx, { kind: 'move', slot: 0 }); ctx = r.ctx; all.push(...r.lines); }
  assert.equal(ctx.battle.over, 'win'); assert.equal(ctx.battle.foe, 2); assert.match(texts(all), /sends out/i);
  assert.throws(() => startBattle('boss', []));
});

test('misses happen with low-accuracy moves over many seeds', () => {
  const me = createMon('pillowstone', 10), foe = createMon('dotton', 30); let missed = 0;
  const slot = me.moves.findIndex(m => MOVES[m.id].accuracy < 100);
  assert.ok(slot >= 0);
  for (let seed = 1; seed < 80; seed++) { const r = takeTurn(ctxOf([{ ...me, hp: 999 }], [{ ...foe, hp: 999 }], 'wild', { seed }), { kind: 'move', slot }); if (/missed/i.test(texts(r.lines))) missed++; }
  assert.ok(missed > 0);
});
