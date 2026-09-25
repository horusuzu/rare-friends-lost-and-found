/**
 * First-person (VR-style) coaster view. The camera rides in the second row: pitch follows the rail,
 * so cresting a hill tips the nose down and the track falls away. Lateral curves and banking are
 * visual only; the simulation stays a 2-D profile. The player's Friend rides in the front seat.
 */
import { trackHeight, trackSlope, ringsBetween, LAUNCH_LENGTH, type State } from './engine.js';

export const VIEW_H = 480;
/** Canvas height is fixed; width follows the stage's aspect ratio so phones are not letterboxed. */
export const viewWidth = (aspect: number) => Math.round(VIEW_H * Math.max(0.55, Math.min(2.2, aspect)));
export type Sprite = readonly string[];
export interface Camera { pitch: number; roll: number; focal: number; shake: number }
export interface Trail { x: number; y: number }

const EYE = 2.1, GAUGE = 0.75, GROUND = -14, FAR = 300;
const PALETTE = {
  skyTop: '#1d1446', skyMid: '#8a2f6b', skyLow: '#ff8a4c', sun: '#ffd36b', fuji: '#3b2a5c', snow: '#f3ecff',
  groundNear: '#1a1130', groundFar: '#3a2150', grid: 'rgba(255,140,120,.22)', rail: '#ff3d3d', tie: '#5b3d80',
  steel: 'rgba(255,120,110,.45)', spark: '#ffe066', gate: '#5ff2ff', car: '#ff3d3d', stripe: '#ffd36b',
};

/** Visual-only lateral curve, flat on the launch rail and easing in afterwards. */
function lateral(x: number, seed: number): number {
  if (x <= LAUNCH_LENGTH) return 0;
  const phase = (seed % 997) / 158.7, ramp = Math.min(1, (x - LAUNCH_LENGTH) / 80);
  const ease = ramp * ramp * (3 - 2 * ramp);
  return ease * (16 * Math.sin(x / 110 + phase) + 6 * Math.sin(x / 47 + phase * 2));
}
const lateralSlope = (x: number, seed: number) => (lateral(x + 0.5, seed) - lateral(x - 0.5, seed));
const lateralCurve = (x: number, seed: number) => lateral(x + 1, seed) - 2 * lateral(x, seed) + lateral(x - 1, seed);

const speedOf = (s: State) => s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
function targetPitch(s: State): number {
  // Look slightly ahead on the rail so the nose starts tipping just before the drop.
  return s.grounded ? Math.atan(trackSlope(s.x + 3, s.seed)) : Math.atan2(s.vy, Math.max(1, s.vx));
}

export function newCamera(s: State): Camera { return { pitch: targetPitch(s), roll: 0, focal: 1, shake: 0 }; }

export function followCamera(cam: Camera, s: State, dt: number): Camera {
  const speed = speedOf(s), k = Math.min(1, dt * 9);
  const roll = Math.max(-0.45, Math.min(0.45, -lateralCurve(s.x, s.seed) * speed * speed * 0.08));
  // Wider field of view as speed rises.
  const focal = 1 - Math.min(0.32, speed / 320) - (s.turboTime > 0 ? 0.14 : 0);
  return {
    pitch: cam.pitch + (targetPitch(s) - cam.pitch) * k,
    roll: cam.roll + (roll - cam.roll) * Math.min(1, dt * 4),
    focal: cam.focal + (focal - cam.focal) * Math.min(1, dt * 3),
    shake: Math.max(0, cam.shake - dt * 3),
  };
}

function bitmap(c: CanvasRenderingContext2D, rows: Sprite, x: number, y: number, size: number, color: string): void {
  c.fillStyle = color;
  const cell = size / rows[0].length;
  rows.forEach((row, j) => [...row].forEach((p, i) => {
    if (p === '#') c.fillRect(x - size / 2 + i * cell, y - size / 2 + j * cell, cell + 0.5, cell + 0.5);
  }));
}

interface Point { x: number; y: number; z: number }

export function drawRush(c: CanvasRenderingContext2D, s: State, cam: Camera, friend: Sprite | null, _trail: readonly Trail[], reduced: boolean, shout: string | null = null): void {
  // Drawing is in VIEW_H units; the caller scales the context when the backing store is larger (high-DPR phones).
  const W = c.canvas.width * VIEW_H / c.canvas.height, H = VIEW_H, cx = W / 2, cy = H * 0.46;
  const f = H * 0.95 * cam.focal, speed = speedOf(s);
  const camY = s.y + EYE, lat0 = lateral(s.x, s.seed), heading = lateralSlope(s.x, s.seed);
  const sinP = Math.sin(cam.pitch), cosP = Math.cos(cam.pitch);
  const shakeX = reduced ? 0 : Math.sin(s.time * 90) * cam.shake * 7, shakeY = reduced ? 0 : Math.cos(s.time * 77) * cam.shake * 7;
  const rumble = reduced || !s.grounded ? 0 : Math.sin(s.time * 60) * Math.min(1.5, speed / 60);

  /** World point → screen: d metres ahead, h metres above the eye, l metres to the right of the heading. */
  const project = (d: number, h: number, l: number): Point | null => {
    const z = d * cosP + h * sinP, u = -d * sinP + h * cosP;
    if (z < 0.4) return null;
    return { x: cx + (l / z) * f, y: cy - (u / z) * f, z };
  };
  const at = (wx: number, wy: number, offset = 0) =>
    project(wx - s.x, wy - camY, lateral(wx, s.seed) - lat0 - heading * (wx - s.x) + offset);

  c.save();
  c.fillStyle = PALETTE.skyTop; c.fillRect(0, 0, W, H);
  c.translate(cx + shakeX, cy + shakeY + rumble); c.rotate(reduced ? 0 : cam.roll); c.translate(-cx, -cy);
  const reach = Math.hypot(W, H);
  const horizon = cy + Math.tan(cam.pitch) * f;

  // Sky and ground split at the horizon, which rises as the nose drops.
  const sky = c.createLinearGradient(0, horizon - H, 0, horizon);
  sky.addColorStop(0, PALETTE.skyTop); sky.addColorStop(0.6, s.screamTime > 0 ? '#c2267d' : PALETTE.skyMid); sky.addColorStop(1, PALETTE.skyLow);
  c.fillStyle = sky; c.fillRect(cx - reach, horizon - reach * 2, reach * 2, reach * 2);
  const ground = c.createLinearGradient(0, horizon, 0, horizon + H);
  ground.addColorStop(0, PALETTE.groundFar); ground.addColorStop(1, PALETTE.groundNear);
  c.fillStyle = ground; c.fillRect(cx - reach, horizon, reach * 2, reach * 2);

  // Sun and Mt. Fuji sit on the horizon and swing with the heading.
  const fujiX = cx + (-0.35 - heading) * f * 1.4;
  c.fillStyle = PALETTE.sun; c.globalAlpha = 0.9;
  c.beginPath(); c.arc(fujiX + f * 0.55, horizon - H * 0.09, H * 0.08, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  const fw = H * 0.62, fh = H * 0.3;
  c.fillStyle = PALETTE.fuji;
  c.beginPath(); c.moveTo(fujiX - fw, horizon + 2); c.lineTo(fujiX - fw * 0.13, horizon - fh); c.lineTo(fujiX + fw * 0.13, horizon - fh); c.lineTo(fujiX + fw, horizon + 2); c.closePath(); c.fill();
  c.fillStyle = PALETTE.snow;
  c.beginPath(); c.moveTo(fujiX - fw * 0.13, horizon - fh); c.lineTo(fujiX + fw * 0.13, horizon - fh);
  c.lineTo(fujiX + fw * 0.26, horizon - fh * 0.68); c.lineTo(fujiX + fw * 0.1, horizon - fh * 0.76); c.lineTo(fujiX, horizon - fh * 0.64);
  c.lineTo(fujiX - fw * 0.1, horizon - fh * 0.77); c.lineTo(fujiX - fw * 0.26, horizon - fh * 0.68); c.closePath(); c.fill();

  // Ground grid rushing past gives the speed.
  c.strokeStyle = PALETTE.grid; c.lineWidth = 1;
  for (let n = Math.ceil(s.x / 12) * 12; n < s.x + FAR; n += 12) {
    const p = project(n - s.x, GROUND - camY, 0);
    if (!p || p.y < horizon) continue;
    c.beginPath(); c.moveTo(cx - reach, p.y); c.lineTo(cx + reach, p.y); c.stroke();
  }

  // Sample the rail ahead, near samples dense.
  const samples: number[] = [];
  for (let d = 0.5; d < FAR; d += d < 30 ? 0.8 : d < 100 ? 1.6 : 3.2) samples.push(s.x + d);
  const rails = samples.map(wx => {
    const wy = trackHeight(wx, s.seed);
    return { wx, wy, left: at(wx, wy, -GAUGE), right: at(wx, wy, GAUGE), base: at(wx, GROUND) };
  });

  // Far to near: supports, ties, rail segments, fading with distance.
  for (let i = rails.length - 1; i > 0; i--) {
    const a = rails[i], b = rails[i - 1];
    if (!a.left || !a.right || !b.left || !b.right) continue;
    const fog = Math.max(0.15, 1 - a.left.z / FAR);
    c.globalAlpha = fog;
    if (Math.floor(a.wx / 7) !== Math.floor(b.wx / 7) && a.base) {
      c.strokeStyle = PALETTE.steel; c.lineWidth = Math.max(1, 0.35 * f / a.left.z);
      const mid = { x: (a.left.x + a.right.x) / 2, y: (a.left.y + a.right.y) / 2 };
      c.beginPath(); c.moveTo(mid.x, mid.y); c.lineTo(a.base.x, a.base.y); c.stroke();
    }
    if (Math.floor(a.wx / 1.6) !== Math.floor(b.wx / 1.6)) {
      c.strokeStyle = PALETTE.tie; c.lineWidth = Math.max(1, 0.22 * f / a.left.z);
      c.beginPath(); c.moveTo(a.left.x, a.left.y); c.lineTo(a.right.x, a.right.y); c.stroke();
    }
    c.strokeStyle = a.wx < LAUNCH_LENGTH ? PALETTE.gate : PALETTE.rail; c.lineWidth = Math.max(1.2, 0.16 * f / a.left.z);
    c.beginPath(); c.moveTo(a.left.x, a.left.y); c.lineTo(b.left.x, b.left.y); c.moveTo(a.right.x, a.right.y); c.lineTo(b.right.x, b.right.y); c.stroke();
  }
  c.globalAlpha = 1;

  // Sparks, boost gates and the checkpoint arch, far to near.
  const collected = new Set(s.collected);
  const rings = ringsBetween(s.x + 1, s.x + 160, s.seed).filter(r => !collected.has(r.id)).reverse();
  for (const ring of rings) {
    const p = at(ring.x, ring.y);
    if (!p) continue;
    const r = f / p.z;
    if (ring.kind === 'turbo') {
      // Glowing turbo capsule with a lightning bolt.
      const pulse = reduced ? 1 : 1 + Math.sin(s.time * 8) * 0.12, rr = 1.3 * r * pulse;
      c.shadowColor = PALETTE.gate; c.shadowBlur = reduced ? 0 : 20;
      c.fillStyle = '#0f2c3d'; c.strokeStyle = PALETTE.gate; c.lineWidth = Math.max(2, 0.3 * r);
      c.beginPath(); c.roundRect(p.x - rr, p.y - rr * 1.3, rr * 2, rr * 2.6, rr * 0.9); c.fill(); c.stroke(); c.shadowBlur = 0;
      c.fillStyle = PALETTE.spark; c.beginPath();
      c.moveTo(p.x + rr * 0.2, p.y - rr); c.lineTo(p.x - rr * 0.45, p.y + rr * 0.1); c.lineTo(p.x, p.y + rr * 0.1);
      c.lineTo(p.x - rr * 0.2, p.y + rr); c.lineTo(p.x + rr * 0.45, p.y - rr * 0.1); c.lineTo(p.x, p.y - rr * 0.1); c.closePath(); c.fill();
      if (r > 6) { c.fillStyle = PALETTE.gate; c.font = `italic 900 ${Math.min(34, Math.max(10, r))}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillText('TURBO', p.x, p.y - rr * 1.7); }
    } else if (ring.kind === 'spark') {
      const spin = reduced ? 1 : Math.abs(Math.cos(s.time * 5 + ring.id));
      c.strokeStyle = PALETTE.spark; c.lineWidth = Math.max(1.5, 0.25 * r);
      c.beginPath(); c.ellipse(p.x, p.y, Math.max(1, 0.9 * r * spin), 0.9 * r, 0, 0, Math.PI * 2); c.stroke();
    } else {
      c.strokeStyle = PALETTE.gate; c.lineWidth = Math.max(2, 0.45 * r); c.shadowColor = PALETTE.gate; c.shadowBlur = reduced ? 0 : 16;
      c.beginPath(); c.ellipse(p.x, p.y - 1.8 * r, 3.2 * r, 3.2 * r, 0, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
      c.fillStyle = PALETTE.gate; c.font = `italic 900 ${Math.max(10, Math.min(40, 1.4 * r))}px system-ui, sans-serif`; c.textAlign = 'center';
      c.fillText('BOOST', p.x, p.y - 5.4 * r);
    }
  }
  const arch = s.nextCheckpoint - s.x < 180 ? at(s.nextCheckpoint, trackHeight(s.nextCheckpoint, s.seed)) : null;
  if (arch) {
    const r = f / arch.z;
    c.strokeStyle = PALETTE.spark; c.lineWidth = Math.max(2, 0.4 * r);
    c.strokeRect(arch.x - 3.4 * r, arch.y - 7 * r, 6.8 * r, 7 * r);
    c.fillStyle = PALETTE.spark; c.font = `italic 900 ${Math.max(10, Math.min(44, 1.3 * r))}px system-ui, sans-serif`; c.textAlign = 'center';
    c.fillText('CHECKPOINT', arch.x, arch.y - 7.6 * r);
  }
  c.restore();

  // Rushing streaks from the vanishing point.
  const turbo = s.turboTime > 0;
  if (!reduced && (speed > 38 || turbo)) {
    c.strokeStyle = `rgba(255,255,255,${Math.min(0.45, (speed - 38) / 120)})`; c.lineWidth = turbo ? 3 : 1.5;
    for (let i = 0; i < (turbo ? 40 : 22); i++) {
      if (turbo) c.strokeStyle = `hsla(${(i * 37 + s.time * 600) % 360} 100% 70% / .7)`;
      const angle = i * 2.39996 + Math.floor(s.time * 30) * 0.7, r0 = (((s.time * speed * 9) + i * 97) % (W * 0.7)) + H * 0.12;
      const r1 = r0 + speed * 1.4;
      c.beginPath(); c.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0); c.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1); c.stroke();
    }
  }
  if (turbo && !reduced && 1.6 - s.turboTime < 0.18) {
    c.fillStyle = `rgba(95,242,255,${(0.18 - (1.6 - s.turboTime)) * 3})`; c.fillRect(0, 0, W, H);
  }
  const vignette = c.createRadialGradient(cx, cy, H * 0.3, cx, cy, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, `rgba(10,4,24,${Math.min(0.75, 0.25 + speed / 220)})`);
  c.fillStyle = vignette; c.fillRect(0, 0, W, H);

  // The front of the train: the Friend rides the front seat, arms up when screaming.
  const bob = reduced ? 0 : rumble * 0.8;
  const seatY = H * 0.93 + bob, size = Math.min(H * 0.24, W * 0.3), fx = cx - W * 0.2;
  if (friend) {
    const screaming = shout !== null;
    if (screaming) {
      c.fillStyle = '#f4ffe6';
      const lift = reduced ? 0 : Math.sin(s.time * 14) * 3;
      c.fillRect(fx - size * 0.52, seatY - size * 1.28 + lift, size * 0.1, size * 0.5);
      c.fillRect(fx + size * 0.42, seatY - size * 1.28 - lift, size * 0.1, size * 0.5);
    }
    bitmap(c, friend, fx, seatY - size * 0.62, size, s.screamTime > 0 ? '#fff7a8' : '#f4ffe6');
  }
  c.fillStyle = PALETTE.car;
  c.beginPath(); c.moveTo(0, H); c.lineTo(W * 0.06, H * 0.84 + bob); c.lineTo(W * 0.94, H * 0.84 + bob); c.lineTo(W, H); c.closePath(); c.fill();
  c.fillStyle = PALETTE.stripe; c.fillRect(W * 0.08, H * 0.87 + bob, W * 0.84, H * 0.018);
  c.strokeStyle = '#d7d2e6'; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(W * 0.36, H * 0.84 + bob); c.quadraticCurveTo(W * 0.5, H * 0.76 + bob, W * 0.64, H * 0.84 + bob); c.stroke();
  c.lineCap = 'butt';

  if (shout) {
    c.font = `italic 900 ${Math.round(H * 0.06)}px system-ui, sans-serif`; c.textAlign = 'left';
    const bx = Math.min(fx + size * 0.55, W - H * 0.42), by = seatY - size * 1.15;
    c.lineWidth = 5; c.strokeStyle = '#1d1446'; c.strokeText(shout, bx, by);
    c.fillStyle = '#fff36b'; c.fillText(shout, bx, by);
  }
}
