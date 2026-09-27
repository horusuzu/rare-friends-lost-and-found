/**
 * Desktop pet pixel scene (trusted host): the selected Friend's canonical sprite on a small rock ledge, swinging a
 * pickaxe at an ore face while coins arc into a pile. Original art drawn in code; the host never imports game code.
 * Sprite rows use '.' for transparency and one character per palette color.
 */
import { spriteFrame, type GenerationSprites } from './generation-sprites.js';

/** Logical scene size in pixels; the canvas scales it by an integer. */
export const SCENE = Object.freeze({ width: 102, height: 68 });
const P = {
  ink: '#140f0c', rock: '#3a2c26', rockHi: '#5a453a', rockLo: '#231a16', rockDeep: '#1a1310', dust: '#7d6552',
  wood: '#a8683a', rail: '#6f6a66', railHi: '#9b958f', cream: '#f3e6cc', glow: '#ffcf6e',
  gold: '#f5c542', goldHi: '#fff1a8', goldLo: '#b07a1c', goldDeep: '#7a4f12',
} as const;
type Sprite = Readonly<{ rows: readonly string[]; colors: Readonly<Record<string, string>> }>;
const gold = { o: P.goldDeep, y: P.gold, h: P.goldHi, d: P.goldLo };
const COIN_FRAMES: readonly Sprite[] = [
  { rows: ['..ooo..', '.oyyyo.', 'oyhhyyo', 'oyhyydo', 'oyyyddo', '.oyddo.', '..ooo..'], colors: gold },
  { rows: ['..oo..', '.oyho.', '.ohyo.', '.oyyo.', '.oydo.', '.oddo.', '..oo..'], colors: gold },
  { rows: ['..o..', '.oho.', '.oyo.', '.oyo.', '.oyo.', '.odo.', '..o..'], colors: gold },
  { rows: ['.o.', '.h.', '.y.', '.y.', '.y.', '.d.', '.o.'], colors: gold },
];
const COIN_EDGE: Sprite = { rows: ['.hhhhh.', 'oyyyyyo', '.ddddd.'], colors: gold };
/** Pickaxe, head up-right; the grip is the bottom-left pixel. */
const PICK: Sprite = { rows: [
  '......oooo..', '....ooiiiio.', '...oiimmmmio', '..oim.oo.oio', '...o.oow.o.o', '.....owo....',
  '....owo.....', '...owo......', '..owo.......', '.owo........', 'owo.........', 'oo..........',
], colors: { o: P.ink, i: P.railHi, m: P.rail, w: P.wood } };

/** Where things stand on the ledge. */
export const LAYOUT = Object.freeze({ ledge: 54, friendX: 50, friendY: 38, pivotX: 65, pivotY: 46, oreX: 80, hitX: 78, hitY: 42, pileX: 6 });
/** Coins in the pile: bottom row 6, then 5, 4, 3, 2, 1. */
export const PILE_MAX = 21;
export const SWING_S = 0.5;
export const STRIKE_AT = 0.7;
const COIN_FLIGHT_S = 0.9;

export type Coin = Readonly<{ born: number; x: number; slot: number }>;
export type Spark = Readonly<{ born: number; dx: number; dy: number }>;
export type SceneState = Readonly<{
  /** Seconds since the pet opened. */
  t: number;
  /** Start time of the current swing, or null when resting. */
  swingAt: number | null;
  coins: readonly Coin[];
  sparks: readonly Spark[];
  pile: number;
  reduced: boolean;
  sprites: GenerationSprites | null;
}>;

function drawSprite(c: CanvasRenderingContext2D, s: Sprite, x: number, y: number): void {
  s.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      c.fillStyle = s.colors[ch];
      c.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  });
}

/** One-bit Friend sprite: dark body with a warm one-pixel halo so it reads against the rock. */
function drawFriend(c: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number): void {
  const w = rows[0]?.length ?? 16;
  const on = (i: number, j: number) => j >= 0 && j < rows.length && i >= 0 && i < w && rows[j][i] === '#';
  c.fillStyle = P.cream;
  for (let j = -1; j <= rows.length; j++) for (let i = -1; i <= w; i++) {
    if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) c.fillRect(x + i, y + j, 1, 1);
  }
  c.fillStyle = P.ink;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) if (on(i, j)) c.fillRect(x + i, y + j, 1, 1);
}
/** Until the canonical art loads: a plain rounded silhouette. */
const PLACEHOLDER = Array.from({ length: 16 }, (_, j) => Array.from({ length: 16 }, (_, i) =>
  j >= 3 && j <= 15 && i >= 3 && i <= 12 && !((j === 3 || j === 15) && (i === 3 || i === 12)) ? '#' : '.').join(''));

/** Deterministic per-pixel hash (no Math.random, so the wall never shimmers). */
function hash(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The static layer: mine wall, ore face and ledge. Paint once into an offscreen canvas. */
export function paintBackdrop(c: CanvasRenderingContext2D): void {
  const { width, height } = SCENE, { ledge, oreX } = LAYOUT;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const n = hash(x >> 1, y >> 1);
    c.fillStyle = n < 0.12 ? P.rockLo : n > 0.93 ? P.rock : P.rockDeep;
    c.fillRect(x, y, 1, 1);
  }
  // Ore face on the right, with gold flecks.
  for (let y = 12; y < ledge; y++) {
    const edge = oreX + Math.round(Math.sin(y * 0.7) * 1.5);
    for (let x = edge; x < width; x++) {
      const n = hash(x, y + 99);
      c.fillStyle = x === edge ? P.rockHi : n > 0.9 ? P.gold : n > 0.84 ? P.goldLo : n < 0.3 ? P.rockLo : P.rock;
      c.fillRect(x, y, 1, 1);
    }
  }
  // Ledge.
  for (let y = ledge; y < height; y++) for (let x = 0; x < width; x++) {
    const n = hash(x + 7, y + 31);
    c.fillStyle = y === ledge ? P.rockHi : y === ledge + 1 ? P.rock : n > 0.9 ? P.dust : n < 0.2 ? P.rockLo : P.rock;
    c.fillRect(x, y, 1, 1);
  }
}

/** Pickaxe angle (radians) through a swing: wind up, strike the ore, recover. Rest is 0.3. */
export function swingAngle(phase: number): number {
  const REST = 0.3, UP = -0.85, HIT = 0.95;
  const p = Math.min(1, Math.max(0, phase));
  const out = (k: number) => 1 - (1 - k) ** 2;
  if (p < 0.55) return REST + (UP - REST) * out(p / 0.55);
  if (p < STRIKE_AT) return UP + (HIT - UP) * ((p - 0.55) / (STRIKE_AT - 0.55));
  return HIT + (REST - HIT) * out((p - STRIKE_AT) / (1 - STRIKE_AT));
}

/** Top-left of pile slot `i` (0 is bottom-left). */
export function pileSlot(i: number): { x: number; y: number } {
  let row = 0, rest = Math.max(0, Math.min(PILE_MAX - 1, Math.floor(i)));
  while (rest >= 6 - row) { rest -= 6 - row; row++; }
  return { x: LAYOUT.pileX + row * 3 + rest * 6, y: LAYOUT.ledge - 3 - row * 3 };
}

/** A flying coin's position, or null once it has landed. */
export function coinAt(coin: Coin, t: number): { x: number; y: number; frame: number } | null {
  const k = (t - coin.born) / COIN_FLIGHT_S;
  if (k < 0 || k >= 1) return null;
  const to = pileSlot(coin.slot);
  const x = coin.x + (to.x - coin.x) * k, y = LAYOUT.hitY + (to.y - 4 - LAYOUT.hitY) * k - 30 * 4 * k * (1 - k);
  return { x, y, frame: Math.floor((t - coin.born) * 12) % COIN_FRAMES.length };
}
export function coinLanded(coin: Coin, t: number): boolean { return t - coin.born >= COIN_FLIGHT_S; }

export function drawScene(c: CanvasRenderingContext2D, backdrop: CanvasImageSource, s: SceneState): void {
  const { friendX, friendY, pivotX, pivotY, hitX, hitY } = LAYOUT;
  c.imageSmoothingEnabled = false;
  c.drawImage(backdrop, 0, 0);
  // Lantern glow around the Friend (steady with reduced motion).
  const flicker = s.reduced ? 0 : Math.sin(s.t * 7) * 0.015 + Math.sin(s.t * 13) * 0.01;
  const glow = c.createRadialGradient(friendX + 8, friendY + 6, 2, friendX + 8, friendY + 6, 34);
  glow.addColorStop(0, `rgba(255,207,110,${0.2 + flicker})`); glow.addColorStop(1, 'rgba(255,207,110,0)');
  c.fillStyle = glow; c.fillRect(0, 0, SCENE.width, SCENE.height);
  for (let i = 0; i < Math.min(PILE_MAX, s.pile); i++) { const { x, y } = pileSlot(i); drawSprite(c, COIN_EDGE, x, y); }
  const rows = s.sprites ? spriteFrame(s.sprites, 'right', false, s.reduced ? 0 : Math.floor(s.t * 6) % 8).frame.rows : PLACEHOLDER;
  drawFriend(c, rows, friendX, friendY);
  const phase = s.swingAt === null || s.reduced ? null : (s.t - s.swingAt) / SWING_S;
  c.save();
  c.translate(pivotX, pivotY);
  c.rotate(phase === null || phase >= 1 ? 0.3 : swingAngle(phase));
  drawSprite(c, PICK, -1, -11);
  c.restore();
  if (s.reduced) return;
  for (const spark of s.sparks) {
    const k = (s.t - spark.born) / 0.3;
    if (k < 0 || k >= 1) continue;
    c.fillStyle = k < 0.5 ? P.goldHi : P.gold;
    c.fillRect(Math.round(hitX + spark.dx * k * 8), Math.round(hitY + spark.dy * k * 8 + 6 * k * k), 1, 1);
  }
  for (const coin of s.coins) { const at = coinAt(coin, s.t); if (at) drawSprite(c, COIN_FRAMES[at.frame], at.x - 3, at.y - 3); }
}
