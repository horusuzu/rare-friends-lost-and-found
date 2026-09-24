/**
 * Rare Quest pixel art, drawn in code with a four-shade green palette. Every tile, NPC and monster
 * here is original; the player's Friend uses its canonical on-chain sprite from the SDK reader.
 */
import { SPECIES } from './data.ts';
import type { NpcLook } from './world.ts';

export const SCREEN_W = 160;
export const SCREEN_H = 144;
export const TILE = 16;
/** 0 lightest … 3 darkest. */
export const PALETTE = ['#e6f0c2', '#9fbf5f', '#3f6f45', '#132b20'] as const;
export type FriendRows = readonly string[];

type Grid = readonly string[];
const rep = (half: Grid): Grid => [...half, ...half].map(r => r + r);
const mirror = (half: Grid): Grid => half.map(h => h + [...h].reverse().join(''));

const GROUND = rep(['11111111', '11111111', '11211111', '11111111', '11111111', '11111211', '11111111', '11111111']);
const PATH = rep(['00000000', '00000100', '00000000', '01000000', '00000000', '00000010', '00100000', '00000000']);
const FLOOR = rep(['00000001', '00000001', '00000001', '11111111', '00010000', '00010000', '00010000', '11111111']);

/** Object tiles use '.' for transparency over their base (ground outdoors, floor indoors). */
const TILES: Readonly<Record<string, { base?: Grid; art: Grid }>> = {
  '.': { art: GROUND },
  ',': { art: PATH },
  '"': { art: rep(['11111111', '13111131', '23121231', '32232323', '23323232', '32223223', '11111111', '13111131']) },
  f: { art: rep(['11111111', '11011111', '10301111', '11011111', '11111101', '11111030', '11111101', '11111111']) },
  '~': { art: rep(['22222222', '21122222', '22211222', '22222222', '22222222', '22222112', '22221122', '22222222']) },
  T: {
    base: GROUND, art: [
      '.....333333.....', '...3322222233...', '..322112222223..', '.32211112222223.', '.32111122222123.', '3221112222212223',
      '3222222222122223', '3222222221122223', '3222212222222223', '.32211222222223.', '.33222222222233.', '..333322223333..',
      '.....3222223....', '......32223.....', '.....3322233....', '....33333333....'],
  },
  F: {
    base: GROUND, art: [
      '................', '................', '..333......333..', '..303......303..', '..303......303..', '3333333333333333',
      '0000000000000000', '3333333333333333', '..303......303..', '..303......303..', '3333333333333333', '0000000000000000',
      '3333333333333333', '..303......303..', '..333......333..', '................'],
  },
  S: {
    base: GROUND, art: [
      '................', '................', '.33333333333333.', '.30000000000003.', '.30311313311303.', '.30000000000003.',
      '.30313113131303.', '.30000000000003.', '.33333333333333.', '......3223......', '......3223......', '......3223......',
      '......3223......', '.....332233.....', '................', '................'],
  },
  R: { art: rep(['33333333', '22222222', '21212121', '22222222', '33333333', '22222222', '12121212', '22222222']) },
  W: { art: rep(['00000000', '11111111', '00000000', '00000000', '00010000', '11111111', '00000000', '00000001']) },
  w: {
    art: [
      '0000000000000000', '1111111111111111', '0033333333333300', '0031111331111300', '0031001331001300', '0031111331111300',
      '0033333333333300', '0031111331111300', '0031001331001300', '0031111331111300', '0033333333333300', '0000000000000000',
      '1111111111111111', '0000000000000000', '0000000000000000', '3333333333333333'],
  },
  D: {
    art: [
      '0000000000000000', '1111111111111111', '0033333333333300', '0032222222222300', '0032111111112300', '0032122222212300',
      '0032122222212300', '0032122222212300', '0032122222202300', '0032122222212300', '0032122222212300', '0032111111112300',
      '0032222222222300', '0032222222222300', '0032222222222300', '3333333333333333'],
  },
  '=': { art: FLOOR },
  M: { base: FLOOR, art: ['................', '................', '.33333333333333.', '.32121212121213.', '.31212121212123.', '.32121212121213.', '.31212121212123.', '.32121212121213.', '.31212121212123.', '.32121212121213.', '.31212121212123.', '.32121212121213.', '.31212121212123.', '.33333333333333.', '................', '................'] },
  '#': { art: rep(['33333333', '32223222', '33333333', '22322232', '33333333', '32223222', '33333333', '22322232']) },
  C: {
    art: [
      '3333333333333333', '0000000000000000', '0101010101010101', '1111111111111111', '3333333333333333', '2222222222222222',
      '2111111111111112', '2122222222222212', '2122222222222212', '2122222222222212', '2122222222222212', '2111111111111112',
      '2222222222222222', '2222222222222222', '3333333333333333', '3333333333333333'],
  },
  K: {
    art: [
      '3333333333333333', '3200220020022023', '3201120120112123', '3201120120112123', '3211121121112123', '3333333333333333',
      '3202002200202203', '3212012210212213', '3212012210212213', '3212112211212213', '3333333333333333', '3222222222222223',
      '3222222222222223', '3222222222222223', '3333333333333333', '3333333333333333'],
  },
  t: {
    base: FLOOR, art: [
      '................', '................', '3333333333333333', '3000000000000003', '3011111111111103', '3011111111111103',
      '3011111111111103', '3000000000000003', '3333333333333333', '.32..........23.', '.32..........23.', '.32..........23.',
      '.32..........23.', '.33..........33.', '................', '................'],
  },
  P: {
    base: FLOOR, art: [
      '......3..3......', '....33133133....', '...3112113113...', '..311213312113..', '..312113311213..', '...3113113113...',
      '..3112133112113.', '...3333333333...', '.....322223.....', '....33333333....', '....31111113....', '....32222223....',
      '....31111113....', '....32222223....', '.....333333.....', '................'],
  },
  O: {
    base: FLOOR, art: [
      '......3333......', '.....300003.....', '.....303303.....', '.....300003.....', '......3003......', '....33000033....',
      '...3000000003...', '...3030000303...', '...3030000303...', '....30000003....', '....30300303....', '....30300303....',
      '..333333333333..', '..300000000003..', '..333333333333..', '................'],
  },
  B: { base: FLOOR, art: mirror(['33333333', '30000000', '30111111', '30111111', '30000000', '32222222', '32121212', '32212121', '32121212', '32212121', '32121212', '32222222', '33333333', '.3......', '.3......', '........']) },
};

type Canvas = HTMLCanvasElement;
function paint(c: CanvasRenderingContext2D, grid: Grid, x: number, y: number, scale = 1, flip = false, shades: readonly string[] = PALETTE) {
  const w = grid[0].length;
  grid.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const p = row[i];
      if (p === '.' || p === undefined) continue;
      c.fillStyle = shades[Number(p)];
      c.fillRect(x + (flip ? w - 1 - i : i) * scale, y + j * scale, scale, scale);
    }
  });
}
function makeCanvas(w: number, h: number): Canvas { const el = document.createElement('canvas'); el.width = w; el.height = h; return el; }

let tileCache: Map<string, Canvas> | null = null;
function tileImage(ch: string, frame: number): Canvas {
  tileCache ??= new Map();
  const key = `${ch}:${ch === '~' ? frame : 0}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const def = TILES[ch] ?? TILES['.'];
  const el = makeCanvas(TILE, TILE), c = el.getContext('2d')!;
  if (def.base) paint(c, def.base, 0, 0);
  const art = ch === '~' && frame ? def.art.map(r => r.slice(3) + r.slice(0, 3)) : def.art;
  paint(c, art, 0, 0);
  tileCache.set(key, el);
  return el;
}

export interface WorldScene {
  readonly rows: readonly string[]; readonly outdoor: boolean;
  readonly npcs: readonly { readonly x: number; readonly y: number; readonly look: NpcLook }[];
  /** Player position in pixels (map coordinates). */
  readonly px: number; readonly py: number;
  readonly friend: FriendRows | null; readonly onGrass: boolean; readonly clock: number;
}

/** Top-down overworld with the camera centred on the player. */
export function drawWorld(c: CanvasRenderingContext2D, s: WorldScene): void {
  const camX = Math.round(s.px - 4 * TILE), camY = Math.round(s.py - 4 * TILE);
  const frame = Math.floor(s.clock * 2) % 2;
  const tx0 = Math.floor(camX / TILE), ty0 = Math.floor(camY / TILE);
  for (let ty = ty0; ty <= ty0 + 10; ty++) for (let tx = tx0; tx <= tx0 + 11; tx++) {
    const inside = ty >= 0 && ty < s.rows.length && tx >= 0 && tx < s.rows[0].length;
    const ch = inside ? s.rows[ty][tx] : s.outdoor ? 'T' : null;
    const dx = tx * TILE - camX, dy = ty * TILE - camY;
    if (ch === null) { c.fillStyle = PALETTE[3]; c.fillRect(dx, dy, TILE, TILE); continue; }
    c.drawImage(tileImage(ch, frame), dx, dy);
  }
  for (const n of s.npcs) paint(c, npcArt(n.look), n.x * TILE - camX, n.y * TILE - camY);
  const x = Math.round(s.px - camX), y = Math.round(s.py - camY);
  if (s.friend) drawFriend(c, s.friend, x, y, 1);
  if (s.onGrass) c.drawImage(tileImage('"', 0), 0, 10, TILE, 6, x, y + 10, TILE, 6);
}

/** A one-bit Friend sprite in the darkest shade with a light one-pixel halo. */
export function drawFriend(c: CanvasRenderingContext2D, rows: FriendRows, x: number, y: number, scale: number, flip = false): void {
  const w = rows[0]?.length ?? 16;
  const on = (i: number, j: number) => j >= 0 && j < rows.length && i >= 0 && i < w && rows[j][i] === '#';
  c.fillStyle = PALETTE[0];
  for (let j = -1; j <= rows.length; j++) for (let i = -1; i <= w; i++) {
    if (on(i, j)) continue;
    if (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1)) c.fillRect(x + (flip ? w - 1 - i : i) * scale, y + j * scale, scale, scale);
  }
  c.fillStyle = PALETTE[3];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) if (on(i, j)) c.fillRect(x + (flip ? w - 1 - i : i) * scale, y + j * scale, scale, scale);
}

const PERSON: Grid = [
  '................', '.....HHHHHH.....', '....HhhhhhhH....', '....HhhhhhhH....', '....30000003....', '....30300303....',
  '....30000003....', '.....300003.....', '....33333333....', '...3BBBBBBBB3...', '..3B3BBBBBB3B3..', '..303BBBBBB303..',
  '...33BBBBBB33...', '....3BB33BB3....', '....3003.3003...', '....333..333....'];
function person(hair: string, body: string, extra: (rows: string[]) => string[] = r => r): Grid {
  return extra(PERSON.map(r => r.replace(/H/g, '3').replace(/h/g, hair).replace(/B/g, body)));
}
const setRow = (rows: string[], i: number, row: string) => rows.map((r, j) => j === i ? row : r);
const NPC_ART: Readonly<Record<NpcLook, Grid>> = {
  elder: person('1', '1', r => setRow(r, 0, '......3333......')),
  kid: person('2', '0', r => setRow(setRow(r, 1, '....33333333....'), 2, '..3322222222....')),
  doctor: person('3', '0', r => setRow(r, 5, '....33333333....')),
  keeper: person('2', '1', r => setRow(r, 0, '.....300003.....')),
  clerk: person('3', '2'),
  hiker: person('2', '2', r => setRow(setRow(r, 0, '.....333333.....'), 1, '..333333333333..')),
  stroller: person('1', '2'),
  girl: person('2', '1', r => setRow(setRow(r, 6, '...230000032....'), 7, '...23300332.....')),
  leader: person('3', '3', r => setRow(setRow(r, 3, '....30000003....'), 12, '...3300000033...')),
};
export function npcArt(look: NpcLook): Grid { return NPC_ART[look]; }
/** Tile characters with art, and their grids (base underneath, then art). For validation and drawing. */
export const TILE_ART_CHARS: readonly string[] = Object.keys(TILES);
export function tileArt(ch: string): { readonly base?: Grid; readonly art: Grid } | null { return Object.hasOwn(TILES, ch) ? TILES[ch] : null; }

/** Monster art from its species; unknown ids draw nothing. */
export function drawMonster(c: CanvasRenderingContext2D, species: string, x: number, y: number, scale: number, flip = false): void {
  const s = Object.hasOwn(SPECIES, species) ? SPECIES[species] : undefined;
  if (s) paint(c, s.art, x, y, scale, flip);
}

export interface BattleScene {
  readonly foeSpecies: string; readonly foeVisible: boolean;
  readonly me: { readonly species: string; readonly friend: FriendRows | null; readonly visible: boolean };
  /** 0–1 intro wipe progress (1 = done), and which side is flashing after a hit. */
  readonly intro: number; readonly flash: 'me' | 'foe' | null; readonly clock: number;
}
export function drawBattle(c: CanvasRenderingContext2D, s: BattleScene): void {
  c.fillStyle = PALETTE[0]; c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // Ground pads.
  c.fillStyle = PALETTE[1];
  c.fillRect(92, 42, 60, 4); c.fillRect(96, 46, 52, 2);
  c.fillRect(6, 86, 64, 4); c.fillRect(10, 90, 56, 2);
  const blink = (side: 'me' | 'foe') => s.flash === side && Math.floor(s.clock * 16) % 2 === 0;
  if (s.foeVisible && !blink('foe')) drawMonster(c, s.foeSpecies, 106, 10, 2);
  if (s.me.visible && !blink('me')) {
    if (s.me.species === 'friend' && s.me.friend) drawFriend(c, s.me.friend, 20, 50, 2);
    else drawMonster(c, s.me.species, 20, 54, 2, true);
  }
  if (s.intro < 1) {
    c.fillStyle = PALETTE[3];
    const bars = 9;
    for (let i = 0; i < bars; i++) {
      const w = Math.round(SCREEN_W * (1 - s.intro));
      c.fillRect(i % 2 ? SCREEN_W - w : 0, i * 16, w, 16);
    }
  }
}

/** Draws the species art (or the Friend) into a small standalone canvas for menus. */
export function paintIcon(el: HTMLCanvasElement, species: string, friend: FriendRows | null): void {
  const c = el.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, el.width, el.height);
  if (species === 'friend') { if (friend) drawFriend(c, friend, 1, 1, 1); }
  else drawMonster(c, species, 1, 1, 1);
}
