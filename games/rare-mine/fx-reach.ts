/**
 * The reach on the mine canvas: the scene dims, spotlights sweep, and a three-reel window (coin, gem, your Friend)
 * spins, stops two matching, then crawls the last reel home. Canvas only, drawn in screen coordinates; the DOM
 * overlay adds the リーチ / 激アツ call and the flashing border.
 */
import { COIN_FRAMES, GEM, PALETTE as P, drawFriend, drawSprite, type FriendRows, type Sprite } from './art.ts';
import { SYMBOLS, reelPosition, type ReachPlan } from './reach.ts';
import type { FxFrame } from './fx-show.ts';

const WIN_W = 36, WIN_H = 46, CELL = 34, GAP = 6, PAD = 6;
export const PANEL_W = WIN_W * 3 + GAP * 2 + PAD * 2;
export const PANEL_H = WIN_H + PAD * 2;
const STAR: Sprite = { rows: ['...o...', '..oyo..', 'ooyyyoo', '.oyyyo.', '.oyoyo.', 'oo...oo'], colors: { o: P.goldDeep, y: P.gold } };
const ASK: Sprite = { rows: ['.rrrr.', 'rr..rr', '....rr', '...rr.', '..rr..', '......', '..rr..'], colors: { r: '#e0322a' } };

/** The reel panel's centre line (screen rows) on a canvas `h` rows tall. */
export const reelCenter = (h: number): number => Math.round(h * 0.42);
export const hue = (t: number, speed = 240, off = 0): string => `hsl(${Math.round((t * speed + off) % 360)} 95% 62%)`;
const sym = (p: number): number => ((Math.round(p) % SYMBOLS) + SYMBOLS) % SYMBOLS;

function drawSymbol(c: CanvasRenderingContext2D, s: number, cx: number, cy: number, rows: FriendRows | null): void {
  if (s === 0) { drawSprite(c, COIN_FRAMES[0], cx - 14, cy - 14, 4); return; }
  if (s === 1) { drawSprite(c, GEM, cx - 14, cy - 14, 4); return; }
  c.fillStyle = P.gold; c.beginPath(); c.arc(cx, cy, 15, 0, Math.PI * 2); c.fill();
  c.fillStyle = P.goldHi; c.beginPath(); c.arc(cx, cy, 12, 0, Math.PI * 2); c.fill();
  if (!rows) { drawSprite(c, STAR, cx - 10, cy - 9, 3); return; }
  const w = rows[0]?.length ?? 16, scale = Math.max(1, Math.floor(22 / w));
  drawFriend(c, rows, Math.round(cx - (w * scale) / 2), Math.round(cy - (rows.length * scale) / 2), scale);
}

export interface ReelLook {
  /** Reel positions in symbol units (reach.ts reelPosition). */
  readonly pos: readonly number[];
  /** Blur amount 0–1 per reel while it spins fast. */
  readonly blur: readonly number[];
  readonly border: string;
  /** The payline glows once two reels match. */
  readonly payline: number;
  /** Reduced motion: the last window shows a static question mark. */
  readonly ask: boolean;
  readonly alpha: number;
}

/** The three-reel panel centred on the canvas. */
export function drawReels(c: CanvasRenderingContext2D, look: ReelLook, rows: FriendRows | null, h: number): void {
  const x0 = Math.round(128 - PANEL_W / 2), y0 = reelCenter(h) - Math.round(PANEL_H / 2);
  c.save();
  c.globalAlpha = look.alpha;
  c.fillStyle = '#0a0706'; c.fillRect(x0 - 3, y0 - 3, PANEL_W + 6, PANEL_H + 6);
  c.fillStyle = look.border; c.fillRect(x0 - 2, y0 - 2, PANEL_W + 4, PANEL_H + 4);
  c.fillStyle = '#1b120d'; c.fillRect(x0, y0, PANEL_W, PANEL_H);
  for (let r = 0; r < 3; r++) {
    const wx = x0 + PAD + r * (WIN_W + GAP), wy = y0 + PAD, cx = wx + WIN_W / 2, cy = wy + WIN_H / 2;
    const g = c.createLinearGradient(0, wy, 0, wy + WIN_H);
    g.addColorStop(0, '#8a7456'); g.addColorStop(0.25, '#fff4d8'); g.addColorStop(0.75, '#fff4d8'); g.addColorStop(1, '#8a7456');
    c.fillStyle = g; c.fillRect(wx, wy, WIN_W, WIN_H);
    c.save(); c.beginPath(); c.rect(wx, wy, WIN_W, WIN_H); c.clip();
    if (r === 2 && look.ask) drawSprite(c, ASK, cx - 9, cy - 11, 3);
    else {
      const p = look.pos[r] ?? 0, base = Math.round(p);
      for (let k = -1; k <= 1; k++) drawSymbol(c, sym(base + k), cx, Math.round(cy + (p - base - k) * CELL), rows);
    }
    const blur = look.blur[r] ?? 0;
    if (blur > 0) {
      c.fillStyle = `rgba(255,244,216,${(0.55 * blur).toFixed(3)})`; c.fillRect(wx, wy, WIN_W, WIN_H);
      c.fillStyle = `rgba(122,79,18,${(0.35 * blur).toFixed(3)})`;
      for (let i = 0; i < 4; i++) c.fillRect(wx + 7 + i * 7, wy, 2, WIN_H);
    }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(wx, wy, WIN_W, 3); c.fillRect(wx, wy + WIN_H - 3, WIN_W, 3);
    c.restore();
  }
  if (look.payline > 0) {
    c.fillStyle = `rgba(255,59,59,${(0.85 * look.payline).toFixed(3)})`;
    c.fillRect(x0 + 2, reelCenter(h) - 1, PANEL_W - 4, 2);
  }
  c.restore();
}

/** Two (three when 超激アツ) light cones sweeping from above, added on top of the dimmed scene. */
function drawSpotlights(c: CanvasRenderingContext2D, t: number, h: number, stage: string): void {
  const cones = stage === 'super' ? 3 : 2;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < cones; i++) {
    const ox = cones === 3 ? 30 + i * 98 : i ? 222 : 34, sway = Math.sin(t * 1.7 + i * 2.1) * 0.5 + (i === 0 ? 0.35 : i === cones - 1 ? -0.35 : 0);
    const len = h + 20, bx = ox + Math.sin(sway) * len, spread = 30;
    const color = stage === 'super' ? hue(t, 200, i * 120) : stage === 'hot' ? '#ffcf6e' : '#fff4d0';
    c.globalAlpha = stage === 'spin' ? Math.min(1, t / 0.4) * 0.12 : 0.16;
    c.fillStyle = color;
    c.beginPath(); c.moveTo(ox - 3, -6); c.lineTo(ox + 3, -6); c.lineTo(bx + spread, len); c.lineTo(bx - spread, len); c.closePath(); c.fill();
  }
  c.restore();
}

export function reachBorder(stage: string, t: number): string {
  if (stage === 'tease') return Math.floor(t * 5) % 2 ? '#ffffff' : '#ff3b3b';
  if (stage === 'super') return hue(t);
  if (stage === 'hot') return '#ffcf6e';
  return P.gold;
}

/** The whole reach: dim, spotlights, the reels at their planned positions. */
export function drawReach(c: CanvasRenderingContext2D, f: FxFrame, rows: FriendRows | null, h: number): void {
  const { t, plan } = f;
  c.fillStyle = `rgba(6,3,10,${(f.reduced ? 0.6 : Math.min(0.62, (t / 0.25) * 0.62)).toFixed(3)})`;
  c.fillRect(0, 0, 256, h);
  if (f.reduced) {
    drawReels(c, { pos: [plan.match, plan.match, 0], blur: [0, 0, 0], border: P.gold, payline: 1, ask: true, alpha: 1 }, rows, h);
    return;
  }
  drawSpotlights(c, t, h, f.stage);
  const pos = [0, 1, 2].map(r => reelPosition(plan, r, t));
  const blur = [0, 1, 2].map(r => Math.min(1, Math.max(0, (pos[r] - reelPosition(plan, r, t - 1 / 60)) * 60 - 6) / 8));
  const payline = t >= 1.05 ? 0.55 + 0.45 * Math.sin(t * Math.PI * 4) : 0;
  drawReels(c, { pos, blur, border: reachBorder(f.stage, t), payline, ask: false, alpha: 1 }, rows, h);
}

/** The reels frozen on the final symbols, fading out as the reveal takes over. */
export function drawLockedReels(c: CanvasRenderingContext2D, plan: ReachPlan, rows: FriendRows | null, h: number, alpha: number, border: string): void {
  if (alpha <= 0) return;
  drawReels(c, { pos: [...plan.final], blur: [0, 0, 0], border, payline: plan.win ? 1 : 0, ask: false, alpha }, rows, h);
}
