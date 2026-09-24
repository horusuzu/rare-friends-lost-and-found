/**
 * Compact saves for client.saveLocal. A dive in progress is suspended whole (floor seed, monsters, items, traps,
 * fog, knowledge, RNG) so it resumes identically. Loading validates every field and never trusts storage.
 */
import { BAG_MAX, CHEST_MAX, DIR_LIST, FLOORS, FULL_MAX, GOLD_CAP, MAX_LEVEL, REGEN_POOL, SHOP_MAX, SPECIES, TRAP_KINDS, UNIDENTIFIED, ITEMS, expForLevel, type TrapKind } from './data.ts';
import { generateMap, isFloor } from './dungeon.ts';
import { itemCode, parseItem, type Item } from './items.ts';
import type { Mon } from './monsters.ts';
import { mix } from './rng.ts';
import { freshHero, type FloorItem, type GameState, type Hero, type Meta, type Run, type Trap } from './run.ts';
import { isToken } from './game.ts';

export const SAVE_LIMIT = 32 * 1024;
const MONS_MAX = 40, ITEMS_MAX = 200, TRAPS_MAX = 20, STATUS_MAX = 99, SLEEP_MAX = 255;
const U32 = 0xffffffff;

// ---------- writing ----------

function seenHex(seen: string): string {
  let out = '';
  for (let i = 0; i < seen.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) n = n * 2 + (seen[i + j] === '1' ? 1 : 0);
    out += n.toString(16);
  }
  return out;
}

const heroTuple = (h: Hero) => [h.hp, h.maxHp, h.level, h.exp, h.str, h.maxStr, h.full, h.gold, h.sleep, h.conf, h.x, h.y, DIR_LIST.indexOf(h.face), h.haste, h.regen];
const monTuple = (m: Mon) => [m.id, m.sp, m.x, m.y, m.hp, m.sleep, m.aware ? 1 : 0, m.slow, m.conf, m.loot, DIR_LIST.indexOf(m.face), m.held ? itemCode(m.held) : ''];

function runRecord(run: Run, hero: Hero) {
  return {
    f: run.floor, z: run.seed, g: run.rng, n: run.turn, d: run.nextId, w: run.spawnIn, x: run.sight ? 1 : 0, q: run.free ? 1 : 0,
    h: heroTuple(hero), v: seenHex(run.seen), i: run.items.map(f => [f.x, f.y, itemCode(f.item)]),
    p: run.traps.map(t => [t.x, t.y, t.kind, t.found ? 1 : 0]), m: run.mons.map(monTuple), k: run.known,
  };
}

/** A dive is settled the moment it ends, so a save made on the summary screen resumes in town and cannot undo a death. */
export function serialize(s: GameState): string {
  return JSON.stringify({
    v: 1, t: s.token, s: s.seed,
    m: [s.meta.purse, s.meta.shopLv, s.meta.clears, s.meta.dives, s.meta.best],
    c: s.chest.map(itemCode), b: s.hero.bag.map(itemCode), e: [s.hero.weapon ? itemCode(s.hero.weapon) : '', s.hero.shield ? itemCode(s.hero.shield) : ''],
    r: s.run ? runRecord(s.run, s.hero) : null,
  });
}

// ---------- reading ----------

function fail(what: string): never { throw new Error(`Invalid save: ${what}`); }
const int = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
function ints(v: unknown, what: string, ranges: readonly (readonly [number, number])[]): number[] {
  if (!Array.isArray(v) || v.length !== ranges.length || !v.every((n, i) => int(n, ranges[i][0], ranges[i][1]))) fail(what);
  return v as number[];
}
const flag = (v: unknown, what: string): boolean => { if (v !== 0 && v !== 1) fail(what); return v === 1; };

function carried(v: unknown, max: number, what: string): Item[] {
  if (!Array.isArray(v) || v.length > max) fail(what);
  return v.map(code => {
    const it = parseItem(code);
    if (!it || it.k === 'gold' || it.k === 'lantern') fail(what);
    return it;
  });
}
function gear(code: unknown, kind: 'weapon' | 'shield'): Item | null {
  if (code === '') return null;
  const it = parseItem(code);
  if (!it || ITEMS[it.k].kind !== kind) fail(kind);
  return it;
}

function readMeta(v: unknown): Meta {
  const [purse, shopLv, clears, dives, best] = ints(v, 'meta', [[0, GOLD_CAP], [1, SHOP_MAX], [0, 1e6], [0, 1e9], [0, FLOORS]]);
  return { purse, shopLv, clears, dives, best };
}

function readSeen(v: unknown, size: number): string {
  if (typeof v !== 'string' || v.length !== Math.ceil(size / 4) || !/^[0-9a-f]*$/.test(v)) fail('fog');
  return [...v].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('').slice(0, size);
}

function readHero(v: unknown, run: { map: ReturnType<typeof generateMap> }, bag: Item[], weapon: Item | null, shield: Item | null): Hero {
  const [hp, maxHp, level, exp, str, maxStr, full, gold, sleep, conf, x, y, face, haste, regen] = ints(v, 'hero', [
    [1, 999], [1, 999], [1, MAX_LEVEL], [0, 1e9], [0, 99], [1, 99], [0, FULL_MAX], [0, GOLD_CAP], [0, STATUS_MAX], [0, STATUS_MAX],
    [0, 99], [0, 99], [0, 7], [0, STATUS_MAX], [0, REGEN_POOL - 1]]);
  if (hp > maxHp || str > maxStr || !isFloor(run.map, x, y)) fail('hero');
  if (exp < expForLevel(level) || (level < MAX_LEVEL && exp >= expForLevel(level + 1))) fail('exp');
  return { x, y, face: DIR_LIST[face], hp, maxHp, level, exp, str, maxStr, full, gold, bag, weapon, shield, sleep, conf, haste, regen };
}

function readItems(v: unknown, map: ReturnType<typeof generateMap>, floor: number): FloorItem[] {
  if (!Array.isArray(v) || v.length > ITEMS_MAX) fail('floor items');
  return v.map((t: unknown) => {
    if (!Array.isArray(t) || t.length !== 3 || !int(t[0], 0, 99) || !int(t[1], 0, 99) || !isFloor(map, t[0], t[1])) fail('floor item');
    const item = parseItem(t[2]);
    if (!item || (item.k === 'lantern' && floor !== FLOORS)) fail('floor item');
    return { x: t[0] as number, y: t[1] as number, item };
  });
}

function readTraps(v: unknown, map: ReturnType<typeof generateMap>): Trap[] {
  if (!Array.isArray(v) || v.length > TRAPS_MAX) fail('traps');
  return v.map((t: unknown) => {
    if (!Array.isArray(t) || t.length !== 4 || !int(t[0], 0, 99) || !int(t[1], 0, 99) || !isFloor(map, t[0], t[1])) fail('trap');
    if (typeof t[2] !== 'string' || !TRAP_KINDS.includes(t[2] as TrapKind)) fail('trap kind');
    return { x: t[0] as number, y: t[1] as number, kind: t[2] as TrapKind, found: flag(t[3], 'trap') };
  });
}

function readMon(t: unknown, map: ReturnType<typeof generateMap>): Mon {
  if (!Array.isArray(t) || t.length !== 12) fail('monster');
  const sp = t[1];
  if (typeof sp !== 'string' || !Object.hasOwn(SPECIES, sp)) fail('species');
  const [id, x, y, hp, sleep, , slow, conf, loot, face] = ints([t[0], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10]], 'monster',
    [[1, 1e9], [0, 99], [0, 99], [1, SPECIES[sp].hp], [0, SLEEP_MAX], [0, 1], [0, STATUS_MAX], [0, STATUS_MAX], [0, GOLD_CAP], [0, 7]]);
  if (!isFloor(map, x, y)) fail('monster position');
  const held = t[11] === '' ? null : parseItem(t[11]);
  if (t[11] !== '' && (!held || held.k === 'lantern')) fail('monster item');
  return { id, sp, x, y, hp, sleep, aware: t[6] === 1, slow, conf, loot, face: DIR_LIST[face], held };
}

function readKnown(v: unknown): string[] {
  if (!Array.isArray(v) || new Set(v).size !== v.length) fail('known');
  if (!v.every(k => typeof k === 'string' && Object.hasOwn(ITEMS, k) && UNIDENTIFIED.includes(ITEMS[k].kind))) fail('known');
  return v as string[];
}

function readRun(v: unknown, bag: Item[], weapon: Item | null, shield: Item | null): { run: Run; hero: Hero } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('run');
  const o = v as Record<string, unknown>;
  if (!int(o.f, 1, FLOORS) || !int(o.z, 0, U32) || !int(o.g, 0, U32) || !int(o.n, 0, 1e7) || !int(o.d, 1, 1e9) || !int(o.w, 0, 999)) fail('run');
  const map = generateMap(mix(o.z, o.f));
  const hero = readHero(o.h, { map }, bag, weapon, shield);
  if (!Array.isArray(o.m) || o.m.length > MONS_MAX) fail('monsters');
  const mons = o.m.map(t => readMon(t, map));
  const spots = new Set([`${hero.x},${hero.y}`, ...mons.map(m => `${m.x},${m.y}`)]);
  if (spots.size !== mons.length + 1 || new Set(mons.map(m => m.id)).size !== mons.length || mons.some(m => m.id >= (o.d as number))) fail('monsters');
  const run: Run = {
    seed: o.z, floor: o.f, map, seen: readSeen(o.v, map.w * map.h), mons, items: readItems(o.i, map, o.f), traps: readTraps(o.p, map),
    nextId: o.d, spawnIn: o.w, known: readKnown(o.k), sight: flag(o.x, 'sight'), turn: o.n, rng: o.g, free: flag(o.q, 'swift'),
  };
  return { run, hero };
}

/** Returns null when nothing is stored; throws when the stored value is malformed, tampered or belongs to another Friend. */
export function loadGame(raw: string | null, token: string, _seed: number): GameState | null {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > SAVE_LIMIT) fail('size');
  if (!isToken(token)) fail('token');
  const v: unknown = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('shape');
  const o = v as Record<string, unknown>;
  if (o.v !== 1) fail('version');
  if (o.t !== token) fail('token');
  if (!int(o.s, 0, U32)) fail('seed');
  const meta = readMeta(o.m);
  const chest = carried(o.c, CHEST_MAX, 'chest'), bag = carried(o.b, BAG_MAX, 'bag');
  if (!Array.isArray(o.e) || o.e.length !== 2) fail('equipment');
  const weapon = gear(o.e[0], 'weapon'), shield = gear(o.e[1], 'shield');
  const dive = o.r === null ? null : readRun(o.r, bag, weapon, shield);
  return {
    token, seed: o.s, meta, chest, hero: dive ? dive.hero : freshHero(bag, weapon, shield), run: dive ? dive.run : null,
    scene: dive ? { k: 'dungeon' } : { k: 'town', cur: 0 },
    log: [dive ? [`${dive.run.floor}階から つづきを はじめる。`, `Resuming on floor ${dive.run.floor}.`] : ['町に もどってきた。', 'Back in town.']],
    saveTick: 0, saveError: false, showMap: false, turnMode: false, sfx: { n: 0, id: 'confirm' },
  };
}
