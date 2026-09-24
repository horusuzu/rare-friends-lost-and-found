/** One hero action and the turn that follows: monsters, hunger, regeneration, spawning and fog. Pure. */
import { BAG_MAX, DIRS, DIR_LIST, FLOORS, GOLD_CAP, HUNGER_TURNS, PIT_DAMAGE, REGEN_POOL, TRAPS, type Dir } from './data.ts';
import { canStep } from './dungeon.ts';
import { itemName, type Item } from './items.ts';
import { monstersAct, spawnTick } from './monsters.ts';
import { rngFrom, type Rng } from './rng.ts';
import { dropNear, endDive, fmt, heroStrike, hurtHero, monAt } from './combat.ts';
import { cue, newFloor, reveal, say, withHero, withRun, type GameState } from './run.ts';
import { drop, equip, refuse, spend, throwItem, unequip, useItem, zap, type Outcome } from './actions.ts';

export { heroAtk, heroDef } from './combat.ts';
export { maxHpFor } from './run.ts';

export type Action =
  | { readonly k: 'move'; readonly dir: Dir } | { readonly k: 'wait' } | { readonly k: 'attack' }
  | { readonly k: 'use'; readonly i: number } | { readonly k: 'zap'; readonly i: number } | { readonly k: 'throw'; readonly i: number }
  | { readonly k: 'equip'; readonly i: number } | { readonly k: 'unequip'; readonly slot: 'weapon' | 'shield' } | { readonly k: 'drop'; readonly i: number };

export const AUTOSAVE_TURNS = 50;

/** Items and traps underfoot after a step. */
function arrive(s: GameState, r: Rng): GameState {
  const run = s.run!, { x, y } = s.hero;
  let next = s;
  const at = run.items.find(f => f.x === x && f.y === y);
  if (at) next = pickUp(next, at.item);
  const trap = next.scene.k === 'dungeon' ? next.run!.traps.find(t => t.x === x && t.y === y) : undefined;
  return trap ? springTrap(next, r, trap.kind) : next;
}

function pickUp(s: GameState, item: Item): GameState {
  const run = s.run!, rest = run.items.filter(f => !(f.x === s.hero.x && f.y === s.hero.y));
  if (item.k === 'lantern') return endDive(say(withRun(s, { items: rest }), ['ハートのランタンを 手に入れた！', 'You hold the Heart Lantern!']), 'clear', null);
  if (item.k === 'gold') {
    return cue(say(withRun(withHero(s, { gold: Math.min(GOLD_CAP, s.hero.gold + item.c) }), { items: rest }), [`${item.c}ゴールド ひろった。`, `Picked up ${item.c} gold.`]), 'pickup');
  }
  const name = itemName(item, run.known, run.seed);
  if (s.hero.bag.length >= BAG_MAX) return say(s, [`${name[0]}が おちている。もちものが いっぱいだ。`, `${name[1]} lies here, but your bag is full.`]);
  return cue(say(withRun(withHero(s, { bag: [...s.hero.bag, item] }), { items: rest }), [`${name[0]}を ひろった。`, `Picked up ${name[1]}.`]), 'pickup');
}

function springTrap(s0: GameState, r: Rng, kind: 'trip' | 'pit' | 'alarm'): GameState {
  const { x, y } = s0.hero;
  let s = cue(say(withRun(s0, { traps: s0.run!.traps.map(t => t.x === x && t.y === y ? { ...t, found: true } : t) }),
    fmt(TRAPS[kind].name, (n, l) => l ? `A ${n}!` : `${n}だ！`)), 'trap');
  if (kind === 'trip' && s.hero.bag.length) {
    const i = r.int(s.hero.bag.length), item = s.hero.bag[i];
    s = withHero(s, { bag: s.hero.bag.filter((_, j) => j !== i) });
    return { ...s, run: dropNear(s.run!, x + r.range(-1, 1), y + r.range(-1, 1), item, [x, y]) };
  }
  if (kind === 'pit' && s.run!.floor < FLOORS) {
    const fallen = withHero(s, { hp: Math.max(1, s.hero.hp - PIT_DAMAGE) });
    return say(newFloor(fallen, s.run!.floor + 1), [`${s.run!.floor + 1}階へ おちた！`, `You fell to floor ${s.run!.floor + 1}!`]);
  }
  if (kind === 'alarm') return withRun(s, { mons: s.run!.mons.map(m => ({ ...m, sleep: 0, aware: true })) });
  return s;
}

function move(s: GameState, r: Rng, wanted: Dir): Outcome {
  const confused = s.hero.conf > 0 && r.chance(0.5);
  const dir = confused ? r.pick(DIR_LIST) : wanted;
  const faced = withHero(s, { face: dir });
  const tx = s.hero.x + DIRS[dir][0], ty = s.hero.y + DIRS[dir][1];
  if (!canStep(s.run!.map, s.hero.x, s.hero.y, dir)) return confused ? spend(faced) : refuse(faced);
  const m = monAt(s.run!, tx, ty);
  if (m) return spend(heroStrike(faced, r, m));
  return spend(arrive(cue(withHero(faced, { x: tx, y: ty }), 'step'), r));
}

function attack(s: GameState, r: Rng): Outcome {
  const dir = s.hero.face, m = monAt(s.run!, s.hero.x + DIRS[dir][0], s.hero.y + DIRS[dir][1]);
  if (m && canStep(s.run!.map, s.hero.x, s.hero.y, dir)) return spend(heroStrike(s, r, m));
  return spend(cue(say(s, ['からぶり。', 'You swing at nothing.']), 'miss'));
}

/** Waiting searches: hidden traps next to the hero come to light. */
function wait(s: GameState): Outcome {
  const { x, y } = s.hero;
  const traps = s.run!.traps.map(t => !t.found && Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= 1 ? { ...t, found: true } : t);
  const foundNew = traps.some((t, i) => t.found !== s.run!.traps[i].found);
  const next = withRun(s, { traps });
  return spend(foundNew ? say(next, ['わなを みつけた！', 'You found a trap!']) : next);
}

function heroAction(s: GameState, r: Rng, a: Action): Outcome {
  switch (a.k) {
    case 'move': return move(s, r, a.dir);
    case 'wait': return wait(s);
    case 'attack': return attack(s, r);
    case 'use': return useItem(s, r, a.i);
    case 'zap': return zap(s, r, a.i);
    case 'throw': return throwItem(s, r, a.i);
    case 'equip': return equip(s, a.i, true);
    case 'unequip': return unequip(s, a.slot, true);
    case 'drop': return drop(s, a.i);
  }
}

/** Hunger drains the belly (then HP); a fed hero slowly regenerates. */
function metabolism(s: GameState): GameState {
  const h = s.hero, turn = s.run!.turn;
  const full = turn % HUNGER_TURNS === 0 ? Math.max(0, h.full - 1) : h.full;
  let next = withHero(s, { full });
  if (full !== h.full && (full === 20 || full === 10)) next = say(next, ['おなかが へってきた…', 'You are getting hungry…']);
  if (h.full === 0) return hurtHero(next, 1, ['おなかが すいて たおれた', 'Collapsed from hunger']);
  if (full === 0 && h.full > 0) next = say(next, ['おなかが ぺこぺこだ！ HPが へっていく…', 'You are starving! HP is draining…']);
  if (h.hp >= h.maxHp) return withHero(next, { regen: 0 });
  // At most 1 HP per turn, however large the pool grows.
  const pool = h.regen + h.maxHp, heal = pool >= REGEN_POOL ? 1 : 0;
  return withHero(next, { hp: Math.min(h.maxHp, h.hp + heal), regen: Math.min(REGEN_POOL - 1, pool - heal * REGEN_POOL) });
}

/** Everything after the hero's action: monsters (unless Swift grants a free action), body, spawns, fog. */
function endTurn(s0: GameState, r: Rng, floor: number): GameState {
  if (!s0.run) return s0;
  let s = withRun(s0, { turn: s0.run.turn + 1 });
  if (s.run!.floor !== floor) return withRun(s, { rng: r.seed });
  const hasted = s.hero.haste > 0;
  s = withHero(s, { conf: Math.max(0, s.hero.conf - 1), haste: Math.max(0, s.hero.haste - 1) });
  if (hasted && s.run!.free) s = withRun(s, { free: false });
  else { s = monstersAct(s, r); if (s.run) s = withRun(s, { free: hasted }); }
  if (s.run) s = metabolism(s);
  if (s.run) s = spawnTick(s, r);
  const run = s.run;
  if (!run) return s;
  s = withRun(s, { rng: r.seed, seen: reveal(run, s.hero.x, s.hero.y) });
  return run.turn % AUTOSAVE_TURNS === 0 ? { ...s, saveTick: s.saveTick + 1 } : s;
}

/** Apply one hero action. Refused actions return without spending a turn; the input state is never mutated. */
export function act(s: GameState, a: Action): GameState {
  if (!s.run || s.scene.k !== 'dungeon') return s;
  const r = rngFrom(s.run.rng), floor = s.run.floor;
  if (s.hero.sleep > 0) return endTurn(say(withHero(s, { sleep: s.hero.sleep - 1 }), ['ぐうぐう…', 'Zzz…']), r, floor);
  const out = heroAction(s, r, a);
  return out.spent ? endTurn(out.s, r, floor) : out.s;
}

