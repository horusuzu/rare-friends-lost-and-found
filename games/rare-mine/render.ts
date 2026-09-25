/**
 * Canvas presentation of the mine: shaft backdrop, the rock face, the Friend with its pickaxe, the cart pile,
 * the safe jar and every flying coin, spark and flame. Visual only: it reads engine state and never changes it.
 */
import { ROCK_HP } from './economy.ts';
import type { MineState } from './game.ts';
import { COIN_EDGE, COIN_EDGE_BURN, LANTERN, PICK, PALETTE as P, drawFriend, drawSprite, hash2, jarLevel, pileCount, type FriendRows } from './art.ts';
import { createParticles, type Cue, type Particles } from './particles.ts';
import { CART, FLOOR_Y, IMPACT, JAR, ROCK_X, SCENE_H, SCENE_H_MAX, SCENE_W } from './layout.ts';

export { SCENE_W, SCENE_H, sceneHeight } from './layout.ts';
const CEILING = SCENE_H_MAX - SCENE_H;
const FRIEND = { x: 132, y: 80, size: 48 } as const;
const MOUND = [6, 6, 6, 5, 5, 4, 4, 3, 2, 2, 1];
const HEAP = [5, 4, 4, 3, 2, 1];

export interface Scene {
  /** Forget queued effects (a new or reloaded mine starts with a quiet scene). */
  reset(s: MineState): void;
  /** Draw one frame on a canvas `h` rows tall (160–224); returns the sound cues due this frame. */
  draw(c: CanvasRenderingContext2D, s: MineState, rows: FriendRows | null, now: number, reduced: boolean, h?: number): Cue[];
}

let backdrop: HTMLCanvasElement | null = null;
function drawBackdrop(): HTMLCanvasElement {
  if (backdrop) return backdrop;
  const el = document.createElement('canvas'); el.width = SCENE_W; el.height = SCENE_H_MAX;
  const c = el.getContext('2d');
  if (!c) return el;
  c.translate(0, CEILING);
  for (let y = -CEILING; y < FLOOR_Y; y++) for (let x = 0; x < SCENE_W; x++) {
    const v = hash2(x >> 2, y >> 2, 3) * 0.7 + hash2(x, y, 5) * 0.3;
    c.fillStyle = v > 0.82 ? P.rockHi : v > 0.5 ? P.rock : v > 0.22 ? P.rockLo : P.rockDeep;
    c.fillRect(x, y, 1, 1);
  }
  c.fillStyle = '#2a201b'; c.fillRect(0, FLOOR_Y, SCENE_W, SCENE_H - FLOOR_Y);
  for (let x = 0; x < SCENE_W; x++) for (let y = FLOOR_Y; y < SCENE_H; y++) if (hash2(x, y, 9) > 0.9) { c.fillStyle = P.rockLo; c.fillRect(x, y, 1, 1); }
  for (let x = 2; x < SCENE_W; x += 8) { c.fillStyle = P.woodLo; c.fillRect(x, FLOOR_Y + 2, 5, 3); }
  c.fillStyle = P.railHi; c.fillRect(0, FLOOR_Y + 1, SCENE_W, 1); c.fillStyle = P.rail; c.fillRect(0, FLOOR_Y + 4, SCENE_W, 1);
  // Timber supports: two posts running up the shaft, a cap beam and (on tall screens) upper beams and braces.
  const top = -CEILING + 10;
  for (const px of [40, 170]) {
    c.fillStyle = P.woodLo; c.fillRect(px, top, 7, FLOOR_Y - top);
    c.fillStyle = P.wood; c.fillRect(px + 1, top, 5, FLOOR_Y - top);
    c.fillStyle = P.woodHi; c.fillRect(px + 1, top, 1, FLOOR_Y - top);
  }
  for (const by of [8, -48, -96]) { c.fillStyle = P.woodLo; c.fillRect(30, by, 156, 8); c.fillStyle = P.wood; c.fillRect(30, by + 1, 156, 5); c.fillStyle = P.woodHi; c.fillRect(30, by + 1, 156, 1); }
  for (let i = 0; i < 40; i++) {
    c.fillStyle = P.woodLo; c.fillRect(47 + i * 3, -40 + i, 4, 3); c.fillStyle = P.wood; c.fillRect(47 + i * 3, -40 + i, 3, 2);
  }
  c.fillStyle = P.ink; c.fillRect(117, 16, 1, 6);
  drawCeiling(c);
  return (backdrop = el);
}

/** Portrait-only ceiling: stalactites along the top edge and a few embedded crystals. */
function drawCeiling(c: CanvasRenderingContext2D): void {
  for (let x = 0; x < SCENE_W; x += 3) {
    const len = 4 + Math.floor(hash2(x, 1, 41) * 14) * (hash2(x, 2, 43) > 0.55 ? 1 : 0.3);
    for (let j = 0; j < len; j++) {
      const w = Math.max(1, Math.round(3 * (1 - j / len)));
      c.fillStyle = j === 0 ? P.rockDeep : hash2(x, j, 47) > 0.7 ? P.rockHi : P.rockLo;
      c.fillRect(x + Math.floor((3 - w) / 2), -CEILING + j, w, 1);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = 10 + Math.floor(hash2(i, 5, 53) * 236), y = -CEILING + 24 + Math.floor(hash2(i, 6, 59) * (CEILING - 30));
    c.fillStyle = P.gemLo; c.fillRect(x, y, 3, 2); c.fillStyle = P.gem; c.fillRect(x + 1, y - 1, 1, 2); c.fillStyle = P.gemHi; c.fillRect(x + 1, y - 1, 1, 1);
  }
}

/** The rock face: a jagged boulder wall whose shape and gold specks depend on the depth. */
function drawRock(c: CanvasRenderingContext2D, s: MineState, now: number, reduced: boolean, jolt: number): void {
  const d = s.depth;
  for (let y = 24; y < FLOOR_Y; y++) {
    const edge = ROCK_X + Math.round(6 * Math.sin(y * 0.11 + d * 1.7) + 4 * hash2(y >> 2, d, 11)) + jolt;
    for (let x = edge; x < SCENE_W; x++) {
      const v = hash2((x - jolt) >> 1, y >> 1, 17 + d);
      const lit = x - edge < 3 ? 1 : 0;
      c.fillStyle = lit ? P.dust : v > 0.8 ? P.rockHi : v > 0.35 ? P.rock : P.rockLo;
      c.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 7; i++) {
    const gx = ROCK_X + 12 + Math.floor(hash2(i, d, 23) * 60) + jolt, gy = 34 + Math.floor(hash2(i, d, 29) * 86);
    const tw = reduced ? 1 : 0.5 + 0.5 * Math.sin(now * 3 + i * 1.3);
    c.fillStyle = tw > 0.8 ? P.goldHi : P.gold; c.fillRect(gx, gy, 2, 1); c.fillRect(gx + 1, gy - 1, 1, 1);
  }
  // Cracks: three random walks from the impact point, revealed stroke by stroke as the rock takes hits.
  const damage = ROCK_HP - s.rockHp;
  if (damage <= 0) return;
  const steps = Math.ceil(damage / (ROCK_HP - 1) * 14);
  c.fillStyle = P.ink;
  for (let k = 0; k < 3; k++) {
    let x = IMPACT.x + 2 + jolt, y = IMPACT.y;
    for (let n = 0; n < steps; n++) {
      const r = hash2(n, k, 31 + d);
      x += r < 0.55 ? 1 : 0; y += k === 0 ? -1 : k === 1 ? 1 : (r > 0.5 ? 1 : -1);
      c.fillRect(x, y, 1, 1);
    }
  }
}

/** The pickaxe angle (radians) given seconds since the last swing: wind up, strike, settle. */
export function swingAngle(t: number): number {
  const rest = -0.5, raised = -2.0, hit = 0.55;
  if (t < 0.08) return rest + (raised - rest) * (t / 0.08);
  if (t < 0.16) return raised + (hit - raised) * ((t - 0.08) / 0.08);
  if (t < 0.4) return hit + (rest - hit) * ((t - 0.16) / 0.24);
  return rest;
}

let pickCanvas: HTMLCanvasElement | null = null;
function pickImage(): HTMLCanvasElement {
  if (pickCanvas) return pickCanvas;
  const el = document.createElement('canvas'); el.width = 36; el.height = 36;
  const c = el.getContext('2d');
  if (c) drawSprite(c, PICK, 0, 0, 3);
  return (pickCanvas = el);
}

function drawMiner(c: CanvasRenderingContext2D, rows: FriendRows | null, swingT: number, now: number, reduced: boolean): void {
  const bob = !reduced && swingT > 0.08 && swingT < 0.22 ? 1 : 0;
  const x = FRIEND.x, y = FRIEND.y + bob;
  c.fillStyle = '#0006'; c.fillRect(x + 6, FLOOR_Y - 1, FRIEND.size - 12, 2);
  if (rows) {
    const w = rows[0]?.length ?? 16, scale = Math.max(1, Math.floor(FRIEND.size / w)), size = w * scale;
    drawFriend(c, rows, x + (FRIEND.size - size) / 2, FLOOR_Y - rows.length * scale, scale);
  } else {
    c.fillStyle = P.ink; c.fillRect(x + 8, y + 8, 16, 24);
  }
  const angle = reduced ? (swingT < 0.2 ? 0.55 : -0.5) : swingAngle(swingT);
  c.save(); c.translate(x + 38, y + 30); c.rotate(angle);
  c.imageSmoothingEnabled = false; c.drawImage(pickImage(), -3, -33);
  c.restore();
  if (!reduced && swingT > 0.15 && swingT < 0.2) { c.fillStyle = P.goldHi; c.fillRect(IMPACT.x - 2, IMPACT.y - 1, 3, 3); }
  void now;
}

function drawPile(c: CanvasRenderingContext2D, coins: number, burning = false): void {
  const edge = burning ? COIN_EDGE_BURN : COIN_EDGE;
  let n = pileCount(coins), row = 0;
  const cx = CART.x + CART.w / 2;
  while (n > 0 && row < MOUND.length) {
    const k = Math.min(n, MOUND[row]);
    for (let i = 0; i < k; i++) drawSprite(c, edge, cx - (MOUND[row] * 6) / 2 + i * 6 + (row % 2) * 2, CART.y + 1 - row * 2);
    n -= k; row++;
  }
  row = 0;
  while (n > 0 && row < HEAP.length) {
    const k = Math.min(n, HEAP[row]);
    for (let i = 0; i < k; i++) drawSprite(c, edge, CART.x + CART.w + 4 + i * 6 + row * 3, FLOOR_Y - 3 - row * 2);
    n -= k; row++;
  }
}

function drawCart(c: CanvasRenderingContext2D): void {
  const { x, y, w } = CART;
  c.fillStyle = P.ink; c.fillRect(x - 1, y + 3, w + 2, 16);
  c.fillStyle = P.rail; c.fillRect(x, y + 4, w, 14);
  c.fillStyle = P.railHi; c.fillRect(x, y + 4, w, 2); c.fillRect(x + 6, y + 8, 1, 8); c.fillRect(x + w - 7, y + 8, 1, 8);
  c.fillStyle = P.ink;
  for (const wx of [x + 7, x + w - 13]) { c.fillRect(wx, y + 18, 6, 4); c.fillStyle = P.railHi; c.fillRect(wx + 2, y + 19, 2, 2); c.fillStyle = P.ink; }
}

function drawJar(c: CanvasRenderingContext2D, safe: number, now: number, reduced: boolean): void {
  const { x, y, w, h } = JAR, level = jarLevel(safe), fill = Math.round((h - 6) * level);
  c.fillStyle = P.woodLo; c.fillRect(x + 4, y - 4, w - 8, 4);
  c.fillStyle = '#9cc9d933'; c.fillRect(x, y, w, h);
  if (fill > 0) {
    c.fillStyle = P.goldLo; c.fillRect(x + 2, y + h - 2 - fill, w - 4, fill);
    c.fillStyle = P.gold; for (let j = 0; j < fill; j += 3) c.fillRect(x + 3 + (j % 6), y + h - 3 - j, w - 8, 1);
    c.fillStyle = P.goldHi; c.fillRect(x + 3, y + h - 2 - fill, w - 6, 1);
  }
  c.fillStyle = P.glass; c.fillRect(x, y, 1, h); c.fillRect(x + w - 1, y, 1, h); c.fillRect(x, y + h - 1, w, 1);
  c.fillStyle = P.glassHi; c.fillRect(x + 3, y + 3, 1, h - 10);
  if (!reduced && level > 0 && Math.sin(now * 2.2) > 0.96) { c.fillStyle = '#ffffff'; c.fillRect(x + w - 6, y + 6, 2, 2); }
}

function drawLight(c: CanvasRenderingContext2D, now: number, reduced: boolean, glowUp: number, top: number): void {
  const flicker = reduced ? 1 : 0.94 + 0.06 * Math.sin(now * 7.1) * Math.sin(now * 3.3);
  drawSprite(c, LANTERN, 114, 21);
  const g = c.createRadialGradient(118, 26, 4, 118, 60, 170);
  g.addColorStop(0, `rgba(255,207,110,${0.26 * flicker + glowUp})`); g.addColorStop(0.45, 'rgba(255,170,80,0.06)'); g.addColorStop(1, 'rgba(10,6,4,0.55)');
  c.fillStyle = g; c.fillRect(0, -top, SCENE_W, SCENE_H + top);
}

export function createScene(): Scene {
  const parts: Particles = createParticles();
  let swingAt = -10, rollGlow = 0;
  return {
    reset(s) { parts.reset(s); swingAt = -10; },
    draw(c, s, rows, now, reduced, h = SCENE_H) {
      const top = Math.max(0, h - SCENE_H);
      const cues = parts.intake(s, now, reduced);
      if (cues.some(q => q.k === 'tock')) swingAt = now;
      const view = parts.step(s, now, reduced);
      c.imageSmoothingEnabled = false;
      c.save();
      c.translate(0, top);
      if (!reduced && view.shake > 0) c.translate(Math.round((hash2(Math.floor(now * 60), 1) - 0.5) * 2 * view.shake), 0);
      c.drawImage(drawBackdrop(), 0, -CEILING);
      drawRock(c, s, now, reduced, !reduced && now - swingAt > 0.15 && now - swingAt < 0.2 ? 1 : 0);
      drawJar(c, view.jar, now, reduced);
      drawPile(c, view.pile);
      if (view.burning > 0) drawPile(c, view.burning, true);
      drawCart(c);
      drawMiner(c, rows, now - swingAt, now, reduced);
      rollGlow = s.phase === 'roll' && !reduced ? 0.08 + 0.06 * Math.sin(now * 18) : 0;
      parts.draw(c, now);
      drawLight(c, now, reduced, rollGlow, top);
      if (view.flash > 0) { c.fillStyle = `${view.flashColor}${Math.round(view.flash * 255).toString(16).padStart(2, '0')}`; c.fillRect(0, -top, SCENE_W, h); }
      c.restore();
      return [...cues, ...view.cues];
    },
  };
}
