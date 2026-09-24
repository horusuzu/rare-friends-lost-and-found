/** Hero and monster blows, experience, drops and the end of a dive. Pure helpers shared by turns and monster AI. */
import { DIRS, DIR_LIST, FLOORS, HP_PER_LEVEL, ITEMS, MAX_LEVEL, SPECIES, expForLevel, type Text } from './data.ts';
import { isFloor } from './dungeon.ts';
import { ENCHANT_MAX, type Item } from './items.ts';
import type { Mon } from './monsters.ts';
import type { Rng } from './rng.ts';
import { cue, say, settleRun, withRun, type GameState, type Hero, type Result, type Run } from './run.ts';

export const HERO_HIT = 0.92;
export const MON_HIT = 0.85;
export const MON_CAP = 18;

export function heroAtk(h: Hero): number {
  return h.level + Math.floor(h.str / 2) + (h.weapon ? Math.max(0, ITEMS[h.weapon.k].power + h.weapon.e) : 0);
}
export function heroDef(h: Hero): number {
  return h.shield ? Math.max(0, ITEMS[h.shield.k].power + h.shield.e) : 0;
}
/** Damage after a ±12% swing, reduced by defence. Never below 1. */
export function blow(r: Rng, atk: number, def: number, soak: number): number {
  return Math.max(1, Math.round(atk * r.range(88, 112) / 100 - def * soak));
}

export const monName = (m: Mon): Text => SPECIES[m.sp].name;
export const fmt = (text: Text, f: (s: string, lang: 0 | 1) => string): Text => [f(text[0], 0), f(text[1], 1)];
export const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function monAt(run: Run, x: number, y: number): Mon | undefined { return run.mons.find(m => m.x === x && m.y === y); }
export function setMon(s: GameState, id: number, patch: Partial<Mon>): GameState {
  return withRun(s, { mons: s.run!.mons.map(m => m.id === id ? { ...m, ...patch } : m) });
}

/** End the dive: settle it immediately (run becomes null) and show a summary; the adapter saves the settled state. */
export function endDive(s: GameState, result: Result, cause: Text | null): GameState {
  const run = s.run!;
  const scene = { k: 'summary' as const, result, floor: run.floor, turns: run.turn, level: s.hero.level, gold: s.hero.gold, cause };
  return { ...settleRun(cue(s, result === 'dead' ? 'death' : result), result), scene };
}

export function hurtHero(s: GameState, dmg: number, cause: Text): GameState {
  const hp = s.hero.hp - dmg;
  const next = { ...s, hero: { ...s.hero, hp: Math.max(0, hp) } };
  return hp <= 0 ? endDive(next, 'dead', cause) : next;
}

export function gainExp(s: GameState, n: number): GameState {
  let h = { ...s.hero, exp: s.hero.exp + n }, ups = 0;
  while (h.level < MAX_LEVEL && h.exp >= expForLevel(h.level + 1)) {
    h = { ...h, level: h.level + 1, maxHp: h.maxHp + HP_PER_LEVEL, hp: h.hp + HP_PER_LEVEL }; ups++;
  }
  const next = { ...s, hero: h };
  return ups ? cue(say(next, [`レベル ${h.level} に あがった！`, `You reached level ${h.level}!`]), 'level') : next;
}

/** Put an item on (x, y) or the nearest free floor tile around it; lost when nothing is free. */
export function dropNear(run: Run, x: number, y: number, item: Item, avoid: readonly [number, number] | null = null): Run {
  const free = (px: number, py: number) => isFloor(run.map, px, py) && !run.items.some(f => f.x === px && f.y === py)
    && !(avoid && avoid[0] === px && avoid[1] === py) && !(run.map.stairs[0] === px && run.map.stairs[1] === py);
  for (let ring = 0; ring <= 3; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring || !free(x + dx, y + dy)) continue;
      return { ...run, items: [...run.items, { x: x + dx, y: y + dy, item }] };
    }
  }
  return run;
}

function killMon(s: GameState, m: Mon): GameState {
  let run: Run = { ...s.run!, mons: s.run!.mons.filter(x => x.id !== m.id) };
  if (m.loot > 0) run = dropNear(run, m.x, m.y, { k: 'gold', e: 0, c: m.loot });
  if (m.held) run = dropNear(run, m.x, m.y, m.held);
  const next = cue(say({ ...s, run }, fmt(monName(m), (n, l) => l ? `${n} is defeated.` : `${n}を たおした。`)), 'kill');
  return gainExp(next, SPECIES[m.sp].exp);
}

function split(s: GameState, r: Rng, m: Mon): GameState {
  const run = s.run!;
  if (m.hp < 2 || run.mons.length >= MON_CAP) return s;
  const spots = r.shuffle(DIR_LIST).map(d => [m.x + DIRS[d][0], m.y + DIRS[d][1]] as const)
    .filter(([x, y]) => isFloor(run.map, x, y) && !monAt(run, x, y) && !(s.hero.x === x && s.hero.y === y));
  if (!spots.length) return s;
  const [x, y] = spots[0], half = Math.floor(m.hp / 2);
  const twin: Mon = { ...m, id: run.nextId, x, y, hp: m.hp - half, loot: 0, held: null };
  const mons = [...run.mons.map(x2 => x2.id === m.id ? { ...x2, hp: half } : x2), twin];
  return say(withRun(s, { mons, nextId: run.nextId + 1 }), fmt(monName(m), (n, l) => l ? `${n} splits in two!` : `${n}が ぶんれつした！`));
}

/** Damage a monster: it wakes and notices; it may split; at 0 HP it falls and drops what it carried. */
export function hurtMon(s: GameState, r: Rng, id: number, dmg: number): GameState {
  const m = s.run!.mons.find(x => x.id === id);
  if (!m) return s;
  if (m.hp - dmg <= 0) return killMon(s, m);
  const hurt = { ...m, hp: m.hp - dmg, sleep: 0, aware: true };
  const next = setMon(s, id, hurt);
  return SPECIES[m.sp].quirk === 'split' && r.chance(0.5) ? split(next, r, hurt) : next;
}

/** The hero swings at a monster. */
export function heroStrike(s: GameState, r: Rng, m: Mon): GameState {
  if (!r.chance(HERO_HIT)) {
    return cue(say(setMon(s, m.id, { sleep: 0, aware: true }), fmt(monName(m), (n, l) => l ? `You miss the ${n}.` : `${n}に かわされた。`)), 'miss');
  }
  const dmg = blow(r, heroAtk(s.hero), SPECIES[m.sp].def, 0.5);
  const hit = cue(say(s, fmt(monName(m), (n, l) => l ? `You hit the ${n} for ${dmg}.` : `${n}に ${dmg}の ダメージ！`)), 'hit');
  return hurtMon(hit, r, m.id, dmg);
}

export const defeatedBy = (m: Mon): Text => fmt(monName(m), (n, l) => l ? `Defeated by a ${n}` : `${n}に たおされた`);

/** The quirk riders on a monster's blow: rust, sting and muddle. */
function rider(s: GameState, r: Rng, m: Mon): GameState {
  const h = s.hero, q = SPECIES[m.sp].quirk;
  if (q === 'rust' && h.shield && h.shield.e > -ENCHANT_MAX && r.chance(0.5)) {
    return say({ ...s, hero: { ...h, shield: { ...h.shield, e: h.shield.e - 1 } } }, ['盾が さびてしまった！', 'Your shield rusts!']);
  }
  if (q === 'sting' && h.str > 1 && r.chance(0.5)) return say({ ...s, hero: { ...h, str: h.str - 1 } }, ['ちからが へった…', 'Your strength drains…']);
  if (q === 'muddle' && r.chance(0.4)) return say({ ...s, hero: { ...h, conf: Math.max(h.conf, 6) } }, ['あたまが くらくらする！', 'You feel muddled!']);
  return s;
}

/** A thief takes gold instead of biting, then warps somewhere far away. */
function steal(s: GameState, r: Rng, m: Mon): GameState {
  const run = s.run!, take = Math.min(s.hero.gold, r.range(30, 60) + run.floor * 15);
  const far = run.map.rooms.flatMap(room => Array.from({ length: room.w * room.h }, (_, i) => [room.x + (i % room.w), room.y + Math.floor(i / room.w)] as const))
    .filter(([x, y]) => cheb({ x, y }, s.hero) > 3 && !monAt(run, x, y));
  const [x, y] = far.length ? r.pick(far) : [m.x, m.y];
  const next = setMon({ ...s, hero: { ...s.hero, gold: s.hero.gold - take } }, m.id, { loot: m.loot + take, x, y, aware: false });
  return cue(say(next, fmt(monName(m), (n, l) => l ? `The ${n} stole ${take} gold and vanished!` : `${n}に ${take}ゴールド ぬすまれた！`)), 'hurt');
}

/** A monster attacks the hero in melee (or with an arrow). */
export function monStrike(s: GameState, r: Rng, m: Mon, arrow = false): GameState {
  const d = SPECIES[m.sp];
  if (!arrow && d.quirk === 'thief' && m.loot === 0 && s.hero.gold > 0) return steal(s, r, m);
  const shot = arrow ? fmt(monName(m), (n, l) => l ? `The ${n} shoots an arrow` : `${n}が 矢を はなった`) : null;
  if (s.hero.sleep === 0 && !r.chance(MON_HIT)) {
    return say(s, shot ? [`${shot[0]}が はずれた。`, `${shot[1]}, but it misses.`] : fmt(monName(m), (n, l) => l ? `The ${n} misses.` : `${n}の こうげきは はずれた。`));
  }
  const dmg = blow(r, d.atk, heroDef(s.hero), 0.6);
  const text: Text = shot ? [`${shot[0]}！ ${dmg}の ダメージ。`, `${shot[1]}! You take ${dmg}.`]
    : fmt(monName(m), (n, l) => l ? `The ${n} hits you for ${dmg}.` : `${n}の こうげき！ ${dmg}の ダメージ。`);
  const cause: Text = arrow ? fmt(monName(m), (n, l) => l ? `Shot down by a ${n}'s arrow` : `${n}の 矢に たおされた`) : defeatedBy(m);
  const hit = hurtHero(cue(say(s, text), 'hurt'), dmg, cause);
  return hit.scene.k === 'summary' ? hit : rider(hit, r, m);
}

export const LAST_FLOOR = FLOORS;
