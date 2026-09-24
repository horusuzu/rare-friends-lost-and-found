/** Floor layout: generation, hand-drawn test floors, 8-way steps with corner blocking, sight and distances. Pure. */
import { DIRS, DIR_LIST, H, W, type Dir } from './data.ts';
import { rngFrom, type Rng } from './rng.ts';

export interface Room { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export type Point = readonly [x: number, y: number];
/** tiles: '#' wall, '.' room floor, ',' corridor. Stairs live in `stairs` (drawn over a room tile). */
export interface FloorMap {
  readonly w: number; readonly h: number; readonly tiles: string;
  readonly rooms: readonly Room[]; readonly start: Point; readonly stairs: Point;
}

export function isFloor(m: FloorMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] !== '#';
}

/** One 8-way step: the target must be floor, and a diagonal may not cut a wall corner. */
export function canStep(m: FloorMap, x: number, y: number, dir: Dir): boolean {
  const [dx, dy] = DIRS[dir];
  if (!isFloor(m, x + dx, y + dy)) return false;
  return dx === 0 || dy === 0 || (isFloor(m, x + dx, y) && isFloor(m, x, y + dy));
}

/** The room whose floor or doorway ring holds (x, y); -1 in corridors and walls. */
export function roomIndex(m: FloorMap, x: number, y: number): number {
  if (!isFloor(m, x, y)) return -1;
  return m.rooms.findIndex(r => x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h);
}

/** Tile indices the hero sees: a lit room with its walls, or one tile around in corridors. */
export function visibleIdx(m: FloorMap, x: number, y: number): number[] {
  const out = new Set<number>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    for (let j = Math.max(0, y0); j <= Math.min(m.h - 1, y1); j++) for (let i = Math.max(0, x0); i <= Math.min(m.w - 1, x1); i++) out.add(j * m.w + i);
  };
  const ri = roomIndex(m, x, y);
  if (ri >= 0) { const r = m.rooms[ri]; add(r.x - 1, r.y - 1, r.x + r.w, r.y + r.h); }
  add(x - 1, y - 1, x + 1, y + 1);
  return [...out];
}

/** Steps from (sx, sy) to every tile using 8-way moves; -1 where unreachable. */
export function distanceMap(m: FloorMap, sx: number, sy: number): Int16Array {
  const d = new Int16Array(m.w * m.h).fill(-1);
  if (!isFloor(m, sx, sy)) return d;
  const queue = [sy * m.w + sx];
  d[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q], x = cur % m.w, y = (cur - x) / m.w;
    for (const dir of DIR_LIST) {
      if (!canStep(m, x, y, dir)) continue;
      const n = (y + DIRS[dir][1]) * m.w + x + DIRS[dir][0];
      if (d[n] >= 0) continue;
      d[n] = d[cur] + 1; queue.push(n);
    }
  }
  return d;
}

/** Room floor tiles (inside rooms, not doorways). */
export function roomTiles(m: FloorMap, r: Room): Point[] {
  const out: Point[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (isFloor(m, x, y)) out.push([x, y]);
  return out;
}

// ---------- hand-drawn floors (tests) ----------

/** '#' wall, '.' room, ',' corridor, '>' stairs, '@' start. Rooms are 4-connected room tiles. */
export function mapFromRows(rows: readonly string[]): FloorMap {
  const h = rows.length, w = rows[0].length;
  let start: Point = [-1, -1], stairs: Point = [-1, -1];
  const cells: string[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '@') start = [x, y];
    if (ch === '>') stairs = [x, y];
    cells.push(ch === '#' ? '#' : ch === ',' ? ',' : '.');
  }));
  const isRoom = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] === '.';
  const seen = new Set<number>(), rooms: Room[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isRoom(x, y) || seen.has(y * w + x)) continue;
    let x0 = x, x1 = x, y0 = y, y1 = y;
    const stack: Point[] = [[x, y]]; seen.add(y * w + x);
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
        if (isRoom(nx, ny) && !seen.has(ny * w + nx)) { seen.add(ny * w + nx); stack.push([nx, ny]); }
      }
    }
    rooms.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return { w, h, tiles: cells.join(''), rooms, start, stairs };
}

// ---------- generation ----------

interface Cell { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number }

function edges(n: number, span: number): number[] { return Array.from({ length: n + 1 }, (_, i) => Math.round(i * span / n)); }

/** A room inside a cell with a two-tile margin on its low side and one on its high side, so neighbours keep a 3-tile gap. */
function roomIn(r: Rng, c: Cell): Room {
  const maxW = Math.min(9, c.x1 - 1 - (c.x0 + 2)), maxH = Math.min(7, c.y1 - 1 - (c.y0 + 2));
  const w = r.range(4, maxW), h = r.range(3, maxH);
  return { x: r.range(c.x0 + 2, c.x1 - 1 - w), y: r.range(c.y0 + 2, c.y1 - 1 - h), w, h };
}

function carve(cells: string[], x: number, y: number): void { if (cells[y * W + x] === '#') cells[y * W + x] = ','; }
function line(cells: string[], x0: number, y0: number, x1: number, y1: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) carve(cells, x, y);
}

/** Join two rooms side by side (a left of b) or stacked (a above b) with a three-leg corridor through the gap. */
function connect(r: Rng, cells: string[], a: Room, b: Room, across: boolean): void {
  if (across) {
    const ya = a.y + r.int(a.h), yb = b.y + r.int(b.h), x0 = a.x + a.w, x1 = b.x - 1, mx = r.range(x0 + 1, x1 - 1);
    line(cells, x0, ya, mx, ya); line(cells, mx, ya, mx, yb); line(cells, mx, yb, x1, yb);
  } else {
    const xa = a.x + r.int(a.w), xb = b.x + r.int(b.w), y0 = a.y + a.h, y1 = b.y - 1, my = r.range(y0 + 1, y1 - 1);
    line(cells, xa, y0, xa, my); line(cells, xa, my, xb, my); line(cells, xb, my, xb, y1);
  }
}

/** A 40x28 floor: a grid of rooms joined by a random spanning tree of corridors plus a few loops. */
export function generateMap(seed: number): FloorMap {
  const r = rngFrom(seed);
  const cols = r.chance(0.5) ? 4 : 3, rowsN = 2;
  const xs = edges(cols, W - 1), ys = edges(rowsN, H - 1);
  const cells: string[] = Array(W * H).fill('#');
  const rooms: Room[] = [];
  for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) rooms.push(roomIn(r, { x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] }));
  for (const room of rooms) for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) cells[y * W + x] = '.';
  const links: [number, number, boolean][] = [];
  for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i;
    if (i + 1 < cols) links.push([k, k + 1, true]);
    if (j + 1 < rowsN) links.push([k, k + cols, false]);
  }
  const parent = rooms.map((_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : root(parent[i]);
  for (const [a, b, across] of r.shuffle(links)) {
    const ra = root(a), rb = root(b);
    if (ra !== rb) parent[ra] = rb;
    else if (!r.chance(0.3)) continue;
    connect(r, cells, rooms[a], rooms[b], across);
  }
  const startRoom = r.int(rooms.length);
  const stairsRoom = (startRoom + 1 + r.int(rooms.length - 1)) % rooms.length;
  const spot = (room: Room): Point => [room.x + r.int(room.w), room.y + r.int(room.h)];
  return { w: W, h: H, tiles: cells.join(''), rooms, start: spot(rooms[startRoom]), stairs: spot(rooms[stairsRoom]) };
}
