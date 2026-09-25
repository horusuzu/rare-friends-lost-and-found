/** Rare Cards sound effects: soft synthesised cues (no audio files). The player lives in sound-engine.ts. */
import type { Cue } from './sound-engine.ts';
export { createSound, cueLength, type Cue, type Sound, type SoundOptions } from './sound-engine.ts';

/** A quick card-flip swish that starts every reveal. */
const FLIP: Cue = [{ f: 1200, to: 2600, d: 0.07, wave: 'noise', level: 0.35 }];
/** High sparkles layered over the shiny reveals. */
const sparkle = (from: number, notes: number[]): Cue => notes.map((f, i) => ({ f, d: 0.28, at: from + i * 0.07, wave: 'sine', level: 0.22 }));

export const CUES = {
  tap: [{ f: 660, d: 0.05, level: 0.45 }],
  error: [{ f: 247, d: 0.08, level: 0.55 }, { f: 196, d: 0.12, level: 0.55 }],
  /** Pack tear: three rips that follow the shaking wrapper. */
  tear: [{ f: 1600, to: 4200, d: 0.16, wave: 'noise', level: 0.6 }, { f: 2200, to: 5200, d: 0.2, at: 0.22, wave: 'noise', level: 0.55 },
    { f: 2600, to: 6400, d: 0.26, at: 0.48, wave: 'noise', level: 0.5 }],
  flip: [...FLIP, { f: 587, d: 0.06, level: 0.35 }],
  'reveal-common': [...FLIP, { f: 523, d: 0.09, level: 0.55 }, { f: 659, d: 0.14, level: 0.55 }],
  'reveal-rare': [...FLIP, { f: 587, d: 0.08, level: 0.55 }, { f: 740, d: 0.08, level: 0.55 }, { f: 880, d: 0.2, level: 0.55 }],
  /** Holo and prism: a rising arpeggio under a shimmer of bells. */
  'reveal-shiny': [...FLIP, { f: 659, d: 0.06, level: 0.5 }, { f: 831, d: 0.06, level: 0.5 }, { f: 988, d: 0.06, level: 0.5 }, { f: 1319, d: 0.24, level: 0.5 },
    ...sparkle(0.3, [2637, 3136, 3520, 2960])],
  /** Gold foil: a little fanfare, a held chord and a longer shimmer. */
  'reveal-legend': [...FLIP, { f: 523, d: 0.07, level: 0.5 }, { f: 659, d: 0.07, level: 0.5 }, { f: 784, d: 0.07, level: 0.5 }, { f: 1047, d: 0.5, level: 0.45 },
    { f: 1319, d: 0.5, at: 0.28, level: 0.35 }, { f: 1568, d: 0.5, at: 0.28, level: 0.3 }, ...sparkle(0.36, [2093, 2637, 3136, 3520, 4186, 3520])],
  /** A card sliding into a binder pocket. */
  pocket: [{ f: 900, to: 400, d: 0.08, wave: 'noise', level: 0.45 }, { f: 330, d: 0.06, at: 0.06, level: 0.45 }],
  page: [{ f: 500, to: 2400, d: 0.18, wave: 'noise', level: 0.4 }, { f: 2400, to: 900, d: 0.1, wave: 'noise', level: 0.25 }],
  copy: [{ f: 1047, d: 0.05, wave: 'sine', level: 0.5 }, { f: 1568, d: 0.09, wave: 'sine', level: 0.5 }],
  accept: [{ f: 523, d: 0.07, level: 0.5 }, { f: 784, d: 0.07, level: 0.5 }, { f: 1047, d: 0.18, level: 0.5 }, { f: 900, to: 400, d: 0.08, at: 0.2, wave: 'noise', level: 0.35 }],
  'hit-sun': [{ f: 440, to: 220, d: 0.09, wave: 'square', level: 0.3 }, { f: 3000, to: 1200, d: 0.06, at: 0, wave: 'noise', level: 0.35 }],
  'hit-moon': [{ f: 330, to: 196, d: 0.11, wave: 'sine', level: 0.7 }, { f: 1500, to: 600, d: 0.07, at: 0, wave: 'noise', level: 0.25 }],
  'hit-star': [{ f: 1319, to: 988, d: 0.05, level: 0.45 }, { f: 1760, to: 1175, d: 0.07, level: 0.4 }],
  crit: [{ f: 196, to: 98, d: 0.13, wave: 'square', level: 0.35 }, { f: 4000, to: 1000, d: 0.1, at: 0, wave: 'noise', level: 0.45 }, { f: 1568, d: 0.1, at: 0.05, level: 0.4 }],
  'round-win': [{ f: 659, d: 0.07, level: 0.5 }, { f: 988, d: 0.12, level: 0.5 }],
  'round-lose': [{ f: 392, d: 0.08, level: 0.5 }, { f: 294, d: 0.14, level: 0.5 }],
  win: [{ f: 523, d: 0.1 }, { f: 659, d: 0.1 }, { f: 784, d: 0.1 }, { f: 1047, d: 0.12 }, { f: 784, d: 0.08 }, { f: 1047, d: 0.35 }],
  lose: [{ f: 392, d: 0.14, level: 0.7 }, { f: 349, d: 0.14, level: 0.7 }, { f: 311, d: 0.16, level: 0.7 }, { f: 262, d: 0.4, level: 0.7 }],
  draw: [{ f: 523, d: 0.12, level: 0.7 }, { f: 494, d: 0.12, level: 0.7 }, { f: 523, d: 0.25, level: 0.7 }],
  /** An RF ticket burning: a rising whoosh over a low thump, then crackle. */
  burn: [{ f: 300, to: 2400, d: 0.36, wave: 'noise', level: 0.55 }, { f: 110, to: 55, d: 0.34, at: 0, wave: 'sine', level: 0.5 },
    { f: 2000, to: 4200, d: 0.2, at: 0.3, wave: 'noise', level: 0.3 }],
} satisfies Record<string, Cue>;
export type CueId = keyof typeof CUES;

/** Card finish rarity 1–4 → reveal cue; holo/prism (3) and gold (4) get the bigger shimmer. */
export function revealCue(rarity: number): CueId {
  return rarity >= 4 ? 'reveal-legend' : rarity === 3 ? 'reveal-shiny' : rarity === 2 ? 'reveal-rare' : 'reveal-common';
}
/** Element 0 Sun, 1 Moon, 2 Star; a critical hit has its own cue. */
export function hitCue(element: number, crit: boolean): CueId {
  return crit ? 'crit' : element === 1 ? 'hit-moon' : element === 2 ? 'hit-star' : 'hit-sun';
}
export function roundCue(winner: 'a' | 'b' | 'draw', mine: 'a' | 'b'): CueId { return winner === mine ? 'round-win' : 'round-lose'; }
export function verdictCue(winner: 'a' | 'b' | 'draw', mine: 'a' | 'b'): CueId { return winner === 'draw' ? 'draw' : winner === mine ? 'win' : 'lose'; }
