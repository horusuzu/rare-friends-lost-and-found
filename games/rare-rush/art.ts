/** Canvas renderer for Rare Rush: dusk sky, Fuji silhouette, red steel rail, the player's Friend in the lead car. */
import { trackHeight, trackSlope, ringsBetween, LAUNCH_LENGTH, type State } from './engine.js';

/** Canvas height is fixed; width follows the stage's aspect ratio so phones are not letterboxed. */
export const VIEW_H = 480;
export const viewWidth = (aspect: number) => Math.round(VIEW_H * Math.max(0.55, Math.min(2.2, aspect)));
const CAR_SCALE = 1.8;
export type Sprite = readonly string[];
export interface Camera { x: number; y: number; scale: number; shake: number }
export interface Trail { x: number; y: number }

const PALETTE = {
  skyTop: '#1d1446', skyMid: '#8a2f6b', skyLow: '#ff8a4c', sun: '#ffd36b',
  fuji: '#3b2a5c', snow: '#f3ecff', hills: '#22183a', ground: '#140f24',
  rail: '#ff3d3d', railHi: '#ffd1c4', steel: 'rgba(255,120,110,.35)', spark: '#ffe066', gate: '#5ff2ff',
};

export function newCamera(s: State): Camera { return { x: s.x, y: s.y, scale: 5, shake: 0 }; }

/** Follow the car, zooming out with speed and altitude so drops read as drops. */
export function followCamera(cam: Camera, s: State, dt: number): Camera {
  const speed = s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
  const altitude = Math.max(0, s.y - trackHeight(s.x + 30, s.seed));
  const target = Math.max(1.9, Math.min(5.2, 5.2 - speed * 0.018 - altitude * 0.03));
  const k = Math.min(1, dt * 3);
  const ahead = trackHeight(s.x + 45, s.seed);
  return {
    x: s.x, y: cam.y + ((s.y * 0.65 + ahead * 0.35) - cam.y) * k,
    scale: cam.scale + (target - cam.scale) * k, shake: Math.max(0, cam.shake - dt * 3),
  };
}

function bitmap(c: CanvasRenderingContext2D, rows: Sprite, x: number, y: number, size: number, color: string): void {
  c.fillStyle = color;
  const cell = size / rows[0].length;
  rows.forEach((row, j) => [...row].forEach((p, i) => {
    if (p === '#') c.fillRect(x - size / 2 + i * cell, y - size / 2 + j * cell, cell + 0.4, cell + 0.4);
  }));
}

function backdrop(c: CanvasRenderingContext2D, cam: Camera, screamMode: boolean): void {
  const VIEW_W = c.canvas.width;
  const sky = c.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, PALETTE.skyTop); sky.addColorStop(0.55, screamMode ? '#c2267d' : PALETTE.skyMid); sky.addColorStop(1, PALETTE.skyLow);
  c.fillStyle = sky; c.fillRect(0, 0, VIEW_W, VIEW_H);
  c.fillStyle = PALETTE.sun; c.globalAlpha = 0.9;
  c.beginPath(); c.arc(VIEW_W * 0.72, VIEW_H * 0.52, 46, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  // Fuji drifts slowly: far parallax.
  const fx = VIEW_W * 0.55 - ((cam.x * 0.04) % (VIEW_W * 1.6)), base = VIEW_H * 0.78;
  for (const offset of [0, VIEW_W * 1.6]) {
    const x = fx + offset;
    c.fillStyle = PALETTE.fuji;
    c.beginPath(); c.moveTo(x - 260, base); c.lineTo(x - 38, base - 190); c.lineTo(x + 38, base - 190); c.lineTo(x + 260, base); c.closePath(); c.fill();
    c.fillStyle = PALETTE.snow;
    c.beginPath(); c.moveTo(x - 38, base - 190); c.lineTo(x + 38, base - 190); c.lineTo(x + 70, base - 130);
    c.lineTo(x + 30, base - 145); c.lineTo(x + 5, base - 125); c.lineTo(x - 22, base - 148); c.lineTo(x - 70, base - 130); c.closePath(); c.fill();
  }
  c.fillStyle = PALETTE.hills;
  const hx = -((cam.x * 0.25) % 160);
  c.beginPath(); c.moveTo(0, VIEW_H);
  for (let x = hx - 160; x <= VIEW_W + 160; x += 80) c.lineTo(x, VIEW_H * 0.8 - ((Math.floor((x - hx) / 80) % 2) ? 28 : 8));
  c.lineTo(VIEW_W, VIEW_H); c.closePath(); c.fill();
}

export function drawRush(c: CanvasRenderingContext2D, s: State, view: Camera, friend: Sprite | null, trail: readonly Trail[], reduced: boolean, shout: string | null = null): void {
  const VIEW_W = c.canvas.width;
  // Narrow screens zoom out so the track ahead stays readable.
  const cam = { ...view, scale: view.scale * Math.max(0.62, Math.min(1.15, VIEW_W / 640)) };
  const shakeX = reduced ? 0 : Math.sin(s.time * 90) * cam.shake * 6, shakeY = reduced ? 0 : Math.cos(s.time * 77) * cam.shake * 6;
  const sx = (x: number) => VIEW_W * 0.32 + (x - cam.x) * cam.scale + shakeX;
  const sy = (y: number) => VIEW_H * 0.58 - (y - cam.y) * cam.scale + shakeY;
  const screamMode = s.screamTime > 0;
  backdrop(c, cam, screamMode);
  const left = cam.x - VIEW_W * 0.32 / cam.scale - 4, right = cam.x + VIEW_W * 0.68 / cam.scale + 4;

  // Steel supports and lattice.
  c.strokeStyle = PALETTE.steel; c.lineWidth = 1.5;
  const spacing = 6, first = Math.floor(left / spacing) * spacing;
  for (let x = first; x < right; x += spacing) {
    const top = sy(trackHeight(x, s.seed));
    c.beginPath(); c.moveTo(sx(x), top); c.lineTo(sx(x), VIEW_H); c.stroke();
    const nextTop = sy(trackHeight(x + spacing, s.seed));
    c.beginPath(); c.moveTo(sx(x), top + 14); c.lineTo(sx(x + spacing), Math.min(VIEW_H, nextTop + 44)); c.stroke();
  }
  c.fillStyle = PALETTE.ground; c.fillRect(0, VIEW_H - 14, VIEW_W, 14);

  // Launch rail markings and the rail itself.
  if (left < LAUNCH_LENGTH) {
    c.fillStyle = 'rgba(95,242,255,.55)';
    for (let x = 16; x < LAUNCH_LENGTH; x += 8) c.fillRect(sx(x), sy(0) + 4, 4 * cam.scale * 0.6, 3);
  }
  for (const [color, width, lift] of [[PALETTE.rail, 5, 0], [PALETTE.railHi, 1.5, -1.5]] as const) {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    for (let x = left; x <= right; x += 1.5) { const px = sx(x), py = sy(trackHeight(x, s.seed)) + lift; if (x === left) c.moveTo(px, py); else c.lineTo(px, py); }
    c.stroke();
  }

  // Checkpoint arch.
  if (s.nextCheckpoint > left && s.nextCheckpoint < right) {
    const ax = sx(s.nextCheckpoint), ay = sy(trackHeight(s.nextCheckpoint, s.seed));
    c.strokeStyle = PALETTE.spark; c.lineWidth = 3; c.strokeRect(ax - 3, ay - 14 * cam.scale, 6, 14 * cam.scale);
    c.fillStyle = PALETTE.spark; c.font = 'italic 900 14px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText('CHECKPOINT', ax, ay - 14 * cam.scale - 6);
  }

  // Sparks and boost gates.
  const collected = new Set(s.collected);
  for (const ring of ringsBetween(left, right, s.seed)) {
    if (collected.has(ring.id)) continue;
    const rx = sx(ring.x), ry = sy(ring.y);
    if (ring.kind === 'spark') {
      const spin = reduced ? 1 : Math.abs(Math.cos(s.time * 5 + ring.id));
      c.strokeStyle = PALETTE.spark; c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(rx, ry, Math.max(1, 0.9 * cam.scale * spin), 0.9 * cam.scale, 0, 0, Math.PI * 2); c.stroke();
    } else {
      c.strokeStyle = PALETTE.gate; c.lineWidth = 4; c.shadowColor = PALETTE.gate; c.shadowBlur = reduced ? 0 : 14;
      c.beginPath(); c.ellipse(rx, ry - 2 * cam.scale, 1.4 * cam.scale, 3.6 * cam.scale, 0, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0; c.fillStyle = PALETTE.gate; c.font = 'italic 900 12px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('BOOST', rx, ry - 6.2 * cam.scale);
    }
  }

  // Scream-mode afterimage trail.
  if (screamMode && !reduced) trail.forEach((p, i) => {
    c.globalAlpha = (i + 1) / trail.length * 0.35;
    c.fillStyle = `hsl(${(s.time * 360 + i * 30) % 360} 100% 65%)`;
    c.beginPath(); c.arc(sx(p.x), sy(p.y) - 1.6 * cam.scale, 1.3 * cam.scale, 0, Math.PI * 2); c.fill();
  });
  c.globalAlpha = 1;

  // Speed streaks.
  const speed = s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
  if (!reduced && speed > 50) {
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const y = (i * 67 + Math.floor(s.time * 40) * 13) % VIEW_H, x = (i * 151 + s.time * 1400) % (VIEW_W + 200) - 100;
      c.beginPath(); c.moveTo(VIEW_W - x, y); c.lineTo(VIEW_W - x + (speed - 40) * 2.2, y); c.stroke();
    }
  }

  // The car, tilted to the rail (or to its flight path), with the Friend riding up front.
  const angle = s.grounded ? Math.atan(trackSlope(s.x, s.seed)) : Math.atan2(s.vy, Math.max(1, s.vx));
  const unit = Math.max(7, cam.scale * CAR_SCALE); // keep the Friend readable when zoomed out
  c.save(); c.translate(sx(s.x), sy(s.y)); c.rotate(-angle);
  if (friend) bitmap(c, friend, 0.2 * unit, -3.5 * unit, 3.6 * unit, screamMode ? '#fff7a8' : '#f4ffe6');
  c.fillStyle = '#ff3d3d'; c.beginPath(); c.roundRect(-2.8 * unit, -2.2 * unit, 5.6 * unit, 2 * unit, 0.5 * unit); c.fill();
  c.fillStyle = '#ffd36b'; c.fillRect(-2.8 * unit, -1.4 * unit, 5.6 * unit, 0.35 * unit);
  c.fillStyle = '#1a1030';
  for (const wx of [-1.8, 1.8]) { c.beginPath(); c.arc(wx * unit, -0.1 * unit, 0.45 * unit, 0, Math.PI * 2); c.fill(); }
  c.restore();
  if (shout) {
    const bx = Math.max(8, Math.min(sx(s.x) + 2.5 * unit, VIEW_W - 170)), by = Math.max(30, sy(s.y) - 8.5 * unit);
    c.font = 'italic 900 22px system-ui, sans-serif'; c.textAlign = 'left';
    c.lineWidth = 5; c.strokeStyle = '#1d1446'; c.strokeText(shout, bx, by);
    c.fillStyle = '#fff36b'; c.fillText(shout, bx, by);
  }
}
