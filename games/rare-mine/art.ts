/**
 * Rare Mine pixel art: a warm lantern-lit mine shaft drawn in code. Every coin, gem, tool, cart and rock is original.
 * Sprite rows use '.' for transparency and one character per palette color.
 */
export const PALETTE = {
  ink: '#140f0c', rock: '#3a2c26', rockHi: '#5a453a', rockLo: '#231a16', rockDeep: '#1a1310', dust: '#7d6552',
  wood: '#7a4a2a', woodHi: '#a8683a', woodLo: '#4a2c18', rail: '#6f6a66', railHi: '#9b958f',
  gold: '#f5c542', goldHi: '#fff1a8', goldLo: '#b07a1c', goldDeep: '#7a4f12',
  gem: '#4fd8cc', gemHi: '#d6fffa', gemLo: '#1f8a8a', glow: '#ffcf6e', cream: '#f3e6cc',
  ember: '#ff7a2e', flame: '#ffb13b', burn: '#e04a2a', smoke: '#4a3a36', glass: '#9cc9d9', glassHi: '#e2f4fa',
} as const;
const P = PALETTE;

export interface Sprite { readonly rows: readonly string[]; readonly colors: Readonly<Record<string, string>> }
const sprite = (rows: readonly string[], colors: Record<string, string>): Sprite => ({ rows, colors });

/** A coin seen face-on, and three narrower spin frames for coins in flight. */
export const COIN_FRAMES: readonly Sprite[] = [
  sprite(['..ooo..', '.oyyyo.', 'oyhhyyo', 'oyhyydo', 'oyyyddo', '.oyddo.', '..ooo..'], { o: P.goldDeep, y: P.gold, h: P.goldHi, d: P.goldLo }),
  sprite(['..oo..', '.oyho.', '.ohyo.', '.oyyo.', '.oydo.', '.oddo.', '..oo..'], { o: P.goldDeep, y: P.gold, h: P.goldHi, d: P.goldLo }),
  sprite(['..o..', '.oho.', '.oyo.', '.oyo.', '.oyo.', '.odo.', '..o..'], { o: P.goldDeep, y: P.gold, h: P.goldHi, d: P.goldLo }),
  sprite(['.o.', '.h.', '.y.', '.y.', '.y.', '.d.', '.o.'], { o: P.goldDeep, y: P.gold, h: P.goldHi, d: P.goldLo }),
];
/** A coin lying in a stack (edge view). */
export const COIN_EDGE = sprite(['.hhhhh.', 'oyyyyyo', '.ddddd.'], { o: P.goldDeep, y: P.gold, h: P.goldHi, d: P.goldLo });
/** A coin in the burning pile: glowing ember colors. */
export const COIN_EDGE_BURN = sprite(['.fffff.', 'reeeeer', '.rrrrr.'], { f: '#ffd27a', e: '#ff7a2e', r: '#a8281a' });
/** A charred coin: the burnt pile crumbling to ash. */
export const COIN_EDGE_CHAR = sprite(['.ddddd.', 'kccccck', '.kkkkk.'], { d: '#5a4238', c: '#3a2c26', k: '#1a1310' });
export const GEM = sprite(['...o...', '..oho..', '.ohhgo.', 'ohggglo', '.ogglo.', '..olo..', '...o...'],
  { o: P.gemLo, h: P.gemHi, g: P.gem, l: P.gemLo });
/** Pickaxe, head up-right, handle down-left; the grip is at the bottom-left corner. */
export const PICK = sprite([
  '......oooo..', '....ooiiiio.', '...oiimmmmio', '..oim.oo.oio', '...o.oow.o.o', '.....owo....',
  '....owo.....', '...owo......', '..owo.......', '.owo........', 'owo.........', 'oo..........',
], { o: P.ink, i: P.railHi, m: P.rail, w: P.woodHi });
export const LANTERN = sprite(['..ooo..', '.o...o.', 'ooooooo', 'owgggwo', 'owghgwo', 'owgggwo', 'ooooooo', '..ooo..'],
  { o: P.ink, w: P.wood, g: P.glow, h: '#ffffff' });

/** Draw a sprite at (x, y) with an integer scale. */
export function drawSprite(c: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1): void {
  s.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      c.fillStyle = s.colors[ch];
      c.fillRect(Math.round(x) + i * scale, Math.round(y) + j * scale, scale, scale);
    }
  });
}

export type FriendRows = readonly string[];
/** The player's canonical one-bit Friend sprite: dark body with a warm one-pixel halo so it reads against the rock. */
export function drawFriend(c: CanvasRenderingContext2D, rows: FriendRows, x: number, y: number, scale = 1, flip = false): void {
  const w = rows[0]?.length ?? 16;
  const on = (i: number, j: number) => j >= 0 && j < rows.length && i >= 0 && i < w && rows[j][i] === '#';
  const px = (i: number) => x + (flip ? w - 1 - i : i) * scale;
  c.fillStyle = P.cream;
  for (let j = -1; j <= rows.length; j++) for (let i = -1; i <= w; i++) {
    if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) c.fillRect(px(i), y + j * scale, scale, scale);
  }
  c.fillStyle = P.ink;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) if (on(i, j)) c.fillRect(px(i), y + j * scale, scale, scale);
}

/** Deterministic per-pixel hash for textures (no Math.random, so the wall never shimmers). */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2246822519, 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Coins drawn as a stack in the cart: how many edge sprites a pot of `coins` shows (square-root growth, capped). */
export function pileCount(coins: number): number {
  return coins <= 0 ? 0 : Math.min(80, Math.max(1, Math.round(Math.sqrt(coins) * 2.2)));
}
/** How full the safe jar looks (0–1): logarithmic, full at a million. */
export function jarLevel(safe: number): number {
  return safe <= 0 ? 0 : Math.min(1, Math.log10(1 + safe) / 6);
}
