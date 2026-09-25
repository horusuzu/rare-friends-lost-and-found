/**
 * The burn on the mine canvas: the reels show the miss, a beat of silence, one dim orange flash, then the cart bursts
 * into flame with rising embers, charred coin crumbs falling off the rim and smoke drifting up. Stateless: every frame
 * is a pure function of the show clock. Reduced motion gets a still fire with no flash.
 */
import { PALETTE as P, hash2, type FriendRows } from './art.ts';
import { CART, FLOOR_Y } from './layout.ts';
import { LOSE_BEAT, type ReachPlan } from './reach.ts';
import type { FxFrame } from './fx-show.ts';
import { drawLockedReels } from './fx-reach.ts';

const EMBERS = 36, SMOKE = 8, CRUMBS = 16;

/** Fire strength 0–1: up fast after the beat, holding, then dying down before the card fades. */
export function fireLevel(t: number, duration: number, reduced: boolean): number {
  if (reduced) return 0.7;
  if (t < LOSE_BEAT) return 0;
  return Math.max(0, Math.min(1, (t - LOSE_BEAT) / 0.15, (duration - 0.2 - t) / 0.9));
}

/** Screen shake offset in pixels (0 with reduced motion): a short jolt after the beat. */
export function loseShake(f: FxFrame): number {
  if (f.reduced || f.t < LOSE_BEAT || f.t > LOSE_BEAT + 0.45) return 0;
  const k = 1 - (f.t - LOSE_BEAT) / 0.45;
  return Math.round((hash2(Math.floor(f.t * 40), 3, 7) - 0.5) * 4 * k);
}

/** Scene space, in front of the cart. */
export function drawLoseFront(c: CanvasRenderingContext2D, f: FxFrame, h: number, top: number): void {
  const { t, reduced } = f, fire = fireLevel(t, f.duration, reduced);
  c.save();
  if (fire > 0) { c.fillStyle = `rgba(40,6,0,${(0.24 * fire).toFixed(3)})`; c.fillRect(0, -top, 256, h); }
  // Smoke first so the flames glow over it.
  for (let i = 0; i < SMOKE && !reduced; i++) {
    const age = t - LOSE_BEAT - i * 0.12;
    if (age <= 0 || age > 1.6) continue;
    c.globalAlpha = 0.32 * (1 - age / 1.6); c.fillStyle = i % 2 ? P.smoke : '#2e2522';
    c.beginPath(); c.arc(CART.x + 8 + hash2(i, 1, 13) * (CART.w - 16), CART.y - 6 - age * 30, 4 + age * 12, 0, Math.PI * 2); c.fill();
  }
  if (fire > 0) {
    const frame = reduced ? 0 : Math.floor(t * 12), mix = reduced ? 0 : t * 12 - frame;
    for (let x = CART.x - 6; x < CART.x + CART.w + 6; x += 2) {
      const edge = 1 - Math.abs(x - (CART.x + CART.w / 2)) / (CART.w / 2 + 8);
      const n = hash2(x >> 1, frame, 19) * (1 - mix) + hash2(x >> 1, frame + 1, 19) * mix;
      const tall = Math.round(fire * (6 + 22 * edge) * (0.6 + 0.6 * n));
      if (tall <= 0) continue;
      const base = CART.y + 6;
      c.globalAlpha = 0.95;
      c.fillStyle = P.burn; c.fillRect(x, base - Math.round(tall * 0.45), 2, Math.round(tall * 0.45));
      c.fillStyle = P.ember; c.fillRect(x, base - Math.round(tall * 0.8), 2, Math.round(tall * 0.35));
      c.fillStyle = P.flame; c.fillRect(x, base - tall, 2, Math.round(tall * 0.2) + 1);
      if (tall > 14) { c.fillStyle = P.goldHi; c.fillRect(x, base - tall, 2, 1); }
    }
  }
  for (let i = 0; i < EMBERS && !reduced; i++) {
    const age = t - LOSE_BEAT - hash2(i, 2, 29) * 1.1, life = 0.7 + hash2(i, 3, 31) * 0.6;
    if (age <= 0 || age > life) continue;
    const x = CART.x + hash2(i, 4, 37) * CART.w + Math.sin(age * 5 + i) * 3, y = CART.y - age * (28 + hash2(i, 5, 41) * 40);
    c.globalAlpha = 1 - age / life; c.fillStyle = age / life < 0.5 ? P.flame : P.ember;
    c.fillRect(Math.round(x), Math.round(y), i % 4 ? 1 : 2, 1);
  }
  for (let i = 0; i < CRUMBS && !reduced; i++) {
    const age = t - LOSE_BEAT - 0.4 - hash2(i, 6, 43) * 0.7;
    if (age <= 0) continue;
    const side = i % 2 ? CART.x + CART.w + 1 : CART.x - 2, x = side + (i % 2 ? 1 : -1) * age * (10 + hash2(i, 7, 47) * 14);
    const y = Math.min(FLOOR_Y - 2, CART.y + 2 + 130 * age * age);
    c.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.6) / 0.6); c.fillStyle = i % 3 ? '#2a1f1a' : P.smoke;
    c.fillRect(Math.round(x), Math.round(y), 2, i % 3 ? 2 : 1);
  }
  c.restore();
}

/** Screen space: the missed reels for a beat, then a single dim orange flash (never a red strobe). */
export function drawLoseScreen(c: CanvasRenderingContext2D, f: FxFrame, plan: ReachPlan, rows: FriendRows | null, h: number): void {
  const { t, reduced } = f;
  if (!reduced && t < LOSE_BEAT + 0.25) {
    const a = Math.min(1, Math.max(0, (LOSE_BEAT + 0.25 - t) / 0.25));
    c.fillStyle = `rgba(6,3,10,${(0.6 * a).toFixed(3)})`; c.fillRect(0, 0, 256, h);
    drawLockedReels(c, plan, rows, h, a, '#7a2a1a');
  }
  if (!reduced && t >= LOSE_BEAT && t < LOSE_BEAT + 0.4) {
    c.fillStyle = `rgba(255,96,32,${(0.26 * (1 - (t - LOSE_BEAT) / 0.4)).toFixed(3)})`; c.fillRect(0, 0, 256, h);
  }
}
