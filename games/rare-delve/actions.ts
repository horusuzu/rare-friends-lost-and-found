/** Item actions: eat, drink, read, zap, throw, equip, unequip and drop. Pure; each returns whether a turn passes. */
import { BAG_MAX, BLAZE_DAMAGE, DIRS, FULL_MAX, ITEMS, SPECIES, expForLevel, type Dir, type Text } from './data.ts';
import { canStep, isFloor, visibleIdx } from './dungeon.ts';
import { ENCHANT_MAX, isGear, itemName, type Item } from './items.ts';
import type { Mon } from './monsters.ts';
import type { Rng } from './rng.ts';
import { dropNear, endDive, fmt, gainExp, hurtMon, monAt, monName, setMon } from './combat.ts';
import { cue, say, withHero, withRun, type GameState } from './run.ts';

/** An action's outcome: `spent` false means it was refused and no turn passes. */
export interface Outcome { readonly s: GameState; readonly spent: boolean }
export const refuse = (s: GameState): Outcome => ({ s, spent: false });
export const spend = (s: GameState): Outcome => ({ s, spent: true });

const RANGE = 10;
const THROW_HIT = 0.85;

const nameOf = (s: GameState, it: Item): Text => itemName(it, s.run!.known, s.run!.seed);
const without = <T>(xs: readonly T[], i: number): T[] => xs.filter((_, j) => j !== i);
export function identify(s: GameState, k: string): GameState {
  return s.run!.known.includes(k) ? s : withRun(s, { known: [...s.run!.known, k] });
}

/** Walk from the hero along `dir` until a monster or a wall; returns the monster hit (if any) and the last tile reached. */
function trace(s: GameState, dir: Dir): { mon: Mon | null; x: number; y: number } {
  let { x, y } = s.hero;
  for (let n = 0; n < RANGE; n++) {
    if (!canStep(s.run!.map, x, y, dir)) break;
    x += DIRS[dir][0]; y += DIRS[dir][1];
    const mon = monAt(s.run!, x, y);
    if (mon) return { mon, x, y };
  }
  return { mon: null, x, y };
}

function eatOrHerb(s: GameState, it: Item): GameState {
  const h = s.hero, d = ITEMS[it.k];
  if (d.kind === 'food') return cue(say(withHero(s, { full: Math.min(FULL_MAX, h.full + d.power) }), ['もぐもぐ。おなかが ふくれた。', 'Munch. Your belly fills up.']), 'eat');
  if (it.k === 'mendleaf') {
    const top = h.hp >= h.maxHp;
    const hero = top ? { maxHp: h.maxHp + 1, hp: h.hp + 1 } : { hp: Math.min(h.maxHp, h.hp + d.power) };
    return cue(say(withHero(s, hero), top ? ['さいだいHPが 1 あがった。', 'Max HP rises by 1.'] : ['きずが いえた。', 'Your wounds close.']), 'drink');
  }
  if (it.k === 'clearroot') return cue(say(withHero(s, { str: h.maxStr, conf: 0 }), ['からだが すっきりした。', 'You feel clear-headed and strong.']), 'drink');
  return cue(say(withHero(s, { maxStr: h.maxStr + 1, str: h.str + 1 }), ['ちからが みなぎる！', 'Your strength grows!']), 'drink');
}

function drink(s0: GameState, it: Item): GameState {
  const s = cue(identify(s0, it.k), 'drink'), h = s.hero;
  switch (it.k) {
    case 'p_mend': return say(withHero(s, { maxHp: h.maxHp + 3, hp: h.maxHp + 3 }), ['からだが かるい！ HPが 全快した。', 'You feel wonderful! HP fully restored.']);
    case 'p_doze': return say(withHero(s, { sleep: 5 }), ['ねむくなって きた…', 'You grow drowsy…']);
    case 'p_muddle': return say(withHero(s, { conf: 10 }), ['めが まわる！', 'The room spins!']);
    case 'p_sight': return say(withRun(s, { sight: true }), ['この階の ようすが みえる！', 'You sense everything on this floor!']);
    case 'p_rise': return gainExp(s, expForLevel(h.level + 1) - h.exp);
    default: return say(withHero(s, { haste: 30 }), ['からだが かるく なった！', 'You feel quick!']);
  }
}

/** Mark every floor tile and the walls around floors as explored. */
function chart(s: GameState): GameState {
  const m = s.run!.map;
  const near = (x: number, y: number) => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => isFloor(m, x + dx, y + dy)));
  const seen = Array.from({ length: m.w * m.h }, (_, i) => near(i % m.w, Math.floor(i / m.w)) ? '1' : s.run!.seen[i]).join('');
  return say(withRun(s, { seen }), ['この階の 地図が わかった！', 'The floor\'s layout is revealed!']);
}

function blaze(s0: GameState, r: Rng): GameState {
  let s = say(s0, ['火の粉が ふりそそぐ！', 'Cinders rain down!']);
  const seen = new Set(visibleIdx(s.run!.map, s.hero.x, s.hero.y));
  for (const m of s.run!.mons.filter(x => seen.has(x.y * s.run!.map.w + x.x))) s = hurtMon(s, r, m.id, BLAZE_DAMAGE);
  return s;
}

function enchant(s: GameState, slot: 'weapon' | 'shield'): GameState {
  const it = s.hero[slot];
  if (!it) return say(s, slot === 'weapon' ? ['ぶきを もっていない。巻物は むだに なった。', 'No weapon to hone. The scroll is wasted.'] : ['盾を もっていない。巻物は むだに なった。', 'No shield to brace. The scroll is wasted.']);
  const e = Math.min(ENCHANT_MAX, it.e + 1);
  return say(withHero(s, slot === 'weapon' ? { weapon: { ...it, e } } : { shield: { ...it, e } }), slot === 'weapon' ? ['ぶきが するどく なった！', 'Your weapon is keener!'] : ['盾が かたく なった！', 'Your shield is sturdier!']);
}

function read(s0: GameState, r: Rng, it: Item): GameState {
  const s = cue(identify(s0, it.k), 'read');
  switch (it.k) {
    case 's_know': return s.hero.bag.length ? say({ ...s, scene: { k: 'pick', cur: 0 } }, ['どれを しらべる？', 'Identify which item?']) : say(s, ['しらべる ものが ない。', 'Nothing to identify.']);
    case 's_edge': return enchant(s, 'weapon');
    case 's_guard': return enchant(s, 'shield');
    case 's_chart': return chart(s);
    case 's_home': return endDive(say(s, ['光に つつまれて 町へ かえった。', 'Light carries you home to town.']), 'home', null);
    default: return blaze(s, r);
  }
}

export function useItem(s: GameState, r: Rng, i: number): Outcome {
  const it = s.hero.bag[i];
  if (!it) return refuse(s);
  const kind = ITEMS[it.k].kind, name = nameOf(s, it);
  if (!['food', 'herb', 'potion', 'scroll'].includes(kind)) return refuse(s);
  const s1 = say(withHero(s, { bag: without(s.hero.bag, i) }), [`${name[0]}を つかった。`, `You use the ${name[1]}.`]);
  if (kind === 'potion') return spend(drink(s1, it));
  if (kind === 'scroll') return spend(read(s1, r, it));
  return spend(eatOrHerb(s1, it));
}

/** Identify the chosen bag item (after a Scroll of Insight). */
export function identifyAt(s: GameState, i: number): GameState {
  const it = s.hero.bag[i];
  if (!it) return s;
  const known = identify(s, it.k), name = nameOf(known, it);
  return say(known, [`それは ${name[0]}だった！`, `It is ${name[1]}!`]);
}

function wandHit(s0: GameState, it: Item, m: Mon): GameState {
  const s = identify(s0, it.k), dir = s.hero.face, name = monName(m);
  switch (it.k) {
    case 'w_gust': {
      let { x, y } = m;
      for (let n = 0; n < RANGE && canStep(s.run!.map, x, y, dir); n++) {
        const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1];
        if (monAt(s.run!, nx, ny) || (s.hero.x === nx && s.hero.y === ny)) break;
        x = nx; y = ny;
      }
      return say(setMon(s, m.id, { x, y }), fmt(name, (n, l) => l ? `The ${n} is blown away!` : `${n}を ふきとばした！`));
    }
    case 'w_lull': return say(setMon(s, m.id, { sleep: 30 }), fmt(name, (n, l) => l ? `The ${n} falls asleep.` : `${n}は ねむってしまった。`));
    case 'w_swap': return say(setMon(withHero(s, { x: m.x, y: m.y }), m.id, { x: s.hero.x, y: s.hero.y }), fmt(name, (n, l) => l ? `You swap places with the ${n}.` : `${n}と 入れかわった！`));
    default: return say(setMon(s, m.id, { slow: 40 }), fmt(name, (n, l) => l ? `The ${n} slows down.` : `${n}の うごきが おそくなった。`));
  }
}

export function zap(s: GameState, _r: Rng, i: number): Outcome {
  const it = s.hero.bag[i];
  if (!it || ITEMS[it.k].kind !== 'wand') return refuse(s);
  if (it.c <= 0) return spend(say(s, ['なにも おこらない。', 'Nothing happens.']));
  const used = withHero(cue(s, 'zap'), { bag: s.hero.bag.map((x, j) => j === i ? { ...x, c: x.c - 1 } : x) });
  const { mon } = trace(used, s.hero.face);
  return spend(mon ? wandHit(used, it, mon) : say(used, ['まほうは どこにも あたらなかった。', 'The bolt hits nothing.']));
}

function potionSplash(s0: GameState, it: Item, m: Mon): GameState {
  const name = monName(m);
  if (it.k === 'p_doze') return say(setMon(identify(s0, it.k), m.id, { sleep: 30 }), fmt(name, (n, l) => l ? `The ${n} falls asleep.` : `${n}は ねむってしまった。`));
  if (it.k === 'p_muddle') return say(setMon(identify(s0, it.k), m.id, { conf: 15 }), fmt(name, (n, l) => l ? `The ${n} looks muddled.` : `${n}は こんらんした。`));
  if (it.k === 'p_mend') return say(setMon(s0, m.id, { hp: Math.max(m.hp, SPECIES[m.sp].hp) }), fmt(name, (n, l) => l ? `The ${n} looks healthier.` : `${n}の きずが なおった。`));
  return say(s0, ['びんが われた。', 'The bottle shatters.']);
}

export function throwItem(s: GameState, r: Rng, i: number): Outcome {
  const it = s.hero.bag[i];
  if (!it) return refuse(s);
  const kind = ITEMS[it.k].kind, one: Item = kind === 'dart' ? { ...it, c: 1 } : it;
  const bag = kind === 'dart' && it.c > 1 ? s.hero.bag.map((x, j) => j === i ? { ...x, c: x.c - 1 } : x) : without(s.hero.bag, i);
  const thrown = cue(withHero(s, { bag }), 'throw');
  const { mon, x, y } = trace(thrown, s.hero.face);
  const landed = (st: GameState, lx: number, ly: number) => ({ ...st, run: dropNear(st.run!, lx, ly, one, [s.hero.x, s.hero.y]) });
  if (!mon) return spend(landed(say(thrown, ['なげた ものが 床に おちた。', 'It lands on the floor.']), x, y));
  if (!r.chance(THROW_HIT)) return spend(landed(say(thrown, fmt(monName(mon), (n, l) => l ? `It misses the ${n}.` : `${n}に あたらなかった。`)), mon.x, mon.y));
  if (kind === 'potion') return spend(potionSplash(thrown, it, mon));
  const dmg = kind === 'dart' ? ITEMS[it.k].power : 1 + r.int(2);
  const hit = hurtMon(say(thrown, fmt(monName(mon), (n, l) => l ? `It hits the ${n} for ${dmg}.` : `${n}に あたって ${dmg}の ダメージ。`)), r, mon.id, dmg);
  return spend(kind === 'dart' ? hit : landed(hit, mon.x, mon.y));
}

export function equip(s: GameState, i: number, inDungeon: boolean): Outcome {
  const it = s.hero.bag[i];
  if (!it || !isGear(it.k)) return refuse(s);
  const slot = ITEMS[it.k].kind === 'weapon' ? 'weapon' : 'shield', old = s.hero[slot];
  const bag = [...without(s.hero.bag, i), ...(old ? [old] : [])];
  const name = inDungeon ? nameOf(s, it) : ITEMS[it.k].name;
  return spend(cue(say(withHero(s, slot === 'weapon' ? { bag, weapon: it } : { bag, shield: it }), [`${name[0]}を そうびした。`, `You equip the ${name[1]}.`]), 'confirm'));
}

export function unequip(s: GameState, slot: 'weapon' | 'shield', _inDungeon: boolean): Outcome {
  const it = s.hero[slot];
  if (!it || s.hero.bag.length >= BAG_MAX) return refuse(s);
  return spend(cue(withHero(s, slot === 'weapon' ? { bag: [...s.hero.bag, it], weapon: null } : { bag: [...s.hero.bag, it], shield: null }), 'confirm'));
}

export function drop(s: GameState, i: number): Outcome {
  const it = s.hero.bag[i], run = s.run!;
  if (!it) return refuse(s);
  const { x, y } = s.hero;
  if (run.items.some(f => f.x === x && f.y === y) || (run.map.stairs[0] === x && run.map.stairs[1] === y)) return refuse(say(s, ['ここには おけない。', 'You cannot put it here.']));
  const name = nameOf(s, it);
  return spend(say(withRun(withHero(s, { bag: without(s.hero.bag, i) }), { items: [...run.items, { x, y, item: it }] }), [`${name[0]}を おいた。`, `You put down the ${name[1]}.`]));
}
