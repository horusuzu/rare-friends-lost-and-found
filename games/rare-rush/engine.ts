/** Pure coaster-run simulation in metres and seconds. Score is local arcade points, never RF. */
export const LAUNCH_LENGTH = 90;
export const START_TIME = 45;
export const CHECKPOINT_EVERY = 1000;
export const CHECKPOINT_BONUS = 15;
export const MIN_SPEED = 6;
export const MAX_SPEED = 100;
export const FUJI_HEIGHT = 79;
/** Turbo lifts the cap to 432 km/h for a short burst. */
export const TURBO_MAX_SPEED = 120;
export const MAX_TURBOS = 3;
const TURBO_KICK = 20, TURBO_PUSH = 32, TURBO_TIME = 1.6, SETTLE = 30;
const GRAVITY = 24, DIVE = 1.9, AIR_DIVE = 2.8, DRAG = 0.00055, SCREAM_PUSH = 5;
const PERFECT_ANGLE = 0.35, BAD_ANGLE = 0.95, CATCH_RADIUS = 3.6, GATE_BOOST = 14;
const SCREAM_TIME = 6, PRESSURE_RISE = 1.2, STEP = 1 / 120, MIN_FLIGHT = 0.25;

export type EventKind = 'launch' | 'perfect-launch' | 'perfect' | 'bad' | 'boost' | 'checkpoint' | 'scream' | 'item' | 'turbo';
export interface RushEvent { kind: EventKind; at: number }
export interface State {
  status: 'launch' | 'running' | 'over';
  seed: number; time: number; timeLeft: number;
  x: number; y: number; vx: number; vy: number; speed: number; grounded: boolean;
  held: boolean; heldFor: number; pressure: number;
  distance: number; score: number; sparks: number; perfects: number; maxSpeed: number; airTime: number;
  /** airTime when the current flight began; landings shorter than MIN_FLIGHT are not graded. */
  takeoffAt: number;
  scream: number; screamTime: number; nextCheckpoint: number; collected: number[];
  /** turboTail: seconds after a turbo during which speed eases back under the normal cap. */
  turbos: number; turboTime: number; turboTail: number; turboHeld: boolean;
  event: RushEvent | null;
}
/** `turbo` fires once per press; holding the key does not refire. */
export interface Input { hold: boolean; turbo?: boolean }
export interface TrackPoint { x: number; y: number }
export interface Ring { id: number; kind: 'spark' | 'gate' | 'turbo'; x: number; y: number }

export const kmh = (metresPerSecond: number) => Math.round(metresPerSecond * 3.6);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Stateless hash in [0, 1). */
function hash(seed: number, k: number, salt: number): number {
  let h = Math.imul((seed >>> 0) ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const isFuji = (k: number) => k % 14 === 13;
/** Control points alternate valley (even) and crest (odd); every fourteenth segment is the 79 m giant. */
function pointHeight(seed: number, k: number): number {
  if (k === 0) return 0;
  if (k % 2 === 0) return -hash(seed, k, 1) * 8;
  if (isFuji(k)) return FUJI_HEIGHT;
  return Math.round(14 + Math.min(34, k * 0.7) + hash(seed, k, 2) * 12);
}
function segmentLength(seed: number, k: number): number {
  const base = 64 + 26 * hash(seed, k, 3) + Math.min(46, k * 0.9);
  return isFuji(k) || isFuji(k + 1) ? base * 1.45 : base;
}
const cache = new Map<number, number[]>();
function xs(seed: number, count: number): number[] {
  let list = cache.get(seed);
  if (!list) { list = [LAUNCH_LENGTH]; cache.set(seed, list); }
  while (list.length < count) list.push(list[list.length - 1] + segmentLength(seed, list.length - 1));
  return list;
}
function locate(x: number, seed: number): { k: number; t: number; length: number; rise: number } | null {
  if (x <= LAUNCH_LENGTH) return null;
  let list = xs(seed, 64);
  while (list[list.length - 1] <= x) list = xs(seed, list.length * 2);
  let lo = 0, hi = list.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (list[mid] <= x) lo = mid; else hi = mid; }
  const length = list[lo + 1] - list[lo];
  return { k: lo, t: (x - list[lo]) / length, length, rise: pointHeight(seed, lo + 1) - pointHeight(seed, lo) };
}
/** Smooth cosine-eased rail: continuous height and slope everywhere. */
export function trackHeight(x: number, seed: number): number {
  const at = locate(x, seed);
  return at ? pointHeight(seed, at.k) + at.rise * (1 - Math.cos(Math.PI * at.t)) / 2 : 0;
}
export function trackSlope(x: number, seed: number): number {
  const at = locate(x, seed);
  return at ? at.rise * Math.PI / 2 * Math.sin(Math.PI * at.t) / at.length : 0;
}
function trackCurve(x: number, seed: number): number {
  const at = locate(x, seed);
  return at ? at.rise * Math.PI * Math.PI / 2 * Math.cos(Math.PI * at.t) / (at.length * at.length) : 0;
}
export function trackPoints(count: number, seed: number): TrackPoint[] {
  return xs(seed, count).slice(0, count).map((x, k) => ({ x, y: pointHeight(seed, k) }));
}
/** Sparks arc over each crest; a launch gate sits in every sixth valley. */
export function ringsBetween(x0: number, x1: number, seed: number): Ring[] {
  const rings: Ring[] = [];
  let list = xs(seed, 64);
  while (list[list.length - 1] < x1) list = xs(seed, list.length * 2);
  for (let k = 1; k < list.length; k++) {
    const x = list[k];
    if (x < x0 - 40 || x > x1 + 40) continue;
    if (k % 2 === 1) for (let i = 0; i < 5; i++) {
      const rx = x + (i - 2) * 7;
      rings.push({ id: k * 10 + i, kind: 'spark', x: rx, y: trackHeight(rx, seed) + 5 + (2 - Math.abs(i - 2)) * 1.6 });
    } else if (k % 6 === 0) rings.push({ id: k * 10 + 9, kind: 'gate', x, y: trackHeight(x, seed) + 1.2 });
    // A turbo capsule floats down the far side of every fourth crest.
    if (k % 8 === 3) { const tx = x + 18; rings.push({ id: k * 10 + 7, kind: 'turbo', x: tx, y: trackHeight(tx, seed) + 2.2 }); }
  }
  return rings.filter(r => r.x >= x0 && r.x <= x1);
}

export function createGame(seed = 1): State {
  return {
    status: 'launch', seed: seed >>> 0, time: 0, timeLeft: START_TIME,
    x: 12, y: 0, vx: 0, vy: 0, speed: 0, grounded: true, held: false, heldFor: 0, pressure: 0,
    distance: 0, score: 0, sparks: 0, perfects: 0, maxSpeed: 0, airTime: 0, takeoffAt: 0,
    scream: 0, screamTime: 0, nextCheckpoint: CHECKPOINT_EVERY, collected: [], event: null,
    turbos: 1, turboTime: 0, turboTail: 0, turboHeld: false,
  };
}

const emit = (s: State, kind: EventKind) => { s.event = { kind, at: s.time }; };
const multiplier = (s: State) => s.screamTime > 0 ? 2 : 1;
/** Top speed: raised during turbo, then eased back down instead of snapping. */
function capped(s: State, speed: number, h: number, previous: number): number {
  const top = s.turboTime > 0 ? TURBO_MAX_SPEED : s.turboTail > 0 ? Math.max(MAX_SPEED, Math.min(TURBO_MAX_SPEED, previous) - SETTLE * h) : MAX_SPEED;
  return clamp(speed, MIN_SPEED, top);
}

function launchPhase(s: State, hold: boolean, dt: number): void {
  if (hold) {
    s.heldFor += dt;
    const phase = (s.heldFor / PRESSURE_RISE) % 2;
    s.pressure = phase <= 1 ? phase : 2 - phase;
  } else if (s.held) {
    const quality = s.pressure;
    s.status = 'running';
    s.speed = 16 + 44 * quality;
    if (quality >= 0.9) { s.scream = 0.3; emit(s, 'perfect-launch'); } else emit(s, 'launch');
  }
  s.held = hold;
}

function ride(s: State, hold: boolean, h: number): void {
  const slope = trackSlope(s.x, s.seed), angle = Math.atan(slope);
  const weight = hold ? DIVE : 1;
  let accel = -GRAVITY * Math.sin(angle) * weight - DRAG * s.speed * s.speed;
  if (s.screamTime > 0) accel += SCREAM_PUSH;
  if (s.turboTime > 0) accel = Math.max(accel, 0) + TURBO_PUSH;
  s.speed = capped(s, s.speed + accel * h, h, s.speed);
  const curve = trackCurve(s.x, s.seed) / Math.pow(1 + slope * slope, 1.5);
  if (curve < 0 && s.speed * s.speed * -curve > GRAVITY * weight * Math.cos(angle)) {
    s.grounded = false; s.takeoffAt = s.airTime; s.vx = s.speed * Math.cos(angle); s.vy = s.speed * Math.sin(angle);
    return;
  }
  s.x += s.speed * Math.cos(angle) * h;
  s.y = trackHeight(s.x, s.seed);
}

function fly(s: State, hold: boolean, h: number): void {
  const before = Math.hypot(s.vx, s.vy);
  s.vy -= GRAVITY * (hold ? AIR_DIVE : 1) * h;
  if (s.turboTime > 0) s.vx += TURBO_PUSH * h;
  const airSpeed = Math.hypot(s.vx, s.vy), top = capped(s, airSpeed, h, before);
  if (airSpeed > top) { s.vx *= top / airSpeed; s.vy *= top / airSpeed; }
  s.x += Math.max(s.vx, MIN_SPEED) * h; s.y += s.vy * h;
  s.airTime += h;
  if (s.vy < -18) s.scream += 0.3 * h;
  const ground = trackHeight(s.x, s.seed);
  if (s.y > ground) return;
  const tangent = Math.atan(trackSlope(s.x, s.seed)), heading = Math.atan2(s.vy, s.vx);
  const miss = Math.abs(heading - tangent), along = Math.hypot(s.vx, s.vy) * Math.cos(miss);
  s.y = ground; s.grounded = true;
  // Skimming a crest for a few substeps is riding, not a jump: no grade either way.
  if (s.airTime - s.takeoffAt < MIN_FLIGHT) s.speed = capped(s, along, 0, along);
  else if (miss < PERFECT_ANGLE) {
    s.speed = capped(s, along * 1.12, 0, along); s.perfects += 1; s.scream += 0.22;
    s.score += 100 * multiplier(s); emit(s, 'perfect');
  } else if (miss > BAD_ANGLE) {
    s.speed = capped(s, along * 0.75, 0, along); emit(s, 'bad');
  } else s.speed = capped(s, along, 0, along);
}

function collect(s: State): void {
  const collected = new Set(s.collected);
  for (const ring of ringsBetween(s.x - 6, s.x + 6, s.seed)) {
    if (collected.has(ring.id) || Math.hypot(ring.x - s.x, ring.y - s.y) > CATCH_RADIUS) continue;
    collected.add(ring.id);
    if (ring.kind === 'spark') { s.sparks += 1; s.score += 10 * multiplier(s); continue; }
    if (ring.kind === 'turbo') { s.turbos = Math.min(MAX_TURBOS, s.turbos + 1); emit(s, 'item'); continue; }
    s.speed = capped(s, s.speed + GATE_BOOST, 0, s.speed);
    if (!s.grounded) {
      const before = Math.hypot(s.vx, s.vy);
      s.vx += GATE_BOOST;
      const air = Math.hypot(s.vx, s.vy), top = capped(s, air, 0, before);
      if (air > top) { s.vx *= top / air; s.vy *= top / air; }
    }
    s.score += 50 * multiplier(s); emit(s, 'boost');
  }
  // Rings are only reachable near the car, so a short recent list is enough.
  s.collected = [...collected].slice(-40);
}

function fireTurbo(s: State): void {
  s.turbos -= 1; s.turboTime = TURBO_TIME; s.scream += 0.15;
  if (s.grounded) s.speed = Math.min(TURBO_MAX_SPEED, s.speed + TURBO_KICK);
  else s.vx += TURBO_KICK;
  emit(s, 'turbo');
}

function running(s: State, hold: boolean, turbo: boolean, dt: number): void {
  if (turbo && !s.turboHeld && s.turbos > 0) fireTurbo(s);
  for (let left = dt; left > 1e-9; left -= STEP) {
    const h = Math.min(STEP, left), before = s.x;
    if (s.grounded) ride(s, hold, h); else fly(s, hold, h);
    s.distance += s.x - before;
    s.score += (s.x - before) * multiplier(s);
    collect(s);
  }
  const speed = s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
  s.maxSpeed = Math.max(s.maxSpeed, speed);
  if (speed > 45) s.scream += dt * (speed - 45) / 60; else if (s.screamTime === 0) s.scream = Math.max(0, s.scream - 0.04 * dt);
  if (s.screamTime > 0) s.screamTime = Math.max(0, s.screamTime - dt);
  if (s.turboTime > 0 && s.turboTime <= dt) s.turboTail = 1.2; else s.turboTail = Math.max(0, s.turboTail - dt);
  s.turboTime = Math.max(0, s.turboTime - dt);
  if (s.scream >= 1 && s.screamTime === 0) { s.scream = 0; s.screamTime = SCREAM_TIME; emit(s, 'scream'); }
  s.scream = clamp(s.scream, 0, 1);
  if (s.x >= s.nextCheckpoint) { s.timeLeft += CHECKPOINT_BONUS; s.nextCheckpoint += CHECKPOINT_EVERY; emit(s, 'checkpoint'); }
  s.timeLeft = Math.max(0, s.timeLeft - dt);
  if (s.timeLeft === 0) s.status = 'over';
}

export function step(state: State, input: Input, elapsed: number): State {
  if (state.status === 'over' || !Number.isFinite(elapsed) || elapsed <= 0) return state;
  const dt = Math.min(elapsed, 0.034);
  const s: State = { ...state, collected: [...state.collected], event: state.event && { ...state.event } };
  s.time += dt;
  if (s.status === 'launch') launchPhase(s, input.hold === true, dt);
  else running(s, input.hold === true, input.turbo === true, dt);
  s.turboHeld = input.turbo === true;
  return s;
}
