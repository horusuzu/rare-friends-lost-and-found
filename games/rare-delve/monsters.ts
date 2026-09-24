/** Monsters: creation, species by depth, and each monster's turn (sleep, quirks, pursuit, ranged shots, spawning). Pure. */
import { DIRS, DIR_LIST, SPECIES, dirOf, type Dir } from './data.ts';
import { canStep, distanceMap, isFloor, roomTiles, visibleIdx } from './dungeon.ts';
import type { Item } from './items.ts';
import type { Rng } from './rng.ts';
import { MON_CAP, cheb, fmt, monAt, monName, monStrike, setMon } from './combat.ts';
import { say, spawnDelay, withRun, type GameState } from './run.ts';

export interface Mon {
  readonly id: number; readonly sp: string; readonly x: number; readonly y: number; readonly hp: number;
  /** Turns left asleep, slowed or confused. */
  readonly sleep: number; readonly aware: boolean; readonly slow: number; readonly conf: number;
  /** Gold carried by a thief; the item a gulp toad swallowed. */
  readonly loot: number; readonly face: Dir; readonly held: Item | null;
}

export const SLEEPER_SLEEP = 250;

export function makeMon(sp: string, x: number, y: number, id: number, opts: Partial<Mon> = {}): Mon {
  const d = SPECIES[sp];
  if (!d) throw new Error(`Unknown species ${sp}`);
  return { id, sp, x, y, hp: d.hp, sleep: d.quirk === 'sleeper' ? SLEEPER_SLEEP : 0, aware: false, slow: 0, conf: 0, loot: 0, face: 's', held: null, ...opts };
}

/** A species for this floor, drawn by weight. */
export function pickSpecies(r: Rng, floor: number): string {
  const pool = Object.keys(SPECIES).filter(k => SPECIES[k].minFloor <= floor && floor <= SPECIES[k].maxFloor);
  let roll = r.int(pool.reduce((n, k) => n + SPECIES[k].weight, 0));
  return pool.find(k => (roll -= SPECIES[k].weight) < 0) ?? pool[0];
}

/** How many actions a monster gets this turn. */
function actionsFor(m: Mon, turn: number): number {
  const speed = SPECIES[m.sp].speed;
  const base = speed === 'fast' ? 2 : speed === 'slow' ? (turn % 2 === 0 ? 1 : 0) : 1;
  if (m.slow <= 0) return base;
  return speed === 'fast' ? 1 : speed === 'slow' ? (turn % 4 === 0 ? 1 : 0) : (turn % 2 === 0 ? 1 : 0);
}

const free = (s: GameState, x: number, y: number) => !monAt(s.run!, x, y) && !(s.hero.x === x && s.hero.y === y);

function stepMon(s: GameState, m: Mon, dir: Dir): GameState {
  return setMon(s, m.id, { x: m.x + DIRS[dir][0], y: m.y + DIRS[dir][1], face: dir });
}

function randomStep(s: GameState, r: Rng, m: Mon): GameState {
  const dir = r.shuffle(DIR_LIST).find(d => canStep(s.run!.map, m.x, m.y, d) && free(s, m.x + DIRS[d][0], m.y + DIRS[d][1]));
  return dir ? stepMon(s, m, dir) : s;
}

/** Move one step down the distance field toward the hero, around walls and other monsters. */
function chase(s: GameState, m: Mon, dist: Int16Array): GameState {
  const w = s.run!.map.w, here = dist[m.y * w + m.x];
  if (here < 0) return s;
  let best: Dir | null = null, bestScore = here * 1000;
  for (const d of DIR_LIST) {
    const nx = m.x + DIRS[d][0], ny = m.y + DIRS[d][1], nd = dist[ny * w + nx];
    // Fewer steps first, then the straighter line toward the hero.
    const score = nd * 1000 + (nx - s.hero.x) ** 2 + (ny - s.hero.y) ** 2;
    if (nd < 0 || nd >= here || score >= bestScore || !canStep(s.run!.map, m.x, m.y, d) || !free(s, nx, ny)) continue;
    best = d; bestScore = score;
  }
  return best ? stepMon(s, m, best) : s;
}

/** A clear straight line (8 directions) from the monster to the hero, within range. */
function lineOfFire(s: GameState, m: Mon): boolean {
  const dx = s.hero.x - m.x, dy = s.hero.y - m.y, dir = dirOf(dx, dy);
  if (!dir || (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) || cheb(m, s.hero) > 8) return false;
  let x = m.x, y = m.y;
  while (x !== s.hero.x || y !== s.hero.y) {
    if (!canStep(s.run!.map, x, y, dir)) return false;
    x += DIRS[dir][0]; y += DIRS[dir][1];
    if ((x !== s.hero.x || y !== s.hero.y) && monAt(s.run!, x, y)) return false;
  }
  return true;
}

/** One monster action. `seen` holds tiles the hero can see; `dist` is the distance field from the hero. */
function monAct(s: GameState, r: Rng, id: number, seen: Set<number>, dist: Int16Array): GameState {
  const run = s.run!, found = run.mons.find(x => x.id === id);
  if (!found) return s;
  let m: Mon = found;
  const q = SPECIES[m.sp].quirk, w = run.map.w;
  const under = run.items.findIndex(f => f.x === m.x && f.y === m.y && f.item.k !== 'lantern');
  if (q === 'gulp' && under >= 0) {
    const eaten = run.items[under];
    const next = setMon(withRun(s, { items: run.items.filter((_, i) => i !== under) }), m.id, { held: eaten.item });
    return seen.has(m.y * w + m.x) ? say(next, fmt(monName(m), (n, l) => l ? `The ${n} swallows something.` : `${n}が 道具を のみこんだ！`)) : next;
  }
  const d = dist[m.y * w + m.x];
  if (!m.aware && !(q === 'thief' && m.loot > 0) && (seen.has(m.y * w + m.x) || (d >= 0 && d <= 2))) {
    m = { ...m, aware: true }; s = setMon(s, m.id, { aware: true });
  }
  const erratic = m.conf > 0 || (q === 'erratic' && r.chance(0.4)) || (q === 'muddle' && r.chance(0.3));
  if (erratic || !m.aware) return erratic || r.chance(0.5) ? randomStep(s, r, m) : s;
  const toHero = dirOf(s.hero.x - m.x, s.hero.y - m.y);
  if (toHero && cheb(m, s.hero) === 1 && canStep(run.map, m.x, m.y, toHero)) return monStrike(setMon(s, m.id, { face: toHero }), r, m);
  if (q === 'archer' && lineOfFire(s, m)) return monStrike(setMon(s, m.id, { face: toHero! }), r, m, true);
  return chase(s, m, dist);
}

/** Every monster takes its turn after the hero acts. */
export function monstersAct(s0: GameState, r: Rng): GameState {
  let s = s0;
  const run = s.run!, turn = run.turn;
  const seen = new Set(visibleIdx(run.map, s.hero.x, s.hero.y));
  const dist = distanceMap(run.map, s.hero.x, s.hero.y);
  for (const id of run.mons.map(m => m.id)) {
    if (s.scene.k === 'summary' || s.run!.floor !== run.floor) break;
    const m = s.run!.mons.find(x => x.id === id);
    if (!m) continue;
    const statuses = { sleep: Math.max(0, m.sleep - 1), slow: Math.max(0, m.slow - 1), conf: Math.max(0, m.conf - 1) };
    s = setMon(s, id, statuses);
    if (m.sleep > 0) continue;
    for (let n = actionsFor(m, turn); n > 0 && s.scene.k !== 'summary'; n--) s = monAct(s, r, id, seen, dist);
  }
  return s;
}

/** Now and then a new monster wanders in, somewhere the hero cannot see. */
export function spawnTick(s: GameState, r: Rng): GameState {
  const run = s.run!;
  if (run.spawnIn > 1) return withRun(s, { spawnIn: run.spawnIn - 1 });
  const seen = new Set(visibleIdx(run.map, s.hero.x, s.hero.y));
  const spots = run.map.rooms.flatMap(room => roomTiles(run.map, room))
    .filter(([x, y]) => isFloor(run.map, x, y) && !seen.has(y * run.map.w + x) && free(s, x, y));
  if (run.mons.length >= MON_CAP || !spots.length) return withRun(s, { spawnIn: spawnDelay(r) });
  const [x, y] = r.pick(spots);
  const mon = makeMon(pickSpecies(r, run.floor), x, y, run.nextId, { sleep: 0 });
  return withRun(s, { mons: [...run.mons, mon], nextId: run.nextId + 1, spawnIn: spawnDelay(r) });
}
