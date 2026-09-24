/** Compact save format for client.saveLocal (32 KB limit). Loading validates every field and never trusts storage. */
import { MOVES, SPECIES } from './data.ts';
import { expForLevel, healMon, isFainted, isToken, MAX_LEVEL, MAX_MOVES, PARTNER, statsOf, type Mon } from './mon.ts';
import { PARTY_MAX } from './battle.ts';
import { COIN_CAP, ITEM_CAP, type GameState } from './game.ts';
import { MAPS, isBlocked, type Dir } from './world.ts';

export const SAVE_LIMIT = 32 * 1024;
const FACES: Readonly<Record<string, Dir>> = { u: 'up', d: 'down', l: 'left', r: 'right' };
const FACE_KEY: Readonly<Record<Dir, string>> = { up: 'u', down: 'd', left: 'l', right: 'r' };
type SavedMon = [string, number, number, number, [string, number][]];

export function serialize(s: GameState): string {
  return JSON.stringify({
    v: 1, t: s.token, m: s.map, x: s.x, y: s.y, f: FACE_KEY[s.face],
    p: s.party.map((m): SavedMon => [m.species, m.level, m.exp, m.hp, m.moves.map(x => [x.id, x.pp])]),
    i: [s.items.ribbon, s.items.herb], c: s.coins, g: [s.flags.lab, s.flags.badge, s.flags.rest].map(Number),
    s: s.seen, k: s.caught, n: s.steps,
  });
}

const int = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
function fail(what: string): never { throw new Error(`Invalid save: ${what}`); }

function parseMon(raw: unknown, token: string): Mon {
  if (!Array.isArray(raw) || raw.length !== 5) fail('party entry');
  const [species, level, exp, hp, moves] = raw as unknown[];
  if (typeof species !== 'string' || (species !== PARTNER && !Object.hasOwn(SPECIES, species))) fail('species');
  if (!int(level, 1, MAX_LEVEL)) fail('level');
  const top = level === MAX_LEVEL ? expForLevel(MAX_LEVEL) : expForLevel(level + 1) - 1;
  if (!int(exp, expForLevel(level), top)) fail('exp');
  const base = { species, level, ...(species === PARTNER ? { token } : {}) };
  if (!int(hp, 0, statsOf(base).hp)) fail('hp');
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > MAX_MOVES) fail('moves');
  const parsed = moves.map(m => {
    if (!Array.isArray(m) || m.length !== 2 || typeof m[0] !== 'string' || !Object.hasOwn(MOVES, m[0]) || !int(m[1], 0, MOVES[m[0]].pp)) fail('move');
    return { id: m[0] as string, pp: m[1] as number };
  });
  if (new Set(parsed.map(m => m.id)).size !== parsed.length) fail('duplicate move');
  return { ...base, exp, hp, moves: parsed };
}
function speciesList(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > Object.keys(SPECIES).length) fail('notes');
  if (!raw.every(id => typeof id === 'string' && Object.hasOwn(SPECIES, id)) || new Set(raw).size !== raw.length) fail('notes');
  return raw as string[];
}

/** Returns null when nothing is stored; throws when the stored value is malformed or belongs to another token. */
export function loadGame(raw: string | null, token: string, seed: number): GameState | null {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > SAVE_LIMIT) fail('size');
  if (!isToken(token)) fail('token');
  const v: unknown = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('shape');
  const o = v as Record<string, unknown>;
  if (o.v !== 1) fail('version');
  if (o.t !== token) fail('token');
  if (typeof o.m !== 'string' || !Object.hasOwn(MAPS, o.m)) fail('map');
  if (!int(o.x, 0, 99) || !int(o.y, 0, 99) || isBlocked(o.m, o.x, o.y)) fail('position');
  if (typeof o.f !== 'string' || !Object.hasOwn(FACES, o.f)) fail('facing');
  if (!Array.isArray(o.p) || o.p.length < 1 || o.p.length > PARTY_MAX) fail('party size');
  let party = o.p.map(m => parseMon(m, token));
  if (party.filter(m => m.species === PARTNER).length !== 1) fail('partner');
  if (party.every(isFainted)) party = party.map(healMon);
  if (!Array.isArray(o.i) || o.i.length !== 2 || !o.i.every(n => int(n, 0, ITEM_CAP))) fail('items');
  if (!int(o.c, 0, COIN_CAP)) fail('acorns');
  if (!Array.isArray(o.g) || o.g.length !== 3 || !o.g.every(n => n === 0 || n === 1)) fail('flags');
  const seen = speciesList(o.s), caught = speciesList(o.k);
  if (!caught.every(id => seen.includes(id))) fail('notes');
  if (!int(o.n, 0, 1e9)) fail('steps');
  const [ribbon, herb] = o.i as number[], [lab, badge, rest] = (o.g as number[]).map(Boolean);
  return {
    token, seed: seed >>> 0, map: o.m, x: o.x, y: o.y, face: FACES[o.f], walk: null,
    party, items: { ribbon, herb }, coins: o.c, flags: { lab, badge, rest }, seen, caught, steps: o.n,
    scene: { k: 'world' }, saving: false, saveTick: 0, saveError: false, sfx: { n: 0, id: 'confirm' }, last: null, bump: 0, clock: 0,
  };
}
