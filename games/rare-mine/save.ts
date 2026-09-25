/**
 * Compact saves for client.saveLocal, one per NFT (the token is stored and must match).
 * A rolling bet is saved already settled, so reloading can never undo a burn. Loading validates every
 * field and the ledger identities, and never trusts storage.
 */
import { COIN_CAP, GEM_MIN, MAX_STREAK, ROCK_BONUS, ROCK_HP, VEIN_MIN } from './economy.ts';
import { EMPTY_STATS, isToken, newGame, rested, settle, type MineState, type Stats } from './game.ts';

export const SAVE_LIMIT = 4 * 1024;
const U32 = 0xffffffff;
const STAT_KEYS = ['mined', 'withdrawn', 'burned', 'staked', 'winnings', 'betsWon', 'betsLost', 'bestStreak', 'strikes', 'veins', 'gems', 'rocks'] as const;

export function serialize(state: MineState): string {
  const s = settle(state);
  return JSON.stringify({
    v: 1, t: s.token, g: [s.mineSeed, s.betSeed], p: [s.pot, s.streak, s.safe, s.depth, s.rockHp],
    s: STAT_KEYS.map(k => s.stats[k]), a: s.sound ? 1 : 0,
  });
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

/** Returns null when nothing is stored; throws when the stored value is malformed, tampered or belongs to another NFT. */
export function loadGame(raw: string | null, token: string): MineState | null {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > SAVE_LIMIT) fail('size');
  if (!isToken(token)) fail('token');
  const v: unknown = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('shape');
  const o = v as Record<string, unknown>;
  if (o.v !== 1) fail('version');
  if (o.t !== token) fail('token');
  const [mineSeed, betSeed] = ints(o.g, 'seeds', [U32, U32]);
  const [pot, streak, safe, depth, rockHp] = ints(o.p, 'pot', [COIN_CAP, MAX_STREAK, COIN_CAP, COIN_CAP, ROCK_HP]);
  if (o.a !== 0 && o.a !== 1) fail('sound');
  const stats = readStats(o.s);
  if (safe !== stats.withdrawn || stats.mined + stats.winnings !== stats.withdrawn + stats.burned + pot) fail('ledger');
  if (streak > stats.bestStreak || (streak > 0 && pot === 0)) fail('streak');
  if (rockHp < 1 || rockHp !== ROCK_HP - (stats.strikes % ROCK_HP) || depth !== stats.rocks) fail('rock');
  const base = newGame(token, 0, o.a === 1);
  return rested({ ...base, mineSeed, betSeed, pot, streak, safe, depth, rockHp, stats });
}
