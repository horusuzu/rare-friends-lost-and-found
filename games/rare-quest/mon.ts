/** Monsters, stats and levelling. Pure and immutable. */
import { SPECIES, MOVES, TYPES, WEAK_MOVE, STRONG_MOVE, type SpeciesDef, type Text } from './data.ts';
import { hashString } from './rng.ts';

export const MAX_LEVEL = 50;
export const MAX_MOVES = 4;
export const PARTNER = 'friend';
export interface MoveSlot { readonly id: string; readonly pp: number }
export interface Mon {
  readonly species: string; readonly level: number; readonly exp: number; readonly hp: number;
  readonly moves: readonly MoveSlot[];
  /** Only the partner: `generations:<id>` or `genesis:<id>`. */
  readonly token?: string;
}
export interface Stats { readonly hp: number; readonly atk: number; readonly def: number; readonly spd: number }

const TOKEN = /^(generations|genesis):([1-9][0-9]{0,77})$/;
export function isToken(token: unknown): token is string { return typeof token === 'string' && TOKEN.test(token); }

const partnerCache = new Map<string, SpeciesDef>();
/** The player's Friend: type, base stats and moves derived deterministically from its collection and token id. */
export function partnerSpecies(token: string): SpeciesDef {
  const match = TOKEN.exec(token);
  if (!match) throw new Error('Invalid partner token');
  const cached = partnerCache.get(token);
  if (cached) return cached;
  const h = hashString(token), h2 = hashString(`${token}:stats`);
  const type = TYPES[h % TYPES.length];
  const weights = [0, 8, 16, 24].map(shift => 1 + ((h2 >>> shift) & 0xff));
  const sum = weights.reduce((a, b) => a + b, 0);
  const [hp, atk, def, spd] = weights.map(w => 50 + Math.floor((60 * w) / sum));
  const label = `${match[1] === 'genesis' ? 'Genesis' : 'Friend'} #${match[2]}`;
  const learnset: (readonly [number, string])[] = [[1, 'dot-tackle'], [1, WEAK_MOVE[type]], [8, type === 'pixel' ? 'pixel-rush' : 'hop-kick'],
    [13, STRONG_MOVE[type]], [20, type === 'pixel' ? 'boulder-press' : 'pixel-rush']];
  const def_: SpeciesDef = Object.freeze({
    id: PARTNER, name: [label, label] as const, type, base: Object.freeze({ hp, atk, def, spd }), catchRate: 0.01, expYield: 60,
    learnset: Object.freeze(learnset), art: Object.freeze(Array.from({ length: 16 }, () => '.'.repeat(16))),
    note: ['きみの あいぼう。オンチェーンの すがた。', 'Your partner, drawn from its on-chain sprite.'] as const,
  });
  partnerCache.set(token, def_);
  return def_;
}

export function speciesOf(mon: Pick<Mon, 'species' | 'token'>): SpeciesDef {
  if (mon.species === PARTNER) return partnerSpecies(mon.token ?? '');
  const s = Object.hasOwn(SPECIES, mon.species) ? SPECIES[mon.species] : undefined;
  if (!s) throw new Error(`Unknown species ${mon.species}`);
  return s;
}
export function monName(mon: Mon, lang: 'ja' | 'en'): string { return speciesOf(mon).name[lang === 'ja' ? 0 : 1]; }
export function monText(mon: Mon): Text { return speciesOf(mon).name; }

export function statsOf(mon: Pick<Mon, 'species' | 'token' | 'level'>): Stats {
  const { base } = speciesOf(mon), l = mon.level;
  const stat = (b: number) => Math.floor((b * l) / 20) + 5;
  return { hp: Math.floor((base.hp * l) / 25) + l + 12, atk: stat(base.atk), def: stat(base.def), spd: stat(base.spd) };
}
export function expForLevel(level: number): number { return level <= 1 ? 0 : Math.floor(level ** 3 / 2); }
export function isFainted(mon: Mon): boolean { return mon.hp <= 0; }

function learnedBy(s: SpeciesDef, level: number): string[] {
  const ids: string[] = [];
  for (const [lv, id] of s.learnset) if (lv <= level && !ids.includes(id)) ids.push(id);
  return ids.slice(-MAX_MOVES);
}
export function createMon(species: string, level: number, token?: string): Mon {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) throw new RangeError('Invalid level');
  const base = { species, level, token: species === PARTNER ? token : undefined };
  const s = speciesOf(base);
  const mon: Mon = {
    species, level, exp: expForLevel(level), hp: 0,
    moves: learnedBy(s, level).map(id => ({ id, pp: MOVES[id].pp })),
    ...(species === PARTNER ? { token } : {}),
  };
  return { ...mon, hp: statsOf(mon).hp };
}

export interface ExpGain { readonly mon: Mon; readonly levels: readonly number[]; readonly learned: readonly string[] }
/** Adds experience; each level recomputes stats and raises current hp by the max-hp gain (fainted stays at 0). */
export function gainExp(mon: Mon, amount: number): ExpGain {
  const s = speciesOf(mon);
  const cap = expForLevel(MAX_LEVEL);
  let current: Mon = { ...mon, exp: Math.min(cap, mon.exp + Math.max(0, Math.floor(amount))) };
  const levels: number[] = [], learned: string[] = [];
  while (current.level < MAX_LEVEL && current.exp >= expForLevel(current.level + 1)) {
    const before = statsOf(current).hp;
    const level = current.level + 1;
    const grown: Mon = { ...current, level };
    const hp = current.hp > 0 ? current.hp + statsOf(grown).hp - before : 0;
    let moves = [...current.moves];
    for (const [lv, id] of s.learnset) {
      if (lv !== level || moves.some(m => m.id === id)) continue;
      const slot = { id, pp: MOVES[id].pp };
      moves = moves.length < MAX_MOVES ? [...moves, slot] : [...moves.slice(1), slot];
      learned.push(id);
    }
    current = { ...grown, hp, moves };
    levels.push(level);
  }
  return { mon: current, levels, learned };
}
export function healMon(mon: Mon): Mon {
  return { ...mon, hp: statsOf(mon).hp, moves: mon.moves.map(m => ({ ...m, pp: MOVES[m.id].pp })) };
}
