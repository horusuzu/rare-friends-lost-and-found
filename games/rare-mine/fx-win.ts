/**
 * The 大当たり on the mine canvas: the reels lock, a white flash, then rotating gold (or rainbow) light rays behind the
 * mine, confetti and sparkles in front, and from 確変 up a rainbow wash and fever rings. The coin torrent itself is
 * spawned by particles.ts so the cart pile really fills. Stateless: every frame is a pure function of the show clock.
 */
import { PALETTE as P, hash2, type FriendRows } from './art.ts';
import { WIN_FLASH_AT, type ReachPlan } from './reach.ts';
import type { FxFrame } from './fx-show.ts';
import { drawLockedReels, hue, reelCenter } from './fx-reach.ts';

const RAYS = 14;
const CONFETTI = [44, 64, 84, 110] as const;
const GOLDS = [P.goldHi, P.gold, '#ffffff', P.flame, P.gem] as const;
const RAINBOW = ['#ff4d6d', '#ffb13b', '#fff1a8', '#5be37d', '#4fd8cc', '#6c8cff', '#c77dff'] as const;

/** 0 → 1 → 0 envelope: in over `a` seconds, out over the last `b` seconds of `d`. */
const fade = (t: number, d: number, a: number, b: number): number => Math.max(0, Math.min(1, t / a, (d - t) / b));

/** Behind the Friend and the cart (scene coordinates, translated by `top`). */
export function drawWinBack(c: CanvasRenderingContext2D, f: FxFrame, h: number, top: number): void {
  const { t, winTier: tier, reduced } = f, env = reduced ? 0.8 : fade(t - 0.1, f.duration - 0.1, 0.3, 0.6);
  if (env <= 0) return;
  const cx = 128, cy = reelCenter(h) - top, spin = reduced ? 0 : t * (tier >= 3 ? 1.1 : 0.6);
  c.save();
  if (tier >= 2) {
    const g = c.createLinearGradient(0, -top, 256, h - top);
    RAINBOW.forEach((col, i) => g.addColorStop(((i / RAINBOW.length) + (reduced ? 0 : t * 0.25)) % 1, col));
    c.globalAlpha = 0.2 * env; c.fillStyle = g; c.fillRect(0, -top, 256, h);
  }
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < RAYS; i++) {
    const a0 = spin + (i / RAYS) * Math.PI * 2, a1 = a0 + Math.PI / RAYS;
    c.globalAlpha = (i % 2 ? 0.1 : 0.2) * env;
    c.fillStyle = tier >= 2 ? hue(reduced ? 0 : t, 90, i * (360 / RAYS)) : i % 2 ? P.flame : P.goldHi;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * 320, cy + Math.sin(a0) * 320); c.lineTo(cx + Math.cos(a1) * 320, cy + Math.sin(a1) * 320);
    c.closePath(); c.fill();
  }
  c.restore();
}

/** In front of the scene: confetti, sparkles and (FEVER) expanding rings. */
export function drawWinFront(c: CanvasRenderingContext2D, f: FxFrame, h: number, top: number): void {
  const { t, winTier: tier, reduced } = f, n = CONFETTI[tier], palette = tier >= 2 ? RAINBOW : GOLDS;
  c.save();
  for (let i = 0; i < n; i++) {
    const delay = hash2(i, 1, 71) * 1.4 + 0.2, age = reduced ? 1.2 + hash2(i, 2, 73) * 1.6 : t - delay;
    if (age < 0) continue;
    const x = hash2(i, 3, 79) * 256 + (reduced ? 0 : Math.sin(age * 3 + i) * 6), y = -top - 8 + age * (38 + hash2(i, 4, 83) * 40);
    if (y > h - top) continue;
    const flip = reduced ? i % 2 : Math.floor(age * 8 + i) % 2;
    c.globalAlpha = reduced ? 0.9 : Math.min(1, (f.duration - t) / 0.4);
    c.fillStyle = palette[i % palette.length];
    c.fillRect(Math.round(x), Math.round(y), flip ? 2 : 1, flip ? 1 : 2);
  }
  // Sparkles twinkle around the banner area.
  for (let i = 0; i < 10 + tier * 4; i++) {
    const tw = reduced ? 0.8 : Math.max(0, Math.sin(t * 6 + i * 1.7));
    if (tw < 0.3) continue;
    const x = 20 + hash2(i, 5, 89) * 216, y = reelCenter(h) - top - 50 + hash2(i, 6, 97) * 90;
    c.globalAlpha = tw; c.fillStyle = '#ffffff';
    c.fillRect(Math.round(x), Math.round(y) - 1, 1, 3); c.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
  }
  if (tier >= 3 && !reduced) {
    c.globalCompositeOperation = 'lighter'; c.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const r = ((t * 110 + k * 55) % 165) + 6;
      c.globalAlpha = 0.3 * (1 - r / 171); c.strokeStyle = hue(t, 120, k * 120);
      c.beginPath(); c.arc(128, reelCenter(h) - top, r, 0, Math.PI * 2); c.stroke();
    }
  }
  c.restore();
}

/** Screen space: the locked reels for a moment, then one white flash (never repeated, so it stays photosensitivity-safe). */
export function drawWinScreen(c: CanvasRenderingContext2D, f: FxFrame, plan: ReachPlan, rows: FriendRows | null, h: number): void {
  const { t, reduced } = f;
  if (!reduced && t < 0.55) {
    c.fillStyle = `rgba(6,3,10,${(0.6 * Math.max(0, 1 - t / 0.55)).toFixed(3)})`; c.fillRect(0, 0, 256, h);
    drawLockedReels(c, plan, rows, h, Math.min(1, Math.max(0, (0.55 - t) / 0.25)), P.goldHi);
  }
  if (!reduced && t >= WIN_FLASH_AT && t < WIN_FLASH_AT + 0.35) {
    c.fillStyle = `rgba(255,255,255,${(0.6 * (1 - (t - WIN_FLASH_AT) / 0.35)).toFixed(3)})`; c.fillRect(0, 0, 256, h);
  }
}
