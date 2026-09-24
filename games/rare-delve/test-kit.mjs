/** Shared fixtures for Rare Delve engine tests (not shipped: index.tsx never imports it). */
import { newGame, startDive } from './game.ts';
import { mapFromRows } from './dungeon.ts';
import { makeMon } from './monsters.ts';

export const TOKEN = 'generations:7730';

/** A fresh game already standing on floor 1. */
export function dive(seed = 1) { return startDive(newGame(TOKEN, seed)); }

/**
 * A hand-drawn floor: '#' wall, '.' room, ',' corridor, '>' stairs, '@' hero.
 * mons: [species, x, y, opts?]; spawning is disabled unless run.spawnIn is given.
 */
export function arena(rows, { hero = {}, mons = [], items = [], traps = [], run = {}, seed = 1 } = {}) {
  const s = dive(seed);
  const map = mapFromRows(rows);
  const [x, y] = map.start;
  return {
    ...s,
    hero: { ...s.hero, x, y, ...hero },
    run: {
      ...s.run, map, seen: '0'.repeat(map.w * map.h), items, traps,
      mons: mons.map(([sp, mx, my, opts], i) => makeMon(sp, mx, my, i + 1, opts)), nextId: mons.length + 1, spawnIn: 999, ...run,
    },
  };
}

export const OPEN = [
  '###########',
  '#.........#',
  '#.........#',
  '#....@....#',
  '#.........#',
  '#........>#',
  '###########',
];

/** Repeat an action until pred(state) or the limit; returns the state. */
export function until(s, step, pred, limit = 200) {
  for (let i = 0; i < limit && !pred(s); i++) s = step(s);
  return s;
}
