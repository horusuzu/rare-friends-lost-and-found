/** Original overworld maps, collision, warps and wild encounters. Pure data and functions. */
import type { Text } from './data.ts';
import { createMon, type Mon } from './mon.ts';
import { rand } from './rng.ts';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type NpcLook = 'elder' | 'kid' | 'doctor' | 'keeper' | 'clerk' | 'hiker' | 'stroller' | 'girl' | 'leader';
export interface Npc { readonly kind: 'npc'; readonly id: string; readonly x: number; readonly y: number; readonly look: NpcLook }
export interface Sign { readonly kind: 'sign'; readonly id: string; readonly x: number; readonly y: number; readonly lines: readonly Text[] }
export interface Warp { readonly x: number; readonly y: number; readonly to: string; readonly tx: number; readonly ty: number }
export interface Encounter { readonly species: string; readonly min: number; readonly max: number; readonly weight: number }
export interface MapDef {
  readonly id: string; readonly name: Text; readonly outdoor: boolean; readonly rows: readonly string[];
  readonly warps: readonly Warp[]; readonly npcs: readonly Npc[]; readonly signs: readonly Sign[];
  readonly encounters?: readonly Encounter[];
}

/**
 * Tiles: `.` ground, `,` path, `"` tall grass, `f` flowers, `D` door, `=` floor, `M` exit mat (walkable);
 * `T` tree, `~` water, `F` fence, `R` roof, `W`/`w` wall/window, `S` sign, `#` wall, `C` counter,
 * `K` shelf, `t` table, `P` plant, `O` statue, `B` bed (solid).
 */
export const TILE_CHARS = '.,"fD=MT~FRWwS#CKtPOB';
const WALKABLE = '.,"fD=M';
export const ENCOUNTER_RATE = 0.12;

const npc = (id: string, x: number, y: number, look: NpcLook): Npc => ({ kind: 'npc', id, x, y, look });
const sign = (id: string, x: number, y: number, ...lines: Text[]): Sign => ({ kind: 'sign', id, x, y, lines });
const warp = (x: number, y: number, to: string, tx: number, ty: number): Warp => ({ x, y, to, tx, ty });

const MAP_LIST: readonly MapDef[] = [
  {
    id: 'moegi', name: ['モエギ村', 'Moegi Village'], outdoor: true,
    rows: [
      'TTTTTTTTT,,TTTTTTTTT', 'T....f...,,...f....T', 'T.RRRRR..,,..RRRRRRT', 'T.RRRRR..,,..RRRRRRT', 'T.WwDwW..,,..WwWDWwT',
      'T...,....,,.....,..T', 'T...,,,,,,,,,,,,,..T', 'T.f......,,.......fT', 'T...S....,,...F.F..T', 'T........,,...FfF..T',
      'T..TT....,,........T', 'T..TT....,,.S......T', 'T........,,........T', 'T~~~~....,,....~~~~T', 'T~~~~~~......~~~~~~T',
      'TTTTTTTTTTTTTTTTTTTT'],
    warps: [warp(9, 0, 'wakaba', 9, 24), warp(10, 0, 'wakaba', 10, 24), warp(4, 4, 'home', 3, 5), warp(16, 4, 'lab', 4, 6)],
    npcs: [npc('kid', 6, 12, 'kid')],
    signs: [
      sign('moegi-sign', 4, 8, ['モエギ村 ── わかばの かおる ちいさな 村', 'MOEGI VILLAGE: a small village that smells of new leaves']),
      sign('lab-sign', 12, 11, ['きた: わかば小道 → ヒスイ町', 'NORTH: Sprout Trail → Jade Town'], ['みぎの 大きな たてものは ねむの木研究所。', 'The big building on the right is the Nemunoki Lab.']),
    ],
  },
  {
    id: 'wakaba', name: ['わかば小道', 'Sprout Trail'], outdoor: true,
    rows: [
      'TTTTTTTTT,,TTTTTTTTT', 'T........,,........T', 'T.""""...,,..."""".T', 'T.""""...,,..."""".T', 'T.""""...,,..."""".T',
      'T........,,........T', 'TTTTTT...,,...TTTTTT', 'T~~~~T...,,..S.....T', 'T~~~~T...,,........T', 'T~~~~T..""""""..TT.T',
      'T....T..""""""..TT.T', 'T......."""""".....T', 'T.......,,,,,......T', 'TTTT....,,..TTTTTTTT', 'T"""....,,.........T',
      'T"""....,,..F......T', 'T"""..S.,,..F..f...T', 'T.......,,..FFFF...T', 'T..TT...,,.........T', 'T..TT...,,,,,,,....T',
      'T.............,....T', 'T..""""""""...,....T', 'T..""""""""...,....T', 'T..""""""""...,....T', 'T........,,,,,,....T',
      'TTTTTTTTT,,TTTTTTTTT'],
    warps: [warp(9, 25, 'moegi', 9, 1), warp(10, 25, 'moegi', 10, 1), warp(9, 0, 'hisui', 9, 14), warp(10, 0, 'hisui', 10, 14)],
    npcs: [npc('hiker', 11, 3, 'hiker'), npc('stroller', 16, 20, 'stroller')],
    signs: [
      sign('north-sign', 13, 7, ['きた: ヒスイ町  みなみ: モエギ村', 'NORTH: Jade Town   SOUTH: Moegi Village']),
      sign('trail-sign', 6, 16, ['わかば小道 ── たかい くさむらでは モンスターが とびだすよ！', 'SPROUT TRAIL: monsters hop out of the tall grass!']),
    ],
    encounters: [
      { species: 'mossball', min: 2, max: 4, weight: 26 }, { species: 'capmochi', min: 3, max: 5, weight: 12 },
      { species: 'yamyam', min: 2, max: 4, weight: 12 }, { species: 'lanternbo', min: 4, max: 6, weight: 6 },
      { species: 'brinebub', min: 3, max: 5, weight: 12 }, { species: 'polkadrop', min: 3, max: 4, weight: 8 },
      { species: 'vanebird', min: 3, max: 5, weight: 10 }, { species: 'glitchmoth', min: 5, max: 6, weight: 3 },
      { species: 'pillowstone', min: 4, max: 6, weight: 6 }, { species: 'dotton', min: 3, max: 5, weight: 8 },
    ],
  },
  {
    id: 'hisui', name: ['ヒスイ町', 'Jade Town'], outdoor: true,
    rows: [
      'TTTTTTTTTTTTTTTTTTTT', 'T..f.........f.....T', 'T.RRRRRR..RRRRRRRR.T', 'T.RRRRRR..RRRRRRRR.T', 'T.WwWDwW..RRRRRRRR.T',
      'T....,....WwWWDWWw.T', 'T....,.....S..,....T', 'T....,,,,,,,,,,....T', 'T.S......,,........T', 'T.f......,,....f...T',
      'T..TT....,,..TT....T', 'T..TT....,,..TT....T', 'T........,,........T', 'T.....f..,,..f.....T', 'T........,,........T',
      'TTTTTTTTT,,TTTTTTTTT'],
    warps: [warp(9, 15, 'wakaba', 9, 1), warp(10, 15, 'wakaba', 10, 1), warp(5, 4, 'rest', 4, 6), warp(14, 5, 'dojo', 4, 9)],
    npcs: [npc('girl', 16, 12, 'girl')],
    signs: [
      sign('dojo-sign', 11, 6, ['ヒスイ道場 ── 師範コハクに いどむ ものは どうぞ', 'JADE DOJO: challengers for Master Kohaku, come in']),
      sign('hisui-sign', 2, 8, ['ヒスイ町 ── みどりいしの まち', 'JADE TOWN: the town of green stones'], ['ひだりの いえは やすらぎの家。つかれたら よってね。', 'The house on the left is the Rest House. Drop in when tired.']),
    ],
  },
  {
    id: 'home', name: ['じぶんの いえ', 'Home'], outdoor: false,
    rows: ['########', '#KK==BB#', '#======#', '#==tt==#', '#==tt==#', '#======#', '###MM###'],
    warps: [warp(3, 6, 'moegi', 4, 5), warp(4, 6, 'moegi', 4, 5)],
    npcs: [npc('grandma', 5, 2, 'elder')], signs: [],
  },
  {
    id: 'lab', name: ['ねむの木研究所', 'Nemunoki Lab'], outdoor: false,
    rows: ['##########', '#KKKK=KKK#', '#========#', '#=tt==t=P#', '#========#', '#P======P#', '#========#', '####MM####'],
    warps: [warp(4, 7, 'moegi', 16, 5), warp(5, 7, 'moegi', 16, 5)],
    npcs: [npc('doctor', 5, 2, 'doctor')], signs: [],
  },
  {
    id: 'rest', name: ['やすらぎの家', 'Rest House'], outdoor: false,
    rows: ['##########', '#P======P#', '#=CCC=CCC#', '#========#', '#========#', '#=tt==tt=#', '#========#', '####MM####'],
    warps: [warp(4, 7, 'hisui', 5, 5), warp(5, 7, 'hisui', 5, 5)],
    npcs: [npc('keeper', 3, 1, 'keeper'), npc('clerk', 7, 1, 'clerk')], signs: [],
  },
  {
    id: 'dojo', name: ['ヒスイ道場', 'Jade Dojo'], outdoor: false,
    rows: ['##########', '#P======P#', '#========#', '#========#', '#=O====O=#', '#========#', '#=O====O=#', '#========#', '#========#', '#========#', '####MM####'],
    warps: [warp(4, 10, 'hisui', 14, 6), warp(5, 10, 'hisui', 14, 6)],
    npcs: [npc('leader', 4, 2, 'leader')], signs: [],
  },
];
export const MAPS: Readonly<Record<string, MapDef>> = Object.freeze(Object.fromEntries(MAP_LIST.map(m => [m.id, m])));
export const START = Object.freeze({ map: 'moegi', x: 9, y: 9, face: 'up' as Dir });
export const HOME_RESPAWN = Object.freeze({ map: 'home', x: 4, y: 2, face: 'right' as Dir });
export const REST_RESPAWN = Object.freeze({ map: 'rest', x: 3, y: 3, face: 'up' as Dir });

function mapOf(id: string): MapDef {
  const map = Object.hasOwn(MAPS, id) ? MAPS[id] : undefined;
  if (!map) throw new Error(`Unknown map ${id}`);
  return map;
}
export function tileAt(mapId: string, x: number, y: number): string | null {
  const map = mapOf(mapId);
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= map.rows.length || x < 0 || x >= map.rows[0].length) return null;
  return map.rows[y][x];
}
export function isWalkableTile(tile: string | null): boolean { return tile !== null && WALKABLE.includes(tile); }
export function npcAt(mapId: string, x: number, y: number): Npc | null { return mapOf(mapId).npcs.find(n => n.x === x && n.y === y) ?? null; }
export function signAt(mapId: string, x: number, y: number): Sign | null { return mapOf(mapId).signs.find(s => s.x === x && s.y === y) ?? null; }
export function isBlocked(mapId: string, x: number, y: number): boolean { return !isWalkableTile(tileAt(mapId, x, y)) || npcAt(mapId, x, y) !== null; }
export function warpAt(mapId: string, x: number, y: number): Warp | null { return mapOf(mapId).warps.find(w => w.x === x && w.y === y) ?? null; }
export function isGrass(mapId: string, x: number, y: number): boolean { return tileAt(mapId, x, y) === '"'; }
export function stepFrom(x: number, y: number, dir: Dir): { x: number; y: number } {
  return { x: x + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0), y: y + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0) };
}
/** What the player faces: an NPC, a sign, or an NPC standing behind a counter. */
export function facingTarget(mapId: string, x: number, y: number, dir: Dir): Npc | Sign | null {
  const p = stepFrom(x, y, dir);
  const direct = npcAt(mapId, p.x, p.y) ?? signAt(mapId, p.x, p.y);
  if (direct) return direct;
  if (tileAt(mapId, p.x, p.y) !== 'C') return null;
  const q = stepFrom(p.x, p.y, dir);
  return npcAt(mapId, q.x, q.y);
}

/** One tall-grass step: maybe a wild monster, chosen by weight, with a level in its range. */
export function rollEncounter(mapId: string, seed: number): { mon: Mon | null; seed: number } {
  const table = mapOf(mapId).encounters;
  if (!table?.length) return { mon: null, seed };
  const [chance, s1] = rand(seed);
  if (chance >= ENCOUNTER_RATE) return { mon: null, seed: s1 };
  const [pick, s2] = rand(s1), [lv, s3] = rand(s2);
  const total = table.reduce((n, e) => n + e.weight, 0);
  let at = pick * total, entry = table[table.length - 1];
  for (const e of table) { if (at < e.weight) { entry = e; break; } at -= e.weight; }
  return { mon: createMon(entry.species, entry.min + Math.floor(lv * (entry.max - entry.min + 1))), seed: s3 };
}
