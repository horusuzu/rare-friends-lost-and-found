/** Pure mapping from one simulation frame to the next into sound cues. It never changes the game. */
import type { State } from './engine.ts';
import type { DropSfx } from './sound.ts';

export interface Cue { id: DropSfx; pitch?: number; gain?: number }
export interface Combo { count: number; at: number }
export const NO_COMBO: Combo = { count: 0, at: -Infinity };

/** A pentatonic climb: each tier sounds higher than the one below it. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
export const mergePitch = (tier: number) => 2 ** (SCALE[Math.max(0, Math.min(SCALE.length - 1, tier - 1))] / 12);

const BIG_TIER = 7, FRIEND_TIER = 11, COMBO_WINDOW = 1, COMBO_FROM = 3;
const LAND_SPEED = 220, LAND_FULL = 1000;
/** Danger pulses come closer together as the two-second overflow timer runs down. */
const DANGER_PULSES = [0, 0.6, 1, 1.3, 1.55, 1.75, 1.9];
const dangerLevel = (danger: number) => danger <= 0 ? 0 : DANGER_PULSES.filter(t => danger >= t).length;

export function cuesBetween(prev: State, next: State, combo: Combo): { cues: Cue[]; combo: Combo } {
  const cues: Cue[] = [];
  if (prev === next) return { cues, combo };
  if (prev.status === 'playing' && next.status === 'over') return { cues: [{ id: 'over' }], combo: NO_COMBO };
  if (next.status !== 'playing') return { cues, combo };

  if (next.cooldown > prev.cooldown) cues.push({ id: 'drop' });

  // A falling orb that suddenly stops or rebounds has landed; the hardest impact sets the volume.
  const before = new Map(prev.bodies.map(b => [b.id, b]));
  let impact = 0;
  for (const body of next.bodies) {
    const old = before.get(body.id);
    if (old && old.vy > LAND_SPEED && body.vy < old.vy * 0.4) impact = Math.max(impact, old.vy - Math.max(0, body.vy));
  }
  if (impact > 0) cues.push({ id: 'land', gain: Math.min(1, 0.25 + impact / LAND_FULL) });

  const merged = next.merges - prev.merges;
  if (merged > 0) {
    const tiers = next.pops.slice(-merged).map(p => p.tier), top = Math.max(...tiers);
    cues.push({ id: 'merge', pitch: mergePitch(top) });
    if (top >= FRIEND_TIER) cues.push({ id: 'friend' });
    else if (top >= BIG_TIER) cues.push({ id: 'big' });
    const count = next.time - combo.at <= COMBO_WINDOW ? combo.count + merged : merged;
    combo = { count, at: next.time };
    if (count >= COMBO_FROM) cues.push({ id: 'combo', pitch: 2 ** (Math.min(count - COMBO_FROM, 12) / 12) });
  }

  const level = dangerLevel(next.danger);
  if (level > dangerLevel(prev.danger)) cues.push({ id: 'danger', pitch: 1 + (level - 1) * 0.08 });
  return { cues, combo };
}
