/** Rare Delve's button-driven state machine: town, shop counter, storage chest, bag menus and the dungeon. Pure. */
import { BAG_MAX, CHEST_MAX, DIR_LIST, FLOORS, GOLD_CAP, ITEMS, SHOP_COSTS, SHOP_MAX, UNIDENTIFIED, type Dir, type Text } from './data.ts';
import { isGear, makeItem, sellPrice, type Item } from './items.ts';
import { mix } from './rng.ts';
import { equip, identifyAt, unequip } from './actions.ts';
import { act, type Action } from './turn.ts';
import { cue, freshHero, newFloor, say, type GameState, type Run } from './run.ts';

export type Button = Dir | 'a' | 'b' | 'wait' | 'map' | 'turn' | 'menu' | 'up' | 'down' | 'left' | 'right';
export type TownChoice = 'dive' | 'shop' | 'chest' | 'bag';
export const TOWN_MENU: readonly TownChoice[] = ['dive', 'shop', 'chest', 'bag'];
export type ActOption = 'use' | 'zap' | 'throw' | 'drop' | 'equip' | 'unequip';
export interface BagRow { readonly slot: number | 'weapon' | 'shield'; readonly item: Item }

/** Free starting provisions by shop level. */
export const STARTER: readonly (readonly string[])[] = [[], ['bun'], ['bun', 'mendleaf'], ['bun', 'bun', 'mendleaf']];
const TOKEN = /^(generations|genesis):([1-9][0-9]{0,77})$/;
const ALIAS: Readonly<Record<string, Dir>> = { up: 'n', down: 's', left: 'w', right: 'e' };
const wrap = (cur: number, delta: number, n: number) => n > 0 ? (cur + delta + n) % n : 0;
const clamp = (cur: number, n: number) => Math.max(0, Math.min(cur, n - 1));

export function isToken(token: unknown): token is string { return typeof token === 'string' && TOKEN.test(token); }

export function newGame(token: string, seed: number): GameState {
  if (!isToken(token)) throw new Error('Invalid Friend token');
  return {
    token, seed: seed >>> 0, meta: { purse: 0, shopLv: 1, clears: 0, dives: 0, best: 0 }, chest: [], hero: freshHero(), run: null,
    scene: { k: 'town', cur: 0 }, log: [['ようこそ、ランタン洞の 町へ。', 'Welcome to the town above Lantern Hollow.']],
    saveTick: 0, saveError: false, showMap: false, turnMode: false, sfx: { n: 0, id: 'confirm' },
  };
}

export function saveResult(s: GameState, ok: boolean): GameState { return { ...s, saveError: !ok }; }

/** Start a dive: level 1, full belly, the shop's provisions added; kinds brought from town are already known. */
export function startDive(s: GameState): GameState {
  const extra = STARTER[s.meta.shopLv].map(k => makeItem(k));
  const bag = [...s.hero.bag, ...extra].slice(0, BAG_MAX);
  const seed = mix(s.seed, s.meta.dives + 1);
  const known = [...new Set(bag.filter(it => UNIDENTIFIED.includes(ITEMS[it.k].kind)).map(it => it.k))];
  const stub: Run = {
    seed, floor: 0, map: { w: 0, h: 0, tiles: '', rooms: [], start: [0, 0], stairs: [0, 0] }, seen: '', mons: [], items: [], traps: [],
    nextId: 1, spawnIn: 0, known, sight: false, turn: 0, rng: mix(seed, 0x5eed), free: false,
  };
  const diving: GameState = { ...s, hero: freshHero(bag, s.hero.weapon, s.hero.shield), run: stub, meta: { ...s.meta, dives: s.meta.dives + 1 }, log: [] };
  const entered = newFloor(diving, 1);
  return cue(say({ ...entered, saveTick: s.saveTick + 1 }, ['ランタン洞 1階に おりた。', 'You enter Lantern Hollow, floor 1.']), 'stairs');
}

export function bagRows(s: GameState): BagRow[] {
  const h = s.hero;
  return [
    ...(h.weapon ? [{ slot: 'weapon' as const, item: h.weapon }] : []),
    ...(h.shield ? [{ slot: 'shield' as const, item: h.shield }] : []),
    ...h.bag.map((item, i) => ({ slot: i, item })),
  ];
}

export function actOptions(s: GameState, row: number): ActOption[] {
  const r = bagRows(s)[row];
  if (!r) return [];
  if (typeof r.slot !== 'number') return ['unequip'];
  if (!s.run) return isGear(r.item.k) ? ['equip'] : [];
  const kind = ITEMS[r.item.k].kind;
  if (isGear(r.item.k)) return ['equip', 'throw', 'drop'];
  if (kind === 'wand') return ['zap', 'throw', 'drop'];
  if (['food', 'herb', 'potion', 'scroll'].includes(kind)) return ['use', 'throw', 'drop'];
  return ['throw', 'drop'];
}

// ---------- town ----------

function town(s: GameState, b: Button): GameState {
  if (s.scene.k !== 'town') return s;
  if (b === 'n' || b === 's') return { ...s, scene: { k: 'town', cur: wrap(s.scene.cur, b === 's' ? 1 : -1, TOWN_MENU.length) } };
  if (b !== 'a') return s;
  switch (TOWN_MENU[s.scene.cur]) {
    case 'dive': return startDive(s);
    case 'shop': return cue({ ...s, scene: { k: 'shop', cur: 0 } }, 'confirm');
    case 'chest': return cue({ ...s, scene: { k: 'chest', cur: 0 } }, 'confirm');
    default: return cue({ ...s, scene: { k: 'bag', cur: 0, from: 'town' } }, 'confirm');
  }
}
const backToTown = (s: GameState, choice: TownChoice): GameState => cue({ ...s, scene: { k: 'town', cur: TOWN_MENU.indexOf(choice) } }, 'cancel');

function shop(s: GameState, b: Button): GameState {
  if (s.scene.k !== 'shop') return s;
  const rows = 1 + s.hero.bag.length, cur = s.scene.cur;
  if (b === 'n' || b === 's') return { ...s, scene: { k: 'shop', cur: wrap(cur, b === 's' ? 1 : -1, rows) } };
  if (b === 'b') return backToTown(s, 'shop');
  if (b !== 'a') return s;
  if (cur === 0) {
    const lv = s.meta.shopLv, cost = SHOP_COSTS[lv + 1];
    if (lv >= SHOP_MAX || s.meta.purse < cost) return cue(say(s, ['ゴールドが たりない。', 'Not enough gold.']), 'error');
    return cue(say({ ...s, meta: { ...s.meta, shopLv: lv + 1, purse: s.meta.purse - cost }, saveTick: s.saveTick + 1 },
      [`お店が レベル${lv + 1}に なった！`, `The shop is now level ${lv + 1}!`]), 'buy');
  }
  const it = s.hero.bag[cur - 1];
  if (!it) return s;
  const bag = s.hero.bag.filter((_, i) => i !== cur - 1), price = sellPrice(it);
  return cue(say({ ...s, hero: { ...s.hero, bag }, meta: { ...s.meta, purse: Math.min(GOLD_CAP, s.meta.purse + price) },
    scene: { k: 'shop', cur: clamp(cur, 1 + bag.length) }, saveTick: s.saveTick + 1 }, [`${price}ゴールドで うった。`, `Sold for ${price} gold.`]), 'buy');
}

/** Chest rows: the chest's items, then the bag's. A on a chest row takes it out; on a bag row puts it in. */
function chest(s: GameState, b: Button): GameState {
  if (s.scene.k !== 'chest') return s;
  const rows = s.chest.length + s.hero.bag.length, cur = s.scene.cur;
  if (b === 'n' || b === 's') return { ...s, scene: { k: 'chest', cur: wrap(cur, b === 's' ? 1 : -1, rows) } };
  if (b === 'b') return backToTown(s, 'chest');
  if (b !== 'a') return s;
  if (cur < s.chest.length) {
    if (s.hero.bag.length >= BAG_MAX) return cue(say(s, ['もちものが いっぱいだ。', 'Your bag is full.']), 'error');
    const chestItems = s.chest.filter((_, i) => i !== cur);
    return cue({ ...s, chest: chestItems, hero: { ...s.hero, bag: [...s.hero.bag, s.chest[cur]] },
      scene: { k: 'chest', cur: clamp(cur, rows) }, saveTick: s.saveTick + 1 }, 'confirm');
  }
  const i = cur - s.chest.length, it = s.hero.bag[i];
  if (!it) return s;
  if (s.chest.length >= CHEST_MAX) return cue(say(s, ['そうこが いっぱいだ。', 'The chest is full.']), 'error');
  const chestItems = [...s.chest, it];
  return cue({ ...s, chest: chestItems, hero: { ...s.hero, bag: s.hero.bag.filter((_, j) => j !== i) },
    scene: { k: 'chest', cur: clamp(chestItems.length + i, rows) }, saveTick: s.saveTick + 1 }, 'confirm');
}

// ---------- bag menus ----------

function bag(s: GameState, b: Button): GameState {
  if (s.scene.k !== 'bag') return s;
  const rows = bagRows(s).length, { cur, from } = s.scene;
  if (b === 'n' || b === 's') return { ...s, scene: { k: 'bag', from, cur: wrap(cur, b === 's' ? 1 : -1, rows) } };
  if (b === 'b' || b === 'menu') return from === 'town' ? backToTown(s, 'bag') : cue({ ...s, scene: { k: 'dungeon' } }, 'cancel');
  if (b !== 'a' || !actOptions(s, cur).length) return s;
  return cue({ ...s, scene: { k: 'act', row: cur, cur: 0, from } }, 'confirm');
}

function toAction(row: BagRow, option: ActOption): Action {
  if (option === 'unequip') return { k: 'unequip', slot: row.slot as 'weapon' | 'shield' };
  return { k: option, i: row.slot as number };
}

function actMenu(s: GameState, b: Button): GameState {
  if (s.scene.k !== 'act') return s;
  const { row, cur, from } = s.scene, options = actOptions(s, row);
  if (b === 'n' || b === 's') return { ...s, scene: { ...s.scene, cur: wrap(cur, b === 's' ? 1 : -1, options.length) } };
  if (b === 'b') return { ...s, scene: { k: 'bag', cur: row, from } };
  if (b !== 'a' || !options[cur]) return s;
  const r = bagRows(s)[row], option = options[cur];
  if (from === 'town') {
    const done = option === 'equip' ? equip(s, r.slot as number, false).s : unequip(s, r.slot as 'weapon' | 'shield', false).s;
    return { ...done, scene: { k: 'bag', from, cur: clamp(row, bagRows(done).length) } };
  }
  return act({ ...s, scene: { k: 'dungeon' } }, toAction(r, option));
}

function pick(s: GameState, b: Button): GameState {
  if (s.scene.k !== 'pick') return s;
  if (b === 'n' || b === 's') return { ...s, scene: { k: 'pick', cur: wrap(s.scene.cur, b === 's' ? 1 : -1, s.hero.bag.length) } };
  if (b === 'b') return { ...s, scene: { k: 'dungeon' } };
  if (b !== 'a') return s;
  return cue({ ...identifyAt(s, s.scene.cur), scene: { k: 'dungeon' } }, 'confirm');
}

// ---------- dungeon ----------

export function onStairs(s: GameState): boolean {
  const run = s.run;
  return !!run && run.floor < FLOORS && run.map.stairs[0] === s.hero.x && run.map.stairs[1] === s.hero.y;
}

function descend(s: GameState): GameState {
  const floor = s.run!.floor + 1;
  const next = newFloor(s, floor);
  const text: Text = floor === FLOORS ? ['さいごの 階。ハートのランタンが どこかに ある…', 'The last floor. The Heart Lantern is near…'] : [`${floor}階に おりた。`, `You descend to floor ${floor}.`];
  return cue(say({ ...next, saveTick: s.saveTick + 1 }, text), 'stairs');
}

function dungeon(s0: GameState, b: Button): GameState {
  const s = s0.showMap && b !== 'map' ? { ...s0, showMap: false } : s0;
  if (s0.showMap && (b === 'b' || b === 'a')) return s;
  if (s.turnMode) {
    if ((DIR_LIST as readonly string[]).includes(b)) return { ...s, turnMode: false, hero: { ...s.hero, face: b as Dir } };
    if (b === 'b' || b === 'turn') return { ...s, turnMode: false };
  }
  if ((DIR_LIST as readonly string[]).includes(b)) return act(s, { k: 'move', dir: b as Dir });
  switch (b) {
    case 'wait': return act(s, { k: 'wait' });
    case 'a': return onStairs(s) ? descend(s) : act(s, { k: 'attack' });
    case 'menu': return cue({ ...s, scene: { k: 'bag', cur: 0, from: 'dungeon' } }, 'confirm');
    case 'map': return { ...s, showMap: !s0.showMap };
    case 'turn': return { ...s, turnMode: true };
    default: return s;
  }
}

/** Apply one button press. The input state is never mutated. */
export function press(s: GameState, button: Button): GameState {
  const b: Button = (ALIAS[button] as Dir | undefined) ?? button;
  switch (s.scene.k) {
    case 'town': return town(s, b);
    case 'shop': return shop(s, b);
    case 'chest': return chest(s, b);
    case 'bag': return bag(s, b);
    case 'act': return actMenu(s, b);
    case 'pick': return pick(s, b);
    case 'summary': return b === 'a' ? cue({ ...s, scene: { k: 'town', cur: 0 } }, 'confirm') : s;
    case 'dungeon': return dungeon(s, b);
  }
}
