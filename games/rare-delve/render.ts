/** Canvas presentation of a GameState: scrolling camera, fog of war, minimap, full map and the town backdrop. Visual only. */
import { spriteFrame, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { FLOORS, type Dir } from './data.ts';
import { isFloor, visibleIdx } from './dungeon.ts';
import { lookColor } from './items.ts';
import { ITEM_ART, MONSTER_ART, PALETTE as P, TILE_ART, artFor, drawFriend, drawSprite, tinted, type FriendRows, type Sprite } from './art.ts';
import type { GameState, Run } from './run.ts';

export const TILE = 16;
export const VIEW_W = 15;
export const VIEW_H = 11;
export const SCREEN_W = VIEW_W * TILE;
export const SCREEN_H = VIEW_H * TILE;
/** Canvas rows covered by the DOM status strip; the corner map sits below it. */
export const HUD_H = 16;

/** How many tiles the camera shows. The canvas is `cols × TILE` by `rows × TILE`; the engine never sees it. */
export interface View { readonly cols: number; readonly rows: number }
export const BASE_VIEW: View = { cols: VIEW_W, rows: VIEW_H };
/** Phone-sized portrait boxes: fewer columns (bigger tiles) and as many rows as fill the height. */
export const PHONE_COLS = 13;
export const PHONE_MAX_WIDTH = 560;
export const MAX_ROWS = 23;
/**
 * The view that best fills a stage box of `width × height` CSS pixels. Wide boxes and anything wider than a phone keep
 * the reference 15 × 11; a phone's portrait box gets 13 columns and as many whole rows as fit (11–23; with an even count the
 * hero stands half a tile below the middle).
 */
export function viewFor(width: number, height: number): View {
  if (!(width > 0 && height > 0) || width > PHONE_MAX_WIDTH || width / height >= 1.2) return BASE_VIEW;
  const rows = Math.max(VIEW_H, Math.min(MAX_ROWS, Math.floor(PHONE_COLS * height / width)));
  return { cols: PHONE_COLS, rows };
}

export interface RenderClock {
  /** Seconds since page start. */
  readonly now: number;
  readonly reduced: boolean;
  /** When the hero was last hurt (for a short red flash). */
  readonly hurtAt: number;
}

const cache = new Map<string, HTMLCanvasElement>();
function bitmap(key: string, s: Sprite): HTMLCanvasElement {
  let el = cache.get(key);
  if (!el) {
    el = document.createElement('canvas'); el.width = TILE; el.height = TILE;
    const c = el.getContext('2d');
    if (c) drawSprite(c, s, 0, 0);
    cache.set(key, el);
  }
  return el;
}
const blit = (c: CanvasRenderingContext2D, key: string, s: Sprite, x: number, y: number) => c.drawImage(bitmap(key, s), x, y);

export function friendRows(sprites: GenerationSprites | null, face: Dir, frame: number): FriendRows | null {
  if (!sprites) return null;
  const facing = face.includes('e') ? 'right' : face.includes('w') ? 'left' : face === 'n' ? 'up' : 'down';
  try { return spriteFrame(sprites, facing, false, frame % 8).frame.rows; } catch { return sprites.clips.idle.down[0]?.rows ?? null; }
}

function itemSprite(run: Run, k: string): [string, Sprite] {
  const base = artFor(k), kind = k.slice(0, 2);
  if (kind === 'p_' || kind === 'w_') {
    const hex = lookColor(k, run.seed);
    return [`${k}:${hex}`, tinted(base, 'a', hex)];
  }
  return [`item:${k}`, base];
}

function wallFace(run: Run, x: number, y: number): boolean {
  return [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => isFloor(run.map, x + dx, y + dy)));
}

function drawTiles(c: CanvasRenderingContext2D, run: Run, ox: number, oy: number, vis: Set<number>, view: View): void {
  const m = run.map;
  for (let j = 0; j < view.rows; j++) for (let i = 0; i < view.cols; i++) {
    const x = ox + i, y = oy + j, px = i * TILE, py = j * TILE, idx = y * m.w + x;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h || run.seen[idx] !== '1') { c.fillStyle = P.ink; c.fillRect(px, py, TILE, TILE); continue; }
    const ch = m.tiles[idx];
    if (ch === '#') {
      if (wallFace(run, x, y)) blit(c, 'wall', TILE_ART.wall, px, py);
      else { c.fillStyle = P.rockLo; c.fillRect(px, py, TILE, TILE); }
    } else blit(c, ch === ',' ? 'corridor' : 'floor', ch === ',' ? TILE_ART.corridor : TILE_ART.floor, px, py);
    if (m.stairs[0] === x && m.stairs[1] === y) {
      const last = run.floor === FLOORS;
      blit(c, last ? 'pedestal' : 'stairs', last ? TILE_ART.pedestal : TILE_ART.stairs, px, py);
    }
    const trap = run.traps.find(t => t.found && t.x === x && t.y === y);
    if (trap) blit(c, trap.kind, TILE_ART[trap.kind], px, py);
    if (!vis.has(idx)) { c.fillStyle = 'rgba(12,9,16,0.55)'; c.fillRect(px, py, TILE, TILE); }
  }
}

function drawThings(c: CanvasRenderingContext2D, s: GameState, ox: number, oy: number, vis: Set<number>, clock: RenderClock, view: View): void {
  const run = s.run!, w = run.map.w, bob = clock.reduced ? 0 : Math.floor(clock.now * 2) % 2;
  const inView = (x: number, y: number) => x >= ox && y >= oy && x < ox + view.cols && y < oy + view.rows;
  for (const f of run.items) {
    if (!inView(f.x, f.y) || (run.seen[f.y * w + f.x] !== '1' && !run.sight)) continue;
    const [key, sp] = itemSprite(run, f.item.k);
    const lift = f.item.k === 'lantern' && !clock.reduced ? Math.round(Math.sin(clock.now * 3)) : 0;
    blit(c, key, sp, (f.x - ox) * TILE, (f.y - oy) * TILE - lift);
  }
  for (const m of run.mons) {
    if (!inView(m.x, m.y) || (!vis.has(m.y * w + m.x) && !run.sight)) continue;
    const px = (m.x - ox) * TILE, py = (m.y - oy) * TILE;
    c.save();
    if (m.face.includes('w')) { c.translate(px + TILE, py); c.scale(-1, 1); c.drawImage(bitmap(`mon:${m.sp}`, MONSTER_ART[m.sp]), 0, m.sleep > 0 ? 0 : -bob); }
    else c.drawImage(bitmap(`mon:${m.sp}`, MONSTER_ART[m.sp]), px, py - (m.sleep > 0 ? 0 : bob));
    c.restore();
    if (m.sleep > 0) { c.fillStyle = P.bone; c.font = '7px monospace'; c.fillText('z', px + 12, py + 5); }
    if (m.conf > 0 || m.slow > 0) { c.fillStyle = m.conf > 0 ? P.gold : P.water; c.fillRect(px + 1, py + 1, 3, 3); }
  }
}

function drawHero(c: CanvasRenderingContext2D, s: GameState, rows: FriendRows | null, ox: number, oy: number): void {
  const px = (s.hero.x - ox) * TILE, py = (s.hero.y - oy) * TILE;
  if (rows) drawFriend(c, rows, px, py);
  else { c.fillStyle = P.glow; c.fillRect(px + 4, py + 3, 8, 11); }
  const arrows: Readonly<Record<Dir, [number, number]>> = { n: [7, -3], ne: [15, -2], e: [16, 7], se: [15, 15], s: [7, 16], sw: [-2, 15], w: [-3, 7], nw: [-2, -2] };
  const dirs = s.turnMode ? (Object.keys(arrows) as Dir[]) : [s.hero.face];
  c.fillStyle = s.turnMode ? P.gold : P.ember;
  for (const d of dirs) { const [ax, ay] = arrows[d]; c.fillRect(px + ax, py + ay, 3, 3); }
}

/** A small corner map of explored tiles. */
function drawMinimap(c: CanvasRenderingContext2D, s: GameState, scale: number, x0: number, y0: number, alpha: number): void {
  const run = s.run!, m = run.map;
  c.globalAlpha = alpha;
  c.fillStyle = P.ink; c.fillRect(x0 - 2, y0 - 2, m.w * scale + 4, m.h * scale + 4);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    if (run.seen[i] !== '1' || m.tiles[i] === '#') continue;
    c.fillStyle = m.tiles[i] === ',' ? '#6b5a48' : '#8a7760';
    c.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
  }
  const dot = (x: number, y: number, color: string) => { c.fillStyle = color; c.fillRect(x0 + x * scale - scale * 0.25, y0 + y * scale - scale * 0.25, scale * 1.5, scale * 1.5); };
  if (run.seen[m.stairs[1] * m.w + m.stairs[0]] === '1') dot(m.stairs[0], m.stairs[1], P.water);
  const vis = new Set(visibleIdx(m, s.hero.x, s.hero.y));
  for (const f of run.items) if (run.sight || run.seen[f.y * m.w + f.x] === '1') dot(f.x, f.y, f.item.k === 'lantern' ? P.glow : P.gold);
  for (const mon of run.mons) if (run.sight || vis.has(mon.y * m.w + mon.x)) dot(mon.x, mon.y, P.blood);
  dot(s.hero.x, s.hero.y, '#ffffff');
  c.globalAlpha = 1;
}

/** The town backdrop is drawn for 240 × 176; other canvases centre it horizontally and stand it on the bottom edge, with more sky. */
function drawTown(c: CanvasRenderingContext2D, rows: FriendRows | null, clock: RenderClock): void {
  const W = c.canvas.width, H = c.canvas.height, tx = Math.round((W - SCREEN_W) / 2), ty = H - SCREEN_H;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d1530'); sky.addColorStop(0.6, '#3b2540'); sky.addColorStop(1, '#2a2020');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  c.fillStyle = '#fff4d0';
  for (let i = 0; i < 18 + Math.round(ty / 8); i++) c.fillRect((i * 53) % W, (i * 31) % (70 + ty), 1, 1);
  c.fillStyle = P.floor; c.fillRect(0, ty + 132, W, 44);
  for (let x = tx % TILE - TILE; x < W; x += TILE) blit(c, 'floor', TILE_ART.floor, x, ty + 144);
  c.save(); c.translate(tx, ty);
  c.fillStyle = P.rock;
  c.beginPath(); c.moveTo(0, 120); c.lineTo(60, 50); c.lineTo(110, 80); c.lineTo(160, 36); c.lineTo(240, 110); c.lineTo(240, 132); c.lineTo(0, 132); c.fill();
  const glow = clock.reduced ? 0.8 : 0.7 + 0.15 * Math.sin(clock.now * 2);
  c.fillStyle = `rgba(242,193,78,${glow * 0.35})`; c.beginPath(); c.arc(160, 108, 30, 0, Math.PI * 2); c.fill();
  c.fillStyle = P.ink; c.beginPath(); c.moveTo(142, 132); c.lineTo(146, 100); c.quadraticCurveTo(160, 84, 174, 100); c.lineTo(178, 132); c.fill();
  const house = (x: number, roof: string) => {
    c.fillStyle = '#5a4436'; c.fillRect(x, 108, 34, 26); c.fillStyle = roof;
    c.beginPath(); c.moveTo(x - 4, 110); c.lineTo(x + 17, 94); c.lineTo(x + 38, 110); c.fill();
    c.fillStyle = P.glow; c.fillRect(x + 6, 116, 7, 7); c.fillStyle = P.ink; c.fillRect(x + 21, 118, 8, 16);
  };
  house(18, P.rust); house(70, '#6a4a7a');
  blit(c, 'item:lantern', ITEM_ART.lantern, 152, 116);
  if (rows) drawFriend(c, rows, 118, 128); else { c.fillStyle = P.glow; c.fillRect(122, 131, 8, 11); }
  c.restore();
}

export function drawGame(c: CanvasRenderingContext2D, s: GameState, sprites: GenerationSprites | null, clock: RenderClock): void {
  c.imageSmoothingEnabled = false;
  const frame = clock.reduced ? 0 : Math.floor(clock.now * 3);
  if (!s.run) { drawTown(c, friendRows(sprites, 's', frame), clock); return; }
  const run = s.run, m = run.map;
  // The camera follows the canvas: the host sizes it from viewFor (more rows and bigger tiles on phones).
  const W = c.canvas.width, H = c.canvas.height, view: View = { cols: Math.floor(W / TILE), rows: Math.floor(H / TILE) };
  const ox = Math.max(0, Math.min(m.w - view.cols, s.hero.x - Math.floor(view.cols / 2)));
  const oy = Math.max(0, Math.min(m.h - view.rows, s.hero.y - Math.floor(view.rows / 2)));
  const vis = new Set(visibleIdx(m, s.hero.x, s.hero.y));
  drawTiles(c, run, ox, oy, vis, view);
  drawThings(c, s, ox, oy, vis, clock, view);
  drawHero(c, s, friendRows(sprites, s.hero.face, frame), ox, oy);
  if (!clock.reduced && clock.now - clock.hurtAt < 0.18) { c.fillStyle = 'rgba(198,68,60,0.28)'; c.fillRect(0, 0, W, H); }
  if (s.showMap) {
    const scale = Math.max(2, Math.min(5, Math.floor((W - 8) / m.w), Math.floor((H - 30) / m.h)));
    c.fillStyle = 'rgba(18,14,24,0.88)'; c.fillRect(0, 0, W, H);
    drawMinimap(c, s, scale, Math.round((W - m.w * scale) / 2), Math.round((H - m.h * scale) / 2) + 6, 1);
  } else drawMinimap(c, s, 1.5, W - m.w * 1.5 - 3, HUD_H + 3, 0.8);
}
