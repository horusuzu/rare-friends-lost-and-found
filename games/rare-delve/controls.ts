/** Keyboard and touch mapping for Rare Delve, plus the held-direction scheduler (chords make diagonals). Pure. */
import type { Dir } from './data.ts';
import type { Button } from './game.ts';
import type { GameState } from './run.ts';

export type Move = Dir | 'wait';

/** Cardinal keys that may be chorded (↑ + → = north-east). */
export const CHORD_KEYS: Readonly<Record<string, Dir>> = {
  arrowup: 'n', w: 'n', arrowdown: 's', s: 's', arrowleft: 'w', a: 'w', arrowright: 'e', d: 'e',
};
/** Keys that step at once: QEZC diagonals and the numeric keypad (5 waits). Keyed by KeyboardEvent.code for the keypad. */
export const SOLO_KEYS: Readonly<Record<string, Move>> = { q: 'nw', e: 'ne', z: 'sw', c: 'se', '.': 'wait', ' ': 'wait' };
export const NUMPAD: Readonly<Record<string, Move>> = {
  Numpad8: 'n', Numpad9: 'ne', Numpad6: 'e', Numpad3: 'se', Numpad2: 's', Numpad1: 'sw', Numpad4: 'w', Numpad7: 'nw', Numpad5: 'wait',
};
export const BUTTON_KEYS: Readonly<Record<string, Button>> = {
  enter: 'a', f: 'a', j: 'a', x: 'b', backspace: 'b', k: 'b', i: 'menu', m: 'map', t: 'turn',
};

/** First repeat after holding a direction, then the steady walking pace (seconds). */
export const FIRST_REPEAT = 0.28;
export const REPEAT = 0.12;
/** How long a lone arrow key waits for a second one to form a diagonal. */
export const CHORD_WINDOW = 0.05;

const PERPENDICULAR: Readonly<Record<string, Dir>> = { ne: 'ne', en: 'ne', nw: 'nw', wn: 'nw', se: 'se', es: 'se', sw: 'sw', ws: 'sw' };

/** Combine held cardinals: the two most recent perpendicular keys make a diagonal, otherwise the latest wins. */
export function combine(held: readonly Dir[]): Dir | null {
  const last = held.at(-1);
  if (!last) return null;
  for (let i = held.length - 2; i >= 0; i--) {
    const pair = PERPENDICULAR[held[i] + last];
    if (pair) return pair;
  }
  return last;
}

/** Free walking in the dungeon: holding a direction repeats steps. Menus, the map and turn mode take single presses. */
export function roaming(s: GameState | null): boolean {
  return !!s && s.scene.k === 'dungeon' && !s.showMap && !s.turnMode;
}

/** Stop a held walk when something needs attention: damage, a floor change, a new scene or a refused step. */
export function shouldStop(prev: GameState, next: GameState): boolean {
  if (next === prev || next.scene.k !== 'dungeon' || !next.run || !prev.run) return true;
  return next.hero.hp < prev.hero.hp || next.run.floor !== prev.run.floor || next.run.turn === prev.run.turn || next.log.length !== prev.log.length
    || next.log.at(-1) !== prev.log.at(-1);
}
