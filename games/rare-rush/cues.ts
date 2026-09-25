/** Pure mapping from one ride frame to the next into sound cues. It never changes the ride. */
import type { EventKind, State } from './engine.ts';
import type { RushSfx } from './sound.ts';

export interface Cue { id: RushSfx; pitch?: number }

/** The engine holds a climbing car at its minimum speed: that is the chain lift. */
export const CHAIN_SPEED = 6;
const CLACK_EVERY = 1.5, MIN_FLIGHT = 0.25;
const EVENT_CUES: Readonly<Record<EventKind, RushSfx | null>> = {
  'launch': 'launch', 'perfect-launch': 'perfect-launch', 'turbo': 'turbo', 'item': 'item', 'boost': 'boost',
  'scream': 'scream', 'checkpoint': 'checkpoint', 'bad': 'bad', 'perfect': null,
};

export function cuesBetween(prev: State, next: State): Cue[] {
  if (prev === next || prev.status === 'over') return [];
  if (next.status === 'over') return [{ id: 'finish' }];
  const cues: Cue[] = [];
  const fresh = next.event && next.event.at === next.time ? next.event.kind : null;
  if (fresh && EVENT_CUES[fresh]) cues.push({ id: EVENT_CUES[fresh]! });

  if (!prev.grounded && next.grounded && next.airTime - next.takeoffAt >= MIN_FLIGHT) {
    if (next.perfects > prev.perfects) cues.push({ id: 'perfect' });
    else if (fresh !== 'bad') cues.push({ id: 'good' });
  }
  if (next.sparks > prev.sparks) cues.push({ id: 'spark', pitch: 2 ** (((next.sparks - 1) % 5) * 2 / 12) });
  if (next.status === 'running' && prev.status === 'running' && next.grounded && prev.grounded && next.speed <= CHAIN_SPEED + 0.01 &&
    Math.floor(next.x / CLACK_EVERY) > Math.floor(prev.x / CLACK_EVERY)) cues.push({ id: 'clack' });
  return cues;
}
