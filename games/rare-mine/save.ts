/**
 * Compact saves for client.saveLocal, one per NFT (the token is stored and must match).
 * v2 holds the practice mine (optional), the real-mode pot ledger (optional, bigint amounts as decimal strings) and
 * the sound setting. v1 saves (practice only) still load. A rolling bet is saved already settled, so reloading can
 * never undo a burn. Loading validates every field and the ledger identities, and never trusts storage.
 */
import { COIN_CAP, GEM_MIN, MAX_STREAK, ROCK_BONUS, ROCK_HP, VEIN_MIN } from './economy.ts';
import { EMPTY_STATS, isToken, newGame, rested, settle, type MineState, type Stats } from './game.ts';
import { balancedReal, type RealLedger } from './real.ts';

export const SAVE_LIMIT = 4 * 1024;
const U32 = 0xffffffff;
const STAT_KEYS = ['mined', 'withdrawn', 'burned', 'staked', 'winnings', 'betsWon', 'betsLost', 'bestStreak', 'strikes', 'veins', 'gems', 'rocks'] as const;
/** Real amounts: non-negative decimal integers of at most 60 digits (far beyond any RF supply × 2^20). */
const AMOUNT = /^(0|[1-9][0-9]{0,59})$/;
const AMOUNT_KEYS = { b: 'baseline', k: 'bonus', z: 'realized', w: 'withdrawn', x: 'burned', st: 'staked', wn: 'winnings' } as const;

export interface SaveData {
  readonly practice: MineState | null;
  readonly real: RealLedger | null;
  readonly sound: boolean;
}

function practiceFields(state: MineState) {
  const s = settle(state);
  return { g: [s.mineSeed, s.betSeed], p: [s.pot, s.streak, s.safe, s.depth, s.rockHp], s: STAT_KEYS.map(k => s.stats[k]) };
}
function realFields(l: RealLedger) {
  const amounts = Object.fromEntries(Object.entries(AMOUNT_KEYS).map(([k, f]) => [k, l[f].toString()]));
  return { ...amounts, n: [l.streak, l.betsWon, l.betsLost, l.bestStreak, l.claims], q: l.betSeed };
}

export function serializeSave(token: string, data: SaveData): string {
  return JSON.stringify({
    v: 2, t: token, a: data.sound ? 1 : 0, m: data.practice ? 1 : 0,
    ...(data.practice ? practiceFields(data.practice) : {}), r: data.real ? realFields(data.real) : null,
  });
}
/** A practice-only save (the practice mine keeps its own sound setting). */
export function serialize(state: MineState): string {
  return serializeSave(state.token, { practice: state, real: null, sound: state.sound });
}

function fail(what: string): never { throw new Error(`Invalid save: ${what}`); }
const int = (v: unknown, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;
function ints(v: unknown, what: string, maxes: readonly number[]): number[] {
  if (!Array.isArray(v) || v.length !== maxes.length || !v.every((n, i) => int(n, maxes[i]))) fail(what);
  return v as number[];
}

function readStats(v: unknown): Stats {
  const n = ints(v, 'stats', STAT_KEYS.map(k => k === 'bestStreak' ? MAX_STREAK : COIN_CAP));
  const t = Object.fromEntries(STAT_KEYS.map((k, i) => [k, n[i]])) as unknown as Stats;
  if (t.staked !== t.winnings + t.burned) fail('stakes');
  if (t.bestStreak > t.betsWon || (t.winnings > 0) !== (t.betsWon > 0) || (t.burned > 0 && t.betsLost === 0)) fail('bets');
  if (t.veins + t.gems > t.strikes || t.rocks !== Math.floor(t.strikes / ROCK_HP)) fail('strikes');
  if (t.mined < t.strikes + t.veins * VEIN_MIN + t.gems * GEM_MIN + t.rocks * ROCK_BONUS) fail('mined');
  return { ...EMPTY_STATS, ...t };
}

function readPractice(o: Record<string, unknown>, token: string, sound: boolean): MineState {
  const [mineSeed, betSeed] = ints(o.g, 'seeds', [U32, U32]);
  const [pot, streak, safe, depth, rockHp] = ints(o.p, 'pot', [COIN_CAP, MAX_STREAK, COIN_CAP, COIN_CAP, ROCK_HP]);
  const stats = readStats(o.s);
  if (safe !== stats.withdrawn || stats.mined + stats.winnings !== stats.withdrawn + stats.burned + pot) fail('ledger');
  if (streak > stats.bestStreak || (streak > 0 && pot === 0)) fail('streak');
  if (rockHp < 1 || rockHp !== ROCK_HP - (stats.strikes % ROCK_HP) || depth !== stats.rocks) fail('rock');
  const base = newGame(token, 0, sound);
  return rested({ ...base, mineSeed, betSeed, pot, streak, safe, depth, rockHp, stats });
}

function readReal(v: unknown): RealLedger | null {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('real');
  const r = v as Record<string, unknown>;
  const amount = (k: keyof typeof AMOUNT_KEYS): bigint => { const x = r[k]; if (typeof x !== 'string' || !AMOUNT.test(x)) fail(`real ${k}`); return BigInt(x); };
  const [streak, betsWon, betsLost, bestStreak, claims] = ints(r.n, 'real counts', [MAX_STREAK, COIN_CAP, COIN_CAP, MAX_STREAK, COIN_CAP]);
  if (!int(r.q, U32)) fail('real seed');
  const l: RealLedger = {
    baseline: amount('b'), bonus: amount('k'), realized: amount('z'), withdrawn: amount('w'), burned: amount('x'), staked: amount('st'),
    winnings: amount('wn'), streak, betsWon, betsLost, bestStreak, claims, betSeed: r.q,
  };
  if (!balancedReal(l)) fail('real ledger');
  if (streak > bestStreak || bestStreak > betsWon || (l.winnings > 0n) !== (betsWon > 0) || (l.burned > 0n && betsLost === 0)) fail('real bets');
  if ((streak > 0) !== (l.bonus > 0n)) fail('real streak');
  return l;
}

/** Returns null when nothing is stored; throws when the stored value is malformed, tampered or belongs to another NFT. */
export function loadSave(raw: string | null, token: string): SaveData | null {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > SAVE_LIMIT) fail('size');
  if (!isToken(token)) fail('token');
  const v: unknown = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('shape');
  const o = v as Record<string, unknown>;
  if (o.v !== 1 && o.v !== 2) fail('version');
  if (o.t !== token) fail('token');
  if (o.a !== 0 && o.a !== 1) fail('sound');
  const sound = o.a === 1;
  if (o.v === 1) return { practice: readPractice(o, token, sound), real: null, sound };
  if (o.m !== 0 && o.m !== 1) fail('practice flag');
  if (!Object.hasOwn(o, 'r')) fail('real');
  return { practice: o.m === 1 ? readPractice(o, token, sound) : null, real: readReal(o.r), sound };
}

/** The practice mine in a save, if any. */
export function loadGame(raw: string | null, token: string): MineState | null {
  return loadSave(raw, token)?.practice ?? null;
}
