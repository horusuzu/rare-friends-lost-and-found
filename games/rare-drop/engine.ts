/** Pure merge-drop simulation. Score is local arcade points, never RF. */
export const WIDTH = 400;
export const HEIGHT = 620;
export const FLOOR = 608;
export const DROP_Y = 80;
export const DANGER_Y = 140;
export const TIERS = 11;
/** Radius per tier (index 0 = tier 1). Tier 11 is the player's own Friend. */
export const RADII = [15, 21, 27, 34, 42, 51, 60, 70, 81, 93, 106] as const;
/** Points for creating each tier (triangular numbers, as in classic merge-drop). */
export const TIER_POINTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66] as const;
const GRAVITY = 1500, SUBSTEPS = 4, ITERATIONS = 3, BOUNCE = 0.12, MAX_SPEED = 1400;
const AIM_SPEED = 330, COOLDOWN = 0.55, GRACE = 1.2, DANGER_LIMIT = 2, POP_LIFE = 0.45;

export interface Body { id: number; tier: number; x: number; y: number; vx: number; vy: number; age: number }
export interface Pop { x: number; y: number; tier: number; age: number }
export interface State {
  status: 'playing' | 'over';
  bodies: Body[]; pops: Pop[];
  score: number; maxTier: number; merges: number;
  current: number; next: number; aimX: number;
  cooldown: number; danger: number; seed: number; nextId: number; time: number;
}
export interface Input { move: number; aim: number | null; drop: boolean }

export const radius = (tier: number) => RADII[tier - 1];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Deterministic LCG; returns [tier 1..5, next seed]. */
function roll(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [1 + ((next >>> 16) % 5), next];
}

export function createGame(seed = 1): State {
  const [current, s1] = roll(seed >>> 0);
  const [next, s2] = roll(s1);
  return {
    status: 'playing', bodies: [], pops: [], score: 0, maxTier: 0, merges: 0,
    current, next, aimX: WIDTH / 2, cooldown: 0, danger: 0, seed: s2, nextId: 1, time: 0,
  };
}

function keepInJar(b: Body): void {
  const r = radius(b.tier);
  if (b.x < r) { b.x = r; if (b.vx < 0) b.vx = -b.vx * BOUNCE; }
  if (b.x > WIDTH - r) { b.x = WIDTH - r; if (b.vx > 0) b.vx = -b.vx * BOUNCE; }
  if (b.y > FLOOR - r) { b.y = FLOOR - r; if (b.vy > 0) b.vy = -b.vy * BOUNCE; b.vx *= 0.96; }
}

/** Separate overlapping bodies; equal tiers are returned as merge pairs instead. */
function collide(bodies: Body[]): [Body, Body][] {
  const merges: [Body, Body][] = [], merging = new Set<Body>();
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j], ra = radius(a.tier), rb = radius(b.tier);
    let dx = b.x - a.x, dy = b.y - a.y;
    const reach = ra + rb, d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) continue;
    if (a.tier === b.tier && !merging.has(a) && !merging.has(b)) { merging.add(a); merging.add(b); merges.push([a, b]); continue; }
    if (merging.has(a) || merging.has(b)) continue;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = 1; dy = 0; d = 1e-6; } else { dx /= d; dy /= d; }
    const ma = ra * ra, mb = rb * rb, total = ma + mb, overlap = reach - d;
    a.x -= dx * overlap * (mb / total); a.y -= dy * overlap * (mb / total);
    b.x += dx * overlap * (ma / total); b.y += dy * overlap * (ma / total);
    const closing = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
    if (closing < 0) {
      const impulse = -(1 + BOUNCE) * closing / (1 / ma + 1 / mb);
      a.vx -= impulse / ma * dx; a.vy -= impulse / ma * dy;
      b.vx += impulse / mb * dx; b.vy += impulse / mb * dy;
    }
    // Rolling friction keeps piles from sliding forever.
    const tx = -dy, ty = dx, slide = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    const f = slide * 0.04;
    a.vx += f * tx * (mb / total); a.vy += f * ty * (mb / total);
    b.vx -= f * tx * (ma / total); b.vy -= f * ty * (ma / total);
  }
  return merges;
}

function merge(s: State, pairs: [Body, Body][]): void {
  if (pairs.length === 0) return;
  const gone = new Set(pairs.flat());
  const born: Body[] = [];
  for (const [a, b] of pairs) {
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    s.merges += 1;
    if (a.tier === TIERS) {
      s.score += TIER_POINTS[TIERS - 1] * 2;
      s.maxTier = TIERS;
      s.pops.push({ x, y, tier: TIERS, age: 0 });
      continue;
    }
    const tier = a.tier + 1;
    s.score += TIER_POINTS[tier - 1];
    s.maxTier = Math.max(s.maxTier, tier);
    s.pops.push({ x, y, tier, age: 0 });
    born.push({ id: s.nextId++, tier, x, y, vx: (a.vx + b.vx) / 2, vy: Math.min(0, (a.vy + b.vy) / 2), age: Math.min(a.age, b.age) });
  }
  s.bodies = s.bodies.filter(b => !gone.has(b)).concat(born);
  for (const b of born) keepInJar(b);
}

function physics(s: State, dt: number): void {
  const h = dt / SUBSTEPS;
  for (let n = 0; n < SUBSTEPS; n++) {
    for (const b of s.bodies) {
      b.vy += GRAVITY * h;
      b.vx *= 0.999;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
      b.x += b.vx * h; b.y += b.vy * h;
      keepInJar(b);
    }
    for (let k = 0; k < ITERATIONS; k++) {
      merge(s, collide(s.bodies));
      for (const b of s.bodies) keepInJar(b);
    }
  }
}

export function step(state: State, input: Input, elapsed: number): State {
  if (state.status !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return state;
  const dt = Math.min(elapsed, 0.03);
  const s: State = { ...state, bodies: state.bodies.map(b => ({ ...b })), pops: state.pops.map(p => ({ ...p })) };
  s.time += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  const r = radius(s.current);
  const move = Number.isFinite(input.move) ? clamp(input.move, -1, 1) : 0;
  const aimed = input.aim !== null && Number.isFinite(input.aim) ? input.aim : s.aimX + move * AIM_SPEED * dt;
  s.aimX = clamp(aimed, r, WIDTH - r);
  if (input.drop && s.cooldown === 0) {
    s.bodies.push({ id: s.nextId++, tier: s.current, x: s.aimX, y: DROP_Y, vx: 0, vy: 0, age: 0 });
    const [next, seed] = roll(s.seed);
    s.current = s.next; s.next = next; s.seed = seed; s.cooldown = COOLDOWN;
    s.aimX = clamp(s.aimX, radius(s.current), WIDTH - radius(s.current));
  }
  physics(s, dt);
  for (const b of s.bodies) b.age += dt;
  s.pops = s.pops.map(p => ({ ...p, age: p.age + dt })).filter(p => p.age < POP_LIFE);
  const crowded = s.bodies.some(b => b.age > GRACE && b.y - radius(b.tier) < DANGER_Y);
  s.danger = crowded ? s.danger + dt : 0;
  if (s.danger >= DANGER_LIMIT) s.status = 'over';
  return s;
}
