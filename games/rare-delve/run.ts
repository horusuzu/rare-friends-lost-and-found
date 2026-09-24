/** Game state types, the hero between dives, floor population and settling a finished dive. Pure. */
import { BASE_HP, BASE_STR, CLEAR_BONUS, FLOORS, FULL_MAX, GOLD_CAP, HP_PER_LEVEL, type Dir, type Text, type TrapKind } from './data.ts';
import { generateMap, roomIndex, roomTiles, visibleIdx, type FloorMap, type Point } from './dungeon.ts';
import { makeItem, rollItem, type Item } from './items.ts';
import { makeMon, pickSpecies, type Mon } from './monsters.ts';
import { mix, rngFrom, type Rng } from './rng.ts';

export interface Hero {
  readonly x: number; readonly y: number; readonly face: Dir;
  readonly hp: number; readonly maxHp: number; readonly level: number; readonly exp: number;
  readonly str: number; readonly maxStr: number; readonly full: number; readonly gold: number;
  readonly bag: readonly Item[]; readonly weapon: Item | null; readonly shield: Item | null;
  /** Turns left asleep, confused or hasted. */
  readonly sleep: number; readonly conf: number; readonly haste: number;
  /** Regeneration pool: max HP accumulates here each turn; every REGEN_POOL points heal 1 HP. */
  readonly regen: number;
}
export interface FloorItem { readonly x: number; readonly y: number; readonly item: Item }
export interface Trap { readonly x: number; readonly y: number; readonly kind: TrapKind; readonly found: boolean }
export interface Run {
  /** Run seed: floor layouts and unidentified looks derive from it. */
  readonly seed: number; readonly floor: number; readonly map: FloorMap;
  /** '0'/'1' per tile: explored. */
  readonly seen: string;
  readonly mons: readonly Mon[]; readonly items: readonly FloorItem[]; readonly traps: readonly Trap[];
  readonly nextId: number; readonly spawnIn: number; readonly known: readonly string[]; readonly sight: boolean;
  readonly turn: number; readonly rng: number;
  /** Swift: the next hero action is free (monsters skip it). */
  readonly free: boolean;
}
export interface Meta { readonly purse: number; readonly shopLv: number; readonly clears: number; readonly dives: number; readonly best: number }
export type Result = 'dead' | 'home' | 'clear';
export type Scene =
  | { readonly k: 'town'; readonly cur: number }
  | { readonly k: 'dungeon' }
  | { readonly k: 'bag'; readonly cur: number; readonly from: 'dungeon' | 'town' }
  | { readonly k: 'act'; readonly row: number; readonly cur: number; readonly from: 'dungeon' | 'town' }
  | { readonly k: 'pick'; readonly cur: number }
  | { readonly k: 'shop'; readonly cur: number }
  | { readonly k: 'chest'; readonly cur: number }
  | { readonly k: 'summary'; readonly result: Result; readonly floor: number; readonly turns: number; readonly level: number; readonly gold: number; readonly cause: Text | null };
export type Sfx = 'step' | 'hit' | 'hurt' | 'miss' | 'kill' | 'pickup' | 'level' | 'stairs' | 'eat' | 'drink' | 'read' | 'zap' | 'throw'
  | 'trap' | 'death' | 'clear' | 'home' | 'buy' | 'error' | 'confirm' | 'cancel';
export interface GameState {
  readonly token: string; readonly seed: number;
  readonly meta: Meta; readonly chest: readonly Item[]; readonly hero: Hero; readonly run: Run | null;
  readonly scene: Scene; readonly log: readonly Text[];
  /** Incremented whenever the adapter should persist. */
  readonly saveTick: number; readonly saveError: boolean;
  readonly showMap: boolean; readonly turnMode: boolean;
  readonly sfx: { readonly n: number; readonly id: Sfx };
}

export const LOG_MAX = 30;
export const maxHpFor = (level: number): number => BASE_HP + (level - 1) * HP_PER_LEVEL;

export function freshHero(bag: readonly Item[] = [], weapon: Item | null = null, shield: Item | null = null): Hero {
  return {
    x: 0, y: 0, face: 's', hp: maxHpFor(1), maxHp: maxHpFor(1), level: 1, exp: 0, str: BASE_STR, maxStr: BASE_STR,
    full: FULL_MAX, gold: 0, bag, weapon, shield, sleep: 0, conf: 0, haste: 0, regen: 0,
  };
}

export const say = (s: GameState, text: Text): GameState => ({ ...s, log: [...s.log.slice(1 - LOG_MAX), text] });
export const cue = (s: GameState, id: Sfx): GameState => ({ ...s, sfx: { n: s.sfx.n + 1, id } });
export const withRun = (s: GameState, run: Partial<Run>): GameState => ({ ...s, run: { ...s.run!, ...run } });
export const withHero = (s: GameState, hero: Partial<Hero>): GameState => ({ ...s, hero: { ...s.hero, ...hero } });

/** Mark what the hero sees as explored. */
export function reveal(run: Run, x: number, y: number): string {
  const cells = run.seen.split('');
  for (const i of visibleIdx(run.map, x, y)) cells[i] = '1';
  return cells.join('');
}

/** Free floor tiles in rooms, excluding given spots. */
function roomSpots(map: FloorMap, avoidRoom: number, taken: Set<string>): Point[] {
  return map.rooms.flatMap((room, i) => i === avoidRoom ? [] : roomTiles(map, room)).filter(([x, y]) => !taken.has(`${x},${y}`));
}
function takeSpot(r: Rng, spots: Point[], taken: Set<string>): Point | null {
  const free = spots.filter(([x, y]) => !taken.has(`${x},${y}`));
  if (!free.length) return null;
  const p = r.pick(free); taken.add(`${p[0]},${p[1]}`);
  return p;
}

export const spawnDelay = (r: Rng): number => r.range(35, 60);

function populate(r: Rng, map: FloorMap, floor: number, firstId: number) {
  const [sx, sy] = map.start, [tx, ty] = map.stairs;
  const startRoom = roomIndex(map, sx, sy);
  const monTaken = new Set([`${sx},${sy}`]);
  const monSpots = roomSpots(map, startRoom, monTaken);
  const mons: Mon[] = [];
  const count = r.range(2, 3) + Math.floor(floor * 0.6);
  for (let i = 0; i < count; i++) {
    const p = takeSpot(r, monSpots, monTaken); if (!p) break;
    const sp = pickSpecies(r, floor), m = makeMon(sp, p[0], p[1], firstId + i);
    mons.push(m.sleep > 0 ? m : { ...m, sleep: r.chance(0.5) ? r.range(8, 40) : 0 });
  }
  const itemTaken = new Set([`${sx},${sy}`, `${tx},${ty}`]);
  const itemSpots = roomSpots(map, -1, itemTaken);
  const items: FloorItem[] = [];
  if (floor === FLOORS) items.push({ x: tx, y: ty, item: makeItem('lantern') });
  const nItems = r.range(4, 6) + (floor >= 5 ? 1 : 0), nGold = r.range(1, 3);
  for (let i = 0; i < nItems + nGold; i++) {
    const p = takeSpot(r, itemSpots, itemTaken); if (!p) break;
    const item = i < nItems ? rollItem(r, floor) : makeItem('gold', { c: Math.min(GOLD_CAP, r.range(8, 24) * (2 + floor)) });
    items.push({ x: p[0], y: p[1], item });
  }
  // Never beside a doorway, where a known trap would wall off the room.
  const nearCorridor = ([x, y]: Point) => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => map.tiles[(y + dy) * map.w + x + dx] === ','));
  const trapSpots = itemSpots.filter(p => !nearCorridor(p));
  const traps: Trap[] = [];
  const kinds = floor === FLOORS ? (['trip', 'alarm'] as const) : (['trip', 'pit', 'alarm'] as const);
  const nTraps = Math.min(6, 1 + Math.floor(floor / 2) + r.int(2));
  for (let i = 0; i < nTraps; i++) {
    const p = takeSpot(r, trapSpots, itemTaken); if (!p) break;
    traps.push({ x: p[0], y: p[1], kind: r.pick(kinds), found: false });
  }
  return { mons, items, traps };
}

/** Enter floor `floor` of the current run: a fresh map, population and fog; the hero stands on the start tile. */
export function newFloor(s: GameState, floor: number): GameState {
  const run0 = s.run!;
  const map = generateMap(mix(run0.seed, floor));
  const r = rngFrom(mix(run0.seed, floor + 0x100));
  const { mons, items, traps } = populate(r, map, floor, run0.nextId);
  const blank: Run = {
    ...run0, floor, map, seen: '0'.repeat(map.w * map.h), mons, items, traps,
    nextId: run0.nextId + mons.length, spawnIn: spawnDelay(r), sight: false, free: false,
  };
  const [x, y] = map.start;
  const run = { ...blank, seen: reveal(blank, x, y) };
  return { ...s, run, hero: { ...s.hero, x, y }, scene: { k: 'dungeon' }, showMap: false, turnMode: false,
    meta: { ...s.meta, best: Math.max(s.meta.best, floor) } };
}

/** Settle a finished dive at once (the summary screen shows it): death loses everything carried; home and clear bank carried gold. */
export function settleRun(s: GameState, result: Result): GameState {
  const h = s.hero;
  const bonus = result === 'clear' ? CLEAR_BONUS : 0;
  const purse = result === 'dead' ? s.meta.purse : Math.min(GOLD_CAP, s.meta.purse + h.gold + bonus);
  const hero = result === 'dead' ? freshHero() : freshHero(h.bag, h.weapon, h.shield);
  return {
    ...s, hero, run: null, showMap: false, turnMode: false, saveTick: s.saveTick + 1,
    meta: { ...s.meta, purse, clears: s.meta.clears + (result === 'clear' ? 1 : 0) },
  };
}
