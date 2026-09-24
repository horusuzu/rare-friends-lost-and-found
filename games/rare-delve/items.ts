/** Items: construction, compact codes, per-run unidentified looks, names, prices and random rolls. Pure. */
import { COLORS, GOLD_CAP, ITEMS, SYLLABLES, UNIDENTIFIED, WOODS, type ItemKind, type Text } from './data.ts';
import { mix, rngFrom, type Rng } from './rng.ts';

/** k: kind id; e: enchantment (weapons, shields); c: charges (wands) or count (darts, gold). */
export interface Item { readonly k: string; readonly e: number; readonly c: number }

export const ENCHANT_MAX = 9;
export const CHARGE_MAX = 9;
export const DART_MAX = 99;

const kindOf = (k: string): ItemKind => ITEMS[k].kind;
const kindsOf = (kind: ItemKind): string[] => Object.keys(ITEMS).filter(k => ITEMS[k].kind === kind);
export const POTION_KINDS = kindsOf('potion');
export const SCROLL_KINDS = kindsOf('scroll');
export const WAND_KINDS = kindsOf('wand');

export function isGear(k: string): boolean { const kind = kindOf(k); return kind === 'weapon' || kind === 'shield'; }
export function hasCount(k: string): boolean { const kind = kindOf(k); return kind === 'dart' || kind === 'gold'; }

export function makeItem(k: string, opts: { e?: number; c?: number } = {}): Item {
  if (!Object.hasOwn(ITEMS, k)) throw new Error(`Unknown item ${k}`);
  const kind = kindOf(k);
  const c = kind === 'wand' ? opts.c ?? 3 : kind === 'dart' ? opts.c ?? 5 : kind === 'gold' ? opts.c ?? 1 : 0;
  return { k, e: isGear(k) ? opts.e ?? 0 : 0, c };
}

export function itemCode(it: Item): string {
  const kind = kindOf(it.k);
  if (isGear(it.k)) return it.e === 0 ? it.k : `${it.k}${it.e > 0 ? '+' : '-'}${Math.abs(it.e)}`;
  if (kind === 'wand') return `${it.k}:${it.c}`;
  if (hasCount(it.k)) return `${it.k}*${it.c}`;
  return it.k;
}

const CODE = /^([a-z_]+)(?:([+-])(\d{1,2})|:(\d{1,2})|\*(\d{1,6}))?$/;
/** Strict inverse of itemCode; null for anything malformed or out of range. */
export function parseItem(code: unknown): Item | null {
  if (typeof code !== 'string') return null;
  const m = CODE.exec(code);
  if (!m || !Object.hasOwn(ITEMS, m[1])) return null;
  const [, k, sign, e, charges, count] = m, kind = kindOf(k);
  if (isGear(k)) {
    if (charges !== undefined || count !== undefined) return null;
    const value = sign ? (sign === '+' ? 1 : -1) * Number(e) : 0;
    return Math.abs(value) <= ENCHANT_MAX ? makeItem(k, { e: value }) : null;
  }
  if (sign !== undefined) return null;
  if (kind === 'wand') return charges !== undefined && count === undefined && Number(charges) <= CHARGE_MAX ? makeItem(k, { c: Number(charges) }) : null;
  if (hasCount(k)) {
    const max = kind === 'gold' ? GOLD_CAP : DART_MAX, n = Number(count);
    return count !== undefined && charges === undefined && n >= 1 && n <= max ? makeItem(k, { c: n }) : null;
  }
  return charges === undefined && count === undefined ? makeItem(k) : null;
}

export function isKnown(known: readonly string[], k: string): boolean {
  return !UNIDENTIFIED.includes(kindOf(k)) || known.includes(k);
}

interface Look { readonly text: Text; readonly hex: string }
function look(k: string, seed: number): Look | null {
  const kind = kindOf(k);
  if (kind === 'potion') {
    const [ja, en, hex] = rngFrom(mix(seed, 101)).shuffle(COLORS)[POTION_KINDS.indexOf(k)];
    return { text: [`${ja}の びん`, `${en} Bottle`], hex };
  }
  if (kind === 'scroll') {
    const syl = rngFrom(mix(seed, 202)).shuffle(SYLLABLES), i = SCROLL_KINDS.indexOf(k) * 2;
    const en = syl[i][1] + syl[i + 1][1].toLowerCase();
    return { text: [`「${syl[i][0]}${syl[i + 1][0]}」の巻物`, `${en[0]}${en.slice(1).toLowerCase()} Scroll`], hex: '#e8dcb8' };
  }
  if (kind === 'wand') {
    const [ja, en, hex] = rngFrom(mix(seed, 303)).shuffle(WOODS)[WAND_KINDS.indexOf(k)];
    return { text: [`${ja}のつえ`, `${en} Wand`], hex };
  }
  return null;
}

/** The unidentified look of a potion, scroll or wand for this run seed; null for everything else. */
export function appearance(k: string, seed: number): Text | null { return look(k, seed)?.text ?? null; }
/** Tint for drawing: the look's color, stable within a run. */
export function lookColor(k: string, seed: number): string | null { return look(k, seed)?.hex ?? null; }

export function itemName(it: Item, known: readonly string[], seed: number): Text {
  if (!isKnown(known, it.k)) return appearance(it.k, seed)!;
  const [ja, en] = ITEMS[it.k].name, kind = kindOf(it.k);
  const suffix = isGear(it.k) && it.e !== 0 ? ` ${it.e > 0 ? '+' : ''}${it.e}` : kind === 'wand' ? ` (${it.c})` : kind === 'dart' ? ` ×${it.c}` : '';
  if (kind === 'gold') return [`${it.c} ゴールド`, `${it.c} Gold`];
  return [ja + suffix, en + suffix];
}

export function sellPrice(it: Item): number {
  const d = ITEMS[it.k];
  if (isGear(it.k)) return Math.max(1, d.price + it.e * Math.ceil(d.price / 4));
  if (d.kind === 'wand') return d.price + it.c * 10;
  if (hasCount(it.k)) return d.price * it.c;
  return d.price;
}

const LOOSE = Object.keys(ITEMS).filter(k => ITEMS[k].weight > 0);
/** A random floor item for this depth, drawn by weight. */
export function rollItem(r: Rng, floor: number): Item {
  const pool = LOOSE.filter(k => ITEMS[k].minFloor <= floor);
  let roll = r.int(pool.reduce((n, k) => n + ITEMS[k].weight, 0));
  const k = pool.find(id => (roll -= ITEMS[id].weight) < 0) ?? pool[0];
  const kind = kindOf(k);
  if (isGear(k)) return makeItem(k, { e: r.chance(0.3) ? r.pick([-1, 1, 1, 2]) : 0 });
  if (kind === 'wand') return makeItem(k, { c: r.range(2, 5) });
  if (kind === 'dart') return makeItem(k, { c: r.range(3, 8) });
  return makeItem(k);
}
